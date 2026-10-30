#!/usr/bin/env python3
"""Genera deterministicamente le icone PWA dal marchio DPA esistente."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageOps


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "img" / "dpa no sfondo.png"
OUTPUT = ROOT / "assets" / "img" / "pwa"


def icon(size: int, logo_ratio: float, border_ratio: float) -> Image.Image:
    canvas = Image.new("RGB", (size, size), "#050505")
    draw = ImageDraw.Draw(canvas)
    inset = max(5, round(size * border_ratio))
    width = max(3, round(size * 0.018))
    draw.rounded_rectangle(
        (inset, inset, size - inset - 1, size - inset - 1),
        radius=round(size * 0.09),
        outline="#d7ff00",
        width=width,
    )
    source = Image.open(SOURCE).convert("RGBA")
    box = max(1, round(size * logo_ratio))
    fitted = ImageOps.contain(source, (box, box), Image.Resampling.LANCZOS)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.paste(fitted, (x, y), fitted)
    return canvas


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    standard = icon(512, 0.72, 0.055)
    maskable = icon(512, 0.54, 0.14)
    standard.save(OUTPUT / "icon-512.png", optimize=True)
    maskable.save(OUTPUT / "icon-maskable-512.png", optimize=True)
    standard.resize((192, 192), Image.Resampling.LANCZOS).save(OUTPUT / "icon-192.png", optimize=True)
    standard.resize((180, 180), Image.Resampling.LANCZOS).save(OUTPUT / "apple-touch-icon.png", optimize=True)
    print(f"Icone PWA generate in {OUTPUT}")


if __name__ == "__main__":
    main()
