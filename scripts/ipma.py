import requests
import csv
import os

URL = "https://api.ipma.pt/open-data/observation/meteorology/stations/observations.json"

ESTACAO_A = "5210758"
ESTACAO_B = "1210766"

r = requests.get(URL, timeout=30)
r.raise_for_status()

dados = r.json()

ficheiro = "dados/historico.csv"

existentes = set()

if os.path.exists(ficheiro):
with open(ficheiro, newline="", encoding="utf-8") as f:
leitor = csv.reader(f)
next(leitor, None)

    for linha in leitor:
        if linha:
            existentes.add(linha[0])

novos = []

for timestamp in sorted(dados.keys()):

registo = dados[timestamp]

if registo is None:
    continue

if timestamp in existentes:
    continue

est_a = registo.get(ESTACAO_A, {})
est_b = registo.get(ESTACAO_B, {})

a = est_a.get("precAcumulada", "")
b = est_b.get("precAcumulada", "")

novos.append([timestamp, a, b])

if novos:

with open(ficheiro, "a", newline="", encoding="utf-8") as f:
    escritor = csv.writer(f)

    for linha in novos:
        escritor.writerow(linha)

print(f"Foram adicionados {len(novos)} registos")

else:
print("Nenhum registo novo")
