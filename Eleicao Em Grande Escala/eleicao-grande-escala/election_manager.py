"""
election_manager.py - Gerenciador de Eleições Distribuídas

Este módulo implementa o algoritmo de eleição hierárquica para sistemas de grande escala.
Baseado no algoritmo Bully adaptado para superpeers.
"""

import time
from typing import List, Optional
from superpeer import Superpeer


class ElectionMessage:
    """Representa uma mensagem de eleição na rede."""
    ELECTION = "ELECTION"
    OK = "OK"
    COORDINATOR = "COORDINATOR"
    
    def __init__(self, msg_type: str, sender_id: str, sender_power: int):
        self.type = msg_type
        self.sender_id = sender_id
        self.sender_power = sender_power
        self.timestamp = time.time()
    
    def __str__(self) -> str:
        return f"{self.type} from {self.sender_id} (power: {self.sender_power})"


class ElectionManager:
    """
    Gerencia o processo de eleição entre Superpeers.
    
    Implementa o Algoritmo Bully adaptado para hierarquia de Superpeers:
    1. Um superpeer detecta falha do coordenador atual
    2. Inicia eleição enviando ELECTION para superpeers com power maior
    3. Se não receber resposta (OK), se declara coordenador
    4. Se receber OK, aguarda mensagem COORDINATOR
    5. Novo coordenador envia COORDINATOR para todos
    
    Attributes:
        superpeers: Lista de todos os superpeers na rede
        current_coordinator: Superpeer que é o coordenador atual
        election_in_progress: Flag indicando eleição em andamento
        message_log: Log de todas as mensagens trocadas
    """
    
    def __init__(self, superpeers: List[Superpeer]):
        self.superpeers = superpeers
        self.current_coordinator: Optional[Superpeer] = None
        self.election_in_progress = False
        self.message_log: List[str] = []
        
        # Configura referências entre superpeers
        for sp in superpeers:
            sp.other_superpeers = [s for s in superpeers if s.node_id != sp.node_id]
    
    def log(self, message: str) -> None:
        """Registra mensagem no log."""
        self.message_log.append(message)
        print(f"  {message}")
    
    def get_active_superpeers(self) -> List[Superpeer]:
        """Retorna lista de superpeers ativos."""
        return [sp for sp in self.superpeers if sp.is_alive]
    
    def start_election(self, initiator: Superpeer) -> Optional[Superpeer]:
        """
        Inicia processo de eleição a partir de um superpeer.
        
        Args:
            initiator: Superpeer que está iniciando a eleição
        
        Returns:
            O novo coordenador eleito
        """
        if self.election_in_progress:
            self.log(f"{initiator.node_id}: Eleição já em andamento, aguardando...")
            return None
        
        self.election_in_progress = True
        self.log(f"{initiator.node_id} ({initiator.power_score}) → iniciando ELEIÇÃO")
        
        # Remove coordenador anterior
        if self.current_coordinator:
            self.current_coordinator.resign_coordinator()
        
        # Encontra superpeers com power_score MAIOR
        higher_power_peers = [
            sp for sp in self.get_active_superpeers()
            if sp.power_score > initiator.power_score and sp.node_id != initiator.node_id
        ]
        
        if not higher_power_peers:
            # Não há superpeer com power maior - iniciador vence
            self.log(f"{initiator.node_id} → não há superpeer com power maior")
            self.announce_coordinator(initiator)
            self.election_in_progress = False
            return initiator
        
        # Envia ELECTION para superpeers com power maior
        received_ok = False
        for target in higher_power_peers:
            self.log(f"{initiator.node_id} → enviando ELECTION para {target.node_id} (power: {target.power_score})")
            
            # Simula resposta OK do target
            if target.is_alive:
                self.log(f"{target.node_id} → respondendo OK para {initiator.node_id}")
                received_ok = True
                
                # O target agora assume a eleição
                return self.continue_election(target)
        
        if not received_ok:
            # Nenhuma resposta - iniciador se torna coordenador
            self.log(f"{initiator.node_id} → timeout, nenhuma resposta recebida")
            self.announce_coordinator(initiator)
            self.election_in_progress = False
            return initiator
        
        return None
    
    def continue_election(self, superpeer: Superpeer) -> Superpeer:
        """
        Continua eleição a partir de um superpeer que respondeu OK.
        Este superpeer agora tenta encontrar outro com power maior.
        """
        higher_power_peers = [
            sp for sp in self.get_active_superpeers()
            if sp.power_score > superpeer.power_score and sp.node_id != superpeer.node_id
        ]
        
        if not higher_power_peers:
            # Este superpeer tem o maior power - vence a eleição
            self.log(f"{superpeer.node_id} ({superpeer.power_score}) → não há superpeer com power maior")
            self.announce_coordinator(superpeer)
            self.election_in_progress = False
            return superpeer
        
        # Continua a corrente de eleição
        for target in higher_power_peers:
            self.log(f"{superpeer.node_id} → verificando {target.node_id} (power: {target.power_score})")
            if target.is_alive:
                return self.continue_election(target)
        
        # Se chegou aqui, todos os maiores falharam
        self.announce_coordinator(superpeer)
        self.election_in_progress = False
        return superpeer
    
    def announce_coordinator(self, coordinator: Superpeer) -> None:
        """
        Anuncia o novo coordenador para todos os superpeers.
        """
        self.current_coordinator = coordinator
        coordinator.set_as_coordinator()
        
        # Envia mensagem COORDINATOR para todos
        for sp in self.get_active_superpeers():
            if sp.node_id != coordinator.node_id:
                self.log(f"{coordinator.node_id} → enviando COORDINATOR para {sp.node_id}")
    
    def detect_coordinator_failure(self) -> bool:
        """
        Verifica se o coordenador atual falhou.
        
        Returns:
            True se o coordenador falhou, False caso contrário
        """
        if self.current_coordinator is None:
            return True
        return not self.current_coordinator.is_alive
    
    def handle_coordinator_failure(self) -> Optional[Superpeer]:
        """
        Trata falha do coordenador atual iniciando nova eleição.
        
        Returns:
            Novo coordenador eleito
        """
        if not self.detect_coordinator_failure():
            return self.current_coordinator
        
        print("\n" + "=" * 60)
        print("[FALHA DETECTADA] Coordenador não responde!")
        print("=" * 60)
        
        self.election_in_progress = False
        
        # Encontra um superpeer ativo para iniciar a eleição
        active = self.get_active_superpeers()
        if not active:
            print("  ⚠️  Nenhum superpeer ativo na rede!")
            return None
        
        # O primeiro superpeer ativo que detectar a falha inicia a eleição
        initiator = active[0]
        self.log(f"{initiator.node_id} detectou falha do coordenador")
        
        return self.start_election(initiator)
    
    def get_election_summary(self) -> str:
        """Retorna resumo do estado atual da eleição."""
        coord = self.current_coordinator
        if coord:
            return f"Coordenador atual: {coord.node_id} (power: {coord.power_score})"
        return "Nenhum coordenador eleito"
