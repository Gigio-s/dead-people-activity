"""Scarica copertine album Oasis e sfondi Higgsfield per tour-oasis-live-27.html.

Fonte: MusicBrainz (ricerca del release group) + Cover Art Archive (immagine 500 px).
Nessuna chiave API necessaria. Salva in assets/img/oasis/copertine/<slug>.jpg.
Uso (dalla cartella del progetto):  python scripts/scarica_copertine_oasis.py
"""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "img" / "oasis" / "copertine"
UA = "DeadPeopleActivity/1.0 (info@deadpeopleactivity.com)"

ALBUMS = {
    "definitely-maybe": ("Definitely Maybe", "Album"),
    "morning-glory": ("(What's the Story) Morning Glory?", "Album"),
    "be-here-now": ("Be Here Now", "Album"),
    "the-masterplan": ("The Masterplan", "Album"),
    "standing-on-the-shoulder-of-giants": ("Standing on the Shoulder of Giants", "Album"),
    "heathen-chemistry": ("Heathen Chemistry", "Album"),
    "dont-believe-the-truth": ("Don't Believe the Truth", "Album"),
    "dig-out-your-soul": ("Dig Out Your Soul", "Album"),
}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def norm(s):
    s = s.lower().replace("\u2019", "'")
    return "".join(ch for ch in s if ch.isalnum())


_CACHE = {}


def oasis_release_groups():
    """Tutti gli album e le raccolte degli Oasis (UK) su MusicBrainz."""
    if "rg" in _CACHE:
        return _CACHE["rg"]
    q = 'artist:"Oasis" AND country:GB AND type:group'
    data = json.loads(get("https://musicbrainz.org/ws/2/artist/?fmt=json&limit=5&query=" + urllib.parse.quote(q)))
    time.sleep(1.1)
    artisti = [a for a in data.get("artists", []) if a.get("name") == "Oasis"]
    if not artisti:
        raise RuntimeError("artista Oasis non trovato su MusicBrainz")
    artist_id = artisti[0]["id"]
    print("Artista MusicBrainz:", artist_id, "-", artisti[0].get("disambiguation", ""))
    gruppi = []
    for offset in (0, 100):
        url = f"https://musicbrainz.org/ws/2/release-group?artist={artist_id}&type=album&fmt=json&limit=100&offset={offset}"
        page = json.loads(get(url))
        gruppi += page.get("release-groups", [])
        time.sleep(1.1)
        if len(gruppi) >= page.get("release-group-count", 0):
            break
    _CACHE["rg"] = gruppi
    return gruppi


def find_release_group(title, kind):
    target = norm(title)
    candidati = [rg for rg in oasis_release_groups() if norm(rg.get("title", "")) == target]
    # preferisce l'uscita originale (data piu vecchia)
    candidati.sort(key=lambda rg: rg.get("first-release-date") or "9999")
    return candidati[0]["id"] if candidati else None


SFONDI = {
    "oasis-manchester.jpg": "https://d8j0ntlcm91z4.cloudfront.net/user_3Fp93g3AABsPKODQxzIxBVAjWHa/hf_20261022_091231_082a79d0-39e3-4135-b78b-8caeb68116b5.png",
    "oasis-knebworth.jpg": "https://d8j0ntlcm91z4.cloudfront.net/user_3Fp93g3AABsPKODQxzIxBVAjWHa/hf_20261022_091231_b168066c-ee51-44b1-9a61-e878963f8de2.png",
}


def scarica_sfondi():
    cartella = OUT.parent
    for nome, url in SFONDI.items():
        dest = cartella / nome
        if dest.exists():
            print(f"[gia presente] {nome}")
            continue
        raw = get(url)
        try:  # con Pillow converte in JPG leggero, altrimenti salva l'originale
            from io import BytesIO
            from PIL import Image
            Image.open(BytesIO(raw)).convert("RGB").save(dest, "JPEG", quality=78, optimize=True, progressive=True)
        except ImportError:
            dest.write_bytes(raw)
        print(f"[ok] {nome}  ({dest.stat().st_size // 1024} KB)")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        scarica_sfondi()
    except Exception as exc:  # noqa: BLE001
        print(f"[ERRORE sfondi] {exc}")
    for slug, (title, kind) in ALBUMS.items():
        dest = OUT / f"{slug}.jpg"
        if dest.exists():
            print(f"[gia presente] {dest.name}")
            continue
        try:
            rgid = find_release_group(title, kind)
            time.sleep(1.1)  # MusicBrainz: max 1 richiesta al secondo
            if not rgid:
                print(f"[NON TROVATO] {title}")
                continue
            img = get(f"https://coverartarchive.org/release-group/{rgid}/front-500")
            dest.write_bytes(img)
            print(f"[ok] {dest.name}  ({len(img) // 1024} KB)")
        except Exception as exc:  # noqa: BLE001
            print(f"[ERRORE] {title}: {exc}")
        time.sleep(1.1)
    print("\nFatto. Controlla le immagini in", OUT)


if __name__ == "__main__":
    main()
