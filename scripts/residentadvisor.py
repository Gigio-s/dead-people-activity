#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Dead People Activity — FONTE SEPARATA: RESIDENT ADVISOR (ra.co)
==============================================================

COSA FA:
  Script a parte (come dice.py / skiddle.py) che raccoglie gli eventi di
  Resident Advisor (techno / elettronica / club) per una o piu' AREE (citta')
  e li mette nella STESSA coda in attesa (events_pending.json).

COME FUNZIONA (nessuna chiave necessaria):
  RA espone una API GraphQL pubblica su  https://ra.co/graphql
  Interroghiamo l'operazione "GET_EVENT_LISTINGS" per una certa AREA (numero)
  e un intervallo di date, pagina per pagina.

IMPORTANTE — GLI AREA_ID:
  RA identifica ogni citta' con un NUMERO (area id). Devi metterli in config.bat:
        set RA_AREAS=20,34,229     (esempi: vedi sotto come trovarli)
  Come trovare l'area id di una citta':
    1. vai su https://ra.co/events e scegli la citta';
    2. guarda l'URL o i filtri: compare un numero area (es. .../events/es/barcelona);
       aprendo gli strumenti sviluppatore (F12) -> Network -> graphql, nella
       richiesta vedi  "areas": { "eq": NUMERO }  -> quel NUMERO e' l'area id.
  Alcuni area id NOTI (verifica sempre, possono cambiare):
        Londra 13 · Berlino 34 · Barcellona 20 · Madrid 22 · Milano 229
  (Se un area id e' sbagliato, RA restituisce 0 eventi: cambialo e riprova.)

GENERE:
  RA e' una piattaforma di sola musica elettronica: qui NON arriva un tag genere
  per singolo evento, percio' assegniamo di default genere = ["electronic"] cosi'
  gli eventi passano il filtro generi condiviso (rientrano nella famiglia techno).

AFFILIAZIONE:
  RA non ha (ad oggi) un programma di affiliazione pubblico: i link ai biglietti
  puntano a ra.co senza tracciamento. Portano comunque traffico e contenuto.

USO:
  python residentadvisor.py            # scarica -> coda
  python residentadvisor.py --show     # mostra gli eventi RA in coda
  python residentadvisor.py --approva  # pubblica gli eventi RA in coda
"""

import json
import os
import sys
import time
import urllib.request
import urllib.parse
from datetime import date, timedelta

import ingest  # riusa normalizza, coda, dedup, filtro generi, pubblicazione

GRAPHQL_URL = "https://ra.co/graphql"

# Query GraphQL: elenco eventi per area + intervallo date, paginato.
QUERY = """
query GET_EVENT_LISTINGS($filters: FilterInputDtoInput, $pageSize: Int, $page: Int) {
  eventListings(filters: $filters, pageSize: $pageSize, page: $page, sort: {listingDate: {order: ASCENDING}}) {
    data {
      id
      listingDate
      event {
        id
        title
        date
        startTime
        contentUrl
        isTicketed
        venue { name address contentUrl area { name country { name urlCode } } }
        artists { name }
        images { filename }
      }
    }
    totalResults
  }
}
""".strip()


def _post_graphql(area_id, gte, lte, page, pausa):
    variables = {
        "filters": {
            "areas": {"eq": int(area_id)},
            "listingDate": {"gte": gte, "lte": lte},
        },
        "pageSize": 50,
        "page": page,
    }
    body = json.dumps({
        "operationName": "GET_EVENT_LISTINGS",
        "variables": variables,
        "query": QUERY,
    }).encode("utf-8")
    req = urllib.request.Request(GRAPHQL_URL, data=body, headers={
        "Content-Type": "application/json",
        "User-Agent": "DeadPeopleActivity/1.0",
        "Referer": "https://ra.co/events",
        "Origin": "https://ra.co",
    })
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            data = json.load(r)
    except Exception as e:
        print("  ! RA errore (area", area_id, "pag", page, "):", e)
        return [], 0
    listings = (((data or {}).get("data") or {}).get("eventListings") or {})
    rows = listings.get("data") or []
    totale = int(listings.get("totalResults") or 0)
    time.sleep(pausa)
    return rows, totale


def _to_raw(row):
    e = row.get("event") or {}
    venue = e.get("venue") or {}
    area = venue.get("area") or {}
    country = area.get("country") or {}

    # data + ora dallo startTime (ISO) o dalla listingDate
    dt = str(e.get("startTime") or e.get("date") or row.get("listingDate") or "")
    data_, ora = "", ""
    if len(dt) >= 10:
        data_ = dt[:10]
    if "T" in dt and len(dt) >= 16:
        ora = dt[11:16]

    artisti = [a.get("name") for a in (e.get("artists") or []) if isinstance(a, dict) and a.get("name")]
    imgs = e.get("images") or []
    locandina = imgs[0].get("filename") if imgs and isinstance(imgs[0], dict) else None

    content = e.get("contentUrl") or ""
    biglietti = ("https://ra.co" + content) if content.startswith("/") else (content or "")

    cc = (country.get("urlCode") or "").upper()

    return {
        "id": "ra-" + str(e.get("id") or ""),
        "nome": (e.get("title") or "").strip(),
        "descrizione": "",
        "data": data_, "ora": ora,
        "paese": country.get("name") or "", "paese_code": cc,
        "citta": area.get("name") or "",
        "indirizzo": venue.get("address") or "",
        "locale": venue.get("name") or "",
        "lat": None, "lng": None,          # RA non da' coordinate: le mette il geocoding di ingest
        "genere": ["electronic"],          # RA = solo elettronica -> passa il filtro (famiglia techno)
        "artisti": artisti,
        "tipo": "dj-set",
        "prezzo": None,
        "gratuito": not bool(e.get("isTicketed")),
        "biglietti_url": biglietti,
        "locandina": locandina,
        "promoter": "",
    }


def raccogli_ra():
    aree = [a.strip() for a in os.environ.get("RA_AREAS", "").split(",") if a.strip()]
    if not aree:
        print("  ! RA_AREAS vuota. Metti gli area id in config.bat, es: set RA_AREAS=20,34,229")
        print("    (come trovarli: vedi le istruzioni in cima a residentadvisor.py)")
        return []
    giorni = int(os.environ.get("RA_GIORNI", "90"))
    pausa = float(os.environ.get("RA_PAUSA", "0.5"))
    pagine_max = int(os.environ.get("RA_PAGINE", "6"))

    oggi = date.today()
    gte = oggi.isoformat() + "T00:00:00.000Z"
    lte = (oggi + timedelta(days=giorni)).isoformat() + "T23:59:59.999Z"

    tenuti = []
    for area in aree:
        raccolti_area = 0
        for pg in range(1, pagine_max + 1):
            rows, totale = _post_graphql(area, gte, lte, pg, pausa)
            if not rows:
                break
            for row in rows:
                raw = _to_raw(row)
                if raw["nome"] and ingest.genere_ammesso(raw):
                    tenuti.append(raw)
                    raccolti_area += 1
            if pg * 50 >= totale:
                break
        print(f"   RA area {area}: tenuti finora {raccolti_area}")
    print("   RA TOTALE tenuti:", len(tenuti))
    return tenuti


def run():
    print(">> Raccolta da Resident Advisor (GraphQL pubblico)...")
    grezzi = raccogli_ra()
    if not grezzi:
        print("--- Nessun evento da RA. ---")
        return

    print(">> Normalizzazione + geocoding (solo dove mancano le coordinate)...")
    cache = ingest._load_json(ingest.GEOCACHE, {})
    puliti = [ingest.normalizza(r, "ra", cache) for r in grezzi]
    ingest._save_json(ingest.GEOCACHE, cache)

    pending = ingest._load_json(ingest.PENDING_JSON, [])
    pubblicati = ingest._load_json(ingest.EVENTS_JSON, [])
    gia_visti = {ingest.dedup_key(e) for e in pending} | {ingest.dedup_key(e) for e in pubblicati}

    print(">> Rimozione doppioni...")
    nuovi = []
    for ev in puliti:
        k = ingest.dedup_key(ev)
        if k in gia_visti:
            continue
        gia_visti.add(k)
        nuovi.append(ev)

    pending += nuovi
    ingest._save_json(ingest.PENDING_JSON, pending)
    print("--- FATTO (Resident Advisor) ---")
    print("   nuovi aggiunti alla coda:", len(nuovi))
    print("   totale coda (in_attesa):", len(pending))
    print("   Pubblica con:  python residentadvisor.py --approva")


def mostra():
    pending = ingest._load_json(ingest.PENDING_JSON, [])
    d = [e for e in pending if e.get("fonte") == "ra"]
    print("RESIDENT ADVISOR in coda:", len(d), "eventi")
    for e in d:
        print(f"  {e['data']}  {e['nome']} — {e['citta']} ({e.get('paese')})")


if __name__ == "__main__":
    if "--approva" in sys.argv:
        ingest.approva_fonte("ra")
    elif "--show" in sys.argv:
        mostra()
    else:
        run()
