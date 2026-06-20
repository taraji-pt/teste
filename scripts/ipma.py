import requests

URL = "https://api.ipma.pt/open-data/observation/meteorology/stations/observations.json"

r = requests.get(URL, timeout=30)
r.raise_for_status()

dados = r.json()

print(type(dados))
print("Total registos:", len(dados))
