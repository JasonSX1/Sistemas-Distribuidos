"""
main.py - Ponto de entrada da simulação

Demonstração de Algoritmos de Eleição em Sistemas de Grande Escala
Disciplina: Sistemas Distribuídos
Tema: 3.3 - Eleições em sistemas de grande escala

Este programa simula:
1. Criação de rede hierárquica com Superpeers
2. Eleição local (dentro de cada grupo)
3. Eleição global (entre superpeers)
4. Detecção de falha e re-eleição
"""

import time
import random
from network_simulator import NetworkSimulator


def print_header():
    """Imprime cabeçalho do programa."""
    print("\n" + "=" * 70)
    print("║" + " " * 68 + "║")
    print("║" + "   ELEIÇÃO EM SISTEMAS DE GRANDE ESCALA - SIMULAÇÃO   ".center(68) + "║")
    print("║" + " " * 68 + "║")
    print("║" + "   Disciplina: Sistemas Distribuídos   ".center(68) + "║")
    print("║" + "   Tema 3.3: Eleições em sistemas de grande escala   ".center(68) + "║")
    print("║" + " " * 68 + "║")
    print("=" * 70)


def print_theory():
    """Imprime breve explicação teórica."""
    print("\n" + "─" * 70)
    print("📚 CONCEITO TEÓRICO")
    print("─" * 70)
    print("""
Em sistemas distribuídos de GRANDE ESCALA (milhares/milhões de nós),
algoritmos tradicionais de eleição (Bully, Ring) não escalam bem.

SOLUÇÃO: Arquitetura de SUPERPEERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• A rede é dividida em GRUPOS de peers
• Cada grupo elege um SUPERPEER (nó mais "forte")
• Eleições globais ocorrem apenas entre SUPERPEERS
• Isso reduz drasticamente o número de mensagens trocadas

VANTAGENS:
✓ Escalabilidade: O(S²) mensagens ao invés de O(N²), onde S << N
✓ Hierarquia: Coordenação local + global
✓ Tolerância a falhas: Re-eleição rápida apenas entre superpeers
""")
    print("─" * 70)


def run_interactive_demo():
    """Executa demonstração interativa."""
    print_header()
    print_theory()
    
    input("\n⏸️  Pressione ENTER para iniciar a simulação...")
    
    # ===== FASE 1: Criação da Rede =====
    print("\n" + "🔷" * 35)
    print("   FASE 1: CRIAÇÃO DA REDE E ELEIÇÃO LOCAL")
    print("🔷" * 35)
    
    # Define semente para reprodutibilidade (pode ser removido)
    random.seed(42)
    
    # Cria simulador com 3 grupos e 4 peers por grupo
    simulator = NetworkSimulator(num_groups=3, peers_per_group=4)
    simulator.create_network()
    
    input("\n⏸️  Pressione ENTER para ver a eleição global...")
    
    # ===== FASE 2: Eleição Global =====
    print("\n" + "🔷" * 35)
    print("   FASE 2: ELEIÇÃO GLOBAL ENTRE SUPERPEERS")
    print("🔷" * 35)
    
    coordinator = simulator.run_global_election()
    
    # Mostra estrutura da rede
    simulator.visualize_network()
    simulator.print_stats()
    
    input("\n⏸️  Pressione ENTER para simular falha do coordenador...")
    
    # ===== FASE 3: Simulação de Falha =====
    print("\n" + "🔷" * 35)
    print("   FASE 3: FALHA E RE-ELEIÇÃO")
    print("🔷" * 35)
    
    # Simula falha do coordenador atual
    simulator.simulate_superpeer_failure()
    
    # Detecta e trata a falha
    time.sleep(0.5)  # Simula detecção de timeout
    new_coordinator = simulator.handle_failure_and_reelect()
    
    # Mostra nova estrutura
    simulator.visualize_network()
    simulator.print_stats()
    
    # ===== RESUMO FINAL =====
    print("\n" + "=" * 70)
    print("   RESUMO DA SIMULAÇÃO")
    print("=" * 70)
    print(f"""
📊 RESULTADOS:
   • Rede criada com {simulator.num_groups} grupos
   • Total de {simulator.num_groups * simulator.peers_per_group} peers
   • Primeiro coordenador: {coordinator.node_id if coordinator else 'N/A'}
   • Após falha, novo coordenador: {new_coordinator.node_id if new_coordinator else 'N/A'}

✅ DEMONSTRAÇÃO CONCLUÍDA COM SUCESSO!
   
   O algoritmo de eleição hierárquica mostrou:
   1. Eleição local eficiente dentro de cada grupo
   2. Eleição global apenas entre superpeers (menos mensagens)
   3. Detecção de falha e re-eleição rápida
""")
    print("=" * 70)


def run_automatic_demo():
    """Executa demonstração automática (sem pausas)."""
    print_header()
    
    print("\n🤖 Modo automático - executando todas as fases...")
    
    random.seed(42)
    
    # Fase 1: Criação
    simulator = NetworkSimulator(num_groups=3, peers_per_group=4)
    simulator.create_network()
    
    # Fase 2: Eleição Global
    coordinator = simulator.run_global_election()
    simulator.visualize_network()
    
    # Fase 3: Falha e Re-eleição
    simulator.simulate_superpeer_failure()
    new_coordinator = simulator.handle_failure_and_reelect()
    simulator.visualize_network()
    
    print("\n✅ Simulação automática concluída!")
    print(f"   Coordenador final: {new_coordinator.node_id if new_coordinator else 'Nenhum'}")


def main():
    """Função principal."""
    print("\n" + "═" * 50)
    print("  SELECIONE O MODO DE EXECUÇÃO:")
    print("═" * 50)
    print("  [1] Modo Interativo (com pausas para explicação)")
    print("  [2] Modo Automático (execução direta)")
    print("═" * 50)
    
    try:
        choice = input("\n  Digite sua escolha (1 ou 2): ").strip()
        
        if choice == "1":
            run_interactive_demo()
        elif choice == "2":
            run_automatic_demo()
        else:
            print("  Opção inválida. Executando modo interativo...")
            run_interactive_demo()
            
    except KeyboardInterrupt:
        print("\n\n  ⚠️ Execução interrompida pelo usuário.")
    except Exception as e:
        print(f"\n  ❌ Erro: {e}")
        raise


if __name__ == "__main__":
    main()
