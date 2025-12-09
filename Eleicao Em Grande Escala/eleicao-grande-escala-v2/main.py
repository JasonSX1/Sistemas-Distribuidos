import argparse
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from server import create_node
from config import DEFAULT_HOST, DEFAULT_PORT


def print_header():
    print("\n" + "=" * 60)
    print("  ELEICAO DISTRIBUIDA - ALGORITMO BULLY")
    print("  Sistemas Distribuidos")
    print("=" * 60)


def parse_args():
    parser = argparse.ArgumentParser(description="No distribuido para eleicao hierarquica")
    parser.add_argument("--host", type=str, default=DEFAULT_HOST, help="Host para bind")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Porta do servidor")
    parser.add_argument("--peers", type=str, default="", help="Lista de peers (ex: localhost:5002,localhost:5003)")
    parser.add_argument("--power", type=int, default=None, help="Power score manual")
    return parser.parse_args()


def main():
    args = parse_args()
    print_header()
    
    peers = []
    if args.peers:
        peers = [p.strip() for p in args.peers.split(",") if p.strip()]
    
    if not peers:
        print("\n⚠️ Erro: Nenhum peer configurado!")
        print("   Use --peers para especificar outros nos.")
        print("   Exemplo: --peers localhost:5002,localhost:5003")
        return
    
    print(f"\n📌 Configuracao:")
    print(f"   Host: {args.host}")
    print(f"   Porta: {args.port}")
    print(f"   Peers: {peers}")
    if args.power:
        print(f"   Power Score: {args.power}")
    
    print("\n" + "-" * 60)
    print("   Iniciando no distribuido...")
    print("-" * 60 + "\n")
    
    node = create_node(
        host=args.host,
        port=args.port,
        peers=peers,
        power_score=args.power
    )
    
    try:
        node.start()
        print("\n" + "=" * 60)
        print("  ✅ NO ATIVO - Comandos: status, election, quit")
        print("=" * 60 + "\n")
        
        while True:
            try:
                cmd = input().strip().lower()
                
                if cmd == "status":
                    print(node.get_status_display())
                elif cmd == "election":
                    print("🗳️ Forcando nova eleicao...")
                    node.election_in_progress = False
                    node.start_election()
                elif cmd in ["quit", "exit", "q"]:
                    print("👋 Encerrando...")
                    break
                elif cmd == "help":
                    print("Comandos: status, election, quit")
                elif cmd:
                    print(f"Comando desconhecido: {cmd}")
                    
            except EOFError:
                break
    
    except KeyboardInterrupt:
        print("\n\n👋 Interrompido pelo usuario.")
    
    finally:
        node.stop()
        print("✅ No encerrado.")


if __name__ == "__main__":
    main()
