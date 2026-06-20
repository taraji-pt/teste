import requests
import csv
import os

URL = "https://api.ipma.pt/open-data/observation/meteorology/stations/observations.json"

ESTACAO_A = "5210758"
AESTACAO_B = "1210766"

r = requests.get(URL, timeout=30)
r.raise_for_status()

dados = r.json()

ultimo = None
a = ""
b = ""

for timestamp in sorted(dados.keys(), reverse=True):
registo = dados[timestamp]

if registo is None:
    continue

est_a = registo.get(ESTACAO_A, {})
est_b = registo.get(ESTACAO_B, {})

a = est_a.get("precAcumulada", "")
b = est_b.get("precAcumulada", "")

ultimo = timestamp
break

if ultimo is None:
raise Exception("Nenhum registo válido encontrado")

ficheiro = "dados/historico.csv"

ja_existe = set()

if os.path.exists(ficheiro):
with open(ficheiro, newline="", encoding="utf-8") as f:
leitor = csv.reader(f)
next(leitor, None)

    for linha in leitor:
        if linha:
            ja_existe.add(linha[0])

if ultimo not in ja_existe:
with open(ficheiro, "a", newline="", encoding="utf-8") as f:
escritor = csv.writer(f)
escritor.writerow([ultimo, a, b])

print("Novo registo guardado:", ultimo)

else:
print("Registo já existente:", ultimo)
