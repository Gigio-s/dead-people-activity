#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Dead People Activity — Pipeline di importazione eventi
======================================================

COSA FA (in parole semplici):
  1. RACCOGLIE eventi da una o piu' "fonti" (per ora: fonte demo + stub Ticketmaster)
  2. NORMALIZZA tutto nello stesso formato (lo schema di assets/data/events.json)
  3. GEOCODA l'indirizzo -> latitudine/longitudine (per il puntino sulla mappa)
  4. TOGLIE i doppioni (stesso evento arrivato da fonti diverse)
  5. SCRIVE il risultato in una CODA "in attesa" (events_pending.json)

REGOLA D'ORO: questo script NON pubblica nulla da solo.
  Gli eventi finiscono in events_pending.json con approvazione = "in_attesa".
  La redazione li controlla e, quando approva, li sposta in events.json.
  (Vedi funzione approva() in fondo per l'aiuto manuale.)

USO:
  python ingest.py                # raccoglie dalle fonti attive -> events_pending.json
  python ingest.py --show         # mostra un riepilogo della coda
  python ingest.py --approva ID   # sposta un evento dalla coda a events.json (pubblica)

Dipendenze: solo libreria standard. 'requests' e' opzionale (per Ticketmaster/geocoding online).
"""

import json
import os
import re
import sys
import tempfile
import time
import unicodedata
import zipfile
from datetime import datetime, date

# ----------------------------------------------------------------------------
# PERCORSI
# ----------------------------------------------------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
DATA_DIR = os.path.join(PROJECT_ROOT, "assets", "data")
EVENTS_JSON = os.path.join(DATA_DIR, "events.json")            # pubblicati (fonte canonica della mappa)
PENDING_JSON = os.path.join(DATA_DIR, "events_pending.json")  # coda in attesa di approvazione
ARCHIVIO_JSON = os.path.join(DATA_DIR, "events_archivio.json")  # eventi passati (storico)
EVENTS_DATA_JS = os.path.join(PROJECT_ROOT, "assets", "js", "events-data.js")  # fallback locale
GEOCACHE = os.path.join(HERE, "geocode_cache.json")           # cache coordinate (per non richiedere due volte)
COORD_INCERTE_JSON = os.path.join(HERE, "events_coordinate_incerte.json")
BACKUP_DIR = os.path.join(HERE, "backups")
INCERTI_JSON = os.path.join(DATA_DIR, "events_dice_incerti.json")
SCARTATI_JSON = os.path.join(DATA_DIR, "events_dice_scartati.json")

# ----------------------------------------------------------------------------
# SCHEMA — un evento "pulito" ha esattamente questi campi
# (identico a quello che la mappa gia' usa in events.json)
# ----------------------------------------------------------------------------
SCHEMA_FIELDS = [
    "id", "nome", "descrizione", "locandina", "data", "ora",
    "paese", "paese_code", "regione", "citta", "indirizzo", "locale",
    "lat", "lng", "coordinate_precisione", "coordinate_fonte",
    "artisti", "genere", "tipo", "prezzo", "gratuito",
    "biglietti_url", "biglietti", "promoter", "promoter_url", "social",
    "stato", "sponsorizzato", "fonte", "approvazione", "creato_il",
]


def _slug(s):
    """Trasforma 'Città!' in 'citta' — serve per confrontare ed evitare doppioni."""
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def dedup_key(ev):
    """Due eventi sono 'lo stesso' se combaciano nome + data + citta."""
    return "|".join([_slug(ev.get("nome")), str(ev.get("data") or ""), _slug(ev.get("citta"))])


def ticket_options(ev):
    """Restituisce le opzioni biglietto uniche, compatibili anche con i vecchi eventi."""
    options = []
    raw_options = ev.get("biglietti") or []
    if isinstance(raw_options, dict):
        raw_options = [raw_options]
    for item in raw_options:
        if not isinstance(item, dict) or not item.get("url"):
            continue
        options.append({
            "fonte": item.get("fonte") or ev.get("fonte") or "",
            "url": item.get("url"),
            "prezzo": item.get("prezzo"),
            "gratuito": bool(item.get("gratuito")),
        })
    if ev.get("biglietti_url"):
        options.append({
            "fonte": ev.get("fonte") or "",
            "url": ev.get("biglietti_url"),
            "prezzo": ev.get("prezzo"),
            "gratuito": bool(ev.get("gratuito")),
        })

    unique_options, seen_urls = [], set()
    for item in options:
        url = str(item.get("url") or "").strip()
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)
        item["url"] = url
        unique_options.append(item)
    return unique_options


def merge_event(target, incoming):
    """Unisce in una scheda le scelte biglietto di provider diversi."""
    before = ticket_options(target)
    merged = before + ticket_options(incoming)
    probe = dict(target)
    probe["biglietti"] = merged
    probe["biglietti_url"] = None
    target["biglietti"] = ticket_options(probe)
    if not target.get("biglietti_url") and target["biglietti"]:
        target["biglietti_url"] = target["biglietti"][0]["url"]
    return len(target["biglietti"]) - len(before)


def nuovi_per_coda(puliti, pending, pubblicati):
    """Tiene i nuovi eventi e le nuove scelte provider/link per eventi gia' noti."""
    nuovi = []
    esistenti = list(pending) + list(pubblicati)
    for ev in puliti:
        stessa_chiave = [old for old in esistenti if dedup_key(old) == dedup_key(ev)]
        if not stessa_chiave:
            nuovi.append(ev)
            esistenti.append(ev)
            continue
        urls_esistenti = {item["url"] for old in stessa_chiave for item in ticket_options(old)}
        opzioni_nuove = [item for item in ticket_options(ev) if item["url"] not in urls_esistenti]
        if opzioni_nuove:
            ev["biglietti"] = opzioni_nuove
            nuovi.append(ev)
            esistenti.append(ev)
    return nuovi


# ----------------------------------------------------------------------------
# FILTRO GENERI — solo questi (e i loro sottogeneri) entrano dalle fonti
# "firehose" tipo Ticketmaster. Niente pop, reggae, latin, ecc.
# Regola: se UNA di queste parole compare nel genere, l'evento passa.
# Modifica liberamente questa lista.
# ----------------------------------------------------------------------------
# Tre famiglie richieste: ROCK (ampio), RAP/HIP-HOP, TECHNO/ELETTRONICA da club.
# Match per sottostringa: se UNA di queste parole compare nel genere, l'evento passa.
GENERI_AMMESSI = [
    # --- ROCK e TUTTI i sottogeneri (prende anche pop rock, hard rock, prog/post rock, rock & roll) ---
    "rock", "alternative", "indie", "garage", "grunge", "stoner", "psych", "psychedelic",
    "shoegaze", "post-punk", "post punk", "new wave", "no wave", "surf", "math rock", "krautrock",
    "goth", "gothic", "darkwave", "deathrock", "death rock", "britpop", "brit pop",
    # punk e derivati
    "punk", "hardcore", "post-hardcore", "emo", "screamo", "crust", "d-beat", "oi", "ska", "powerviolence",
    # metal e derivati
    "metal", "metalcore", "deathcore", "grindcore", "thrash", "death", "black metal",
    "doom", "sludge", "nu metal", "hard rock",
    # --- RAP / HIP-HOP e sottogeneri ---
    "rap", "hip-hop", "hip hop", "trap", "drill", "grime", "boom bap",
    # affini underground (rock/elettronica sperimentale)
    "industrial", "noise", "ebm",
    # --- TECHNO / ELETTRONICA DA CLUB e sottogeneri ---
    "techno", "electronic", "electronica", "electro", "house", "acid", "minimal",
    "idm", "breakbeat", "breaks", "drum and bass", "dnb", "dubstep", "trance", "rave",
    "gabber", "hardgroove", "hardstyle", "hard dance", "hard house", "tech house",
    "bass", "uk garage", "jungle", "bassline", "edm", "dance/electronic",
]


def _generi_testo(obj):
    """Estrae il testo dei generi da un evento (grezzo o normalizzato)."""
    g = obj.get("genere") or obj.get("genres") or []
    if isinstance(g, str):
        g = [g]
    return " ".join(str(x) for x in g).lower()


def genere_ammesso(obj):
    """True se l'evento va tenuto.

    Regola base: almeno un genere in whitelist (rock/rap/techno & derivati).
      -> Le tribute/cover band RESTANO se il loro genere e' tra quelli ammessi
         (una tribute rock passa; una tribute pop no).
    Eccezione FESTIVAL: se e' un festival e il NOME contiene un genere ammesso,
      lo teniamo comunque, anche se i tag generi mancano o non combaciano.
    """
    testo = _generi_testo(obj)
    if testo.strip() and any(k in testo for k in GENERI_AMMESSI):
        return True
    # Festival col genere nel nome -> tienilo comunque
    tipo = str(obj.get("tipo") or "").lower()
    if "fest" in tipo:
        nome = str(obj.get("nome") or obj.get("name") or "").lower()
        if any(k in nome for k in GENERI_AMMESSI):
            return True
    return False


# ----------------------------------------------------------------------------
# GEOCODING — da indirizzo/citta a coordinate (gratis, OpenStreetMap Nominatim)
# Con cache su file + piccolo dizionario di riserva se non c'e' rete.
# ----------------------------------------------------------------------------
CITY_FALLBACK = {
    "vicenza": (45.5455, 11.5353), "milano": (45.4642, 9.1900),
    "bologna": (44.4949, 11.3426), "torino": (45.0703, 7.6869),
    "roma": (41.9028, 12.4964), "barcellona": (41.3874, 2.1686),
    "madrid": (40.4168, -3.7038), "siviglia": (37.3891, -5.9845),
    "berlino": (52.5200, 13.4050), "parigi": (48.8566, 2.3522),
    "londra": (51.5074, -0.1278), "manchester": (53.4808, -2.2426),
}


def applica_affiliazione(url):
    """Trasforma il link biglietti in link di AFFILIAZIONE (per guadagnare sulle vendite).
    Spenta finche' non imposti la variabile TM_AFFILIATE_TEMPLATE con il tuo link Impact.
    Esempio template: 'https://tuo-sub.pxf.io/c/ID/OFFER/DEST?u={url}'  ({url} = destinazione)."""
    tpl = os.environ.get("TM_AFFILIATE_TEMPLATE", "")
    if url and tpl and "{url}" in tpl:
        import urllib.parse
        return tpl.replace("{url}", urllib.parse.quote(url, safe=""))
    return url


def _load_json(path, default):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return default


def _save_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(
                mode="w", encoding="utf-8", dir=os.path.dirname(path),
                prefix=os.path.basename(path) + ".", suffix=".tmp", delete=False) as f:
            temp_path = f.name
            json.dump(obj, f, ensure_ascii=False, indent=2)
        os.replace(temp_path, path)
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


def backup_eventi():
    """Crea un backup ZIP datato dei dati prima dell'aggiornamento settimanale."""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out = os.path.join(BACKUP_DIR, "eventi-" + stamp + ".zip")
    n = 2
    while os.path.exists(out):
        out = os.path.join(BACKUP_DIR, "eventi-" + stamp + "-" + str(n) + ".zip")
        n += 1

    project_root = PROJECT_ROOT
    files = [EVENTS_JSON, ARCHIVIO_JSON, EVENTS_DATA_JS, PENDING_JSON, INCERTI_JSON,
             SCARTATI_JSON, COORD_INCERTE_JSON]
    included = []
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            if not os.path.exists(path):
                continue
            arcname = os.path.relpath(path, project_root).replace(os.sep, "/")
            archive.write(path, arcname)
            included.append(arcname)
        archive.writestr("backup-info.json", json.dumps({
            "creato_il": datetime.now().isoformat(timespec="seconds"),
            "file": included,
        }, ensure_ascii=False, indent=2))
    print("BACKUP creato:", out)
    print("   file inclusi:", len(included))
    return out


def geocode(indirizzo, citta, paese, cache):
    """Restituisce coordinate dell'indirizzo; non usa mai il centro città come ripiego."""
    if not str(indirizzo or "").strip():
        return None, None
    query = ", ".join([p for p in [indirizzo, citta, paese] if p])
    key = _slug(query)
    if key in cache and cache[key].get("precisione") in ("indirizzo", "locale_verificato"):
        return cache[key]["lat"], cache[key]["lng"]

    # Tentativo online (nessuna libreria esterna: solo urllib della libreria standard)
    try:
        import urllib.request, urllib.parse
        u = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
            {"q": query, "format": "json", "limit": 1})
        req = urllib.request.Request(
            u, headers={"User-Agent": "DeadPeopleActivity/1.0 (contatto@undergroundplatform.xyz)"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            js = json.load(resp)
        if js:
            lat = float(js[0]["lat"]); lng = float(js[0]["lon"])
            cache[key] = {"lat": lat, "lng": lng, "precisione": "indirizzo"}
            time.sleep(1)  # Nominatim: max 1 richiesta/secondo — rispettiamo le regole
            return lat, lng
    except Exception:
        pass  # niente rete: si usa il fallback

    return None, None


# ----------------------------------------------------------------------------
# NORMALIZZAZIONE — porta un evento "grezzo" di qualsiasi fonte allo schema unico
# ----------------------------------------------------------------------------
def normalizza(raw, fonte, cache):
    citta = raw.get("citta") or raw.get("city") or ""
    lat = raw.get("lat"); lng = raw.get("lng")
    coordinate_precisione = raw.get("coordinate_precisione")
    coordinate_fonte = raw.get("coordinate_fonte")
    try:
        coordinate_valide = (-90 <= float(lat) <= 90 and -180 <= float(lng) <= 180
                              and not (float(lat) == 0 and float(lng) == 0))
    except (TypeError, ValueError):
        coordinate_valide = False
    if coordinate_valide:
        coordinate_precisione = coordinate_precisione or "provider"
        coordinate_fonte = coordinate_fonte or fonte
    else:
        indirizzo_completo = ", ".join(p for p in [raw.get("locale") or raw.get("venue"),
                                                    raw.get("indirizzo") or raw.get("address")] if p)
        lat, lng = geocode(indirizzo_completo, citta, raw.get("paese"), cache)
        coordinate_precisione = "indirizzo" if lat is not None and lng is not None else "incerta"
        coordinate_fonte = "nominatim" if lat is not None and lng is not None else None

    genere = raw.get("genere") or raw.get("genres") or []
    if isinstance(genere, str):
        genere = [g.strip() for g in re.split(r"[,/;]", genere) if g.strip()]
    artisti = raw.get("artisti") or raw.get("lineup") or []
    if isinstance(artisti, str):
        artisti = [a.strip() for a in re.split(r"[,/;]", artisti) if a.strip()]

    ev = {
        "id": raw.get("id") or "evt-" + _slug(raw.get("nome"))[:24] + "-" + str(raw.get("data") or ""),
        "nome": (raw.get("nome") or raw.get("name") or "").strip(),
        "descrizione": raw.get("descrizione") or raw.get("description") or "",
        "locandina": raw.get("locandina") or raw.get("image") or None,
        "data": raw.get("data") or raw.get("date") or "",
        "ora": raw.get("ora") or raw.get("time") or "",
        "paese": raw.get("paese") or raw.get("country") or "",
        "paese_code": raw.get("paese_code") or raw.get("country_code") or "",
        "regione": raw.get("regione") or raw.get("region") or "",
        "citta": citta,
        "indirizzo": raw.get("indirizzo") or raw.get("address") or "",
        "locale": raw.get("locale") or raw.get("venue") or "",
        "lat": lat, "lng": lng,
        "coordinate_precisione": coordinate_precisione,
        "coordinate_fonte": coordinate_fonte,
        "artisti": artisti,
        "genere": genere,
        "tipo": raw.get("tipo") or raw.get("type") or "concerto",
        "prezzo": raw.get("prezzo") if raw.get("prezzo") is not None else raw.get("price"),
        "gratuito": bool(raw.get("gratuito") or raw.get("free") or raw.get("prezzo") in (0, "0")),
        "biglietti_url": raw.get("biglietti_url") or raw.get("tickets_url") or None,
        "biglietti": raw.get("biglietti") or [],
        "promoter": raw.get("promoter") or "",
        "promoter_url": raw.get("promoter_url") or None,
        "social": raw.get("social") or {},
        "stato": raw.get("stato") or "LIVE",
        "sponsorizzato": bool(raw.get("sponsorizzato")),
        "fonte": fonte,
        "approvazione": "in_attesa",   # <<< MAI pubblicato in automatico
        "creato_il": date.today().isoformat(),
    }
    ev["biglietti"] = ticket_options(ev)
    return {k: ev.get(k) for k in SCHEMA_FIELDS}


# ============================================================================
# FONTI
# ============================================================================

def fonte_demo():
    """Fonte di ESEMPIO: come se arrivasse da un modulo community o da un file.
    Serve per far girare la pipeline subito, senza rete e senza chiavi API."""
    return [
        {
            "nome": "Notte Crust al Deposito", "data": "2026-11-14", "ora": "22:00",
            "paese": "Italia", "paese_code": "IT", "regione": "Veneto", "citta": "Vicenza",
            "indirizzo": "Via delle Fornaci 12", "locale": "CS Bocciodromo",
            "artisti": "Muro, Scarti, Piombo", "genere": "punk, crust", "tipo": "concerto",
            "prezzo": 0, "gratuito": True, "promoter": "Collettivo Asfalto", "fonte_raw": "community",
        },
        {
            "nome": "Warehouse Techno Torino", "data": "2026-11-22", "ora": "23:30",
            "paese": "Italia", "paese_code": "IT", "regione": "Piemonte", "citta": "Torino",
            "indirizzo": "Via Cigna 96", "locale": "Capannone Nord",
            "artisti": "Acid Warehouse, VJ Noise", "genere": "techno, acid", "tipo": "dj-set",
            "prezzo": 10, "gratuito": False, "promoter": "Nord Rave",
        },
    ]


# Paesi europei coperti da Ticketmaster (modificabile). Sigle ISO a 2 lettere.
PAESI_EU = ["IT", "ES", "FR", "DE", "GB", "IE", "NL", "BE", "PT", "AT", "CH",
            "SE", "NO", "DK", "FI", "PL", "CZ", "GR"]

# Generi e SOTTOGENERI cercati UNO ALLA VOLTA. Ticketmaster limita a ~1000 risultati
# per ricerca: piu' query = molti piu' eventi (anche nelle citta' piccole).
# Elenco esaustivo delle famiglie rock / punk / metal / hip-hop-rap / elettronica.
# I doppioni tra query diverse li toglie il dedup; il filtro GENERI_AMMESSI fa da rete finale.
# (Niente pop / reggae / latin / jazz / classica: quelli restano fuori.)
CLASSIFICAZIONI_TM = [
    # Rock e derivati
    "Rock", "Alternative", "Alternative Rock", "Indie", "Indie Rock", "Hard Rock",
    "Classic Rock", "Psychedelic", "Garage", "Progressive", "Post-Rock", "Shoegaze",
    "Grunge", "Stoner", "Rockabilly", "Surf", "Folk Rock",
    # Punk e derivati
    "Punk", "Pop Punk", "Hardcore Punk", "Post-Hardcore", "Emo", "Screamo",
    "Ska", "Ska Punk", "Crust", "Oi",
    # Metal e derivati
    "Metal", "Heavy Metal", "Death Metal", "Black Metal", "Thrash", "Doom", "Sludge",
    "Metalcore", "Deathcore", "Grindcore", "Nu Metal", "Power Metal", "Progressive Metal",
    "Folk Metal", "Gothic",
    # Post-punk / wave / industrial / sperimentale
    "Post-Punk", "New Wave", "Darkwave", "Cold Wave", "Industrial", "Noise",
    "Experimental", "EBM",
    # Hip-Hop / Rap
    "Hip-Hop/Rap", "Rap", "Trap", "Drill", "Grime", "Boom Bap",
    # Elettronica e derivati
    "Dance/Electronic", "Techno", "House", "Deep House", "Tech House", "Minimal",
    "Acid", "Trance", "Psytrance", "Drum & Bass", "Dubstep", "Breakbeat", "Electro",
    "IDM", "Ambient", "Hardstyle", "Hardcore Techno", "Gabber", "Jungle", "Electronica",
]


def fonte_ticketmaster(api_key, paese="IT", keyword="", size=100, page=0, classification="music"):
    """Ticketmaster Discovery API (chiave gratuita). Una pagina di risultati per un paese e genere.
    Doc: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/"""
    if not api_key:
        return []
    import urllib.request, urllib.parse
    params = {"apikey": api_key, "countryCode": paese, "size": size, "page": page,
              "classificationName": classification, "sort": "date,asc"}
    if keyword:
        params["keyword"] = keyword
    url = "https://app.ticketmaster.com/discovery/v2/events.json?" + urllib.parse.urlencode(params)
    data = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "DeadPeopleActivity/2.0 (+https://deadpeopleactivity.com)",
                "Accept": "application/json",
            })
            with urllib.request.urlopen(req, timeout=45) as resp:
                data = json.load(resp)
            break
        except Exception as e:
            if attempt == 3:
                print("  ! Ticketmaster non raggiungibile dopo 4 tentativi (", paese, "):", e)
                return None
            wait_seconds = (5, 15, 30)[attempt]
            print("  ! Ticketmaster connessione interrotta (", paese,
                  "): nuovo tentativo tra", wait_seconds, "secondi.")
            time.sleep(wait_seconds)
    out = []
    for e in data.get("_embedded", {}).get("events", []):
        venue = (e.get("_embedded", {}).get("venues") or [{}])[0]
        # generi: prendo sia genere che sottogenere, scartando etichette vuote/inutili
        gset = []
        for c in e.get("classifications", []):
            for key in ("genre", "subGenre"):
                nm = (c.get(key) or {}).get("name", "")
                if nm and nm.lower() not in ("undefined", "other", "n/a"):
                    gset.append(nm)
        out.append({
            "id": "tm-" + e.get("id", ""),
            "nome": e.get("name", ""),
            "data": (e.get("dates", {}).get("start", {}) or {}).get("localDate", ""),
            "ora": (e.get("dates", {}).get("start", {}) or {}).get("localTime", ""),
            "paese": (venue.get("country") or {}).get("name", ""),
            "paese_code": (venue.get("country") or {}).get("countryCode", ""),
            "regione": (venue.get("state") or {}).get("name", ""),
            "citta": (venue.get("city") or {}).get("name", ""),
            "indirizzo": (venue.get("address") or {}).get("line1", ""),
            "locale": venue.get("name", ""),
            "lat": float(venue["location"]["latitude"]) if venue.get("location") else None,
            "lng": float(venue["location"]["longitude"]) if venue.get("location") else None,
            "genere": list(dict.fromkeys(gset)),  # generi + sottogeneri, senza duplicati
            "tipo": "concerto",
            "biglietti_url": applica_affiliazione(e.get("url")),
            "promoter": (e.get("promoter") or {}).get("name", ""),
        })
    return out


# Elenco delle fonti ATTIVE (aggiungi qui quando ne integri di nuove)
def raccogli():
    eventi = []
    # Fonte demo DISATTIVATA (serviva solo a collaudare). Per riattivarla togli il commento:
    # eventi += [(r, "demo") for r in fonte_demo()]
    # Ticketmaster: attivo se e' presente la chiave nella variabile TM_API_KEY
    TM_KEY = os.environ.get("TM_API_KEY", "")
    if TM_KEY:
        # Scala europea: cicla su piu' paesi e piu' pagine (100 eventi a pagina).
        # PAESI_TM e PAGINE_TM sono regolabili anche da variabili d'ambiente.
        paesi = os.environ.get("PAESI_TM", ",".join(PAESI_EU)).split(",")
        pagine = int(os.environ.get("PAGINE_TM", "6"))  # fino a 6 pagine (600 eventi) per paese+genere
        tot_ric, tot_ok, chiamate = 0, 0, 0
        for paese in [p.strip() for p in paesi if p.strip()]:
            for cls in CLASSIFICAZIONI_TM:
                for pg in range(pagine):
                    tm = fonte_ticketmaster(TM_KEY, paese=paese, classification=cls, size=100, page=pg)
                    chiamate += 1
                    time.sleep(0.6)  # resta sotto il limite prudente di 2 richieste/secondo
                    if tm is None:
                        raise RuntimeError("Ticketmaster non raggiungibile: raccolta interrotta senza pubblicare dati parziali")
                    if not tm:
                        break  # niente piu' risultati per questo paese+genere
                    tm_ok = [r for r in tm if genere_ammesso(r)]
                    tot_ric += len(tm); tot_ok += len(tm_ok)
                    eventi += [(r, "ticketmaster") for r in tm_ok]
        print("   Ticketmaster EU:", tot_ric, "ricevuti ->", tot_ok,
              "tenuti dopo filtro generi (", chiamate, "chiamate API )")
    return eventi


# ============================================================================
# PIPELINE PRINCIPALE
# ============================================================================
def run():
    print(">> Raccolta dalle fonti attive...")
    grezzi = raccogli()
    print("   eventi grezzi raccolti:", len(grezzi))

    cache = _load_json(GEOCACHE, {})
    print(">> Normalizzazione + geocoding...")
    puliti = [normalizza(raw, fonte, cache) for raw, fonte in grezzi]
    _save_json(GEOCACHE, cache)

    # Carica cio' che c'e' gia': nuove scelte provider/link non vengono perse.
    pending = _load_json(PENDING_JSON, [])
    pubblicati = _load_json(EVENTS_JSON, [])

    print(">> Controllo doppioni e nuove opzioni biglietto...")
    nuovi = nuovi_per_coda(puliti, pending, pubblicati)

    pending += nuovi
    _save_json(PENDING_JSON, pending)

    senza_coord = [e["nome"] for e in nuovi if not e.get("lat")]
    print("--- FATTO ---")
    print("   nuovi aggiunti alla coda:", len(nuovi))
    print("   totale in coda (in_attesa):", len(pending))
    if senza_coord:
        print("   ! senza coordinate (da sistemare a mano):", senza_coord)
    print("   File coda:", PENDING_JSON)
    print("   Prossimo passo: controlla la coda e approva con  python ingest.py --approva <ID>")


def mirror_fallback():
    """Rispecchia events.json -> events-data.js (fallback locale) per tenerli allineati.
    Cosi' non serve piu' aggiornare i due file a mano."""
    pub = _load_json(EVENTS_JSON, [])
    header = (
        "/* ============================================================================\n"
        "   DATI EVENTI - FALLBACK (demo)  [FILE GENERATO AUTOMATICAMENTE]\n"
        "   Copia-specchio di assets/data/events.json usata quando il sito e' aperto\n"
        "   in locale (file://). NON modificare a mano: rigenerato da scripts/ingest.py\n"
        "   ============================================================================ */\n"
        "window.DPA_EVENTS_FALLBACK = "
    )
    with open(EVENTS_DATA_JS, "w", encoding="utf-8") as f:
        f.write(header + json.dumps(pub, ensure_ascii=False, indent=2) + ";\n")
    print("   events-data.js aggiornato (", len(pub), "eventi )")


def mostra():
    pending = _load_json(PENDING_JSON, [])
    print("CODA IN ATTESA:", len(pending), "eventi")
    per_fonte, per_genere = {}, {}
    for e in pending:
        per_fonte[e.get("fonte", "?")] = per_fonte.get(e.get("fonte", "?"), 0) + 1
        for g in (e.get("genere") or ["(nessuno)"]):
            per_genere[g] = per_genere.get(g, 0) + 1
    print("  per fonte: ", per_fonte)
    print("  per genere:", dict(sorted(per_genere.items(), key=lambda x: -x[1])))
    print("  ---")
    for e in pending:
        g = ",".join(e.get("genere") or [])
        print(f"  [{e['fonte']}] {e['id']}  {e['data']}  {e['nome']} — {e['citta']} [{g}]")


def _pubblica(lista_da_spostare, etichetta):
    pending = _load_json(PENDING_JSON, [])
    pubblicati = _load_json(EVENTS_JSON, [])
    ids = {e["id"] for e in lista_da_spostare}
    uniti, nuove_schede, nuove_opzioni = 0, 0, 0
    for e in lista_da_spostare:
        e["approvazione"] = "approvato"
        trovato = next((old for old in pubblicati if dedup_key(old) == dedup_key(e)), None)
        if trovato:
            aggiunte = merge_event(trovato, e)
            nuove_opzioni += aggiunte
            uniti += 1
        else:
            e["biglietti"] = ticket_options(e)
            pubblicati.append(e)
            nuove_schede += 1
    resto = [e for e in pending if e["id"] not in ids]
    _save_json(EVENTS_JSON, pubblicati)
    _save_json(PENDING_JSON, resto)
    print(f"PUBBLICATI {len(lista_da_spostare)} eventi ({etichetta}) -> {EVENTS_JSON}")
    print(f"   nuove schede: {nuove_schede} - uniti a schede esistenti: {uniti} - nuovi link: {nuove_opzioni}")
    print(f"   coda residua: {len(resto)}")
    mirror_fallback()


def approva(ev_id):
    """Pubblica un singolo evento (per ID)."""
    pending = _load_json(PENDING_JSON, [])
    trovato = [e for e in pending if e["id"] == ev_id]
    if not trovato:
        print("ID non trovato in coda:", ev_id); return
    _pubblica(trovato, "singolo")


def approva_fonte(fonte):
    """Pubblica TUTTI gli eventi in coda di una certa fonte (es. ticketmaster)."""
    pending = _load_json(PENDING_JSON, [])
    sel = [e for e in pending if e.get("fonte") == fonte]
    if not sel:
        print("Nessun evento in coda per la fonte:", fonte); return
    _pubblica(sel, "fonte=" + fonte)


def rimuovi_fonte(fonte):
    """Elimina eventi di una certa fonte SIA dalla coda SIA dai pubblicati (utile per togliere i demo)."""
    for path in (PENDING_JSON, EVENTS_JSON):
        dati = _load_json(path, [])
        prima = len(dati)
        dati = [e for e in dati if e.get("fonte") != fonte]
        _save_json(path, dati)
        print(f"  {os.path.basename(path)}: rimossi {prima - len(dati)}")
    mirror_fallback()


def spubblica_fonte(fonte):
    """Rimette in coda gli eventi gia' pubblicati di una fonte (li toglie da events.json
    e li rimanda in events_pending.json azzerando il genere), cosi' si possono
    ricontrollare/ripulire e ripubblicare. Utile dopo aver migliorato i filtri."""
    pub = _load_json(EVENTS_JSON, [])
    back = [e for e in pub if e.get("fonte") == fonte]
    keep = [e for e in pub if e.get("fonte") != fonte]
    if not back:
        print("Nessun evento pubblicato per la fonte:", fonte); return
    for e in back:
        e["approvazione"] = "in_attesa"
        e["genere"] = []   # azzerato: cosi' l'arricchimento lo ricontrolla
    pending = _load_json(PENDING_JSON, [])
    _save_json(PENDING_JSON, pending + back)
    _save_json(EVENTS_JSON, keep)
    mirror_fallback()
    print(f"Rimessi in coda {len(back)} eventi (fonte={fonte}). In mappa restano {len(keep)}.")
    print("Ora ricontrolla e ripubblica:")
    print("  python arricchisci_genere.py")
    print("  python ingest.py --approva-fonte", fonte)


def archivia_passati():
    """Sposta gli eventi con data gia' passata da events.json a events_archivio.json.
    Cosi' la mappa mostra solo eventi futuri. Utile da lanciare ogni giorno."""
    oggi = date.today().isoformat()
    pub = _load_json(EVENTS_JSON, [])
    arch = _load_json(ARCHIVIO_JSON, [])
    futuri = [e for e in pub if (e.get("data") or "9999") >= oggi]
    passati = [e for e in pub if (e.get("data") or "9999") < oggi]
    if passati:
        arch += passati
        _save_json(ARCHIVIO_JSON, arch)
        _save_json(EVENTS_JSON, futuri)
        mirror_fallback()
    print(f"Archiviati {len(passati)} eventi passati. In mappa restano {len(futuri)} eventi futuri.")


def filtra_coda():
    """Applica la whitelist generi alla coda gia' esistente: toglie pop/reggae/ecc.
    Gli eventi inviati dalla community (fonte 'demo'/'community') si tengono comunque."""
    pending = _load_json(PENDING_JSON, [])
    tieni, tolti = [], []
    for e in pending:
        if e.get("fonte") in ("community", "demo", "dice") or genere_ammesso(e):
            tieni.append(e)
        else:
            tolti.append(e)
    _save_json(PENDING_JSON, tieni)
    print(f"Coda filtrata: rimossi {len(tolti)}, tenuti {len(tieni)}")
    if tolti:
        print("  Esempi rimossi:", [f"{e['nome']} {e.get('genere')}" for e in tolti[:8]])


def approva_genere(genere):
    """Pubblica tutti gli eventi in coda che contengono un certo genere."""
    pending = _load_json(PENDING_JSON, [])
    sel = [e for e in pending if genere.lower() in [g.lower() for g in (e.get("genere") or [])]]
    if not sel:
        print("Nessun evento in coda per il genere:", genere); return
    _pubblica(sel, "genere=" + genere)


if __name__ == "__main__":
    def arg(flag):
        return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv and sys.argv.index(flag) + 1 < len(sys.argv) else ""

    if "--backup" in sys.argv:
        backup_eventi()
    elif "--show" in sys.argv:
        mostra()
    elif "--approva-fonte" in sys.argv:
        approva_fonte(arg("--approva-fonte"))
    elif "--approva-genere" in sys.argv:
        approva_genere(arg("--approva-genere"))
    elif "--approva" in sys.argv:
        approva(arg("--approva"))
    elif "--filtra-coda" in sys.argv:
        filtra_coda()
    elif "--rimuovi-fonte" in sys.argv:
        rimuovi_fonte(arg("--rimuovi-fonte"))
    elif "--spubblica-fonte" in sys.argv:
        spubblica_fonte(arg("--spubblica-fonte"))
    elif "--archivia-passati" in sys.argv:
        archivia_passati()
    elif "--mirror" in sys.argv:
        mirror_fallback()
    else:
        run()
