# -*- coding: utf-8 -*-
"""
DEAD PEOPLE ACTIVITY - Trova gli AREA-ID di Resident Advisor.

RA identifica ogni citta' con un numero (area id). Questo script li SCOPRE da
solo: interroga la stessa API GraphQL che usa gia' residentadvisor.py, prova
un intervallo di id e, per ogni id che ha eventi, legge nome citta' + paese.
Alla fine stampa una riga  set RA_AREAS=...  pronta da incollare in config.bat,
gia' unita a quelle che hai gia' e senza doppioni.

USO (dal PC, nella cartella scripts):
    py -3 ra_trova_aree.py
    py -3 ra_trova_aree.py --da 1 --a 700           # intervallo id da scandire
    py -3 ra_trova_aree.py --paesi fr,es,pt,gr       # solo alcuni paesi
    py -3 ra_trova_aree.py --pausa 0.8               # piu' lento (piu' gentile)

Non modifica nulla: fa solo letture e stampa il risultato.
Dipendenze: solo libreria standard.
"""

import argparse
import json
import sys
import time
import urllib.request
from datetime import date, timedelta

GRAPHQL_URL = "https://ra.co/graphql"

# Aree che hai GIA' in config.bat (verranno unite ai risultati, senza doppioni).
RA_AREAS_ESISTENTI = [20, 41, 607, 347, 351, 350, 348, 406, 34, 13]

# Paesi europei di default (urlCode ISO2 minuscolo). --paesi per restringere.
PAESI_EU_DEFAULT = [
    "fr", "es", "pt", "gr", "it", "de", "gb", "ie", "nl", "be", "at", "ch",
    "se", "no", "dk", "fi", "pl", "cz", "hu", "ro", "hr", "si", "rs", "bg",
    "sk", "lt", "lv", "ee", "lu", "is",
]

QUERY = """
query GET_EVENT_LISTINGS($filters: FilterInputDtoInput, $pageSize: Int, $page: Int) {
  eventListings(filters: $filters, pageSize: $pageSize, page: $page, sort: {listingDate: {order: ASCENDING}}) {
    data { event { venue { area { name country { name urlCode } } } } }
    totalResults
  }
}
""".strip()


def interroga_area(area_id, gte, lte, pausa, tentativi=3):
    """Ritorna (nome_citta, urlCode_paese, nome_paese, totale_eventi) o None."""
    variables = {
        "filters": {"areas": {"eq": int(area_id)},
                    "listingDate": {"gte": gte, "lte": lte}},
        "pageSize": 1,
        "page": 1,
    }
    body = json.dumps({"operationName": "GET_EVENT_LISTINGS",
                       "variables": variables, "query": QUERY}).encode("utf-8")
    for t in range(tentativi):
        req = urllib.request.Request(GRAPHQL_URL, data=body, headers={
            "Content-Type": "application/json",
            "User-Agent": "DeadPeopleActivity/1.0",
            "Referer": "https://ra.co/events",
            "Origin": "https://ra.co",
        })
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                data = json.load(r)
            listings = (((data or {}).get("data") or {}).get("eventListings") or {})
            tot = int(listings.get("totalResults") or 0)
            rows = listings.get("data") or []
            time.sleep(pausa)
            if tot <= 0 or not rows:
                return None
            area = (((rows[0].get("event") or {}).get("venue") or {}).get("area") or {})
            country = area.get("country") or {}
            return (area.get("name") or "?",
                    (country.get("urlCode") or "").lower(),
                    country.get("name") or "?",
                    tot)
        except Exception as e:
            wait = 3 * (t + 1)
            print(f"  ! area {area_id}: errore ({e}); riprovo tra {wait}s", file=sys.stderr)
            time.sleep(wait)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--da", type=int, default=1, help="primo area id da provare")
    ap.add_argument("--a", type=int, default=700, help="ultimo area id da provare")
    ap.add_argument("--paesi", default="", help="lista urlCode separati da virgola (default: Europa)")
    ap.add_argument("--giorni", type=int, default=120, help="finestra date in avanti")
    ap.add_argument("--pausa", type=float, default=0.6, help="pausa tra le richieste (secondi)")
    args = ap.parse_args()

    paesi = [p.strip().lower() for p in args.paesi.split(",") if p.strip()] or PAESI_EU_DEFAULT
    oggi = date.today()
    gte = oggi.isoformat() + "T00:00:00.000Z"
    lte = (oggi + timedelta(days=args.giorni)).isoformat() + "T00:00:00.000Z"

    print(f"Scansione aree RA da {args.da} a {args.a} | paesi: {','.join(paesi)}")
    print(f"Finestra: prossimi {args.giorni} giorni | pausa {args.pausa}s\n")

    trovate = {}   # area_id -> (citta, cc, paese, totale)
    for aid in range(args.da, args.a + 1):
        res = interroga_area(aid, gte, lte, args.pausa)
        if res:
            citta, cc, paese, tot = res
            marca = ""
            if paesi and cc not in paesi:
                marca = "  (fuori dai paesi scelti)"
            else:
                trovate[aid] = (citta, cc, paese, tot)
            print(f"  [{aid}] {citta} ({cc}) - {tot} eventi{marca}")

    # Raggruppa per paese e stampa
    print("\n" + "=" * 60)
    print("AREE TROVATE NEI PAESI SCELTI (con eventi nei prossimi giorni)")
    print("=" * 60)
    per_paese = {}
    for aid, (citta, cc, paese, tot) in trovate.items():
        per_paese.setdefault(cc, []).append((tot, aid, citta))
    for cc in sorted(per_paese):
        righe = sorted(per_paese[cc], reverse=True)
        print(f"\n{cc.upper()}:")
        for tot, aid, citta in righe:
            nuovo = "" if aid in RA_AREAS_ESISTENTI else "  <-- NUOVO"
            print(f"   {aid:>4}  {citta:<24} {tot:>4} eventi{nuovo}")

    # Riga finale pronta da incollare
    uniti = sorted(set(RA_AREAS_ESISTENTI) | set(trovate.keys()))
    print("\n" + "=" * 60)
    print("INCOLLA QUESTA RIGA IN config.bat (sostituisce la vecchia RA_AREAS):")
    print("=" * 60)
    print("set RA_AREAS=" + ",".join(str(x) for x in uniti))
    print(f"\n(erano {len(RA_AREAS_ESISTENTI)} aree, ora {len(uniti)})")


if __name__ == "__main__":
    main()
