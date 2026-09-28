"""Arricchimento degli item nuovi.

1. se il feed non ha immagine/descrizione/data -> legge og:meta della pagina originale
2. analizza l'immagine principale: dimensioni (per il masonry senza salti) + palette

Le immagini NON vengono salvate da nessuna parte: si leggono in memoria, si estraggono
numeri (w, h, HEX) e si scartano. Nel feed resta solo il link all'originale.
"""
from __future__ import annotations

import colorsys
from datetime import datetime, timezone
from io import BytesIO

from PIL import Image, ImageFile

from ingest import apply_og
from net import parse_page_meta, polite_get, read_limited, text_limited

ImageFile.LOAD_TRUNCATED_IMAGES = True
Image.MAX_IMAGE_PIXELS = 80_000_000
MAX_BYTES = 8 * 1024 * 1024
IMG_DEADLINE = 15.0          # tempo totale per scaricare un'immagine
OG_MAX_BYTES = 3_200_000     # ≥ 800.000 caratteri anche in UTF-8 multibyte: il parse vede lo stesso testo di prima
OG_DEADLINE = 15.0


def fetch_og(it: dict, delay: float, now: datetime) -> None:
    r = polite_get(it["url"], delay=delay, stream=True)
    if r.status_code != 200 or "html" not in r.headers.get("content-type", ""):
        r.close()
        return
    # prima si scaricava tutta la pagina (fino a 3 MB e oltre) per usarne i primi 800.000 caratteri
    apply_og(it, parse_page_meta(text_limited(r, OG_MAX_BYTES, OG_DEADLINE)[:800_000], it["url"]), now)


def _dist(a, b) -> float:
    rm = (a[0] + b[0]) / 2
    dr, dg, db = a[0] - b[0], a[1] - b[1], a[2] - b[2]
    return ((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db) ** 0.5


def extract_palette(img: Image.Image, k: int = 6) -> list[dict]:
    q = img.quantize(colors=12, method=Image.Quantize.MEDIANCUT)
    raw = q.getpalette() or []
    counts = sorted(q.getcolors() or [], reverse=True)
    total = sum(c for c, _ in counts) or 1
    cols: list[dict] = []
    for n, idx in counts:
        rgb = tuple(raw[idx * 3: idx * 3 + 3])
        if len(rgb) < 3:
            continue
        for col in cols:
            if _dist(col["rgb"], rgb) < 42:
                col["n"] += n
                break
        else:
            cols.append({"rgb": rgb, "n": n})
    cols.sort(key=lambda c: -c["n"])
    return [{"hex": "#%02X%02X%02X" % c["rgb"], "share": round(c["n"] / total, 3)}
            for c in cols[:k] if c["n"] / total >= 0.015]


def analyze_image(url: str, referer: str) -> dict | None:
    r = polite_get(url, headers={"Referer": referer,
                                 "Accept": "image/webp,image/jpeg,image/png,image/*;q=0.8"}, stream=True)
    if r.status_code != 200 or "svg" in r.headers.get("content-type", ""):
        r.close()
        return None
    data = read_limited(r, MAX_BYTES, IMG_DEADLINE)   # prima: nessun limite di tempo totale sul download
    if data is None:
        return None
    with Image.open(BytesIO(data)) as src:
        w, h = src.size
        if w < 160 or h < 100:
            return None
        try:
            src.draft("RGB", (320, 320))
        except Exception:
            pass
        img = src
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGBA")
            bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
            bg.alpha_composite(img)
            img = bg
        img = img.convert("RGB")
        img.thumbnail((112, 112))
        return {"w": w, "h": h, "palette": extract_palette(img)}


def enrich_item(it: dict, delay: float = 0.0, now: datetime | None = None, og: bool = True) -> dict:
    """Muta l'item in place. Non solleva eccezioni: un arricchimento fallito non blocca il feed.
    og=False per gli item dei page watcher: la loro pagina è già stata letta in ingest."""
    need_og = og and (not it["images"] or not it["summary"] or it["dateType"] == "detected") and not it.get("font")
    if need_og:
        try:
            fetch_og(it, delay, now or datetime.now(timezone.utc))
        except Exception:
            pass
    for src in it["images"][:2]:
        try:
            info = analyze_image(src, it["url"])
        except Exception:
            info = None
        if info:
            it["image"] = {"src": src, "w": info["w"], "h": info["h"]}
            it["palette"] = info["palette"]
            break
    return it


def retry_image(it: dict) -> bool:
    """Secondo tentativo per un item già in archivio rimasto senza immagine (server lento o giù in quel giro).
    Stessa analisi di enrich_item; l'immagine scelta esce dalle alternative come negli item nuovi."""
    for src in it.get("images", [])[:2]:
        try:
            info = analyze_image(src, it["url"])
        except Exception:
            info = None
        if info:
            it["image"] = {"src": src, "w": info["w"], "h": info["h"]}
            it["palette"] = info["palette"]
            it["images"] = [u for u in it["images"] if u != src][:3]
            return True
    return False


# --------------------------------------------------------------- colour utils
def hex_to_hls(hex_: str) -> tuple[float, float, float]:
    r, g, b = (int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return colorsys.rgb_to_hls(r, g, b)


def is_chromatic(hex_: str) -> bool:
    h, l, s = hex_to_hls(hex_)
    return s >= 0.28 and 0.14 <= l <= 0.88
