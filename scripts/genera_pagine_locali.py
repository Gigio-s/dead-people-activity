#!/usr/bin/env python3
"""Genera pagine SEO locali esclusivamente dai JSON gia' pubblicati.

Non effettua chiamate HTTP e non modifica events.json. La mappa resta la fonte
centrale: ogni evento nelle pagine generate rimanda a mappa.html?evento=ID.
"""

from __future__ import annotations

import html
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from urllib.parse import urlencode


ROOT = Path(__file__).resolve().parent.parent
EVENTS = ROOT / "assets" / "data" / "events.json"
MANIFEST = ROOT / "assets" / "data" / "seo_local_manifest.json"
DOMAIN = "https://deadpeopleactivity.com"
LANGS = ("it", "en", "es", "ca", "de", "fr")
SECTIONS = {"it": "eventi", "en": "events", "es": "eventos", "ca": "esdeveniments", "de": "veranstaltungen", "fr": "evenements"}
TOP_CITIES = 40
MIN_COUNTRY_EVENTS = 10
MIN_CITY_EVENTS = 5
MAX_EVENTS_PAGE = 60
MONTHLY_EVENTS_PAGE = 30
MONTHLY_ROUTES = {
    "it": "concerti-piu-importanti", "en": "top-concerts", "es": "conciertos-mas-importantes",
    "ca": "concerts-mes-importants", "de": "wichtigste-konzerte", "fr": "concerts-les-plus-importants",
}
MONTHS = {
    "it": ("gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"),
    "en": ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"),
    "es": ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"),
    "ca": ("gener", "febrer", "març", "abril", "maig", "juny", "juliol", "agost", "setembre", "octubre", "novembre", "desembre"),
    "de": ("Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"),
    "fr": ("janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"),
}

TEXT = {
    "it": {"hub": "Concerti ed eventi in Europa", "intro": "Trova concerti, festival, DJ set e musica dal vivo per città o paese.", "countries": "Eventi per paese", "cities": "Eventi per città", "in_country": "Concerti ed eventi in {place}", "in_city": "Concerti a {city}, {country}", "updated": "Dati aggiornati il {date}", "events": "prossimi eventi", "map": "Apri sulla mappa interattiva", "details": "Dettagli evento", "all_map": "Esplora tutti gli eventi sulla mappa", "none": "Nessun evento futuro disponibile.", "monthly_title": "Concerti più importanti di {month} {year}", "monthly_intro": "Una selezione dei concerti in evidenza questo mese in Europa, ordinata usando tour presenti in più città, fonti ufficiali e completezza delle informazioni.", "monthly_link": "I concerti più importanti del mese"},
    "en": {"hub": "Concerts and events in Europe", "intro": "Find concerts, festivals, DJ sets and live music by city or country.", "countries": "Events by country", "cities": "Events by city", "in_country": "Concerts and events in {place}", "in_city": "Concerts in {city}, {country}", "updated": "Data updated on {date}", "events": "upcoming events", "map": "Open on the interactive map", "details": "Event details", "all_map": "Explore all events on the map", "none": "No upcoming events available.", "monthly_title": "Top concerts in {month} {year}", "monthly_intro": "A selection of this month's highlighted concerts across Europe, ranked using tours appearing in multiple cities, official sources and information completeness.", "monthly_link": "This month's top concerts"},
    "es": {"hub": "Conciertos y eventos en Europa", "intro": "Encuentra conciertos, festivales, sesiones de DJ y música en directo por ciudad o país.", "countries": "Eventos por país", "cities": "Eventos por ciudad", "in_country": "Conciertos y eventos en {place}", "in_city": "Conciertos en {city}, {country}", "updated": "Datos actualizados el {date}", "events": "próximos eventos", "map": "Abrir en el mapa interactivo", "details": "Detalles del evento", "all_map": "Explorar todos los eventos en el mapa", "none": "No hay próximos eventos disponibles.", "monthly_title": "Conciertos más importantes de {month} de {year}", "monthly_intro": "Una selección de los conciertos destacados del mes en Europa, ordenada según giras presentes en varias ciudades, fuentes oficiales y calidad de la información.", "monthly_link": "Los conciertos más importantes del mes"},
    "ca": {"hub": "Concerts i esdeveniments a Europa", "intro": "Troba concerts, festivals, sessions de DJ i música en directe per ciutat o país.", "countries": "Esdeveniments per país", "cities": "Esdeveniments per ciutat", "in_country": "Concerts i esdeveniments a {place}", "in_city": "Concerts a {city}, {country}", "updated": "Dades actualitzades el {date}", "events": "propers esdeveniments", "map": "Obre al mapa interactiu", "details": "Detalls de l’esdeveniment", "all_map": "Explora tots els esdeveniments al mapa", "none": "No hi ha propers esdeveniments disponibles.", "monthly_title": "Concerts més importants de {month} de {year}", "monthly_intro": "Una selecció dels concerts destacats del mes a Europa, ordenada segons gires presents en diverses ciutats, fonts oficials i qualitat de la informació.", "monthly_link": "Els concerts més importants del mes"},
    "de": {"hub": "Konzerte und Events in Europa", "intro": "Finde Konzerte, Festivals, DJ-Sets und Livemusik nach Stadt oder Land.", "countries": "Events nach Land", "cities": "Events nach Stadt", "in_country": "Konzerte und Events in {place}", "in_city": "Konzerte in {city}, {country}", "updated": "Daten aktualisiert am {date}", "events": "kommende Events", "map": "Auf der interaktiven Karte öffnen", "details": "Eventdetails", "all_map": "Alle Events auf der Karte entdecken", "none": "Keine kommenden Events verfügbar.", "monthly_title": "Die wichtigsten Konzerte im {month} {year}", "monthly_intro": "Eine Auswahl der Konzert-Highlights dieses Monats in Europa, geordnet nach Tourneen in mehreren Städten, offiziellen Quellen und Vollständigkeit der Angaben.", "monthly_link": "Die wichtigsten Konzerte des Monats"},
    "fr": {"hub": "Concerts et événements en Europe", "intro": "Trouvez des concerts, festivals, DJ sets et musique live par ville ou pays.", "countries": "Événements par pays", "cities": "Événements par ville", "in_country": "Concerts et événements en {place}", "in_city": "Concerts à {city}, {country}", "updated": "Données mises à jour le {date}", "events": "événements à venir", "map": "Ouvrir sur la carte interactive", "details": "Détails de l’événement", "all_map": "Explorer tous les événements sur la carte", "none": "Aucun événement à venir disponible.", "monthly_title": "Les concerts les plus importants de {month} {year}", "monthly_intro": "Une sélection des concerts phares du mois en Europe, classée selon les tournées présentes dans plusieurs villes, les sources officielles et la qualité des informations.", "monthly_link": "Les concerts les plus importants du mois"},
}

CODES = ("AT","BE","BG","CH","CZ","DE","DK","EE","ES","FI","FR","GB","GR","HR","HU","IE","IT","LT","LV","NL","NO","PL","PT","RO","RS","SE","SI","SK")
NAMES = {
    "it": ("Austria","Belgio","Bulgaria","Svizzera","Repubblica Ceca","Germania","Danimarca","Estonia","Spagna","Finlandia","Francia","Regno Unito","Grecia","Croazia","Ungheria","Irlanda","Italia","Lituania","Lettonia","Paesi Bassi","Norvegia","Polonia","Portogallo","Romania","Serbia","Svezia","Slovenia","Slovacchia"),
    "en": ("Austria","Belgium","Bulgaria","Switzerland","Czechia","Germany","Denmark","Estonia","Spain","Finland","France","United Kingdom","Greece","Croatia","Hungary","Ireland","Italy","Lithuania","Latvia","Netherlands","Norway","Poland","Portugal","Romania","Serbia","Sweden","Slovenia","Slovakia"),
    "es": ("Austria","Bélgica","Bulgaria","Suiza","Chequia","Alemania","Dinamarca","Estonia","España","Finlandia","Francia","Reino Unido","Grecia","Croacia","Hungría","Irlanda","Italia","Lituania","Letonia","Países Bajos","Noruega","Polonia","Portugal","Rumanía","Serbia","Suecia","Eslovenia","Eslovaquia"),
    "ca": ("Àustria","Bèlgica","Bulgària","Suïssa","Txèquia","Alemanya","Dinamarca","Estònia","Espanya","Finlàndia","França","Regne Unit","Grècia","Croàcia","Hongria","Irlanda","Itàlia","Lituània","Letònia","Països Baixos","Noruega","Polònia","Portugal","Romania","Sèrbia","Suècia","Eslovènia","Eslovàquia"),
    "de": ("Österreich","Belgien","Bulgarien","Schweiz","Tschechien","Deutschland","Dänemark","Estland","Spanien","Finnland","Frankreich","Vereinigtes Königreich","Griechenland","Kroatien","Ungarn","Irland","Italien","Litauen","Lettland","Niederlande","Norwegen","Polen","Portugal","Rumänien","Serbien","Schweden","Slowenien","Slowakei"),
    "fr": ("Autriche","Belgique","Bulgarie","Suisse","Tchéquie","Allemagne","Danemark","Estonie","Espagne","Finlande","France","Royaume-Uni","Grèce","Croatie","Hongrie","Irlande","Italie","Lituanie","Lettonie","Pays-Bas","Norvège","Pologne","Portugal","Roumanie","Serbie","Suède","Slovénie","Slovaquie"),
}
COUNTRY_NAMES = {lang: dict(zip(CODES, names)) for lang, names in NAMES.items()}
PREFERRED_CITIES = {"Rome", "Roma", "Milan", "Milano", "Madrid", "Barcelona", "Paris", "Berlin", "London"}


def esc(value: object) -> str:
    return html.escape(str(value or ""), quote=True)


def slug(value: str) -> str:
    plain = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "-", plain).strip("-") or "localita"


def country_name(code: str, lang: str, fallback: str = "") -> str:
    return COUNTRY_NAMES.get(lang, {}).get(code, fallback or code)


def route(lang: str, code: str = "", city: str = "") -> str:
    base = f"{lang}/{SECTIONS[lang]}"
    if code:
        base += "/" + slug(country_name(code, lang, code))
    if city:
        base += "/" + slug(city)
    return base + "/"


def monthly_route(lang: str, target: date) -> str:
    month = slug(MONTHS[lang][target.month - 1])
    return f"{lang}/{SECTIONS[lang]}/{MONTHLY_ROUTES[lang]}-{month}-{target.year}/"


def alternates(code: str = "", city: str = "") -> str:
    tags = [f'<link rel="alternate" hreflang="{lang}" href="{DOMAIN}/{route(lang, code, city)}">' for lang in LANGS]
    tags.append(f'<link rel="alternate" hreflang="x-default" href="{DOMAIN}/{route("en", code, city)}">')
    return "\n    ".join(tags)


def monthly_alternates(target: date) -> str:
    tags = [f'<link rel="alternate" hreflang="{lang}" href="{DOMAIN}/{monthly_route(lang, target)}">' for lang in LANGS]
    tags.append(f'<link rel="alternate" hreflang="x-default" href="{DOMAIN}/{monthly_route("en", target)}">')
    return "\n    ".join(tags)


def headliner_key(event: dict) -> str:
    """Raggruppa tour e pacchetti dello stesso artista senza alterare i dati."""
    name = unicodedata.normalize("NFKD", str(event.get("nome") or "")).encode("ascii", "ignore").decode("ascii").lower()
    name = re.split(r"\s+\|\s+", name, maxsplit=1)[0]
    parts = re.split(r"\s+[-–—]\s+", name, maxsplit=1)
    if len(parts) == 2 and re.search(r"\b(tour|world|europe|european|live|vip|package|box seat)\b", parts[1]):
        name = parts[0]
    name = re.sub(r"\b(vip|premium|all-in|box seat|package|packages|sound ?check)\b.*$", "", name)
    return re.sub(r"[^a-z0-9]+", " ", name).strip() or str(event.get("id") or "evento")


def monthly_highlights(events: list[dict], target: date) -> list[dict]:
    prefix = target.strftime("%Y-%m-")
    monthly = [e for e in events if str(e.get("data") or "").startswith(prefix) and str(e.get("tipo") or "").lower() != "festival"]
    occurrences = Counter(headliner_key(e) for e in monthly)
    cities: dict[str, set[str]] = defaultdict(set)
    countries: dict[str, set[str]] = defaultdict(set)
    for event in monthly:
        key = headliner_key(event)
        if event.get("citta"):
            cities[key].add(str(event["citta"]))
        if event.get("paese_code"):
            countries[key].add(str(event["paese_code"]))

    def score(event: dict) -> tuple[int, str, str]:
        key = headliner_key(event)
        name = str(event.get("nome") or "").lower()
        tickets = event.get("biglietti") if isinstance(event.get("biglietti"), list) else []
        providers = {str(item.get("fonte") or "") for item in tickets if isinstance(item, dict)}
        completeness = sum(bool(event.get(field)) for field in ("locale", "indirizzo", "lat", "lng", "genere", "biglietti_url"))
        value = len(countries[key]) * 12 + len(cities[key]) * 5 + occurrences[key] * 2 + len(providers) * 4 + completeness
        if event.get("sponsorizzato"):
            value += 20
        if str(event.get("fonte") or "").lower() == "ticketmaster":
            value += 3
        # La scheda principale precede sempre VIP, box seat e altri upgrade
        # quando il provider pubblica più varianti dello stesso concerto.
        if re.search(r"\b(vip|premium|package|packages|box seat|upgrade|loge|gallery seat|vinyl room)\b", name):
            value -= 60
        return value, str(event.get("data") or ""), str(event.get("nome") or "")

    ranked = sorted(monthly, key=score, reverse=True)
    chosen: list[dict] = []
    seen_headliners: set[str] = set()
    per_country: Counter[str] = Counter()
    for event in ranked:
        key = headliner_key(event)
        country = str(event.get("paese_code") or "")
        if key in seen_headliners or per_country[country] >= 5:
            continue
        chosen.append(event)
        seen_headliners.add(key)
        per_country[country] += 1
        if len(chosen) >= MONTHLY_EVENTS_PAGE:
            break
    if len(chosen) < MONTHLY_EVENTS_PAGE:
        for event in ranked:
            key = headliner_key(event)
            if key in seen_headliners:
                continue
            chosen.append(event)
            seen_headliners.add(key)
            if len(chosen) >= MONTHLY_EVENTS_PAGE:
                break
    return sorted(chosen, key=lambda e: (str(e.get("data") or ""), str(e.get("nome") or "")))


def event_cards(events: list[dict], t: dict) -> str:
    cards = []
    for event in events[:MAX_EVENTS_PAGE]:
        genres = event.get("genere") or []
        genre = " · ".join(str(g) for g in genres[:2])
        place = ", ".join(x for x in (str(event.get("locale") or ""), str(event.get("citta") or "")) if x)
        payload = {key: event.get(key) for key in ("id", "nome", "descrizione", "data", "data_fine", "ora", "paese", "paese_code", "regione", "citta", "indirizzo", "locale", "lat", "lng", "artisti", "genere", "tipo", "prezzo", "gratuito", "biglietti_url", "biglietti", "fonte", "stato", "sponsorizzato")}
        encoded = esc(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c"))
        cards.append(
            f'<article class="local-event-card" data-event="{encoded}"><button type="button" class="local-event-summary" aria-expanded="false">'
            f'<time datetime="{esc(event.get("data"))}">{esc(event.get("data"))}</time>'
            f'<h2>{esc(event.get("nome"))}</h2><p>{esc(place)}</p>'
            + (f'<p class="local-event-genre">{esc(genre)}</p>' if genre else "")
            + f'<span class="btn">{esc(t["details"])} ↓</span></button></article>'
        )
    return "\n".join(cards) if cards else f'<p>{esc(t["none"])}</p>'


def page_html(lang: str, title: str, description: str, canonical: str, content: str, depth: int, code: str = "", city: str = "", alternate_links: str = "") -> str:
    base = "../" * depth
    schema = json.dumps({"@context": "https://schema.org", "@type": "CollectionPage", "name": title, "description": description, "url": canonical, "isPartOf": {"@type": "WebSite", "name": "Dead People Activity", "url": DOMAIN}}, ensure_ascii=False, separators=(",", ":"))
    return f'''<!DOCTYPE html>
<html lang="{lang}">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <base href="{base}">
    <title>{esc(title)} | Dead People Activity</title>
    <meta name="description" content="{esc(description)}"><meta name="robots" content="index, follow, max-image-preview:large">
    <link rel="canonical" href="{canonical}">
    {alternate_links or alternates(code, city)}
    <meta property="og:type" content="website"><meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(description)}"><meta property="og:url" content="{canonical}">
    <script type="application/ld+json">{schema}</script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
    <link rel="stylesheet" href="assets/css/style.css?v=18">
</head>
<body class="local-seo-page">
    <header class="header"><div class="container nav-container"><a href="index.html" class="logo">Dead People <span>Activity</span></a><ul class="nav-menu"></ul><div class="header-socials"></div><button class="hamburger" aria-label="Apri Menu"><span class="bar"></span><span class="bar"></span><span class="bar"></span></button></div></header>
    <main class="page-wrapper local-directory"><div class="container">{content}</div></main>
    <footer class="footer"></footer>
    <script src="assets/js/i18n.js?v=9"></script><script src="assets/js/main.js?v=9"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script><script src="assets/js/local-pages.js?v=1"></script>
</body></html>'''


def write_page(relative_url: str, content: str, generated: list[str]) -> None:
    path = ROOT / relative_url / "index.html"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    generated.append(relative_url)


def remove_previous() -> None:
    if not MANIFEST.exists():
        return
    old = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for relative in old.get("urls", []):
        target = (ROOT / relative / "index.html").resolve()
        if ROOT.resolve() in target.parents and target.exists() and "local-seo-page" in target.read_text(encoding="utf-8", errors="ignore"):
            target.unlink()


def main() -> None:
    remove_previous()
    today_date = date.today()
    today = today_date.isoformat()
    next_month = date(today_date.year + (1 if today_date.month == 12 else 0), 1 if today_date.month == 12 else today_date.month + 1, 1)
    monthly_targets = (date(today_date.year, today_date.month, 1), next_month)
    raw = json.loads(EVENTS.read_text(encoding="utf-8"))
    candidates = [e for e in raw if str(e.get("data") or "") >= today and str(e.get("stato") or "").upper() == "LIVE" and e.get("paese_code")]
    # L'inventario centrale puo' contenere varianti della stessa inserzione:
    # nelle directory SEO mostriamo una sola scheda per ID senza toccare il JSON.
    unique: dict[str, dict] = {}
    for event in candidates:
        key = str(event.get("id") or "") or "|".join(str(event.get(field) or "") for field in ("nome", "data", "locale", "citta"))
        unique.setdefault(key, event)
    events = list(unique.values())
    by_country: dict[str, list[dict]] = defaultdict(list)
    by_city: dict[tuple[str, str], list[dict]] = defaultdict(list)
    fallback_names: dict[str, str] = {}
    for event in sorted(events, key=lambda e: (str(e.get("data") or ""), str(e.get("nome") or ""))):
        code = str(event.get("paese_code") or "").upper()
        city = str(event.get("citta") or "").strip()
        fallback_names.setdefault(code, str(event.get("paese") or code))
        by_country[code].append(event)
        if city and city.lower() not in {"all", "unknown", "online"}:
            by_city[(code, city)].append(event)

    countries = [code for code, rows in by_country.items() if len(rows) >= MIN_COUNTRY_EVENTS]
    countries.sort(key=lambda code: (-len(by_country[code]), code))
    ranked_cities = sorted(by_city, key=lambda key: (-len(by_city[key]), key[1]))
    selected_cities = set(ranked_cities[:TOP_CITIES])
    selected_cities.update(key for key in ranked_cities if key[1] in PREFERRED_CITIES and len(by_city[key]) >= MIN_CITY_EVENTS)
    selected_cities = sorted(selected_cities, key=lambda key: (-len(by_city[key]), key[1]))

    generated: list[str] = []
    display_date = today_date.strftime("%d/%m/%Y")
    for lang in LANGS:
        t = TEXT[lang]
        country_links = "".join(f'<a class="local-directory-link" href="{route(lang, code)}"><strong>{esc(country_name(code, lang, fallback_names.get(code, code)))}</strong><span>{len(by_country[code])} {esc(t["events"])}</span></a>' for code in countries)
        city_links = "".join(f'<a class="local-directory-link" href="{route(lang, code, city)}"><strong>{esc(city)}</strong><span>{esc(country_name(code, lang, fallback_names.get(code, code)))} · {len(by_city[(code, city)])}</span></a>' for code, city in selected_cities)
        hub_title = t["hub"]
        monthly_links = "".join(
            f'<a class="local-directory-link local-monthly-link" href="{monthly_route(lang, target)}"><strong>{esc(t["monthly_title"].format(month=MONTHS[lang][target.month - 1], year=target.year))}</strong><span>{esc(t["monthly_link"])}</span></a>'
            for target in monthly_targets
        )
        hub_content = f'<section class="local-hero"><p class="eyebrow">EUROPE // LIVE</p><h1>{esc(hub_title)}</h1><p>{esc(t["intro"])}</p><a class="btn btn-primary" href="mappa.html">{esc(t["all_map"])} →</a></section><section class="local-monthly-section"><div class="local-directory-grid">{monthly_links}</div></section><section id="paesi"><h2>{esc(t["countries"])}</h2><div class="local-directory-grid">{country_links}</div></section><section id="citta"><h2>{esc(t["cities"])}</h2><div class="local-directory-grid">{city_links}</div></section>'
        write_page(route(lang), page_html(lang, hub_title, t["intro"], f'{DOMAIN}/{route(lang)}', hub_content, 2), generated)

        for target in monthly_targets:
            highlights = monthly_highlights(events, target)
            month_name = MONTHS[lang][target.month - 1]
            title = t["monthly_title"].format(month=month_name, year=target.year)
            desc = f'{title}. {t["monthly_intro"]} {t["updated"].format(date=display_date)}.'
            body = (
                f'<nav class="local-breadcrumb"><a href="{route(lang)}">{esc(t["hub"])}</a> / {esc(title)}</nav>'
                f'<section class="local-hero local-monthly-hero"><p class="eyebrow">EUROPE // {esc(month_name.upper())}</p><h1>{esc(title)}</h1><p>{esc(t["monthly_intro"])}</p>'
                f'<a class="btn btn-primary" href="mappa.html">{esc(t["all_map"])} →</a></section>'
                f'<section class="local-events-grid">{event_cards(highlights, t)}</section>'
            )
            write_page(monthly_route(lang, target), page_html(lang, title, desc, f'{DOMAIN}/{monthly_route(lang, target)}', body, 3, alternate_links=monthly_alternates(target)), generated)

        for code in countries:
            cname = country_name(code, lang, fallback_names.get(code, code))
            title = t["in_country"].format(place=cname)
            desc = f'{title}: {len(by_country[code])} {t["events"]}. {t["updated"].format(date=display_date)}.'
            country_city_links = "".join(f'<a class="local-directory-link" href="{route(lang, code, city)}"><strong>{esc(city)}</strong><span>{len(by_city[(code, city)])} {esc(t["events"])}</span></a>' for c, city in selected_cities if c == code)
            body = f'<nav class="local-breadcrumb"><a href="{route(lang)}">{esc(t["hub"])}</a> / {esc(cname)}</nav><section class="local-hero"><h1>{esc(title)}</h1><p>{esc(desc)}</p><a class="btn btn-primary" href="mappa.html?{urlencode({"paese": fallback_names.get(code, code)})}">{esc(t["map"])} →</a></section>' + (f'<section><h2>{esc(t["cities"])}</h2><div class="local-directory-grid">{country_city_links}</div></section>' if country_city_links else "") + f'<section class="local-events-grid">{event_cards(by_country[code], t)}</section>'
            write_page(route(lang, code), page_html(lang, title, desc, f'{DOMAIN}/{route(lang, code)}', body, 3, code), generated)

        for code, city in selected_cities:
            cname = country_name(code, lang, fallback_names.get(code, code))
            title = t["in_city"].format(city=city, country=cname)
            desc = f'{title}: {len(by_city[(code, city)])} {t["events"]}. {t["updated"].format(date=display_date)}.'
            query = urlencode({"paese": fallback_names.get(code, code), "citta": city})
            body = f'<nav class="local-breadcrumb"><a href="{route(lang)}">{esc(t["hub"])}</a> / <a href="{route(lang, code)}">{esc(cname)}</a> / {esc(city)}</nav><section class="local-hero"><h1>{esc(title)}</h1><p>{esc(desc)}</p><a class="btn btn-primary" href="mappa.html?{query}">{esc(t["map"])} →</a></section><section class="local-events-grid">{event_cards(by_city[(code, city)], t)}</section>'
            write_page(route(lang, code, city), page_html(lang, title, desc, f'{DOMAIN}/{route(lang, code, city)}', body, 4, code, city), generated)

    MANIFEST.write_text(json.dumps({"generated_at": today, "source": "assets/data/events.json", "urls": generated}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Pagine SEO locali generate: {len(generated)} ({len(countries)} paesi, {len(selected_cities)} citta, 2 mesi, {len(LANGS)} lingue).")


if __name__ == "__main__":
    main()
