# Eleição em Sistemas de Grande Escala

## 📋 Sobre o Projeto

Este projeto implementa uma **simulação de algoritmos de eleição em sistemas distribuídos de grande escala**, utilizando a arquitetura de **Super Pares (Superpeers)**.

### Disciplina
- **Sistemas Distribuídos**
- **Tema 3.3**: Eleições em sistemas de grande escala

## 🎯 Conceito

Em sistemas distribuídos de grande escala (milhares ou milhões de nós), os algoritmos tradicionais de eleição (Bully, Ring) não escalam bem devido ao alto número de mensagens trocadas.

### Solução: Arquitetura de Super Pares

```
                    [Coordenador Global]
                           │
           ┌───────────────┼───────────────┐
           │               │               │
      [Super Par 1]   [Super Par 2]   [Super Par 3]
           │               │               │
       ┌───┴───┐       ┌───┴───┐       ┌───┴───┐
       P1  P2  P3      P4  P5  P6      P7  P8  P9
```

- **Pares regulares (Peers)**: Nós comuns organizados em grupos
- **Super Pares (Superpeers)**: Nós mais "fortes" que coordenam cada grupo
- **Eleição hierárquica**: Eleições ocorrem apenas entre Super Pares

## 🚀 Como Executar

```bash
cd eleicao-grande-escala
python main.py
```

### Modos de Execução:
1. **Interativo**: Com pausas para explicação de cada fase
2. **Automático**: Execução direta sem pausas

## 📁 Estrutura do Projeto

```
eleicao-grande-escala/
├── main.py                 # Ponto de entrada
├── node.py                 # Classe base para pares (Node)
├── superpeer.py            # Classe Super Par (Superpeer)
├── election_manager.py     # Gerenciador de Eleição
├── network_simulator.py    # Simulador da rede
└── README.md               # Este arquivo
```

## 🔧 Componentes

| Arquivo | Descrição |
|---------|-----------|
| `node.py` | Classe base `Node` representando um par regular |
| `superpeer.py` | Classe `Superpeer` (Super Par) que coordena grupos e participa de eleições |
| `election_manager.py` | Implementa o algoritmo Bully adaptado para Super Pares |
| `network_simulator.py` | Simula a rede distribuída com visualização ASCII |
| `main.py` | Interface principal com demonstração interativa |

## 📊 O que a Simulação Demonstra

1. **Criação da Rede**: Gera grupos de pares com `power_score` aleatório
2. **Eleição Local**: Cada grupo elege seu Super Par (maior `power_score`)
3. **Eleição Global**: Super Pares competem para ser o Coordenador Global
4. **Tolerância a Falhas**: Simula falha do coordenador e re-eleição

## 🏆 Vantagens da Abordagem Hierárquica

| Aspecto | Tradicional | Hierárquica |
|---------|-------------|-------------|
| Mensagens | O(n²) | O(s²), onde s << n |
| Escalabilidade | Baixa | Alta |
| Re-eleição | Toda a rede | Apenas Super Pares |

## 📚 Referências

- Tanenbaum, A. S., & Van Steen, M. - *Distributed Systems: Principles and Paradigms*
- Garcia-Molina, H. - *Elections in a Distributed Computing System*
