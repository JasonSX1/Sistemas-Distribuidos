"""
node.py - Classe base para nós (peers) na rede distribuída

Este módulo define a classe Node que representa um peer regular na rede.
Cada nó possui um ID único e um power_score que representa sua capacidade
computacional (usado para eleições).
"""

import random
from dataclasses import dataclass
from typing import Optional


@dataclass
class Node:
    """
    Representa um nó (peer) regular na rede distribuída.
    
    Attributes:
        node_id: Identificador único do nó
        power_score: Pontuação de "força" do nó (CPU, memória, uptime, etc.)
        is_alive: Indica se o nó está ativo
        group_id: ID do grupo ao qual o nó pertence
        superpeer_id: ID do superpeer que coordena este nó
    """
    node_id: str
    power_score: int
    is_alive: bool = True
    group_id: Optional[int] = None
    superpeer_id: Optional[str] = None
    
    def __str__(self) -> str:
        status = "✓" if self.is_alive else "✗"
        return f"[{status}] {self.node_id} (power: {self.power_score})"
    
    def __repr__(self) -> str:
        return f"Node(id={self.node_id}, power={self.power_score}, alive={self.is_alive})"
    
    def fail(self) -> None:
        """Simula a falha do nó."""
        self.is_alive = False
        print(f"  💥 {self.node_id} FALHOU!")
    
    def recover(self) -> None:
        """Simula a recuperação do nó."""
        self.is_alive = True
        print(f"  ♻️  {self.node_id} recuperado!")


def create_random_node(node_id: str, min_power: int = 10, max_power: int = 100) -> Node:
    """
    Cria um nó com power_score aleatório.
    
    Args:
        node_id: ID do nó
        min_power: Valor mínimo do power_score
        max_power: Valor máximo do power_score
    
    Returns:
        Novo objeto Node com power_score aleatório
    """
    power = random.randint(min_power, max_power)
    return Node(node_id=node_id, power_score=power)
