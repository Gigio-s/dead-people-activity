#!/usr/bin/env python3
"""Genera metadati SEO, robots.txt e sitemap.xml per Dead People Activity."""

from __future__ import annotations

import html
import json
import re
import sys
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DOMAIN = "https://deadpeopleactivity.com"
SOCIAL_IMAGE = f"{DOMAIN}/assets/img/foto%20per%20sfondo%20index/sfondo%20index.jpg"
TODAY = date.today().isoformat()

INDEXABLE = [
    "index.html", "mappa.html", "eventi.html", "festival.html", "the-wall.html",
    "articoli.html", "articolo-perche-nasce-dpa.html",
    "articolo-serata-autogestita.html", "articolo-autoprodurre-musica.html",
    "contatti.html", "affiliazioni.html",
]

NOINDEX = {
    "apparire.html", "archivio.html", "buried.html", "collaboratori.html",
    "coming-soon.html", "diy.html", "mappa-full.html", "privacy.html", "store.html",
}

ARTICLE_DATES = {
    "articolo-perche-nasce-dpa.html": "2026-07-31",
    "articolo-serata-autogestita.html": "2026-07-29",
    "articolo-autoprodurre-musica.html": "2026-07-26",
}

START = "    <!-- SEO:START -->"
END = "    <!-- SEO:END -->"


def canonical_for(filename: str) -> str:
    if filename == "index.html":
        return f"{DOMAIN}/"
    if filename == "mappa-full.html":
        return f"{DOMAIN}/mappa.html"
    return f"{DOMAIN}/{filename}"


def extract(content: str, pattern: str, fallback: str) -> str:
    match = re.search(pattern, content, flags=re.IGNORECASE | re.DOTALL)
    return html.unescape(match.group(1).strip()) if match else fallback


def json_ld(filename: str, title: str, description: str, canonical: str) -> dict:
    organization = {
        "@type": "Organization", "@id": f"{DOMAIN}/#organization",
        "name": "Dead People Activity", "url": f"{DOMAIN}/",
        "logo": f"{DOMAIN}/assets/img/dpa%20no%20sfondo.png",
        "email": "info@deadpeopleactivity.com",
    }
    website = {
        "@type": "WebSite", "@id": f"{DOMAIN}/#website", "url": f"{DOMAIN}/",
        "name": "Dead People Activity",
        "description": "Mappa, calendario e storie delle scene musicali underground europee.",
        "publisher": {"@id": f"{DOMAIN}/#organization"},
        "inLanguage": ["it", "en", "es", "ca", "de", "fr"],
    }
    if filename in ARTICLE_DATES:
        page = {
            "@type": "BlogPosting", "@id": f"{canonical}#article",
            "mainEntityOfPage": {"@type": "WebPage", "@id": canonical},
            "headline": title.replace(" | Dead People Activity", ""),
            "description": description, "image": SOCIAL_IMAGE,
            "datePublished": ARTICLE_DATES[filename], "dateModified": TODAY,
            "author": {"@id": f"{DOMAIN}/#organization"},
            "publisher": {"@id": f"{DOMAIN}/#organization"}, "inLanguage": "it",
        }
    else:
        page = {
            "@type": "WebPage", "@id": f"{canonical}#webpage", "url": canonical,
            "name": title, "description": description,
            "isPartOf": {"@id": f"{DOMAIN}/#website"},
            "about": {"@id": f"{DOMAIN}/#organization"}, "inLanguage": "it",
        }
    return {"@context": "https://schema.org", "@graph": [organization, website, page]}


def seo_block(filename: str, content: str) -> str:
    title = extract(content, r"<title>(.*?)</title>", "Dead People Activity")
    description = extract(content, r'<meta\s+name="description"\s+content="(.*?)"\s*/?>', "Mappa, calendario e storie delle scene musicali underground europee.")
    canonical = canonical_for(filename)
    robots = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" if filename in INDEXABLE else "noindex, follow"
    og_type = "article" if filename in ARTICLE_DATES else "website"
    title_attr = html.escape(title, quote=True)
    desc_attr = html.escape(description, quote=True)
    lines = [
        START,
        f'    <meta name="robots" content="{robots}">',
        f'    <link rel="canonical" href="{canonical}">',
        f'    <meta property="og:type" content="{og_type}">',
        '    <meta property="og:site_name" content="Dead People Activity">',
        '    <meta property="og:locale" content="it_IT">',
        f'    <meta property="og:title" content="{title_attr}">',
        f'    <meta property="og:description" content="{desc_attr}">',
        f'    <meta property="og:url" content="{canonical}">',
        f'    <meta property="og:image" content="{SOCIAL_IMAGE}">',
        '    <meta property="og:image:width" content="1820">',
        '    <meta property="og:image:height" content="1365">',
        '    <meta property="og:image:alt" content="Pubblico davanti a un palco durante un concerto">',
        '    <meta name="twitter:card" content="summary_large_image">',
        f'    <meta name="twitter:title" content="{title_attr}">',
        f'    <meta name="twitter:description" content="{desc_attr}">',
        f'    <meta name="twitter:image" content="{SOCIAL_IMAGE}">',
    ]
    if filename in INDEXABLE:
        schema = json.dumps(json_ld(filename, title, description, canonical), ensure_ascii=False, separators=(",", ":"))
        lines.append(f'    <script type="application/ld+json">{schema}</script>')
    lines.append(END)
    return "\n".join(lines)


def update_html(path: Path) -> None:
    original = path.read_text(encoding="utf-8")
    content = original
    content = re.sub(r"assets/js/i18n\.js\?v=\d+", "assets/js/i18n.js?v=9", content)
    content = re.sub(r"assets/js/main\.js\?v=\d+", "assets/js/main.js?v=9", content)
    content = re.sub(r"assets/css/style\.css\?v=\d+", "assets/css/style.css?v=17", content)
    content = re.sub(rf"\n?{re.escape(START)}.*?{re.escape(END)}\n?", "\n", content, flags=re.DOTALL)
    content = re.sub(r'^\s*<meta\s+(?:name="robots"|property="og:[^"]+"|name="twitter:[^"]+")[^>]*>\s*\n?', "", content, flags=re.MULTILINE | re.IGNORECASE)
    content = re.sub(r'^\s*<link\s+rel="canonical"[^>]*>\s*\n?', "", content, flags=re.MULTILINE | re.IGNORECASE)
    content = re.sub(r'^\s*<link\s+rel="icon"[^>]*>\s*\n?', "", content, flags=re.MULTILINE | re.IGNORECASE)
    content = content.replace("</head>", '    <link rel="icon" type="image/png" href="assets/img/dpa%20no%20sfondo.png?v=2">\n</head>', 1)
    content = content.replace("</head>", f"{seo_block(path.name, content)}\n</head>", 1)
    if content != original:
        path.write_text(content, encoding="utf-8")


def write_sitemap() -> None:
    entries = []
    for filename in INDEXABLE:
        url = canonical_for(filename)
        priority = "1.0" if filename == "index.html" else ("0.9" if filename in {"mappa.html", "eventi.html", "festival.html"} else "0.7")
        entries.append(f"  <url>\n    <loc>{url}</loc>\n    <lastmod>{TODAY}</lastmod>\n    <priority>{priority}</priority>\n  </url>")
    local_manifest = ROOT / "assets" / "data" / "seo_local_manifest.json"
    if local_manifest.exists():
        for relative in json.loads(local_manifest.read_text(encoding="utf-8")).get("urls", []):
            entries.append(
                f"  <url>\n    <loc>{DOMAIN}/{html.escape(relative)}</loc>\n"
                f"    <lastmod>{TODAY}</lastmod>\n    <priority>0.8</priority>\n  </url>"
            )
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(entries) + "\n</urlset>\n"
    (ROOT / "sitemap.xml").write_text(xml, encoding="utf-8")


def main() -> None:
    known = set(INDEXABLE) | NOINDEX
    unknown = sorted({path.name for path in ROOT.glob("*.html")} - known)
    if unknown:
        raise SystemExit("Pagine senza regola SEO: " + ", ".join(unknown))
    # Nel ciclo settimanale sitemap e pagine locali cambiano, i metadati delle
    # pagine principali no. La loro riscrittura resta disponibile solo quando
    # richiesta esplicitamente, evitando conflitti con editor/Live Server.
    if "--aggiorna-html" in sys.argv:
        for filename in sorted(INDEXABLE):
            update_html(ROOT / filename)
    (ROOT / "robots.txt").write_text("User-agent: *\nAllow: /\n\nSitemap: https://deadpeopleactivity.com/sitemap.xml\n", encoding="utf-8")
    write_sitemap()
    for filename in INDEXABLE:
        content = (ROOT / filename).read_text(encoding="utf-8")
        for raw in re.findall(r'<script type="application/ld\+json">(.*?)</script>', content, flags=re.DOTALL):
            json.loads(raw)
    print(f"SEO aggiornato: {len(INDEXABLE)} pagine indicizzabili, {len(NOINDEX)} escluse.")


if __name__ == "__main__":
    main()
