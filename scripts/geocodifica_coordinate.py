"""Geocodifica con prudenza i locali rimasti senza coordinate.

Usa Nominatim rispettando una richiesta al secondo, cache persistente e User-Agent
identificabile. Applica soltanto risultati coerenti con Paese, città e locale/indirizzo.
"""

import argparse
import json
import os
import re
import subprocess
import time
import unicodedata
import urllib.parse
from difflib import SequenceMatcher

import coordinate_eventi
import ingest


CACHE_PATH = os.path.join(ingest.HERE, "venue_geocode_cache.json")
USER_AGENT = "DeadPeopleActivity/2.0 (https://deadpeopleactivity.com; info@deadpeopleactivity.com)"
COUNTRY_CODES = {
    "italia": "it", "italy": "it", "spagna": "es", "spain": "es",
    "germania": "de", "germany": "de", "francia": "fr", "france": "fr",
    "regno unito": "gb", "great britain": "gb", "united kingdom": "gb",
    "irlanda": "ie", "ireland": "ie", "belgio": "be", "belgium": "be",
    "paesi bassi": "nl", "netherlands": "nl", "austria": "at",
    "svizzera": "ch", "switzerland": "ch", "polonia": "pl", "poland": "pl",
    "portogallo": "pt", "portugal": "pt", "danimarca": "dk", "denmark": "dk",
    "svezia": "se", "sweden": "se", "norvegia": "no", "norway": "no",
    "finlandia": "fi", "finland": "fi", "grecia": "gr", "greece": "gr",
    "repubblica ceca": "cz", "czechia": "cz", "czech republic": "cz",
}
ADMIN_TYPES = {"city", "town", "village", "municipality", "county", "state",
               "administrative", "country", "postcode", "suburb", "neighbourhood"}
LAST_REQUEST_AT = 0.0


def norm(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def venue_key(evento):
    return "|".join((norm(evento.get("locale")), norm(evento.get("indirizzo")),
                     norm(evento.get("citta")), norm(evento.get("paese_code") or evento.get("paese"))))


def similarity(left, right):
    left, right = norm(left), norm(right)
    if not left or not right:
        return 0.0
    return SequenceMatcher(None, left, right).ratio()


def expected_country(evento):
    code = norm(evento.get("paese_code"))
    if len(code) == 2:
        return code
    return COUNTRY_CODES.get(norm(evento.get("paese")), "")


def result_score(evento, result):
    address = result.get("address") or {}
    result_country = norm(address.get("country_code"))
    wanted_country = expected_country(evento)
    if wanted_country and result_country != wanted_country:
        return -1

    display = result.get("display_name") or ""
    city_result = " ".join(str(address.get(k) or "") for k in
                           ("city", "town", "village", "municipality", "county"))
    city_ok = similarity(evento.get("citta"), city_result) >= 0.65 or norm(evento.get("citta")) in norm(display)
    if evento.get("citta") and not city_ok:
        return -1

    score = 4 + (3 if city_ok else 0)
    venue_sim = similarity(evento.get("locale"), result.get("name") or display.split(",")[0])
    address_sim = similarity(evento.get("indirizzo"), display)
    if venue_sim >= 0.62:
        score += 4
    elif venue_sim >= 0.42:
        score += 2
    if address_sim >= 0.42:
        score += 4
    elif address_sim >= 0.25:
        score += 2
    if norm(result.get("type")) not in ADMIN_TYPES:
        score += 2
    return score


def search_queries(evento):
    venue, address = evento.get("locale") or "", evento.get("indirizzo") or ""
    city, country = evento.get("citta") or "", evento.get("paese") or ""
    candidates = [
        ", ".join(x for x in (venue, address, city, country) if x),
        ", ".join(x for x in (address, city, country) if x),
        ", ".join(x for x in (venue, city, country) if x),
    ]
    return list(dict.fromkeys(q for q in candidates if q))


def fetch_results(url, delay):
    """Una richiesta per volta, con pausa e backoff se il servizio limita l'accesso."""
    global LAST_REQUEST_AT
    last_error = None
    for attempt in range(4):
        wait_for = delay - (time.monotonic() - LAST_REQUEST_AT)
        if wait_for > 0:
            time.sleep(wait_for)
        try:
            completed = subprocess.run(
                ["curl.exe", "--silent", "--show-error", "--fail", "--max-time", "30",
                 "--user-agent", USER_AGENT, "--header", "Accept-Language: it,en", url],
                check=True, capture_output=True, text=True, encoding="utf-8")
            LAST_REQUEST_AT = time.monotonic()
            return json.loads(completed.stdout)
        except subprocess.CalledProcessError as exc:
            LAST_REQUEST_AT = time.monotonic()
            last_error = exc
            if exc.returncode != 22 or attempt == 3:
                raise
            backoff = 60 * (2 ** attempt)
            print(f"Limite temporaneo del servizio: attendo {backoff} secondi e riprovo.", flush=True)
            time.sleep(backoff)
    raise last_error


def lookup(evento, delay):
    code = expected_country(evento)
    for query in search_queries(evento):
        params = {"q": query, "format": "jsonv2", "limit": 5,
                  "addressdetails": 1, "namedetails": 1}
        if code:
            params["countrycodes"] = code
        url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(params)
        results = fetch_results(url, delay)
        ranked = sorted(((result_score(evento, item), item) for item in results),
                        key=lambda pair: pair[0], reverse=True)
        if ranked and ranked[0][0] >= 9 and (len(ranked) == 1 or ranked[0][0] > ranked[1][0]):
            best_score, best = ranked[0]
            return {"status": "verificato", "lat": float(best["lat"]),
                    "lng": float(best["lon"]), "score": best_score,
                    "display_name": best.get("display_name"), "query": query}
    return {"status": "incerto"}


def run(limit, apply_changes, delay):
    eventi = ingest._load_json(ingest.EVENTS_JSON, [])
    cache = ingest._load_json(CACHE_PATH, {})
    grouped = {}
    for evento in eventi:
        if not coordinate_eventi.coord(evento):
            grouped.setdefault(venue_key(evento), evento)

    requested = 0
    for key, sample in grouped.items():
        if cache.get(key, {}).get("status") in ("verificato", "incerto") or requested >= limit:
            continue
        try:
            cache[key] = lookup(sample, delay)
        except subprocess.CalledProcessError as exc:
            cache[key] = {"status": "errore", "errore": str(exc)}
            ingest._save_json(CACHE_PATH, cache)
            print("Servizio temporaneamente non disponibile: esecuzione interrotta senza perdere la cache.")
            break
        except Exception as exc:
            cache[key] = {"status": "errore", "errore": str(exc)}
        requested += 1
        ingest._save_json(CACHE_PATH, cache)
        print(f"[{requested}/{min(limit, len(grouped))}] {sample.get('locale')} - {cache[key].get('status')}", flush=True)

    fixed = 0
    for evento in eventi:
        if coordinate_eventi.coord(evento):
            continue
        result = cache.get(venue_key(evento)) or {}
        if result.get("status") == "verificato":
            evento["lat"], evento["lng"] = result["lat"], result["lng"]
            evento["coordinate_precisione"] = "locale_verificato"
            evento["coordinate_fonte"] = "nominatim_verificato"
            fixed += 1

    print("Locali nuovi interrogati:", requested)
    print("Eventi con coordinate verificate disponibili:", fixed)
    if apply_changes and fixed:
        ingest.backup_eventi()
        ingest._save_json(ingest.EVENTS_JSON, eventi)
        ingest.mirror_fallback()
        coordinate_eventi.run(True)
        print("Coordinate applicate e coda aggiornata.")
    elif apply_changes:
        coordinate_eventi.run(True)
        print("Nessuna nuova coordinata sicura da applicare; coda aggiornata.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--delay", type=float, default=2.5,
                        help="secondi minimi tra due richieste")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    run(max(0, args.limit), args.apply, max(1.1, args.delay))
