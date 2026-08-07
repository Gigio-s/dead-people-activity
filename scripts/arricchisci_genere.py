#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Dead People Activity — CONTROLLO GENERE AUTOMATICO (per eventi senza genere, es. Dice)
=====================================================================================

COSA FA:
  Prende gli eventi in coda (events_pending.json) che NON hanno un genere — tipici
  quelli di Dice — estrae il nome dell'artista, ne cerca il genere online su
  MusicBrainz (gratis, senza chiave) e smista tutto in automatico in TRE gruppi:

    TIENI    -> l'artista ha un genere/sottogenere della tua whitelist
                (rock, punk, metal, rap, elettronica...). Restano in coda,
                pronti da pubblicare, con il campo "genere" compilato.
    INCERTI  -> nessun genere trovato online (band sconosciuta, o nome evento
                strano, o serata senza un artista chiaro). Spostati in
                events_dice_incerti.json  -> li guardi a mano.
    SCARTATI -> genere trovato ma FUORI target (pop, reggae, latin, jazz...).
                Spostati in events_dice_scartati.json.

  NIENTE viene cancellato: incerti e scartati sono salvati in file separati e li
  puoi recuperare quando vuoi.

  In fondo puoi pubblicare i "TIENI" con:  python ingest.py --approva-fonte dice

FONTE GENERE:
  - MusicBrainz (https://musicbrainz.org) — gratis, senza chiave. Limite: ~1
    richiesta al secondo, quindi su tante band ci mette un po' (c'e' una cache
    su file: gli artisti gia' visti non vengono richiesti due volte).
  - (Facoltativo) Last.fm come rinforzo quando MusicBrainz non trova nulla:
    metti  set LASTFM_KEY=la_tua_chiave  in config.bat  (chiave gratuita su
    https://www.last.fm/api). Migliora la copertura sulle band piu' oscure.

USO:
  python arricchisci_genere.py            # controlla tutti i Dice in coda
  python arricchisci_genere.py --max 50   # solo i primi 50 (per una prova veloce)
  python arricchisci_genere.py --tutti    # controlla TUTTI gli eventi senza genere
                                          # (non solo fonte=dice)
  python arricchisci_genere.py --reincerti  # rimette in gioco gli "incerti" e li
                                          # ricontrolla (utile dopo aver messo LASTFM_KEY)

Dipendenze: solo libreria standard. Deve stare nella STESSA cartella di ingest.py.
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "coordinate eventi"))
import ingest  # riusa whitelist generi, coda, helper

HERE = os.path.dirname(os.path.abspath(__file__))
INCERTI_JSON = os.path.join(ingest.DATA_DIR, "events_dice_incerti.json")
SCARTATI_JSON = os.path.join(ingest.DATA_DIR, "events_dice_scartati.json")
CACHE_JSON = os.path.join(HERE, "genere_cache.json")

UA = "DeadPeopleActivity/1.0 (contatto@undergroundplatform.xyz)"


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")


def _get_retry(url, tries=2):
    """Come _get ma riprova una volta sugli errori temporanei (503/502/429)."""
    for i in range(tries):
        try:
            return _get(url)
        except urllib.error.HTTPError as e:
            if e.code in (503, 502, 429) and i < tries - 1:
                time.sleep(2.5)
                continue
            raise
    return ""


def _generi_da_testo(txt):
    """Cerca parole della whitelist dentro un testo libero (es. la descrizione MusicBrainz)."""
    t = (txt or "").lower()
    return [k for k in ingest.GENERI_AMMESSI if k in t]


# Giorni della settimana (IT/EN/ES/FR): da soli non sono un artista.
_GIORNI = {
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "saturdays", "thursdays", "fridays", "sundays", "the weekend", "weekend",
    "lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato", "domenica",
    "lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo",
    "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
}

# Parole-spia: se compaiono nel TITOLO, e' una serata/festa/evento generico, non un
# concerto di un artista identificabile -> meglio mandarlo tra gli INCERTI.
_SEGNALI_SERATA = [
    "pool party", "boat party", "block party", "garden party", "after party",
    "afterparty", "white party", "fluo party", "halloween party", "silent disco",
    "bingo", "karaoke", "brunch", "guest list", "free guest", "freshers", "tardeo",
    "fiesta", "perreo", "reggaeton", "sunset", "sunrise", "takeover", "all dayer",
    "open decks", "open mic", "sound system", "viewing party", "drag race",
    "summer series", "summer club", "pool session", "pool days", "boat club",
    "student", "campus", "silent disco", "rooftop", "salsa", "bachata", "kizomba",
    "quiz night", "listening session", "day fever", "soul bingo", "bingo jamz",
    "raver tots", "swiftogeddon", "emo night", "club classics", "throwback thursday",
]


def _titolo_e_serata(nome):
    t = (nome or "").lower()
    return any(s in t for s in _SEGNALI_SERATA)


# Regex per trovare un GENERE della whitelist scritto come parola intera nel titolo
# (es. "DER TECHNO", "Metal History", "Tardeo Rock", "House in Paradise").
# Parola intera: evita falsi positivi tipo "house" dentro "warehouse".
_GEN_TITOLO_RE = re.compile(
    r"\b(?:" + "|".join(re.escape(k) for k in
                        sorted(ingest.GENERI_AMMESSI, key=len, reverse=True)) + r")\b",
    re.I)


def _generi_nel_titolo(nome):
    """Ritorna i generi della whitelist trovati (come parola intera) nel titolo evento."""
    found = [m.group(0).lower() for m in _GEN_TITOLO_RE.finditer(nome or "")]
    return list(dict.fromkeys(found))


# LISTA PERSONALE: nomi di serate/brand che continuano a matchare per sbaglio una band.
# Aggiungi qui (in minuscolo) quelli che vedi passare sbagliati e non vuoi piu'.
_STOP_NOMI = {
    "baile", "motion", "kisstory", "graceland", "classics", "nostalgia",
    "throwback", "rewind", "afters", "the opening", "closing",
}


def _nome_non_utile(art):
    """True se il nome estratto non e' un artista cercabile (giorno, simboli, troppo corto)."""
    a = (art or "").strip().lower()
    if len(a) < 3:
        return True
    if a in _GIORNI or a in _STOP_NOMI:
        return True
    if not re.search(r"[a-zA-Z0-9]", a):   # solo punteggiatura/simboli
        return True
    return False


# Separatori tipici dei cartelloni: "A + B", "A / B", "A: sottotitolo", "A b2b B"...
_SEP = re.compile(r"\s*(?:\+|/|•|·|\||:|,| b2b | vs\.? | feat\.? | ft\.? | w/ )\s*", re.I)
# "Promoter pres/presents/presenta Artista" -> l'artista e' DOPO questa parola
_PRES = re.compile(r".*?\b(?:pres\.?|presents|presenta|invites?|invita)\b\s*", re.I)


def artista_principale(nome):
    """Estrae il nome dell'artista principale dal titolo dell'evento."""
    n = nome or ""
    # togli code tipo "@ Locale", "- Tour 2026", "– data"
    n = re.split(r"\s[@–—]\s|\s-\s", n)[0]
    n = re.sub(r"\(.*?\)", "", n)          # via le parentesi
    n = re.sub(r"\[.*?\]", "", n)
    n = n.replace("*", " ")                 # via gli asterischi decorativi
    # taglia le code tipiche dei dj-set/serate che rovinano la ricerca dell'artista
    n = re.sub(r"\b(all night long|all nighter|all night|live set|live|dj[ -]?set|"
               r"open air|closing( party)?|after ?party|warm ?up|residency)\b.*$",
               "", n, flags=re.I).strip()
    # "X pres Y" / "X presents Y" -> tieni la parte DOPO (l'artista, non il promoter)
    if _PRES.match(n):
        n = _PRES.sub("", n, count=1)
    # se restano piu' nomi (con & o x), tieni il primo
    n = re.split(r"\s+(?:&|x|×)\s+", n)[0]
    parti = [p.strip() for p in _SEP.split(n) if p.strip()]
    return (parti[0] if parti else n.strip())[:80]


def mb_tags(artista, cache):
    """Genere/i da MusicBrainz per un artista (con cache su file). Lista di stringhe."""
    key = ingest._slug(artista)
    if not key:
        return []
    if key in cache:
        return cache[key]
    tags = []
    try:
        q = urllib.parse.quote('artist:"%s"' % artista)
        url = "https://musicbrainz.org/ws/2/artist?query=%s&fmt=json&limit=1" % q
        j = json.loads(_get_retry(url))
        a = (j.get("artists") or [{}])[0]
        if a and int(a.get("score", 0)) >= 90:
            tags = [t.get("name", "") for t in (a.get("tags") or []) if t.get("name")]
            tags += [g.get("name", "") for g in (a.get("genres") or []) if g.get("name")]
            # a volte il genere e' solo nella descrizione ("German shoegaze band")
            tags += _generi_da_testo(a.get("disambiguation"))
            tags = [x for x in dict.fromkeys(tags) if x]
        time.sleep(1.1)   # MusicBrainz: max ~1 richiesta/secondo
    except Exception as e:
        print("   ! MusicBrainz errore su", artista, ":", str(e)[:60])
    cache[key] = tags
    return tags


def lastfm_tags(artista, api_key, cache):
    """Rinforzo facoltativo: tag di Last.fm (se e' impostata LASTFM_KEY)."""
    key = "lf:" + ingest._slug(artista)
    if key in cache:
        return cache[key]
    tags = []
    try:
        url = ("https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=%s"
               "&api_key=%s&format=json&autocorrect=1" % (urllib.parse.quote(artista), api_key))
        j = json.loads(_get(url))
        raw = j.get("toptags", {}).get("tag") or []
        tags = [t.get("name", "") for t in raw[:10] if t.get("name")]
        time.sleep(0.25)
    except Exception:
        pass
    cache[key] = tags
    return tags


def run(argv):
    n_max = None
    if "--max" in argv:
        try:
            n_max = int(argv[argv.index("--max") + 1])
        except Exception:
            pass
    tutti = "--tutti" in argv
    lastfm_key = os.environ.get("LASTFM_KEY", "")

    pending = ingest._load_json(ingest.PENDING_JSON, [])

    # --reincerti: rimette in gioco gli eventi finiti tra gli "incerti" (utile dopo
    # aver aggiunto la chiave Last.fm, per ricontrollarli con piu' copertura)
    if "--reincerti" in argv:
        inc = ingest._load_json(INCERTI_JSON, [])
        if inc:
            for e in inc:
                e["genere"] = []          # azzera cosi' rientra tra i "senza genere"
                e.pop("_artista_check", None)
            pending += inc
            ingest._save_json(INCERTI_JSON, [])
            print(f"   Reinseriti {len(inc)} eventi 'incerti' per un nuovo controllo.")

    def senza_genere(e):
        g = e.get("genere") or []
        return not (g and any(str(x).strip() for x in g))

    # candidati da controllare
    def target(e):
        if tutti:
            return senza_genere(e)
        return e.get("fonte") == "dice" and senza_genere(e)

    da_controllare = [e for e in pending if target(e)]
    resto = [e for e in pending if not target(e)]
    if n_max:
        da_controllare, extra = da_controllare[:n_max], da_controllare[n_max:]
        resto += extra

    if not da_controllare:
        print("Nessun evento senza genere da controllare. (Hai gia' lanciato dice.py?)")
        return

    cache = ingest._load_json(CACHE_JSON, {})
    print(f">> Controllo genere online per {len(da_controllare)} eventi "
          f"(MusicBrainz{' + Last.fm' if lastfm_key else ''})...")
    print("   (MusicBrainz limita a ~1 richiesta/sec: gli artisti nuovi richiedono tempo, "
          "i gia' visti sono in cache)")

    tieni, incerti, scartati = [], [], []
    for i, e in enumerate(da_controllare, 1):
        art = artista_principale(e.get("nome"))
        # PRIORITA': se il TITOLO contiene gia' un genere della whitelist (es. "Metal
        # History", "DER TECHNO", "Tardeo Rock"), teniamo l'evento con quel genere,
        # anche se e' un festival/serata senza un artista singolo.
        gen_tit = _generi_nel_titolo(e.get("nome"))
        if gen_tit:
            e["genere"] = gen_tit
            tieni.append(e)
            print(f"   [{i}/{len(da_controllare)}] {'TIENI':8} {(art or '')[:30]:30} -> {gen_tit[:4]} (dal titolo)")
            continue
        # Filtri di sicurezza: serate/feste generiche o nomi non-artista -> subito INCERTO
        # (niente lookup: evita falsi positivi tipo "Baile", "Thursday", "Pool Party")
        if _titolo_e_serata(e.get("nome")) or _nome_non_utile(art):
            e["genere"] = []
            e["_artista_check"] = art
            incerti.append(e)
            print(f"   [{i}/{len(da_controllare)}] {'INCERTO':8} {art[:32]:32} -> (serata/generico, saltato)")
            continue
        tags = mb_tags(art, cache)
        # Con la chiave Last.fm uniamo sempre i suoi tag (copertura molto migliore)
        if lastfm_key:
            tags = list(dict.fromkeys(tags + lastfm_tags(art, lastfm_key, cache)))
        e["genere"] = list(dict.fromkeys(tags))
        if not tags:
            e["_artista_check"] = art
            incerti.append(e)
            esito = "INCERTO"
        elif ingest.genere_ammesso({"genere": tags}):
            tieni.append(e)
            esito = "TIENI"
        else:
            e["_artista_check"] = art
            scartati.append(e)
            esito = "SCARTA"
        if i % 25 == 0 or i == len(da_controllare):
            ingest._save_json(CACHE_JSON, cache)  # salva la cache man mano
        print(f"   [{i}/{len(da_controllare)}] {esito:8} {art[:32]:32} -> {tags[:4]}")

    ingest._save_json(CACHE_JSON, cache)

    # ricompone la coda: tutto il resto + i TIENI (con genere compilato)
    ingest._save_json(ingest.PENDING_JSON, resto + tieni)
    # incerti e scartati: aggiunti (non sovrascritti) ai loro file
    if incerti:
        ingest._save_json(INCERTI_JSON, ingest._load_json(INCERTI_JSON, []) + incerti)
    if scartati:
        ingest._save_json(SCARTATI_JSON, ingest._load_json(SCARTATI_JSON, []) + scartati)

    print("--- FATTO ---")
    print(f"   TIENI   (genere giusto): {len(tieni)}  -> restano in coda")
    print(f"   INCERTI (niente genere): {len(incerti)}  -> {INCERTI_JSON}")
    print(f"   SCARTATI(fuori target) : {len(scartati)}  -> {SCARTATI_JSON}")
    print("   Pubblica i TIENI con:  python ingest.py --approva-fonte dice")


if __name__ == "__main__":
    run(sys.argv)
