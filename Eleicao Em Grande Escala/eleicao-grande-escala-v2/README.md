# Eleicao Distribuida - Algoritmo Bully

Sistema distribuido de eleicao hierarquica usando HTTP.

## Instalacao

```bash
pip install -r requirements.txt
```

## Uso

Abra 3 terminais:

**Terminal 1:**
```bash
python main.py --port 5001 --peers localhost:5002,localhost:5003
```

**Terminal 2:**
```bash
python main.py --port 5002 --peers localhost:5001,localhost:5003
```

**Terminal 3:**
```bash
python main.py --port 5003 --peers localhost:5001,localhost:5002
```

## Comandos

| Comando | Descricao |
|---------|-----------|
| status | Mostra estado do no |
| election | Forca nova eleicao |
| quit | Encerra o no |

## Opcoes

| Opcao | Descricao | Padrao |
|-------|-----------|--------|
| --host | Host para bind | 0.0.0.0 |
| --port | Porta do servidor | 5001 |
| --peers | Lista de peers | - |
| --power | Power score | aleatorio |
