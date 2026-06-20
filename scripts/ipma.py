import requests
import csv
import os

URL = "https://api.ipma.pt/open-data/observation/meteorology/stations/observations.json"

ESTACAO_A = "5210758"
ESTACAO_B = "1210766"

FICHEIRO = "dados/historico.csv"

# Ler dados do IPMA
r = requests.get(URL, timeout=30)
r.raise_for_status()
dados = r.json()

# Garantir que o CSV existe
if not os.path.exists(FICHEIRO):
    with open(FICHEIRO, "w", newline="", encoding="utf-8") as f:
        escritor = csv.writer(f)
        escritor.writerow(["timestamp", "alcochete", "barreiro"])

# Ler timestamps já existentes
existentes = set()

with open(FICHEIRO, newline="", encoding="utf-8") as f:
    leitor = csv.reader(f)
    next(leitor, None)

    for linha in leitor:
        if len(linha) > 0:
            existentes.add(linha[0])

# Novos registos
novos = []

for timestamp in sorted(dados.keys()):

    registo = dados[timestamp]

    if registo is None:
        continue

    if timestamp in existentes:
        continue

    est_a = registo.get(ESTACAO_A) or {}
    est_b = registo.get(ESTACAO_B) or {}

    chuva_a = est_a.get("precAcumulada", "")
    chuva_b = est_b.get("precAcumulada", "")

    novos.append([
        timestamp,
        chuva_a,
        chuva_b
    ])

# Guardar novos registos
if novos:

    with open(FICHEIRO, "a", newline="", encoding="utf-8") as f:

        escritor = csv.writer(f)

        for linha in novos:
            escritor.writerow(linha)

    print(f"Foram adicionados {len(novos)} registos.")

else:
    print("Nenhum registo novo.")
