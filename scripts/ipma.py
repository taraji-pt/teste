import requests
import csv
import os

URL = "https://api.ipma.pt/open-data/observation/meteorology/stations/observations.json"

ESTACAO_A = "5210758"
ESTACAO_B = "1210766"

r = requests.get(URL)
dados = r.json()

ultimo = sorted(dados.keys())[-1]

a = dados[ultimo].get(ESTACAO_A, {}).get("precAcumulada")
b = dados[ultimo].get(ESTACAO_B, {}).get("precAcumulada")

if a is None:
    a = ""

if b is None:
    b = ""

ficheiro = "dados/historico.csv"

ja_existe = set()

if os.path.exists(ficheiro):
    with open(ficheiro, newline="", encoding="utf-8") as f:
        leitor = csv.reader(f)
        next(leitor, None)

        for linha in leitor:
            ja_existe.add(linha[0])

if ultimo not in ja_existe:
    with open(ficheiro, "a", newline="", encoding="utf-8") as f:
        escritor = csv.writer(f)
        escritor.writerow([ultimo, a, b])

    print("Novo registo guardado")
else:
    print("Já existe")
