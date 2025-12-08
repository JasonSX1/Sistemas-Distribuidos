"""
superpeer.py - Classe Superpeer para coordenação de grupos

Este módulo define a classe Superpeer que herda de Node e adiciona
funcionalidades de coordenação de grupo e participação em eleições globais.
"""

from typing import List, Optional
from node import Node


class Superpeer(Node):
    """
    Representa um Superpeer na rede distribuída.
    
    Superpeers são nós especiais que:
    - Coordenam um grupo de peers regulares
    - Participam de eleições globais para escolher o coordenador
    - Detectam falhas de outros superpeers
    
    Attributes:
        peers: Lista de peers sob coordenação deste superpeer
        other_superpeers: Referência a outros superpeers na rede
        is_global_coordinator: Indica se é o coordenador global atual
    """
    
    def __init__(self, node_id: str, power_score: int, group_id: int):
        super().__init__(node_id=node_id, power_score=power_score, 
                        is_alive=True, group_id=group_id)
        self.peers: List[Node] = []
        self.other_superpeers: List['Superpeer'] = []
        self.is_global_coordinator: bool = False
    
    def __str__(self) -> str:
        status = "✓" if self.is_alive else "✗"
        coord = " ★COORD" if self.is_global_coordinator else ""
        return f"[{status}] {self.node_id} (power: {self.power_score}){coord}"
    
    def add_peer(self, peer: Node) -> None:
        """Adiciona um peer ao grupo coordenado por este superpeer."""
        peer.superpeer_id = self.node_id
        peer.group_id = self.group_id
        self.peers.append(peer)
    
    def remove_peer(self, peer: Node) -> None:
        """Remove um peer do grupo."""
        if peer in self.peers:
            self.peers.remove(peer)
            peer.superpeer_id = None
    
    def set_as_coordinator(self) -> None:
        """Define este superpeer como coordenador global."""
        self.is_global_coordinator = True
        print(f"\n  🏆 {self.node_id} é o novo COORDENADOR GLOBAL! (power: {self.power_score})")
    
    def resign_coordinator(self) -> None:
        """Remove status de coordenador global."""
        self.is_global_coordinator = False
    
    def get_peer_count(self) -> int:
        """Retorna quantidade de peers no grupo."""
        return len(self.peers)
    
    def get_group_info(self) -> str:
        """Retorna informações do grupo coordenado."""
        peers_str = ", ".join([p.node_id for p in self.peers])
        return f"Grupo {self.group_id}: Superpeer {self.node_id} → [{peers_str}]"
    
    def check_superpeer_alive(self, target: 'Superpeer', timeout_ms: int = 1000) -> bool:
        """
        Simula verificação se outro superpeer está vivo.
        Em uma implementação real, isso seria uma mensagem de rede com timeout.
        """
        return target.is_alive


def elect_superpeer_from_group(peers: List[Node], group_id: int) -> Superpeer:
    """
    Elege o superpeer de um grupo de peers.
    O peer com maior power_score se torna o superpeer.
    
    Args:
        peers: Lista de peers do grupo
        group_id: ID do grupo
    
    Returns:
        Superpeer eleito do grupo
    """
    if not peers:
        raise ValueError("Grupo vazio - não é possível eleger superpeer")
    
    # Encontra o peer com maior power_score
    best_peer = max(peers, key=lambda p: p.power_score)
    
    # Cria Superpeer a partir do peer eleito
    superpeer = Superpeer(
        node_id=best_peer.node_id,
        power_score=best_peer.power_score,
        group_id=group_id
    )
    
    # Adiciona os outros peers ao grupo do superpeer
    for peer in peers:
        if peer.node_id != superpeer.node_id:
            superpeer.add_peer(peer)
    
    print(f"  → Superpeer eleito: {superpeer.node_id} (power: {superpeer.power_score})")
    
    return superpeer
