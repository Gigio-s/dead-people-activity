#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Scopre festival musicali europei senza pubblicarli o attivarli.

Le fonti strutturate servono soltanto a creare una coda di ricerca. Prima di
entrare in fonti_europee.json ogni candidato deve essere verificato sul sito
ufficiale e collaudato con fonti_europee.py.
"""

import argparse
import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
REGISTRY = os.path.join(HERE, "fonti_europee.json")
DEFAULT_OUTPUT = os.path.join(ROOT, "assets", "data", "festival_sources_pending.json")
DEFAULT_REJECTED = os.path.join(ROOT, "assets", "data", "festival_sources_scartate.json")
USER_AGENT = "DeadPeopleActivityFestivalDiscovery/1.0 (+https://deadpeopleactivity.com/; info@deadpeopleactivity.com)"
WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql"
MUSICBRAINZ_ENDPOINT = "https://musicbrainz.org/ws/2/event/"
TICKETMASTER_ENDPOINT = "https://app.ticketmaster.com/discovery/v2/events.json"

EUROPE_CODES = {
    "AL", "AD", "AT", "BE", "BA", "BG", "HR", "CY", "CZ", "DK", "EE", "FI",
    "FR", "DE", "GR", "HU", "IS", "IE", "IT", "LV", "LI", "LT", "LU", "MT",
    "MD", "MC", "ME", "NL", "MK", "NO", "PL", "PT", "RO", "SM", "RS", "SK",
    "SI", "ES", "SE", "CH", "UA", "GB", "VA",
}

RELEVANT = re.compile(
    r"rock|metal|punk|hardcore|indie|alternative|grunge|stoner|emo|goth|industrial|"
    r"hip[ -]?hop|rap|trap|drill|grime|techno|electro|electronic|house|trance|"
    r"drum.?and.?bass|dnb|dubstep|hardstyle|gabber|rave|dance|edm",
    re.I,
)


def load_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return default


def save_json(path, value):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    temp = path + ".tmp"
    with open(temp, "w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
    os.replace(temp, path)


def fetch_json(url, params=None, timeout=35, retries=3):
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    last = None
    for attempt in range(retries):
        request = urllib.request.Request(url, headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        })
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8", "replace"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError, ValueError) as exc:
            last = exc
            if attempt + 1 < retries:
                time.sleep(3 * (attempt + 1))
    raise RuntimeError(str(last))


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def norm(value):
    return re.sub(r"[^a-z0-9]+", "", clean(value).casefold())


def domain(url):
    try:
        host = urllib.parse.urlsplit(url).netloc.casefold().split("@")[-1].split(":")[0]
        return host.removeprefix("www.")
    except ValueError:
        return ""


def candidate_id(name, country, url):
    raw = "|".join((norm(name), country, domain(url)))
    return "festival-" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:14]


def relevance(name, genres):
    text = " ".join([name] + list(genres or []))
    matches = sorted({match.group(0).lower() for match in RELEVANT.finditer(text)})
    return ("pertinente" if matches else "genere_da_verificare"), matches


def known_keys():
    registry = load_json(REGISTRY, {}).get("fonti", [])
    names = {norm(item.get("nome")) for item in registry if item.get("nome")}
    domains = {domain(item.get("url")) for item in registry if domain(item.get("url"))}
    return names, domains


def wikidata_candidates(limit):
    query = """
SELECT DISTINCT ?festival ?festivalLabel ?website ?countryCode
       (GROUP_CONCAT(DISTINCT ?genreLabel; separator=\"|\") AS ?genres)
WHERE {
  ?festival wdt:P31/wdt:P279* wd:Q868557;
            wdt:P856 ?website;
            wdt:P17 ?country.
  ?country wdt:P30 wd:Q46.
  OPTIONAL { ?country wdt:P297 ?countryCode. }
  ?festival rdfs:label ?festivalLabel.
  FILTER(LANG(?festivalLabel) = \"en\")
  OPTIONAL {
    ?festival wdt:P136 ?genre.
    OPTIONAL { ?genre rdfs:label ?genreLabel. FILTER(LANG(?genreLabel) = \"en\") }
  }
}
GROUP BY ?festival ?festivalLabel ?website ?countryCode
ORDER BY ?festivalLabel
LIMIT %d
""" % max(1, min(limit, 2000))
    data = fetch_json(WIKIDATA_ENDPOINT, {"query": query, "format": "json"}, timeout=60)
    result = []
    for row in data.get("results", {}).get("bindings", []):
        def value(key):
            return clean((row.get(key) or {}).get("value"))
        name, url, code = value("festivalLabel"), value("website"), value("countryCode").upper()
        if not name or not url or code not in EUROPE_CODES:
            continue
        genres = [item for item in value("genres").split("|") if item]
        status, matches = relevance(name, genres)
        entity = value("festival")
        result.append({
            "id": candidate_id(name, code, url), "nome": name, "paese_code": code,
            "sito_ufficiale": url, "dominio": domain(url), "generi_dichiarati": genres,
            "parole_genere": matches, "valutazione_genere": status,
            "data_inizio": "", "data_fine": "", "citta": "", "locale": "",
            "fonte_scoperta": "wikidata", "riferimento": entity,
            "stato": "da_verificare", "scoperto_il": date.today().isoformat(),
        })
    return result


def musicbrainz_candidates(limit):
    today = date.today().isoformat()
    until = (date.today() + timedelta(days=730)).isoformat()
    query = f'type:festival AND begin:[{today} TO {until}]'
    result, offset = [], 0
    while len(result) < limit:
        size = min(100, limit - len(result))
        data = fetch_json(MUSICBRAINZ_ENDPOINT, {
            "query": query, "fmt": "json", "limit": size, "offset": offset,
        })
        rows = data.get("events", [])
        if not rows:
            break
        for row in rows:
            area = row.get("area") or {}
            iso1 = area.get("iso-3166-1-codes") or []
            iso2 = area.get("iso-3166-2-codes") or []
            code = clean(iso1[0] if iso1 else (iso2[0].split("-", 1)[0] if iso2 else "")).upper()
            # MusicBrainz spesso restituisce solo la citta' senza il paese.
            # Un candidato senza localizzazione certa non deve entrare nella coda europea.
            if code not in EUROPE_CODES:
                continue
            name = re.sub(r",?\s+Day\s+\d+.*$", "", clean(row.get("name")), flags=re.I)
            genres = [clean(item.get("name")) for item in row.get("tags", []) if item.get("name")]
            status, matches = relevance(name, genres)
            if status != "pertinente":
                continue
            reference = "https://musicbrainz.org/event/" + clean(row.get("id"))
            result.append({
                "id": candidate_id(name, code, reference), "nome": name, "paese_code": code,
                "sito_ufficiale": "", "dominio": "", "generi_dichiarati": genres,
                "parole_genere": matches, "valutazione_genere": status,
                "data_inizio": clean((row.get("life-span") or {}).get("begin")),
                "data_fine": clean((row.get("life-span") or {}).get("end")),
                "citta": clean(area.get("name")), "locale": "",
                "fonte_scoperta": "musicbrainz", "riferimento": reference,
                "stato": "sito_ufficiale_da_trovare", "scoperto_il": date.today().isoformat(),
            })
        offset += len(rows)
        if len(rows) < size:
            break
        time.sleep(1.1)
    return result[:limit]


def ticketmaster_candidates(api_key, per_country=100):
    if not api_key:
        return []
    result = []
    for code in sorted(EUROPE_CODES):
        try:
            data = fetch_json(TICKETMASTER_ENDPOINT, {
                "apikey": api_key, "countryCode": code, "keyword": "festival",
                "classificationName": "Music", "size": min(per_country, 200),
                "sort": "date,asc", "locale": "*",
            })
        except RuntimeError:
            continue
        for row in data.get("_embedded", {}).get("events", []):
            name = clean(row.get("name"))
            if "festival" not in name.casefold() and " fest" not in name.casefold():
                continue
            venue = ((row.get("_embedded") or {}).get("venues") or [{}])[0]
            genres = []
            for classification in row.get("classifications", []):
                for key in ("genre", "subGenre"):
                    value = clean((classification.get(key) or {}).get("name"))
                    if value and value.casefold() not in ("undefined", "other"):
                        genres.append(value)
            status, matches = relevance(name, genres)
            reference = clean(row.get("url"))
            result.append({
                "id": candidate_id(name, code, reference), "nome": name, "paese_code": code,
                "sito_ufficiale": "", "dominio": "", "generi_dichiarati": list(dict.fromkeys(genres)),
                "parole_genere": matches, "valutazione_genere": status,
                "data_inizio": clean(((row.get("dates") or {}).get("start") or {}).get("localDate")),
                "data_fine": "", "citta": clean((venue.get("city") or {}).get("name")),
                "locale": clean(venue.get("name")), "fonte_scoperta": "ticketmaster",
                "riferimento": reference, "stato": "sito_ufficiale_da_trovare",
                "scoperto_il": date.today().isoformat(),
            })
        time.sleep(0.25)
    return result


def merge_candidates(items):
    known_names, known_domains = known_keys()
    accepted, rejected, seen = [], [], set()
    for item in items:
        name_key, host = norm(item.get("nome")), item.get("dominio") or ""
        key = host or "|".join((name_key, item.get("paese_code", ""), item.get("data_inizio", "")))
        reason = ""
        if not name_key or re.fullmatch(r"q\d+", name_key):
            reason = "nome_mancante"
        elif name_key in known_names or (host and host in known_domains):
            reason = "gia_registrato"
        elif key in seen:
            reason = "duplicato_scoperta"
        elif item.get("paese_code") and item["paese_code"] not in EUROPE_CODES:
            reason = "fuori_europa"
        if reason:
            rejected.append(dict(item, motivo_scarto=reason))
            continue
        seen.add(key)
        accepted.append(item)
    accepted.sort(key=lambda item: (
        item.get("valutazione_genere") != "pertinente",
        item.get("paese_code", ""), item.get("nome", "").casefold(),
    ))
    return accepted, rejected


def main():
    parser = argparse.ArgumentParser(description="Scoperta prudente dei festival europei")
    parser.add_argument("--wikidata-limit", type=int, default=500)
    parser.add_argument("--musicbrainz-limit", type=int, default=0,
                        help="facoltativo: MusicBrainz spesso non espone il paese dell'evento")
    parser.add_argument("--senza-ticketmaster", action="store_true")
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    parser.add_argument("--scartati", default=DEFAULT_REJECTED)
    args = parser.parse_args()

    collected, errors = [], []
    print("--- WIKIDATA: festival europei con sito ufficiale ---", flush=True)
    try:
        rows = wikidata_candidates(args.wikidata_limit)
        collected.extend(rows)
        print("candidati:", len(rows), flush=True)
    except RuntimeError as exc:
        errors.append({"fonte": "wikidata", "errore": str(exc)})
        print("non disponibile:", exc, flush=True)

    if args.musicbrainz_limit > 0:
        print("--- MUSICBRAINZ: edizioni future ---", flush=True)
        try:
            rows = musicbrainz_candidates(args.musicbrainz_limit)
            collected.extend(rows)
            print("candidati:", len(rows), flush=True)
        except RuntimeError as exc:
            errors.append({"fonte": "musicbrainz", "errore": str(exc)})
            print("non disponibile:", exc, flush=True)

    tm_key = "" if args.senza_ticketmaster else os.environ.get("TM_API_KEY", "")
    if tm_key:
        print("--- TICKETMASTER: eventi festival europei ---", flush=True)
        rows = ticketmaster_candidates(tm_key)
        collected.extend(rows)
        print("candidati:", len(rows), flush=True)

    accepted, rejected = merge_candidates(collected)
    now = datetime.now().isoformat(timespec="seconds")
    save_json(args.output, {
        "modalita": "SCOPERTA_NON_PUBBLICATA", "generato_il": now,
        "totale": len(accepted),
        "pertinenti": sum(item.get("valutazione_genere") == "pertinente" for item in accepted),
        "da_verificare_genere": sum(item.get("valutazione_genere") != "pertinente" for item in accepted),
        "errori": errors, "candidati": accepted,
    })
    save_json(args.scartati, {
        "generato_il": now, "totale": len(rejected), "candidati": rejected,
    })
    print("\nCoda creata:", os.path.abspath(args.output))
    print("Nuovi candidati:", len(accepted))
    print("Di genere probabilmente pertinente:", sum(item.get("valutazione_genere") == "pertinente" for item in accepted))
    print("Nessun festival e stato pubblicato o attivato.")
    return 0 if accepted or not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
