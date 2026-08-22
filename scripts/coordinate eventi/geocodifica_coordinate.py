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
from datetime import datetime, timedelta
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
SECRET_RE = re.compile(
    r"\b(tba|tbd|secret(?:\s+location)?|location\s+only|announced\s+to|"
    r"private\s+location|underground\s+rave)\b", re.I)
POSTCODE_PATTERNS = (
    re.compile(r"\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b", re.I),  # UK
    re.compile(r"\b\d{4,5}(?:-\d{3})?\b"),                         # Europa
)


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


def tokens(value):
    return {part for part in norm(value).split() if len(part) > 2}


def token_overlap(left, right):
    wanted = tokens(left)
    if not wanted:
        return 0.0
    return len(wanted & tokens(right)) / len(wanted)


def city_candidates(evento):
    raw = str(evento.get("citta") or "").strip()
    values = [raw]
    values.extend(re.findall(r"\(([^)]+)\)", raw))
    values.append(re.sub(r"\s*\([^)]+\)\s*", "", raw).strip())
    return list(dict.fromkeys(value for value in values if value))


def postcode(evento):
    haystack = " ".join(str(evento.get(key) or "") for key in ("indirizzo", "locale"))
    for pattern in POSTCODE_PATTERNS:
        match = pattern.search(haystack)
        if match:
            return re.sub(r"\s+", " ", match.group(0).upper()).strip()
    return ""


def house_number(value):
    cleaned = str(value or "")
    for pattern in POSTCODE_PATTERNS:
        cleaned = pattern.sub(" ", cleaned)
    match = re.search(r"\b\d+[a-z]?\b", norm(cleaned))
    return match.group(0) if match else ""


def is_secret(evento):
    text = " ".join(str(evento.get(key) or "") for key in ("locale", "indirizzo", "nome"))
    return bool(SECRET_RE.search(text))


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
                           ("city", "town", "village", "municipality", "county",
                            "suburb", "city_district", "state_district"))
    city_ok = any(similarity(city, city_result) >= 0.62 or norm(city) in norm(display)
                  for city in city_candidates(evento))
    wanted_postcode = norm(postcode(evento))
    result_postcode = norm(address.get("postcode"))
    postcode_ok = bool(wanted_postcode and result_postcode and wanted_postcode == result_postcode)
    if evento.get("citta") and not city_ok and not postcode_ok:
        return -1

    score = 4 + (3 if city_ok else 0) + (4 if postcode_ok else 0)
    venue_sim = similarity(evento.get("locale"), result.get("name") or display.split(",")[0])
    address_overlap = token_overlap(evento.get("indirizzo"), display)
    wanted_number = house_number(evento.get("indirizzo"))
    result_number = norm(address.get("house_number"))
    if wanted_number and result_number and wanted_number != result_number:
        return -1
    number_ok = bool(wanted_number and result_number and wanted_number == result_number)
    if venue_sim >= 0.62:
        score += 4
    elif venue_sim >= 0.42:
        score += 2
    if address_overlap >= 0.72:
        score += 4
    elif address_overlap >= 0.45:
        score += 2
    if number_ok:
        score += 3
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


def search_attempts(evento):
    """Tentativi dal piu preciso al piu tollerante, senza mescolare q e campi strutturati."""
    address = str(evento.get("indirizzo") or "").strip()
    venue = str(evento.get("locale") or "").strip()
    country = str(evento.get("paese") or "").strip()
    code = expected_country(evento)
    post = postcode(evento)
    common = {"format": "jsonv2", "limit": 8, "addressdetails": 1,
              "namedetails": 1, "dedupe": 1}
    if code:
        common["countrycodes"] = code

    attempts = []
    for city in city_candidates(evento):
        if address:
            structured = dict(common, street=address, city=city)
            if post:
                structured["postalcode"] = post
            attempts.append(("indirizzo_strutturato", structured))
            attempts.append(("indirizzo_libero", dict(common, q=", ".join(
                value for value in (address, city, country) if value))))
        if venue:
            attempts.append(("locale_citta", dict(common, q=", ".join(
                value for value in (venue, city, country) if value))))
    for query in search_queries(evento):
        attempts.append(("ricerca_completa", dict(common, q=query)))

    unique = []
    seen = set()
    for mode, params in attempts:
        signature = urllib.parse.urlencode(sorted(params.items()))
        if signature not in seen:
            seen.add(signature)
            unique.append((mode, params))
    return unique


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
                check=True, capture_output=True, text=True, encoding="utf-8", errors="replace")
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
    checked_at = datetime.now().isoformat(timespec="seconds")
    if is_secret(evento):
        return {"status": "in_attesa_indirizzo", "checked_at": checked_at,
                "motivo": "posizione_non_pubblica"}
    for mode, params in search_attempts(evento):
        url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(params)
        results = fetch_results(url, delay)
        ranked = sorted(((result_score(evento, item), item) for item in results),
                        key=lambda pair: pair[0], reverse=True)
        if ranked and ranked[0][0] >= 10 and (len(ranked) == 1 or ranked[0][0] >= ranked[1][0] + 2):
            best_score, best = ranked[0]
            return {"status": "verificato", "lat": float(best["lat"]),
                    "lng": float(best["lon"]), "score": best_score,
                    "display_name": best.get("display_name"), "query": params,
                    "modalita": mode, "checked_at": checked_at,
                    "precisione": "indirizzo_verificato" if evento.get("indirizzo") else "locale_verificato"}
    return {"status": "incerto", "checked_at": checked_at,
            "retry_after": (datetime.now() + timedelta(days=7)).isoformat(timespec="seconds")}


def should_retry(result, retry_days):
    status = result.get("status")
    if status not in ("incerto", "errore"):
        return status not in ("verificato", "in_attesa_indirizzo")
    checked = result.get("checked_at")
    if not checked:
        return True  # cache precedente: esegue una volta la nuova ricerca avanzata
    try:
        return datetime.now() >= datetime.fromisoformat(checked) + timedelta(days=retry_days)
    except ValueError:
        return True


def run(limit, apply_changes, delay, retry_days=7, event_type="", source_prefix=""):
    eventi = ingest._load_json(ingest.EVENTS_JSON, [])
    cache = ingest._load_json(CACHE_PATH, {})
    grouped = {}
    for evento in eventi:
        if event_type and str(evento.get("tipo") or "").lower() != event_type.lower():
            continue
        if source_prefix and not str(evento.get("fonte") or "").startswith(source_prefix):
            continue
        if not coordinate_eventi.coord(evento):
            grouped.setdefault(venue_key(evento), evento)

    requested = 0
    for key, sample in grouped.items():
        cached = cache.get(key, {})
        if cached.get("status") == "verificato" or not should_retry(cached, retry_days) or requested >= limit:
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
            evento["coordinate_precisione"] = result.get("precisione", "locale_verificato")
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
    parser.add_argument("--retry-incerti-giorni", type=int, default=7,
                        help="dopo quanti giorni riprovare i risultati incerti")
    parser.add_argument("--tipo", default="", help="interroga soltanto questo tipo di evento")
    parser.add_argument("--fonte-prefisso", default="", help="interroga soltanto fonti con questo prefisso")
    args = parser.parse_args()
    run(max(0, args.limit), args.apply, max(1.1, args.delay),
        max(1, args.retry_incerti_giorni), args.tipo, args.fonte_prefisso)
