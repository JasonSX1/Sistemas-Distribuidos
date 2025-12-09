import threading
import time
import random
import requests
from flask import Flask, request, jsonify
from typing import List, Dict, Optional, Callable
import logging

from config import (
    DEFAULT_HOST, DEFAULT_PORT, 
    HEARTBEAT_INTERVAL, HEARTBEAT_TIMEOUT, 
    ELECTION_TIMEOUT, REQUEST_TIMEOUT,
    MIN_POWER_SCORE, MAX_POWER_SCORE
)

logging.getLogger('werkzeug').setLevel(logging.ERROR)


class DistributedNode:
    
    def __init__(self, host: str, port: int, peers: List[str], power_score: int = None):
        self.host = host
        self.port = port
        self.node_id = f"{host}:{port}"
        self.power_score = power_score or random.randint(MIN_POWER_SCORE, MAX_POWER_SCORE)
        
        self.peers: List[str] = [p for p in peers if p != self.node_id]
        self.peer_status: Dict[str, dict] = {}
        for peer in self.peers:
            self.peer_status[peer] = {
                "last_seen": 0,
                "alive": False,
                "power_score": None
            }
        
        self.is_coordinator = False
        self.current_coordinator: Optional[str] = None
        self.election_in_progress = False
        
        self.app = Flask(__name__)
        self._setup_routes()
        
        self.running = False
        self.heartbeat_thread: Optional[threading.Thread] = None
        self.on_status_change: Optional[Callable] = None
    
    def _setup_routes(self):
        @self.app.route('/heartbeat', methods=['GET'])
        def heartbeat():
            return jsonify({
                "node_id": self.node_id,
                "power_score": self.power_score,
                "is_coordinator": self.is_coordinator,
                "alive": True
            })
        
        @self.app.route('/status', methods=['GET'])
        def status():
            return jsonify({
                "node_id": self.node_id,
                "power_score": self.power_score,
                "is_coordinator": self.is_coordinator,
                "current_coordinator": self.current_coordinator,
                "peers": self.peer_status,
                "election_in_progress": self.election_in_progress
            })
        
        @self.app.route('/election', methods=['POST'])
        def receive_election():
            data = request.json
            sender_id = data.get("sender_id")
            sender_power = data.get("power_score", 0)
            
            self._log(f"📩 ELECTION recebido de {sender_id} (power: {sender_power})")
            
            if self.power_score > sender_power:
                self._log(f"✅ Respondendo OK para {sender_id}")
                threading.Thread(target=self.start_election, daemon=True).start()
                return jsonify({"response": "OK", "node_id": self.node_id, "power_score": self.power_score})
            else:
                return jsonify({"response": "ACKNOWLEDGED", "node_id": self.node_id})
        
        @self.app.route('/coordinator', methods=['POST'])
        def receive_coordinator():
            data = request.json
            coordinator_id = data.get("coordinator_id")
            coordinator_power = data.get("power_score")
            
            self._log(f"👑 COORDINATOR anunciado: {coordinator_id} (power: {coordinator_power})")
            
            self.current_coordinator = coordinator_id
            self.is_coordinator = (coordinator_id == self.node_id)
            self.election_in_progress = False
            
            return jsonify({"status": "acknowledged"})
    
    def _log(self, message: str):
        timestamp = time.strftime("%H:%M:%S")
        print(f"[{timestamp}] [{self.node_id}] {message}")
        
        if self.on_status_change:
            self.on_status_change(message)
    
    def start(self):
        self.running = True
        
        server_thread = threading.Thread(
            target=lambda: self.app.run(
                host=self.host, 
                port=self.port, 
                threaded=True,
                use_reloader=False
            ),
            daemon=True
        )
        server_thread.start()
        
        self._log(f"🚀 Servidor iniciado em {self.host}:{self.port}")
        self._log(f"⚡ Power Score: {self.power_score}")
        self._log(f"👥 Peers: {self.peers}")
        
        time.sleep(1)
        
        self.heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self.heartbeat_thread.start()
        
        time.sleep(2)
        if not self.current_coordinator:
            self._log("📢 Iniciando eleicao inicial...")
            self.start_election()
    
    def stop(self):
        self.running = False
        self._log("🛑 No encerrado")
    
    def _heartbeat_loop(self):
        while self.running:
            for peer in self.peers:
                try:
                    response = requests.get(
                        f"http://{peer}/heartbeat",
                        timeout=REQUEST_TIMEOUT
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        was_alive = self.peer_status[peer]["alive"]
                        
                        self.peer_status[peer] = {
                            "last_seen": time.time(),
                            "alive": True,
                            "power_score": data.get("power_score")
                        }
                        
                        if not was_alive:
                            self._log(f"✅ Peer {peer} online (power: {data.get('power_score')})")
                    
                except requests.exceptions.RequestException:
                    was_alive = self.peer_status[peer].get("alive", False)
                    self.peer_status[peer]["alive"] = False
                    
                    if was_alive:
                        self._log(f"❌ Peer {peer} offline")
                        
                        if peer == self.current_coordinator:
                            self._log(f"💥 Coordenador {peer} falhou! Nova eleicao...")
                            threading.Thread(target=self.start_election, daemon=True).start()
            
            time.sleep(HEARTBEAT_INTERVAL)
    
    def start_election(self):
        if self.election_in_progress:
            return
        
        self.election_in_progress = True
        self._log(f"🗳️ Iniciando eleicao (meu power: {self.power_score})...")
        
        higher_power_peers = []
        for peer, status in self.peer_status.items():
            if status["alive"] and status["power_score"] is not None:
                if status["power_score"] > self.power_score:
                    higher_power_peers.append(peer)
        
        if not higher_power_peers:
            self._log("👑 Nenhum peer com power maior - me declarando COORDENADOR!")
            self._announce_coordinator()
            return
        
        received_ok = False
        for peer in higher_power_peers:
            try:
                self._log(f"📤 Enviando ELECTION para {peer}...")
                
                response = requests.post(
                    f"http://{peer}/election",
                    json={"sender_id": self.node_id, "power_score": self.power_score},
                    timeout=ELECTION_TIMEOUT
                )
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get("response") == "OK":
                        self._log(f"📥 Recebido OK de {peer}")
                        received_ok = True
                        break
            
            except requests.exceptions.RequestException:
                self._log(f"⚠️ Falha ao contatar {peer}")
                self.peer_status[peer]["alive"] = False
        
        if not received_ok:
            self._log("👑 Nenhuma resposta OK - me declarando COORDENADOR!")
            self._announce_coordinator()
        else:
            self._log("⏳ Aguardando anuncio de coordenador...")
            time.sleep(ELECTION_TIMEOUT)
            
            if self.election_in_progress:
                self._log("⚠️ Timeout - reiniciando eleicao...")
                self.election_in_progress = False
                self.start_election()
    
    def _announce_coordinator(self):
        self.is_coordinator = True
        self.current_coordinator = self.node_id
        self.election_in_progress = False
        
        self._log(f"🏆 SOU O COORDENADOR! (power: {self.power_score})")
        
        for peer in self.peers:
            if self.peer_status[peer].get("alive"):
                try:
                    requests.post(
                        f"http://{peer}/coordinator",
                        json={
                            "coordinator_id": self.node_id,
                            "power_score": self.power_score
                        },
                        timeout=REQUEST_TIMEOUT
                    )
                    self._log(f"📢 Anunciado para {peer}")
                
                except requests.exceptions.RequestException:
                    self._log(f"⚠️ Falha ao anunciar para {peer}")
    
    def get_status_display(self) -> str:
        lines = []
        lines.append("=" * 50)
        lines.append(f"  NO: {self.node_id}")
        lines.append(f"  Power Score: {self.power_score}")
        lines.append(f"  Coordenador: {'SIM 👑' if self.is_coordinator else 'NAO'}")
        lines.append(f"  Coordenador Atual: {self.current_coordinator or 'Nenhum'}")
        lines.append("-" * 50)
        lines.append("  PEERS:")
        
        for peer, status in self.peer_status.items():
            alive = "✅" if status["alive"] else "❌"
            power = status["power_score"] or "?"
            coord = " 👑" if peer == self.current_coordinator else ""
            lines.append(f"    {alive} {peer} (power: {power}){coord}")
        
        lines.append("=" * 50)
        return "\n".join(lines)


def create_node(host: str, port: int, peers: List[str], power_score: int = None) -> DistributedNode:
    return DistributedNode(host, port, peers, power_score)
