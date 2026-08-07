"""Controlla e corregge in modo conservativo le coordinate degli eventi pubblicati.

Uso:
  python coordinate_eventi.py          # sola analisi
  python coordinate_eventi.py --apply  # applica solo corrispondenze di locali univoche

Non interroga servizi esterni e non assegna mai il centro città.
"""

import json
import os
import re
import sys
import unicodedata
from collections import defaultdict

import ingest


FONTI_COORD_PROVIDER = {"ticketmaster", "skiddle", "dice"}


def norm(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def coord(evento):
    try:
        lat, lng = float(evento.get("lat")), float(evento.get("lng"))
    except (TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180) or (lat == 0 and lng == 0):
        return None
    return round(lat, 6), round(lng, 6)


def venue_key(evento):
    return (norm(evento.get("locale")), norm(evento.get("citta")),
            norm(evento.get("paese_code") or evento.get("paese")))


def address_key(evento):
    return (norm(evento.get("indirizzo")), norm(evento.get("citta")),
            norm(evento.get("paese_code") or evento.get("paese")))


def registry(eventi):
    by_venue, by_address = defaultdict(set), defaultdict(set)
    for evento in eventi:
        posizione = coord(evento)
        if not posizione or norm(evento.get("fonte")) not in FONTI_COORD_PROVIDER:
            continue
        vk, ak = venue_key(evento), address_key(evento)
        if vk[0]:
            by_venue[vk].add(posizione)
        if ak[0]:
            by_address[ak].add(posizione)
    return ({key: next(iter(values)) for key, values in by_venue.items() if len(values) == 1},
            {key: next(iter(values)) for key, values in by_address.items() if len(values) == 1})


def suspicious_ra_centres(eventi):
    groups = defaultdict(list)
    for evento in eventi:
        posizione = coord(evento)
        if posizione and norm(evento.get("fonte")) == "ra":
            groups[posizione].append(evento)
    bad = set()
    for same_position in groups.values():
        venues = {venue_key(evento)[0] for evento in same_position if venue_key(evento)[0]}
        cities = {venue_key(evento)[1] for evento in same_position if venue_key(evento)[1]}
        if len(same_position) >= 5 and len(venues) >= 3 and len(cities) == 1:
            bad.update(evento.get("id") for evento in same_position)
    return bad


def run(apply_changes=False):
    eventi = ingest._load_json(ingest.EVENTS_JSON, [])
    venue_registry, address_registry = registry(eventi)
    suspicious = suspicious_ra_centres(eventi)
    corrected, cleared, uncertain = 0, 0, []

    for evento in eventi:
        posizione = coord(evento)
        reason = None
        zero_coords = evento.get("lat") == 0 and evento.get("lng") == 0
        if zero_coords:
            reason = "coordinate_zero"
            if apply_changes:
                evento["lat"] = None
                evento["lng"] = None
                evento["coordinate_precisione"] = "incerta"
                evento["coordinate_fonte"] = None
                cleared += 1
        if evento.get("id") in suspicious:
            posizione = None
            reason = "probabile_centro_citta"
            if apply_changes:
                evento["lat"] = None
                evento["lng"] = None
                evento["coordinate_precisione"] = "incerta"
                evento["coordinate_fonte"] = None
                cleared += 1

        if posizione:
            continue

        found = venue_registry.get(venue_key(evento))
        source = "locale_verificato"
        if not found:
            found = address_registry.get(address_key(evento))
            source = "indirizzo_verificato"
        if found:
            if apply_changes:
                evento["lat"], evento["lng"] = found
                evento["coordinate_precisione"] = "locale_verificato"
                evento["coordinate_fonte"] = source
            corrected += 1
        else:
            uncertain.append({
                "id": evento.get("id"), "nome": evento.get("nome"),
                "data": evento.get("data"), "fonte": evento.get("fonte"),
                "locale": evento.get("locale"), "indirizzo": evento.get("indirizzo"),
                "citta": evento.get("citta"), "paese": evento.get("paese"),
                "paese_code": evento.get("paese_code"),
                "motivo": reason or "coordinate_mancanti",
            })

    print("Eventi pubblicati:", len(eventi))
    print("Coordinate recuperabili da locali verificati:", corrected)
    print("Coordinate RA generiche da rimuovere:", len(suspicious))
    print("Eventi ancora da verificare:", len(uncertain))

    if apply_changes:
        if corrected or cleared:
            ingest.backup_eventi()
            ingest._save_json(ingest.EVENTS_JSON, eventi)
            ingest.mirror_fallback()
        ingest._save_json(ingest.COORD_INCERTE_JSON, uncertain)
        print("Correzioni applicate:", corrected)
        print("Coordinate generiche rimosse:", cleared)
        print("Coda salvata in:", ingest.COORD_INCERTE_JSON)


if __name__ == "__main__":
    run("--apply" in sys.argv)
