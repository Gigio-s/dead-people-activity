#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Raccoglitore di prova per festival, promoter e locali europei.

Legge prima i dati Event/MusicEvent/Festival in JSON-LD, poi usa piccoli
adattatori solo quando una fonte non offre dati strutturati. Normalmente crea
un file di prova; con --enqueue-events o --enqueue-festivals accoda il risultato
alla pipeline canonica, che applica deduplica e approvazione separatamente.
"""

import argparse
import hashlib
import html
import importlib.util
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from datetime import date, datetime
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
REGISTRY = os.path.join(HERE, "fonti_europee.json")
DEFAULT_OUTPUT = os.path.join(ROOT, "assets", "data", "events_europee_test.json")
INGEST_PATH = os.path.join(HERE, "coordinate eventi", "ingest.py")
USER_AGENT = "DeadPeopleActivityEventResearch/1.0 (+https://deadpeopleactivity.com/; info@deadpeopleactivity.com)"
EVENT_TYPES = {"event", "musicevent", "festival", "danceevent", "theaterevent"}

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links, self.jsonld, self.text = [], [], []
        self._json = False
        self._json_buf = []
        self.title = ""
        self._title = False

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if tag == "a" and data.get("href"):
            self.links.append(data["href"])
        if tag == "script" and "ld+json" in data.get("type", "").lower():
            self._json = True
            self._json_buf = []
        if tag == "title":
            self._title = True

    def handle_endtag(self, tag):
        if tag == "script" and self._json:
            self.jsonld.append("".join(self._json_buf))
            self._json = False
        if tag == "title":
            self._title = False

    def handle_data(self, data):
        if self._json:
            self._json_buf.append(data)
        elif self._title:
            self.title += data
        else:
            value = data.strip()
            if value:
                self.text.append(value)


class Collector:
    def __init__(self, delay=1.5, max_pages=30):
        self.delay = max(0.5, float(delay))
        self.max_pages = max(1, int(max_pages))
        self.last_request = 0.0
        self.robots = {}
        self.errors = []

    def _wait(self):
        remaining = self.delay - (time.time() - self.last_request)
        if remaining > 0:
            time.sleep(remaining)

    def fetch(self, url, timeout=25):
        self._wait()
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/json,application/xml;q=0.9,*/*;q=0.5"})
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                self.last_request = time.time()
                raw = response.read(4_000_000)
                charset = response.headers.get_content_charset() or "utf-8"
                try:
                    decoded = raw.decode("utf-8")
                except UnicodeDecodeError:
                    decoded = raw.decode(charset, "replace")
                return decoded, response.geturl(), response.headers.get_content_type()
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as exc:
            self.last_request = time.time()
            self.errors.append({"url": url, "errore": str(exc)})
            return None, url, ""

    def allowed(self, url):
        parts = urllib.parse.urlsplit(url)
        root = parts.scheme + "://" + parts.netloc
        if root not in self.robots:
            robots_url = root + "/robots.txt"
            text, _, _ = self.fetch(robots_url)
            parser = urllib.robotparser.RobotFileParser()
            parser.set_url(robots_url)
            if text is None:
                # robots non raggiungibile: consenti solo le URL fornite nel registro,
                # senza scansione aggressiva; il limite pagine resta comunque attivo.
                parser = None
            else:
                parser.parse(text.splitlines())
            self.robots[root] = parser
        parser = self.robots[root]
        return True if parser is None else parser.can_fetch(USER_AGENT, url)


def load_registry():
    with open(REGISTRY, "r", encoding="utf-8") as handle:
        return json.load(handle).get("fonti", [])


def scalar(value):
    if isinstance(value, list):
        return scalar(value[0]) if value else ""
    if isinstance(value, dict):
        return value.get("name") or value.get("url") or ""
    return str(value or "").strip()


def flatten_jsonld(value):
    if isinstance(value, list):
        for item in value:
            yield from flatten_jsonld(item)
    elif isinstance(value, dict):
        if "@graph" in value:
            yield from flatten_jsonld(value["@graph"])
        yield value


def is_event_node(node):
    raw = node.get("@type", "")
    types = raw if isinstance(raw, list) else [raw]
    return any(str(item).lower().replace("schema:", "") in EVENT_TYPES for item in types)


def iso_date(value):
    raw = scalar(value)
    match = re.match(r"(\d{4}-\d{2}-\d{2})", raw)
    return match.group(1) if match else ""


def iso_time(value):
    raw = scalar(value)
    match = re.search(r"T(\d{2}:\d{2})", raw)
    return match.group(1) if match else ""


def names(value):
    items = value if isinstance(value, list) else [value]
    result = []
    for item in items:
        name = scalar(item)
        if name and name not in result:
            result.append(name)
    return result


def image_url(value):
    if isinstance(value, list):
        return image_url(value[0]) if value else ""
    if isinstance(value, dict):
        return scalar(value.get("url") or value.get("contentUrl"))
    return scalar(value)


def offer_data(value):
    offers = value if isinstance(value, list) else [value]
    links, price, free = [], None, False
    for offer in offers:
        if not isinstance(offer, dict):
            continue
        url = scalar(offer.get("url"))
        if url and url not in [item["url"] for item in links]:
            links.append({"fonte": "sito ufficiale", "url": url, "prezzo": offer.get("price"), "gratuito": False})
        if price is None and offer.get("price") not in (None, ""):
            price = offer.get("price")
            try:
                free = float(price) == 0
            except (TypeError, ValueError):
                pass
    return links, price, free


def festival_name(name):
    return bool(re.search(r"(^|\W)(festival|fest|openair|open air)(\W|$)", name or "", re.I))


def event_id(source_id, name, event_date, city):
    key = "|".join([source_id, name.lower(), event_date, city.lower()])
    return "eu-" + hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]


def official_static_event(source):
    data = source.get("evento_ufficiale")
    if not isinstance(data, dict) or not data.get("nome") or not data.get("data"):
        return None
    if data["data"] < date.today().isoformat():
        return None
    ticket_url = scalar(data.get("biglietti_url"))
    tickets = [{"fonte": source["nome"], "url": ticket_url, "prezzo": None, "gratuito": False}] if ticket_url else []
    return {
        "id": event_id(source["id"], data["nome"], data["data"], data.get("citta", "")),
        "nome": data["nome"], "descrizione": data.get("descrizione", ""), "locandina": data.get("locandina", ""),
        "data": data["data"], "data_fine": data.get("data_fine", ""), "ora": "",
        "paese": data.get("paese", ""), "paese_code": source.get("paese_code", ""),
        "regione": data.get("regione", ""), "citta": data.get("citta", ""),
        "indirizzo": data.get("indirizzo", ""), "locale": data.get("locale", ""),
        "lat": data.get("lat"), "lng": data.get("lng"), "artisti": [], "genere": list(source.get("generi_default", [])),
        "tipo": "festival", "prezzo": None, "gratuito": False, "biglietti_url": ticket_url,
        "biglietti": tickets, "promoter": source["nome"], "promoter_url": source["url"],
        "social": [], "stato": "LIVE", "sponsorizzato": False, "fonte": "europa:" + source["id"],
        "approvazione": "in_attesa", "creato_il": datetime.now().isoformat(timespec="seconds"),
        "pagina_fonte": data.get("pagina_fonte") or source["url"]
    }


def normalize_jsonld(node, source, page_url):
    start = node.get("startDate")
    event_date = iso_date(start)
    if not event_date:
        return None
    location = node.get("location") or {}
    if isinstance(location, list):
        location = location[0] if location else {}
    address = location.get("address") or {} if isinstance(location, dict) else {}
    if isinstance(address, str):
        address = {"streetAddress": address}
    name = scalar(node.get("name"))
    city = scalar(address.get("addressLocality"))
    venue = scalar(location.get("name")) if isinstance(location, dict) else scalar(location)
    country = scalar(address.get("addressCountry")) or source.get("paese_code", "")
    country_code = country if len(country) == 2 else source.get("paese_code", "")
    tickets, price, free = offer_data(node.get("offers") or [])
    canonical = scalar(node.get("url")) or page_url
    if canonical and not tickets:
        tickets = [{"fonte": source["nome"], "url": canonical, "prezzo": None, "gratuito": False}]
    artists = names(node.get("performer") or node.get("actor") or [])
    genres = names(node.get("genre")) or list(source.get("generi_default", []))
    event_type = "festival" if festival_name(name) or scalar(node.get("@type")).lower() == "festival" else "concerto"
    return {
        "id": event_id(source["id"], name, event_date, city), "nome": name or "Evento musicale",
        "descrizione": scalar(node.get("description")), "locandina": image_url(node.get("image")),
        "data": event_date, "ora": iso_time(start), "paese": country, "paese_code": country_code,
        "regione": scalar(address.get("addressRegion")), "citta": city,
        "indirizzo": scalar(address.get("streetAddress")), "locale": venue,
        "lat": None, "lng": None, "artisti": artists, "genere": genres, "tipo": event_type,
        "prezzo": price, "gratuito": free, "biglietti_url": tickets[0]["url"] if tickets else canonical,
        "biglietti": tickets, "promoter": scalar(node.get("organizer")) or source["nome"],
        "promoter_url": source["url"], "social": [], "stato": "LIVE", "sponsorizzato": False,
        "fonte": "europa:" + source["id"], "approvazione": "in_attesa",
        "creato_il": datetime.now().isoformat(timespec="seconds"), "pagina_fonte": page_url
    }


def parse_jsonld(parser, source, page_url):
    events = []
    for block in parser.jsonld:
        try:
            payload = json.loads(html.unescape(block).strip())
        except (ValueError, TypeError):
            continue
        for node in flatten_jsonld(payload):
            if is_event_node(node):
                event = normalize_jsonld(node, source, page_url)
                if event:
                    events.append(event)
    return events


def route_resurrection(parser, source, page_url):
    if "/route/" not in urllib.parse.urlsplit(page_url).path:
        return []
    text = " ".join(parser.text)
    title = re.sub(r"\s*[-|]\s*Resurrection Fest.*$", "", parser.title, flags=re.I).strip()
    date_pattern = re.compile(
        r"(" + "|".join(MONTHS) + r")\s+(\d{1,2})(?:st|nd|rd|th)?[,\s]+(20\d{2})",
        re.I,
    )
    events = []
    dates = list(date_pattern.finditer(text))
    for index, match in enumerate(dates):
        month, day, year = match.groups()
        stop = dates[index + 1].start() if index + 1 < len(dates) else min(len(text), match.end() + 180)
        segment = text[match.end():stop]
        place = re.match(r"\s*[.\-–:]?\s*([^,|;.]{2,45}?)\s*[,|.]\s*([^|;]{2,90})", segment)
        if not place:
            continue
        city, venue = place.groups()
        event_date = date(int(year), MONTHS[month.lower()], int(day)).isoformat()
        city = city.strip(" .-")
        venue = re.split(r"(?:[\U00010000-\U0010ffff]|PRE[- ]?SALE|GENERAL SALE|Tickets?|Guest|Support|\s+-\s+\d{2}/\d{2}/\d{4})", venue, maxsplit=1, flags=re.I)[0].strip(" .-")
        if not city or not venue or len(city.split()) > 4 or re.search(r"\b20\d{2}\b", city):
            continue
        name = title or "Route Resurrection"
        events.append({
            "id": event_id(source["id"], name, event_date, city), "nome": name,
            "descrizione": "Data pubblicata da Route Resurrection.", "locandina": "",
            "data": event_date, "ora": "", "paese": "Spagna", "paese_code": "ES", "regione": "",
            "citta": city, "indirizzo": "", "locale": venue, "lat": None, "lng": None,
            "artisti": [re.sub(r"^Route Resurrection\s*:?\s*", "", name, flags=re.I)],
            "genere": list(source.get("generi_default", [])), "tipo": "concerto", "prezzo": None,
            "gratuito": False, "biglietti_url": page_url,
            "biglietti": [{"fonte": source["nome"], "url": page_url, "prezzo": None, "gratuito": False}],
            "promoter": source["nome"], "promoter_url": source["url"], "social": [], "stato": "LIVE",
            "sponsorizzato": False, "fonte": "europa:" + source["id"], "approvazione": "in_attesa",
            "creato_il": datetime.now().isoformat(timespec="seconds"), "pagina_fonte": page_url
        })
    return events


def same_domain(url, base):
    return urllib.parse.urlsplit(url).netloc.lower().removeprefix("www.") == urllib.parse.urlsplit(base).netloc.lower().removeprefix("www.")


def relevant_link(url, source):
    path = urllib.parse.urlsplit(url).path.lower()
    return any(token.lower() in path for token in source.get("path_eventi", []))


def discover_sitemap(collector, source):
    parts = urllib.parse.urlsplit(source["url"])
    root = parts.scheme + "://" + parts.netloc
    found = []
    for sitemap in (root + "/wp-sitemap.xml", root + "/sitemap.xml"):
        text, _, _ = collector.fetch(sitemap)
        if not text:
            continue
        child_sitemaps = 0
        for loc in re.findall(r"<loc>(.*?)</loc>", text, re.I | re.S):
            url = html.unescape(loc.strip())
            if url.endswith(".xml"):
                if child_sitemaps >= 6 or len(found) >= collector.max_pages * 4:
                    continue
                child_sitemaps += 1
                child, _, _ = collector.fetch(url)
                if child:
                    found.extend(html.unescape(item.strip()) for item in re.findall(r"<loc>(.*?)</loc>", child, re.I | re.S))
            elif relevant_link(url, source):
                found.append(url)
            if len(found) >= collector.max_pages * 4:
                break
        if found:
            break
    urls = [url for url in found if same_domain(url, source["url"]) and relevant_link(url, source)]
    # Le pagine evento singole hanno priorita' su news, lineup e pagine generiche.
    ordered = sorted(dict.fromkeys(urls), key=lambda url: ("/route/" not in urllib.parse.urlsplit(url).path.lower(), url))
    return ordered[:collector.max_pages * 4]


def collect_source(collector, source):
    queue = list(source.get("start_urls") or [source["url"]])
    queue.extend(discover_sitemap(collector, source))
    seen, events = set(), []
    static_event = official_static_event(source)
    if static_event:
        events.append(static_event)
        if source.get("adattatore") == "statico":
            return deduplicate(events), 0, [static_event.get("pagina_fonte") or source["url"]]
    while queue and len(seen) < collector.max_pages:
        url = queue.pop(0).split("#", 1)[0]
        if url in seen or not same_domain(url, source["url"]) or not collector.allowed(url):
            continue
        seen.add(url)
        body, final_url, content_type = collector.fetch(url)
        if not body or "html" not in content_type:
            continue
        parser = PageParser()
        try:
            parser.feed(body)
        except Exception as exc:
            collector.errors.append({"url": final_url, "errore": "HTML: " + str(exc)})
            continue
        events.extend(parse_jsonld(parser, source, final_url))
        if source.get("adattatore") == "resurrection":
            events.extend(route_resurrection(parser, source, final_url))
        for href in parser.links:
            candidate = urllib.parse.urljoin(final_url, href).split("#", 1)[0]
            if candidate not in seen and same_domain(candidate, source["url"]) and relevant_link(candidate, source):
                queue.append(candidate)
    return deduplicate(events), len(seen), sorted(seen)


def deduplicate(events):
    result = {}
    for event in events:
        key = (event.get("nome", "").lower(), event.get("data", ""), event.get("citta", "").lower())
        if key not in result:
            result[key] = event
            continue
        known = {item.get("url") for item in result[key].get("biglietti", [])}
        for ticket in event.get("biglietti", []):
            if ticket.get("url") not in known:
                result[key].setdefault("biglietti", []).append(ticket)
    today = date.today().isoformat()
    return [event for event in result.values() if not event.get("data") or event["data"] >= today]


def enqueue_pipeline(events):
    """Accoda gli eventi alla pipeline canonica riusando la sua deduplica."""
    spec = importlib.util.spec_from_file_location("dpa_ingest", INGEST_PATH)
    if not spec or not spec.loader:
        raise RuntimeError("Impossibile caricare la pipeline canonica: " + INGEST_PATH)
    ingest = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ingest)
    pending = ingest._load_json(ingest.PENDING_JSON, [])
    published = ingest._load_json(ingest.EVENTS_JSON, [])
    new_events = ingest.nuovi_per_coda(events, pending, published)
    pending.extend(new_events)
    ingest._save_json(ingest.PENDING_JSON, pending)
    upgraded = 0
    for incoming in events:
        if incoming.get("lat") is None or incoming.get("lng") is None:
            continue
        current = next((item for item in published
                        if ingest.dedup_key(item) == ingest.dedup_key(incoming)), None)
        if current and (current.get("lat") is None or current.get("lng") is None):
            current["lat"], current["lng"] = incoming["lat"], incoming["lng"]
            current["coordinate_precisione"] = "locale_verificato"
            current["coordinate_fonte"] = "fonte_ufficiale"
            upgraded += 1
    if upgraded:
        ingest._save_json(ingest.EVENTS_JSON, published)
        ingest.mirror_fallback()
    return len(new_events), len(pending)


def main():
    parser = argparse.ArgumentParser(description="Test sicuro delle fonti europee")
    parser.add_argument("--source", help="ID fonte; ometti per tutte le fonti attive")
    parser.add_argument("--all", action="store_true", help="prova anche le fonti candidate disattivate")
    parser.add_argument("--festival-only", action="store_true", help="usa solo fonti con festival futuro confermato e conserva soltanto i festival")
    parser.add_argument("--concert-only", action="store_true", help="usa le fonti abilitate ai concerti e conserva soltanto gli eventi non festival")
    parser.add_argument("--enqueue-events", action="store_true", help="accoda il risultato alla normale pipeline eventi con deduplica")
    parser.add_argument("--enqueue-festivals", action="store_true", help="accoda i festival alla pipeline canonica con deduplica")
    parser.add_argument("--max-pages", type=int, default=30)
    parser.add_argument("--delay", type=float, default=1.5)
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    if args.enqueue_events and args.enqueue_festivals:
        parser.error("usa un solo tipo di accodamento")
    if args.enqueue_events and not args.concert_only:
        parser.error("--enqueue-events richiede --concert-only")
    if args.enqueue_festivals and not args.festival_only:
        parser.error("--enqueue-festivals richiede --festival-only")

    sources = load_registry()
    if args.source:
        sources = [item for item in sources if item.get("id") == args.source]
    elif args.festival_only:
        sources = [item for item in sources if item.get("festival_attiva")]
    elif args.concert_only:
        sources = [item for item in sources if item.get("concerti_attiva")]
    elif not args.all:
        sources = [item for item in sources if item.get("attiva")]
    if not sources:
        print("Nessuna fonte corrispondente.")
        return 2

    collector = Collector(args.delay, args.max_pages)
    all_events, report = [], []
    for source in sources:
        print("---", source["nome"], "---")
        events, pages, visited = collect_source(collector, source)
        if args.festival_only:
            events = [event for event in events if event.get("tipo") == "festival"]
        elif args.concert_only:
            events = [event for event in events if event.get("tipo") != "festival"]
        all_events.extend(events)
        report.append({"id": source["id"], "nome": source["nome"], "pagine_lette": pages, "eventi_trovati": len(events), "pagine_campione": visited[:20]})
        print("pagine:", pages, "eventi:", len(events))

    all_events = deduplicate(all_events)
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    payload = {
        "modalita": ("CODA_CONCERTI" if args.enqueue_events else
                     "CODA_FESTIVAL" if args.enqueue_festivals else "TEST_NON_PUBBLICATO"),
        "generato_il": datetime.now().isoformat(timespec="seconds"),
        "totale": len(all_events), "fonti": report, "errori": collector.errors, "events": all_events
    }
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    print("\nCreato:", os.path.abspath(args.output))
    if args.enqueue_events or args.enqueue_festivals:
        added, pending_total = enqueue_pipeline(all_events)
        label = "Festival" if args.enqueue_festivals else "Concerti"
        print(label + " aggiunti alla coda normale:", added)
        print("Totale eventi ora in attesa:", pending_total)
    else:
        print("Eventi in prova:", len(all_events), "- nessuna pubblicazione eseguita.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
