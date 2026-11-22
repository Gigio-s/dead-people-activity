#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Dead People Activity — FONTE SEPARATA: DICE.FM  (senza chiave)
==============================================================

COSA FA:
  Script a parte (staccato da ingest.py) che raccoglie TUTTI gli eventi musicali
  di Dice.fm nelle citta' europee e li mette nella STESSA coda in attesa
  (events_pending.json). Se un giorno Dice cambia, la pipeline principale
  (Ticketmaster) continua a funzionare lo stesso.

COME FUNZIONA (nessuna chiave necessaria):
  1. Scarica la lista citta' da  https://api.dice.fm/cities  e tiene solo quelle
     europee (costruendo lo "slug" citta' = nome + '-' + id).
  2. Per ogni citta' scarica le pagine pubbliche
        https://dice.fm/browse/<slug>/music/gig
        https://dice.fm/browse/<slug>/music/dj
        https://dice.fm/browse/<slug>/music/party
     e legge gli eventi dal blocco dati della pagina (__NEXT_DATA__).
  3. Normalizza, toglie i doppioni e li mette in coda con fonte = "dice".

IMPORTANTE — IL GENERE:
  Dice NON espone il genere musicale (ne' punk, ne' techno, ecc.): non e'
  disponibile da nessuna parte. Percio' qui arrivano TUTTI gli eventi musicali
  (concerti + dj set + party) delle citta' europee. Sta a te rivederli in coda
  e pubblicare solo quelli giusti:
        python dice.py --show      (vedi cosa e' arrivato)
        python dice.py --approva   (pubblica TUTTI i Dice in coda)
  In alternativa puoi pubblicare a mano i singoli con:
        python ingest.py --approva <ID>

NOTA (correttezza): interroghiamo pagine pubbliche a basso ritmo, con una pausa
  tra le richieste. E' comunque una soluzione non ufficiale: se Dice cambia la
  struttura del sito, lo script stampa un avviso e finisce senza bloccare nulla.

USO:
  python dice.py                 # raccoglie da tutte le citta' UE -> coda
  python dice.py --show          # mostra gli eventi Dice in coda
  python dice.py --approva       # pubblica tutti i Dice in coda
  python dice.py --import-url URL [URL ...]       # importa link evento singoli
  python dice.py --import-file dice_urls.txt      # importa un link per riga

  Variabili facoltative (in config.bat):
    set DICE_CITTA=Barcelona,Berlin,Milano   (limita a certe citta')
    set DICE_TIPI=gig,dj,party               (quali tipi prendere)
    set DICE_PAUSA=0.4                        (pausa in secondi tra le richieste)

Dipendenze: solo libreria standard. Deve stare nella STESSA cartella di ingest.py.
"""

import json
import os
import re
import sys
import time
import unicodedata
import urllib.request
import urllib.error

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "coordinate eventi"))
import ingest  # riusa normalizza(), geocoding, coda, dedup, pubblicazione


UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) DeadPeopleActivity/1.0 (+contatto@undergroundplatform.xyz)"

# Country code (Dice) considerati "Europa". Modificabile.
EU_CC = {"GB", "IE", "ES", "PT", "FR", "IT", "DE", "NL", "BE", "LU", "AT", "CH",
         "SE", "NO", "DK", "FI", "PL", "CZ", "SK", "HU", "GR", "RO", "BG", "HR",
         "SI", "EE", "LV", "LT", "IS", "MT", "CY", "RS", "UA"}

# Tipi di evento musicale su Dice -> nostra etichetta "tipo"
TIPI = {"gig": "concerto", "dj": "dj-set", "party": "party"}

EXIT_OK = 0
EXIT_UNAVAILABLE = 2


class DiceUnavailable(RuntimeError):
    """Dice non e' raggiungibile senza autenticazione o ha cambiato struttura."""


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "it,en"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode("utf-8", "replace")


def _slugify(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def citta_europee():
    """Legge api.dice.fm/cities e ritorna le citta' europee come
    lista di dict: {name, cc, slug, lat, lng}."""
    try:
        j = json.loads(_get("https://api.dice.fm/cities"))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403, 429):
            raise DiceUnavailable(f"endpoint citta' bloccato: HTTP {e.code}") from e
        raise DiceUnavailable(f"endpoint citta' non raggiungibile: HTTP {e.code}") from e
    except Exception as e:
        raise DiceUnavailable(f"impossibile leggere la lista citta': {e}") from e
    if not isinstance(j, list):
        raise DiceUnavailable("risposta lista citta' in formato inatteso")
    out = []
    for c in j:
        cc = (c.get("country_code") or c.get("country_id") or "").upper()
        if cc not in EU_CC:
            continue
        cid = c.get("id") or c.get("_id")
        if not cid:
            continue
        loc = c.get("location") or {}
        out.append({
            "name": c.get("name", ""), "cc": cc,
            "slug": _slugify(c.get("name", "")) + "-" + str(cid),
            "lat": loc.get("lat"), "lng": loc.get("lng"),
        })
    out.sort(key=lambda x: (x["cc"], x["name"]))
    return out


def _next_data(html):
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except Exception:
        return None


def _parse_evento(ev, tipo, city):
    """Da un evento Dice (dict del blocco pagina) allo schema grezzo di ingest.normalizza()."""
    dates = ev.get("dates") or {}
    dt = dates.get("event_start_date") or ev.get("date") or ""
    data, ora = "", ""
    m = re.match(r"(\d{4}-\d{2}-\d{2})[T ]?(\d{2}:\d{2})?", str(dt))
    if m:
        data, ora = m.group(1), (m.group(2) or "")

    vs = ev.get("venues") or []
    v = vs[0] if vs else {}
    vloc = v.get("location") or {}
    vcity = v.get("city") or {}

    price = ev.get("price") or {}
    amount = price.get("amount")
    prezzo = (amount / 100.0) if isinstance(amount, (int, float)) else None

    perm = ev.get("perm_name") or ""

    img = None
    images = ev.get("images")
    if isinstance(images, dict):
        for val in images.values():
            if isinstance(val, str) and val.startswith("http"):
                img = val
                break
            if isinstance(val, dict) and val.get("url"):
                img = val["url"]
                break

    address = v.get("address")
    if not isinstance(address, str):
        address = ""

    return {
        "id": "dice-" + str(ev.get("id") or perm or _slugify(ev.get("name") or "")),
        "nome": (ev.get("name") or "").strip(),
        "data": data, "ora": ora,
        "citta": vcity.get("name") or city.get("name") or "",
        "paese": vcity.get("country_name") or "",
        "paese_code": vcity.get("country_code") or city.get("cc") or "",
        "indirizzo": address,
        "locale": v.get("name") or "",
        "lat": vloc.get("lat"), "lng": vloc.get("lng"),
        "genere": [],            # Dice non espone il genere
        "tipo": tipo,
        "prezzo": prezzo,
        "gratuito": (prezzo == 0),
        "biglietti_url": ("https://dice.fm/event/" + perm) if perm else None,
        "locandina": img,
        "promoter": "",
    }


def eventi_citta(city, tipi, pausa):
    """Scarica gli eventi di una citta' per i tipi richiesti (pagina 1 di ognuno)."""
    raw = []
    for t in tipi:
        url = "https://dice.fm/browse/" + city["slug"] + "/music/" + t
        try:
            html = _get(url)
        except Exception as e:
            print("   ! Dice", city["name"], t, "errore:", e)
            time.sleep(pausa)
            continue
        j = _next_data(html)
        if not j:
            continue
        evs = (((j.get("props") or {}).get("pageProps") or {}).get("events")) or []
        for ev in evs:
            raw.append(_parse_evento(ev, TIPI[t], city))
        time.sleep(pausa)
    return raw


def raccogli_dice():
    tipi = [t.strip() for t in os.environ.get("DICE_TIPI", "gig,dj,party").split(",")
            if t.strip() in TIPI]
    if not tipi:
        tipi = ["gig", "dj", "party"]
    pausa = float(os.environ.get("DICE_PAUSA", "0.4"))

    citta = citta_europee()
    solo = os.environ.get("DICE_CITTA", "").strip()
    if solo:
        voluti = {s.strip().lower() for s in solo.split(",") if s.strip()}
        citta = [c for c in citta if c["name"].lower() in voluti]

    if not citta:
        print("  ! Dice: nessuna citta' da elaborare (lista vuota o filtro troppo stretto).")
        return []

    print(f"   Dice: {len(citta)} citta' europee, tipi = {tipi}")
    tutti = []
    for i, c in enumerate(citta, 1):
        ev = eventi_citta(c, tipi, pausa)
        print(f"   [{i}/{len(citta)}] {c['name']} ({c['cc']}): {len(ev)} eventi")
        tutti += ev
    print("   Dice TOTALE eventi grezzi:", len(tutti))
    return tutti


def run():
    print(">> Raccolta da Dice.fm (pagine citta' pubbliche, senza chiave)...")
    try:
        grezzi = raccogli_dice()
    except DiceUnavailable as e:
        print("  ! DICE NON DISPONIBILE:", e)
        print("  ! Gli eventi Dice gia' pubblicati restano invariati.")
        print("--- Dice saltato; le altre fonti possono continuare. ---")
        return EXIT_UNAVAILABLE
    if not grezzi:
        print("--- Dice raggiungibile, ma nessun nuovo evento trovato. ---")
        return EXIT_OK

    print(">> Normalizzazione + geocoding (solo dove mancano le coordinate)...")
    cache = ingest._load_json(ingest.GEOCACHE, {})
    puliti = [ingest.normalizza(r, "dice", cache) for r in grezzi]
    ingest._save_json(ingest.GEOCACHE, cache)

    pending = ingest._load_json(ingest.PENDING_JSON, [])
    pubblicati = ingest._load_json(ingest.EVENTS_JSON, [])

    print(">> Controllo doppioni e nuove opzioni biglietto...")
    nuovi = ingest.nuovi_per_coda(puliti, pending, pubblicati)

    pending += nuovi
    ingest._save_json(ingest.PENDING_JSON, pending)

    senza_coord = [e["nome"] for e in nuovi if not e.get("lat")]
    print("--- FATTO (Dice) ---")
    print("   nuovi aggiunti alla coda:", len(nuovi))
    print("   totale coda (in_attesa):", len(pending))
    if senza_coord:
        print("   ! senza coordinate:", len(senza_coord), "(esempi:", senza_coord[:10], ")")
    print("   RICORDA: Dice non porta il genere. Rivedi e pubblica:")
    print("     python dice.py --show      (vedi i Dice in coda)")
    print("     python dice.py --approva   (pubblica i Dice gia classificati)")
    return EXIT_OK


def _trova_evento(value):
    """Trova il blocco evento dentro il JSON Next.js di una pagina pubblica."""
    if isinstance(value, dict):
        if (value.get("name") and (value.get("dates") or value.get("date"))
                and (value.get("venues") or value.get("venue"))):
            return value
        for child in value.values():
            found = _trova_evento(child)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = _trova_evento(child)
            if found:
                return found
    return None


def importa_url(urls):
    """Importa in coda singole pagine evento Dice indicate manualmente."""
    if not urls:
        print("Nessun URL Dice indicato.")
        return 1
    validi = []
    errori = 0
    for url in urls:
        url = str(url or "").strip()
        if not re.match(r"^https://(www\.)?dice\.fm/event/", url, re.I):
            print("  ! URL Dice non valido:", url)
            errori += 1
            continue
        try:
            payload = _next_data(_get(url))
            evento = _trova_evento(payload) if payload else None
            if not evento:
                raise DiceUnavailable("dati evento non trovati nella pagina")
            raw = _parse_evento(evento, "concerto", {})
            raw["biglietti_url"] = url
            validi.append(raw)
            print("  + letto:", raw.get("nome") or url)
        except Exception as e:
            print("  ! impossibile importare", url, "-", e)
            errori += 1

    if validi:
        cache = ingest._load_json(ingest.GEOCACHE, {})
        puliti = [ingest.normalizza(r, "dice", cache) for r in validi]
        ingest._save_json(ingest.GEOCACHE, cache)
        pending = ingest._load_json(ingest.PENDING_JSON, [])
        pubblicati = ingest._load_json(ingest.EVENTS_JSON, [])
        nuovi = ingest.nuovi_per_coda(puliti, pending, pubblicati)
        pending += nuovi
        ingest._save_json(ingest.PENDING_JSON, pending)
        print("Eventi Dice aggiunti alla coda:", len(nuovi))
        print("Controllali con: python dice.py --show")
    if errori and not validi:
        return EXIT_UNAVAILABLE
    return EXIT_OK


def leggi_url_file(path):
    with open(path, "r", encoding="utf-8-sig") as f:
        return [riga.strip() for riga in f if riga.strip() and not riga.lstrip().startswith("#")]


def mostra():
    pending = ingest._load_json(ingest.PENDING_JSON, [])
    d = [e for e in pending if e.get("fonte") == "dice"]
    print("DICE in coda:", len(d), "eventi")
    per_citta = {}
    for e in d:
        per_citta[e.get("citta", "?")] = per_citta.get(e.get("citta", "?"), 0) + 1
    print("  per citta':", dict(sorted(per_citta.items(), key=lambda x: -x[1])))
    print("  ---")
    for e in d:
        print(f"  {e['data']}  {e['nome']} — {e['citta']} ({e.get('tipo')})")


def approva_classificati():
    """Pubblica solo i Dice gia classificati; gli altri restano per il prossimo run."""
    pending = ingest._load_json(ingest.PENDING_JSON, [])
    selezionati = [e for e in pending
                   if e.get("fonte") == "dice"
                   and e.get("genere")
                   and ingest.genere_ammesso(e)]
    rimasti = [e for e in pending if e.get("fonte") == "dice" and e not in selezionati]
    if not selezionati:
        print("Nessun evento Dice classificato da pubblicare.")
        print("Eventi Dice ancora in attesa:", len(rimasti))
        return
    ingest._pubblica(selezionati, "fonte=dice (solo classificati)")
    print("Eventi Dice ancora da classificare:", len(rimasti))


if __name__ == "__main__":
    if "--approva" in sys.argv:
        approva_classificati()
    elif "--show" in sys.argv:
        mostra()
    elif "--import-url" in sys.argv:
        pos = sys.argv.index("--import-url")
        sys.exit(importa_url(sys.argv[pos + 1:]))
    elif "--import-file" in sys.argv:
        pos = sys.argv.index("--import-file")
        if pos + 1 >= len(sys.argv):
            print("Manca il percorso del file con gli URL Dice.")
            sys.exit(1)
        sys.exit(importa_url(leggi_url_file(sys.argv[pos + 1])))
    else:
        sys.exit(run())
