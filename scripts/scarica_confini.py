#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Dead People Activity — Scarica i CONFINI dei paesi europei in LOCALE
====================================================================

PERCHE':
  La mappa disegna i paesi (poligoni cliccabili) usando un file GeoJSON.
  Finora veniva preso da una CDN esterna: se la rete o il browser la bloccano,
  i confini non caricano e la mappa non fa lo zoom sul paese.
  Questo script scarica il file UNA VOLTA e lo salva dentro il sito
  (assets/data/europe.geojson), così i confini caricano sempre dal tuo dominio,
  senza dipendere da nessuna CDN.

USO (una volta sola):
  python scarica_confini.py
  # oppure doppio click su  scarica_confini.bat

Dopo averlo eseguito: ricarica la mappa. Poi committa/pusha il file europe.geojson
così i confini valgono anche per il sito online.

Dipendenze: solo libreria standard.
"""

import json
import os
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "assets", "data", "europe.geojson"))

SOURCES = [
    "https://raw.githubusercontent.com/leakyMirror/map-of-europe/master/GeoJSON/europe.geojson",
    "https://cdn.jsdelivr.net/gh/leakyMirror/map-of-europe@master/GeoJSON/europe.geojson",
]


def _round_coords(c):
    # Arrotonda a 2 decimali (~1 km): confini identici all'occhio, file piu' leggero.
    if isinstance(c, (int, float)):
        return round(c, 2)
    if c and isinstance(c[0], (int, float)):
        return [round(c[0], 2), round(c[1], 2)]
    return [_round_coords(x) for x in c]


def main():
    data = None
    for u in SOURCES:
        try:
            print("Scarico i confini da:", u)
            req = urllib.request.Request(u, headers={"User-Agent": "DeadPeopleActivity/1.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.load(r)
            break
        except Exception as e:
            print("  ! fonte non raggiungibile:", e)
    if not data or not data.get("features"):
        print("ERRORE: impossibile scaricare i confini da nessuna fonte. Riprova piu' tardi.")
        return

    # Alleggerisci: tieni solo il nome del paese + coordinate arrotondate.
    for f in data.get("features", []):
        p = f.get("properties") or {}
        name = p.get("NAME") or p.get("name") or p.get("NAME_EN") or ""
        f["properties"] = {"NAME": name}
        g = f.get("geometry")
        if g and "coordinates" in g:
            g["coordinates"] = _round_coords(g["coordinates"])

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(data, fh, separators=(",", ":"), ensure_ascii=False)

    kb = os.path.getsize(OUT) // 1024
    print("FATTO. Salvato:", OUT)
    print("       Paesi:", len(data.get("features", [])), "- Dimensione:", kb, "KB")
    print("Ora ricarica la mappa. Poi committa/pusha europe.geojson per il sito online.")


if __name__ == "__main__":
    main()
