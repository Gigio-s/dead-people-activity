#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verifica tecnica dei festival scoperti, senza pubblicarli o attivarli."""

import argparse
import concurrent.futures
import html
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from datetime import date, datetime
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
INPUT = os.path.join(ROOT, "assets", "data", "festival_sources_pending.json")
VERIFIED = os.path.join(ROOT, "assets", "data", "festival_sources_verificate.json")
REVIEW = os.path.join(ROOT, "assets", "data", "festival_sources_da_controllare.json")
USER_AGENT = "DeadPeopleActivityFestivalVerifier/1.0 (+https://deadpeopleactivity.com/; info@deadpeopleactivity.com)"
FUTURE_YEARS = {str(date.today().year), str(date.today().year + 1), str(date.today().year + 2)}
GENRE_RE = re.compile(
    r"rock|metal|punk|hardcore|indie|alternative|hip[ -]?hop|rap|trap|drill|grime|"
    r"techno|electro|electronic|house|trance|drum.?and.?bass|dnb|dubstep|hardstyle|gabber|rave|edm",
    re.I,
)
EVENT_RE = re.compile(r"festival|line.?up|program|artist|band|ticket|event", re.I)


class Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.text, self.links, self.jsonld = [], [], []
        self._json, self._buffer = False, []

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if tag == "a" and data.get("href"):
            self.links.append((data.get("href"), data.get("title", "")))
        if tag == "script" and "ld+json" in data.get("type", "").lower():
            self._json, self._buffer = True, []

    def handle_endtag(self, tag):
        if tag == "script" and self._json:
            self.jsonld.append("".join(self._buffer))
            self._json = False

    def handle_data(self, data):
        if self._json:
            self._buffer.append(data)
        else:
            value = re.sub(r"\s+", " ", data).strip()
            if value:
                self.text.append(value)


def load(path, default):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return default


def save(path, value):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    temp = path + ".tmp"
    with open(temp, "w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
    os.replace(temp, path)


def robots_allowed(url):
    parts = urllib.parse.urlsplit(url)
    robots_url = parts.scheme + "://" + parts.netloc + "/robots.txt"
    parser = urllib.robotparser.RobotFileParser()
    parser.set_url(robots_url)
    try:
        request = urllib.request.Request(robots_url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=8) as response:
            parser.parse(response.read(300_000).decode("utf-8", "replace").splitlines())
        return parser.can_fetch(USER_AGENT, url)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError, ssl.SSLError):
        # Se robots non e' disponibile si legge esclusivamente la homepage indicata,
        # senza scansione del sito.
        return True


def fetch(url):
    request = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.3",
        "Accept-Language": "en,it,es,fr,de;q=0.7",
    })
    with urllib.request.urlopen(request, timeout=18) as response:
        raw = response.read(1_800_000)
        charset = response.headers.get_content_charset() or "utf-8"
        try:
            body = raw.decode(charset)
        except (UnicodeDecodeError, LookupError):
            body = raw.decode("utf-8", "replace")
        return body, response.geturl(), response.status, response.headers.get_content_type()


def flatten(value):
    if isinstance(value, list):
        for item in value:
            yield from flatten(item)
    elif isinstance(value, dict):
        if "@graph" in value:
            yield from flatten(value["@graph"])
        yield value


def structured_events(blocks):
    result = []
    for block in blocks:
        try:
            value = json.loads(html.unescape(block).strip())
        except (ValueError, TypeError):
            continue
        for item in flatten(value):
            raw_type = item.get("@type", "")
            types = raw_type if isinstance(raw_type, list) else [raw_type]
            if not any(str(kind).lower() in ("event", "musicevent", "festival", "danceevent") for kind in types):
                continue
            start = str(item.get("startDate") or "")[:10]
            result.append({
                "nome": str(item.get("name") or "").strip(),
                "data": start,
                "url": str(item.get("url") or "").strip(),
                "tipo": [str(kind) for kind in types],
            })
    return result


def verification(candidate):
    result = dict(candidate)
    url = candidate.get("sito_ufficiale") or ""
    result.update({
        "verificato_il": datetime.now().isoformat(timespec="seconds"),
        "raggiungibile": False, "url_finale": "", "http_status": None,
        "anni_futuri_trovati": [], "eventi_strutturati": [],
        "link_eventi": [], "link_biglietti": [], "errore_verifica": "",
    })
    if not url:
        result["esito"] = "sito_mancante"
        return result
    if not robots_allowed(url):
        result["esito"] = "robots_vieta_verifica"
        return result
    try:
        body, final_url, status, content_type = fetch(url)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError, ssl.SSLError) as exc:
        result["esito"] = "non_raggiungibile"
        result["errore_verifica"] = str(exc)
        return result
    result.update({"raggiungibile": True, "url_finale": final_url, "http_status": status})
    if "html" not in content_type:
        result["esito"] = "contenuto_non_html"
        return result
    parser = Parser()
    try:
        parser.feed(body)
    except Exception as exc:
        result["esito"] = "html_non_leggibile"
        result["errore_verifica"] = str(exc)
        return result

    visible = " ".join(parser.text)
    years = sorted(year for year in FUTURE_YEARS if re.search(r"(?<!\d)" + year + r"(?!\d)", visible))
    events = structured_events(parser.jsonld)
    future_events = [event for event in events if event.get("data", "")[:4] in FUTURE_YEARS]
    genre_words = sorted({match.group(0).lower() for match in GENRE_RE.finditer(visible[:500_000])})
    event_links, ticket_links = [], []
    for href, title in parser.links:
        absolute = urllib.parse.urljoin(final_url, href).split("#", 1)[0]
        signal = absolute + " " + title
        if EVENT_RE.search(signal) and absolute not in event_links:
            event_links.append(absolute)
        if re.search(r"ticket|bigliett|entrad|billet", signal, re.I) and absolute not in ticket_links:
            ticket_links.append(absolute)

    result.update({
        "anni_futuri_trovati": years, "eventi_strutturati": future_events[:20],
        "parole_genere_pagina": genre_words[:30], "link_eventi": event_links[:20],
        "link_biglietti": ticket_links[:10],
    })
    if future_events:
        result["esito"] = "evento_futuro_strutturato"
    elif years and genre_words:
        result["esito"] = "edizione_futura_probabile"
    elif years:
        result["esito"] = "anno_futuro_genere_da_confermare"
    else:
        result["esito"] = "sito_attivo_senza_edizione_futura"
    return result


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(description="Verifica i festival candidati senza attivarli")
    parser.add_argument("--limit", type=int, default=60)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--tutti-generi", action="store_true")
    parser.add_argument("--input", default=INPUT)
    parser.add_argument("--verificati", default=VERIFIED)
    parser.add_argument("--da-controllare", default=REVIEW)
    args = parser.parse_args()

    payload = load(args.input, {})
    candidates = payload.get("candidati", [])
    if not args.tutti_generi:
        candidates = [item for item in candidates if item.get("valutazione_genere") == "pertinente"]
    start = max(0, args.offset)
    candidates = candidates[start:start + max(0, args.limit)]
    if not candidates:
        print("Nessun candidato da verificare.")
        return 2

    print("Festival da verificare:", len(candidates), flush=True)
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.workers, 8))) as pool:
        futures = {pool.submit(verification, item): item for item in candidates}
        for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
            item = futures[future]
            try:
                checked = future.result()
            except Exception as exc:
                checked = dict(item, esito="errore_interno", errore_verifica=str(exc))
            results.append(checked)
            print(f"[{index}/{len(candidates)}] {checked.get('nome')} - {checked.get('esito')}", flush=True)

    good_states = {"evento_futuro_strutturato", "edizione_futura_probabile"}
    previous_verified = load(args.verificati, {}).get("candidati", [])
    previous_review = load(args.da_controllare, {}).get("candidati", [])
    merged = {item.get("id"): item for item in previous_verified + previous_review if item.get("id")}
    merged.update({item.get("id"): item for item in results if item.get("id")})
    all_results = list(merged.values())
    verified = [item for item in all_results if item.get("esito") in good_states]
    review = [item for item in all_results if item.get("esito") not in good_states]
    verified.sort(key=lambda item: (item.get("paese_code", ""), item.get("nome", "").casefold()))
    review.sort(key=lambda item: (item.get("esito", ""), item.get("nome", "").casefold()))
    now = datetime.now().isoformat(timespec="seconds")
    save(args.verificati, {"generato_il": now, "totale": len(verified), "candidati": verified})
    save(args.da_controllare, {"generato_il": now, "totale": len(review), "candidati": review})
    print("\nVerificati automaticamente:", len(verified))
    print("Da controllare o scartare:", len(review))
    print("Nessuna fonte e stata attivata o pubblicata.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
