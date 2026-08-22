#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Dead People Activity — FONTE: SKIDDLE (API ufficiale, con affiliazione)
=======================================================================

COS'E':
  Skiddle (www.skiddle.com) e' una piattaforma UK forte su club, rave e festival.
  Ha un'API UFFICIALE gratuita e un programma di AFFILIAZIONE (30% del ricavo a
  biglietto). Gli eventi arrivano gia' con il GENERE, quindi qui filtriamo subito
  sulla tua whitelist (come Ticketmaster) — niente controllo genere esterno.

  Riusa il motore comune di ingest.py (normalizzazione, geocoding, coda, dedup,
  pubblicazione) e scrive nella STESSA coda events_pending.json con fonte="skiddle".

COME AVERE LA CHIAVE (gratis):
  1. Vai su  https://www.skiddle.com/api/join.php  e richiedi la API key.
  2. Mettila in config.bat ->  set SKIDDLE_KEY=la_tua_chiave

AFFILIAZIONE (dopo, quando il sito e' online):
  1. Iscriviti su  https://www.skiddle.com/affiliates/join.php
  2. Ti daranno un modo per tracciare i link. Quando ce l'hai, imposta in config.bat:
       set SKIDDLE_AFFILIATE_TEMPLATE=...{url}...
     ({url} verra' sostituito col link dell'evento). Finche' non lo imposti, i link
     restano quelli normali di Skiddle.

USO:
  python skiddle.py            # scarica -> coda (solo generi giusti)
  python skiddle.py --show     # mostra gli eventi Skiddle in coda
  python skiddle.py --approva  # pubblica gli eventi Skiddle in coda

  Variabili facoltative (config.bat):
    set SKIDDLE_PAESI=GB,IE        (paesi; Skiddle e' soprattutto UK/Irlanda)
    set SKIDDLE_PAGINE=5           (pagine da 100 eventi per tipo+paese)

Dipendenze: solo libreria standard. Deve stare nella STESSA cartella di ingest.py.
"""

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "coordinate eventi"))
import ingest  # riusa whitelist generi, normalizza, coda, dedup, pubblicazione

# Tipi di evento Skiddle che ci interessano -> nostra etichetta "tipo"
EVENTCODES = {"LIVE": "concerto", "CLUB": "dj-set", "FEST": "festival"}

# Codice paese -> nome italiano (per la mappa). Skiddle e' soprattutto UK.
CC2IT = {"GB": "Regno Unito", "IE": "Irlanda"}


def _apply_aff(url):
    """Applica l'affiliazione Skiddle all'URL dell'evento.

    Skiddle NON usa un link "wrapper": basta aggiungere il tuo sktag in coda
    all'URL dell'evento (es. .../events/123/?sktag=15777).
      - SKIDDLE_SKTAG       -> il tuo ID affiliato (es. 15777)   [consigliato]
      - SKIDDLE_SKCAMPAIGN  -> etichetta campagna facoltativa (es. sito)
    Retro-compatibilita': se e' impostato SKIDDLE_AFFILIATE_TEMPLATE con {url},
    usa quel formato wrapper (URL codificato).
    """
    if not url:
        return url
    # Modalita' consigliata: sktag appeso direttamente all'URL evento
    sktag = os.environ.get("SKIDDLE_SKTAG", "").strip()
    if sktag:
        sep = "&" if "?" in url else "?"
        out = "%s%ssktag=%s" % (url, sep, sktag)
        camp = os.environ.get("SKIDDLE_SKCAMPAIGN", "").strip()
        if camp:
            out += "&skcampaign=" + urllib.parse.quote_plus(camp)
        return out
    # Compatibilita': vecchio formato wrapper con {url}
    tpl = os.environ.get("SKIDDLE_AFFILIATE_TEMPLATE", "")
    if tpl and "{url}" in tpl:
        return tpl.replace("{url}", urllib.parse.quote(url, safe=""))
    return url


def _event_name(data):
    """Skiddle usa eventname nei risultati; name resta come fallback storico."""
    if isinstance(data, list):
        for item in data:
            nome = _event_name(item)
            if nome:
                return nome
        return ""
    if not isinstance(data, dict):
        return ""
    nome = str(data.get("eventname") or data.get("name") or "").strip()
    if nome:
        return nome
    # L'endpoint dettaglio puo' avvolgere l'evento in results/event/data.
    for chiave in ("results", "result", "event", "data"):
        nome = _event_name(data.get(chiave))
        if nome:
            return nome
    return ""


def fonte_skiddle(api_key, paese="GB", eventcode="LIVE", limit=100, offset=0, min_date=None):
    """Una pagina di risultati Skiddle per un paese + tipo di evento."""
    params = {
        "api_key": api_key, "country": paese, "eventcode": eventcode,
        "limit": limit, "offset": offset, "order": "trending",
        "description": 1,                 # <<< include GENERE e artisti
        "minDate": min_date or date.today().isoformat(),
    }
    url = "https://www.skiddle.com/api/v1/events/search/?" + urllib.parse.urlencode(params)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DeadPeopleActivity/1.0"})
        with urllib.request.urlopen(req, timeout=25) as r:
            data = json.load(r)
    except Exception as e:
        print("  ! Skiddle errore (", paese, eventcode, "):", e)
        return [], 0
    results = data.get("results") or []
    totale = int(data.get("totalcount") or 0)
    return results, totale


def _to_raw(e, tipo, cc):
    venue = e.get("venue") or {}
    # data + ora: preferisci startdate (datetime), poi date (solo giorno)
    dt = e.get("startdate") or e.get("date") or ""
    data_, ora = "", ""
    m = re.match(r"(\d{4}-\d{2}-\d{2})[T ]?(\d{2}:\d{2})?", str(dt))
    if m:
        data_, ora = m.group(1), (m.group(2) or "")

    genere = [g.get("name") for g in (e.get("genres") or []) if isinstance(g, dict) and g.get("name")]
    artisti = [a.get("name") for a in (e.get("artists") or []) if isinstance(a, dict) and a.get("name")]

    prezzo = e.get("entryprice")
    prezzo_txt = str(prezzo or "").strip().lower()
    gratuito = prezzo_txt in ("0", "0.00", "free", "gratis", "")

    lat = venue.get("latitude")
    lng = venue.get("longitude")

    return {
        "id": "skiddle-" + str(e.get("id") or ""),
        "nome": _event_name(e),
        "descrizione": e.get("description") or "",
        "data": data_, "ora": ora,
        "paese": CC2IT.get(cc, cc), "paese_code": cc,
        "citta": venue.get("town") or venue.get("name") or "",
        "indirizzo": venue.get("address") or "",
        "locale": venue.get("name") or "",
        "lat": float(lat) if lat not in (None, "", "0") else None,
        "lng": float(lng) if lng not in (None, "", "0") else None,
        "genere": genere,
        "artisti": artisti,
        "tipo": tipo,
        "prezzo": None if gratuito else prezzo,
        "gratuito": gratuito,
        "biglietti_url": _apply_aff(e.get("link")),
        "locandina": e.get("largeimageurl") or e.get("imageurl") or None,
        "promoter": "",
    }


def raccogli_skiddle():
    key = os.environ.get("SKIDDLE_KEY", "")
    if not key:
        print("  ! SKIDDLE_KEY vuota. Prendila (gratis) su https://www.skiddle.com/api/join.php")
        print("    e mettila in config.bat -> set SKIDDLE_KEY=...")
        return []
    paesi = [p.strip() for p in os.environ.get("SKIDDLE_PAESI", "GB,IE").split(",") if p.strip()]
    pagine = int(os.environ.get("SKIDDLE_PAGINE", "5"))
    oggi = date.today().isoformat()

    tenuti, ricevuti = [], 0
    for cc in paesi:
        for code, tipo in EVENTCODES.items():
            for pg in range(pagine):
                results, totale = fonte_skiddle(key, cc, code, limit=100, offset=pg * 100, min_date=oggi)
                if not results:
                    break
                ricevuti += len(results)
                for e in results:
                    raw = _to_raw(e, tipo, cc)
                    if ingest.genere_ammesso(raw):     # tieni solo i generi della whitelist
                        tenuti.append(raw)
                time.sleep(0.3)                        # gentile con l'API
                if (pg + 1) * 100 >= totale:
                    break
            print(f"   Skiddle {cc}/{code}: raccolti finora {len(tenuti)} tenuti")
    print("   Skiddle TOTALE:", ricevuti, "ricevuti ->", len(tenuti), "tenuti dopo filtro generi")
    return tenuti


def run():
    print(">> Raccolta da Skiddle (API ufficiale)...")
    grezzi = raccogli_skiddle()
    if not grezzi:
        print("--- Nessun evento da Skiddle. ---")
        return

    print(">> Normalizzazione + geocoding (solo dove mancano le coordinate)...")
    cache = ingest._load_json(ingest.GEOCACHE, {})
    senza_nome = sum(1 for r in grezzi if not r.get("nome"))
    if senza_nome:
        print(f"   ! Scartati {senza_nome} record Skiddle senza titolo.")
    puliti = [ingest.normalizza(r, "skiddle", cache) for r in grezzi if r.get("nome")]
    ingest._save_json(ingest.GEOCACHE, cache)

    pending = ingest._load_json(ingest.PENDING_JSON, [])
    pubblicati = ingest._load_json(ingest.EVENTS_JSON, [])

    print(">> Controllo doppioni e nuove opzioni biglietto...")
    nuovi = ingest.nuovi_per_coda(puliti, pending, pubblicati)

    pending += nuovi
    ingest._save_json(ingest.PENDING_JSON, pending)
    print("--- FATTO (Skiddle) ---")
    print("   nuovi aggiunti alla coda:", len(nuovi))
    print("   totale coda (in_attesa):", len(pending))
    print("   Pubblica con:  python skiddle.py --approva")


def mostra():
    pending = ingest._load_json(ingest.PENDING_JSON, [])
    d = [e for e in pending if e.get("fonte") == "skiddle"]
    print("SKIDDLE in coda:", len(d), "eventi")
    for e in d:
        g = ",".join(e.get("genere") or [])
        print(f"  {e['data']}  {e['nome']} — {e['citta']} [{g}]")


def _dettaglio_evento(api_key, event_id):
    numeric_id = str(event_id or "").replace("skiddle-", "", 1)
    url = "https://www.skiddle.com/api/v1/events/{}/?{}".format(
        urllib.parse.quote(numeric_id),
        urllib.parse.urlencode({"api_key": api_key, "description": 1}),
    )
    req = urllib.request.Request(url, headers={"User-Agent": "DeadPeopleActivity/1.0"})
    with urllib.request.urlopen(req, timeout=25) as response:
        return json.load(response)


def ripara_nomi():
    """Recupera dall'API i titoli mancanti dei record Skiddle gia' pubblicati."""
    key = os.environ.get("SKIDDLE_KEY", "")
    if not key:
        print("ERRORE: SKIDDLE_KEY non configurata in config.bat.")
        return 1

    pubblicati = ingest._load_json(ingest.EVENTS_JSON, [])
    coda = ingest._load_json(ingest.PENDING_JSON, [])
    mancanti = [e for e in pubblicati + coda
                if e.get("fonte") == "skiddle" and not str(e.get("nome") or "").strip()]
    if not mancanti:
        print("Nessun evento Skiddle senza titolo da riparare.")
        return 0

    ingest.backup_eventi()
    corretti, falliti = 0, []
    totale = len(mancanti)
    for indice, evento in enumerate(mancanti, 1):
        try:
            dettaglio = _dettaglio_evento(key, evento.get("id"))
            nome = _event_name(dettaglio)
            if not nome:
                raise ValueError("titolo assente nella risposta API")
            evento["nome"] = nome
            url = evento.get("biglietti_url")
            evento["biglietti"] = ([{
                "fonte": "skiddle",
                "url": url,
                "prezzo": evento.get("prezzo"),
                "gratuito": bool(evento.get("gratuito")),
            }] if url else [])
            corretti += 1
            print(f"[{indice}/{totale}] {evento.get('id')} -> {nome}")
        except Exception as exc:
            falliti.append({"id": evento.get("id"), "errore": str(exc)})
            print(f"[{indice}/{totale}] {evento.get('id')} -> ERRORE: {exc}")
        time.sleep(0.25)

    ingest._save_json(ingest.EVENTS_JSON, pubblicati)
    ingest._save_json(ingest.PENDING_JSON, coda)
    ingest.mirror_fallback()
    print(f"Riparati: {corretti} - ancora senza titolo: {len(falliti)}")
    return 0 if not falliti else 2


if __name__ == "__main__":
    if "--ripara-nomi" in sys.argv:
        raise SystemExit(ripara_nomi())
    elif "--approva" in sys.argv:
        ingest.approva_fonte("skiddle")
    elif "--show" in sys.argv:
        mostra()
    else:
        run()
