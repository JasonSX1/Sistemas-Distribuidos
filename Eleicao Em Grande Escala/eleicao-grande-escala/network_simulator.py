"""
network_simulator.py - Simulador de Rede Distribuída

Este módulo simula uma rede distribuída de grande escala com
arquitetura de Superpeers.
"""

import random
from typing import List, Tuple
from node import Node, create_random_node
from superpeer import Superpeer, elect_superpeer_from_group
from election_manager import ElectionManager


class NetworkSimulator:
    """
    Simula uma rede distribuída de grande escala.
    
    Cria uma estrutura hierárquica com:
    - Múltiplos grupos de peers
    - Superpeers coordenando cada grupo
    - Eleição global entre superpeers
    
    Attributes:
        num_groups: Número de grupos na rede
        peers_per_group: Número de peers por grupo
        groups: Lista de grupos (cada grupo é uma lista de peers)
        superpeers: Lista de superpeers eleitos
        election_manager: Gerenciador de eleições
    """
    
    def __init__(self, num_groups: int = 3, peers_per_group: int = 5):
        self.num_groups = num_groups
        self.peers_per_group = peers_per_group
        self.groups: List[List[Node]] = []
        self.superpeers: List[Superpeer] = []
        self.election_manager: ElectionManager = None
        
        # Contador para IDs de peers
        self.peer_counter = 1
    
    def create_network(self) -> None:
        """Cria a estrutura completa da rede."""
        print("\n" + "=" * 60)
        print("     CRIAÇÃO DA REDE DISTRIBUÍDA")
        print("=" * 60)
        print(f"\nCriando rede com {self.num_groups} grupos e "
              f"{self.num_groups * self.peers_per_group} peers total...\n")
        
        # Cria grupos de peers
        for group_id in range(1, self.num_groups + 1):
            group = self.create_peer_group(group_id)
            self.groups.append(group)
            
            # Elege superpeer do grupo
            print(f"\nGrupo {group_id}: Peers [{', '.join(p.node_id for p in group)}]")
            superpeer = elect_superpeer_from_group(group, group_id)
            self.superpeers.append(superpeer)
        
        # Inicializa o gerenciador de eleições
        self.election_manager = ElectionManager(self.superpeers)
    
    def create_peer_group(self, group_id: int) -> List[Node]:
        """
        Cria um grupo de peers com power_score aleatório.
        
        Args:
            group_id: ID do grupo
        
        Returns:
            Lista de peers criados
        """
        peers = []
        for _ in range(self.peers_per_group):
            node_id = f"P{self.peer_counter}"
            node = create_random_node(node_id, min_power=10, max_power=100)
            node.group_id = group_id
            peers.append(node)
            self.peer_counter += 1
        return peers
    
    def run_global_election(self) -> Superpeer:
        """
        Executa eleição global entre superpeers.
        
        Returns:
            Superpeer eleito como coordenador global
        """
        print("\n" + "=" * 60)
        print("     ELEIÇÃO GLOBAL ENTRE SUPERPEERS")
        print("=" * 60)
        
        # O superpeer com menor power inicia a eleição (simula detecção de necessidade)
        initiator = min(self.superpeers, key=lambda sp: sp.power_score)
        
        print(f"\n{initiator.node_id} (menor power) inicia a eleição...\n")
        
        coordinator = self.election_manager.start_election(initiator)
        return coordinator
    
    def simulate_superpeer_failure(self, superpeer: Superpeer = None) -> None:
        """
        Simula a falha de um superpeer.
        
        Args:
            superpeer: Superpeer que vai falhar. Se None, usa o coordenador atual.
        """
        target = superpeer or self.election_manager.current_coordinator
        
        if target is None:
            print("  ⚠️  Nenhum superpeer para simular falha")
            return
        
        print("\n" + "=" * 60)
        print(f"     SIMULAÇÃO DE FALHA: {target.node_id}")
        print("=" * 60)
        
        target.fail()
    
    def handle_failure_and_reelect(self) -> Superpeer:
        """
        Detecta falha do coordenador e inicia re-eleição.
        
        Returns:
            Novo coordenador eleito
        """
        return self.election_manager.handle_coordinator_failure()
    
    def visualize_network(self) -> None:
        """Exibe visualização ASCII da estrutura da rede."""
        coordinator = self.election_manager.current_coordinator
        
        print("\n" + "=" * 60)
        print("     ESTRUTURA ATUAL DA REDE")
        print("=" * 60)
        
        # Cabeçalho com coordenador
        if coordinator:
            print(f"\n                    ★ {coordinator.node_id} (COORDENADOR GLOBAL)")
            print(f"                       power: {coordinator.power_score}")
            print("                           │")
        else:
            print("\n             ⚠️  NENHUM COORDENADOR ATIVO")
            print("                           │")
        
        # Linha conectando grupos
        group_width = 20
        total_width = group_width * len(self.superpeers)
        
        # Linhas de conexão
        connectors = "───────────────────" * len(self.superpeers)
        print(f"           ┌{'─' * (total_width // 2)}┼{'─' * (total_width // 2)}┐")
        
        # Superpeers
        superpeer_line = ""
        for sp in self.superpeers:
            status = "★" if sp.is_global_coordinator else ("✗" if not sp.is_alive else "●")
            superpeer_line += f"      [{status}] {sp.node_id:6}    "
        print(superpeer_line)
        
        # Power dos superpeers
        power_line = ""
        for sp in self.superpeers:
            power_line += f"      power: {sp.power_score:3}    "
        print(power_line)
        
        # Separador
        sep_line = ""
        for _ in self.superpeers:
            sep_line += "           │         "
        print(sep_line)
        
        # Peers de cada grupo
        max_peers = max(len(sp.peers) for sp in self.superpeers) if self.superpeers else 0
        
        for i in range(max_peers):
            peer_line = ""
            for sp in self.superpeers:
                if i < len(sp.peers):
                    peer = sp.peers[i]
                    status = "✓" if peer.is_alive else "✗"
                    peer_line += f"      {status} {peer.node_id:6}      "
                else:
                    peer_line += "                      "
            print(peer_line)
        
        print("\n" + "=" * 60)
    
    def get_network_stats(self) -> dict:
        """Retorna estatísticas da rede."""
        total_peers = sum(1 + sp.get_peer_count() for sp in self.superpeers)
        active_superpeers = sum(1 for sp in self.superpeers if sp.is_alive)
        
        return {
            "total_grupos": self.num_groups,
            "total_peers": total_peers,
            "superpeers_ativos": active_superpeers,
            "coordenador": self.election_manager.current_coordinator.node_id 
                          if self.election_manager.current_coordinator else "Nenhum"
        }
    
    def print_stats(self) -> None:
        """Imprime estatísticas da rede."""
        stats = self.get_network_stats()
        print("\n📊 Estatísticas da Rede:")
        print(f"   • Total de grupos: {stats['total_grupos']}")
        print(f"   • Total de peers: {stats['total_peers']}")
        print(f"   • Superpeers ativos: {stats['superpeers_ativos']}")
        print(f"   • Coordenador global: {stats['coordenador']}")
