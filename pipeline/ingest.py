"""Ingestione dalle fonti: RSS/Atom, pagine pubbliche (page watcher), Google Fonts.

Ogni fetcher restituisce (items_grezzi, stato_fonte). Un item grezzo è un dict:
  sid, url, key, title, summary, author, tags, date, dateType, images, video, fonts, font
"""
from __future__ import annotations

import html
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import quote_plus, urljoin

import feedparser

from net import (canonical_url, dedup_key, first_text_date, get_json,
                 parse_page_meta, polite_get)

UTC = timezone.utc
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")
BOILER = re.compile(
    r"(The post .{0,200}? appeared first on .{0,80}?\.|Continue reading.*$|Read more.*$|"
    r"\[(?:…|\.\.\.)\]|View original post.*$|Click here.*$)", re.I)
BAD_IMG = re.compile(r"(feedburner|gravatar|emoji|pixel|tracking|wp-includes|/avatar|"
                     r"1x1|spacer|share-|badge|doubleclick|\.svg(\?|$)|data:)", re.I)
GENERIC_TAGS = {"uncategorized", "featured", "news", "design", "blog", "home", "latest",
                "all", "article", "articles", "stories", "journal", "post"}


def clean_text(raw: str, limit: int = 320) -> str:
    txt = html.unescape(TAG_RE.sub(" ", raw or ""))
    txt = BOILER.sub("", txt)
    txt = WS_RE.sub(" ", txt).strip()
    if len(txt) > limit:
        cut = txt[:limit].rsplit(" ", 1)[0].rstrip(",;:—-")
        txt = cut + "…"
    return txt


def to_dt(value) -> datetime | None:
    """Accetta struct_time, ISO 8601 o '2026-Sep-24'. Ritorna datetime UTC."""
    if value is None or value == "":
        return None
    try:
        if hasattr(value, "tm_year"):
            return datetime(*value[:6], tzinfo=UTC)
        s = str(value).strip()
        if re.match(r"^\d{4}-[A-Z][a-z]{2}-\d{2}$", s):
            return datetime.strptime(s, "%Y-%b-%d").replace(tzinfo=UTC, hour=12)
        if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
            return datetime.fromisoformat(s).replace(tzinfo=UTC, hour=12)
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return d.astimezone(UTC) if d.tzinfo else d.replace(tzinfo=UTC)
    except Exception:
        return None


def iso(d: datetime) -> str:
    return d.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def video_from_url(url: str) -> dict | None:
    m = re.search(r"vimeo\.com/(?:video/)?(\d{5,})", url)
    if m:
        return {"provider": "vimeo", "id": m.group(1),
                "embed": f"https://player.vimeo.com/video/{m.group(1)}"}
    m = re.search(r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([\w-]{11})", url)
    if m:
        return {"provider": "youtube", "id": m.group(1),
                "embed": f"https://www.youtube-nocookie.com/embed/{m.group(1)}"}
    return None


def entry_images(e, base: str) -> list[str]:
    urls: list[str] = []
    for m in e.get("media_content", []) or []:
        u, t = m.get("url"), f"{m.get('type', '')}{m.get('medium', '')}"
        if u and ("image" in t or re.search(r"\.(jpe?g|png|webp|gif|avif)(\?|$)", u, re.I)):
            urls.append(u)
    for m in e.get("media_thumbnail", []) or []:
        if m.get("url"):
            urls.append(m["url"])
    for link in e.get("links", []) or []:
        if link.get("rel") == "enclosure" and "image" in (link.get("type") or ""):
            urls.append(link.get("href"))
    blob = "".join(c.get("value", "") for c in (e.get("content") or [])) + (e.get("summary") or "")
    urls += re.findall(r"<img[^>]+src=[\"']([^\"']+)", blob, re.I)
    out, seen = [], set()
    for u in urls:
        if not u:
            continue
        u = urljoin(base, html.unescape(u.strip()))
        if BAD_IMG.search(u) or u in seen:
            continue
        seen.add(u)
        out.append(u)
    return out[:4]


def _base_item(src: dict, url: str) -> dict:
    return {"sid": src["id"], "url": canonical_url(url), "key": dedup_key(url),
            "title": "", "summary": "", "author": "", "tags": [], "date": None,
            "dateType": src.get("dateType", "article"), "images": [], "video": None,
            "fonts": [], "font": None}


# ---------------------------------------------------------------------- RSS
def fetch_rss(src: dict, state: dict, now: datetime, retention_days: int) -> tuple[list, dict]:
    cache = state.setdefault("http", {}).get(src["id"], {})
    headers = {"Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5"}
    if cache.get("etag"):
        headers["If-None-Match"] = cache["etag"]
    if cache.get("modified"):
        headers["If-Modified-Since"] = cache["modified"]
    r = polite_get(src["url"], headers=headers)
    if r.status_code == 304:
        return [], {"ok": True, "http": 304, "note": "nessuna novità (304)"}
    r.raise_for_status()
    state["http"][src["id"]] = {"etag": r.headers.get("ETag"), "modified": r.headers.get("Last-Modified")}
    feed = feedparser.parse(r.content)
    if not feed.entries:
        raise ValueError("feed senza item")

    first_run = src["id"] not in state.setdefault("seenSources", [])
    oldest = now - timedelta(days=retention_days)
    items = []
    for e in feed.entries:
        link = e.get("link") or e.get("id")
        if not link or not link.startswith("http"):
            continue
        it = _base_item(src, link)
        it["title"] = clean_text(e.get("title", ""), 200)
        if src.get("titleStrip"):
            it["title"] = re.sub(src["titleStrip"], "", it["title"]).strip()
        content = "".join(c.get("value", "") for c in (e.get("content") or []))
        it["summary"] = clean_text(e.get("summary") or content, 320)
        if src.get("authorIsCreator"):
            it["author"] = clean_text(e.get("author", ""), 80)
        it["tags"] = [t for t in (clean_text(x.get("term", ""), 60) for x in e.get("tags", []) or [])
                      if t and t.lower() not in GENERIC_TAGS][:8]
        if src.get("tagsAreFonts"):
            fonts = []
            for t in it["tags"]:
                fonts += [f.strip() for f in t.split(",") if f.strip()]
            it["fonts"], it["tags"] = fonts[:6], []
        it["images"] = entry_images(e, link)
        it["video"] = video_from_url(link)
        d = to_dt(e.get("published_parsed")) or to_dt(e.get("updated_parsed"))
        if src.get("dateType") == "detected" or d is None or d > now + timedelta(days=1):
            d, it["dateType"] = now, "detected"
        if d < oldest:
            continue
        it["date"] = iso(d)
        items.append(it)

    items.sort(key=lambda x: x["date"], reverse=True)
    if first_run and src.get("firstRunMax"):
        items = items[: src["firstRunMax"]]
    items = items[: src.get("maxItems", 40)]
    return items, {"ok": True, "http": r.status_code, "entries": len(feed.entries)}


# ------------------------------------------------------------- page watcher
def fetch_page(src: dict, state: dict, now: datetime, retention_days: int) -> tuple[list, dict]:
    """Legge una pagina elenco pubblica, trova i link nuovi, legge og:meta di ciascuno."""
    delay = float(src.get("crawlDelay", 1))
    r = polite_get(src["url"], delay=delay)
    r.raise_for_status()
    base = src.get("base") or src["url"]
    links, seen_now = [], set()
    for m in re.finditer(src["linkPattern"], r.text):
        u = canonical_url(urljoin(base, html.unescape(m.group(0))))
        if u not in seen_now:
            seen_now.add(u)
            links.append(u)
    if not links:
        raise ValueError("nessun link trovato: il markup della pagina potrebbe essere cambiato")

    seen = state.setdefault("pageSeen", {}).setdefault(src["id"], {})
    fresh = [u for u in links if u not in seen]
    todo = fresh[: int(src.get("maxNewPerRun", 12))]
    oldest = now - timedelta(days=retention_days)
    items, failed = [], 0
    for url in todo:
        try:
            pr = polite_get(url, delay=delay)
            if pr.status_code != 200:
                failed += 1
                continue
            meta = parse_page_meta(pr.text, url)
        except Exception:
            failed += 1
            continue
        seen[url] = iso(now)
        it = _base_item(src, url)
        title, desc = meta["title"], meta["description"]
        if src.get("titleFrom") == "description" and desc:
            title, desc = desc, meta["title"]
        title = re.sub(r"\s+[—–|-]\s+(The Brand Identity|Fonts In Use|Brand New).*$", "", title)
        it["title"] = clean_text(title, 200)
        it["summary"] = clean_text(desc, 320)
        if meta["image"]:
            it["images"] = [meta["image"]]
        if src.get("fontsPattern"):
            fonts = [clean_text(f, 60) for f in re.findall(src["fontsPattern"], pr.text)]
            it["fonts"] = list(dict.fromkeys(f for f in fonts if f))[:6]
        d = to_dt(meta["published"])
        if d is None and src.get("dateTextPattern"):
            d = to_dt(first_text_date(pr.text))
        # sanity check: una data nel futuro o incoerente diventa "rilevato"
        if d is None or d > now + timedelta(days=1):
            d, it["dateType"] = now, "detected"
        if d < oldest:
            continue
        it["date"] = iso(d)
        items.append(it)
    return items, {"ok": True, "http": r.status_code, "links": len(links),
                   "new": len(fresh), "fetched": len(todo) - failed, "failed": failed}


# ------------------------------------------------------------- Google Fonts
def fetch_googlefonts(src: dict, state: dict, now: datetime, retention_days: int) -> tuple[list, dict]:
    """Endpoint pubblico usato da fonts.google.com: dateAdded = data ufficiale di release."""
    data = get_json(src["url"])
    fams = data.get("familyMetadataList", [])
    window = now - timedelta(days=int(src.get("windowDays", 120)))
    items, catalog, radar = [], [], []
    for f in fams:
        fam = f.get("family")
        if not fam:
            continue
        catalog.append(fam)
        added = to_dt(f.get("dateAdded"))
        info = {"family": fam, "provider": "google", "category": f.get("category"),
                "designers": f.get("designers") or [], "axes": [
                    {"tag": a.get("tag"), "min": a.get("min"), "max": a.get("max")} for a in f.get("axes", [])],
                "styles": len(f.get("fonts") or {}), "weights": sorted({int(k.rstrip("i")) for k in (f.get("fonts") or {}) if k.rstrip("i").isdigit()}),
                "italic": any(k.endswith("i") for k in (f.get("fonts") or {})),
                "dateAdded": f.get("dateAdded"), "lastModified": f.get("lastModified"),
                "popularity": f.get("popularity"), "trending": f.get("trending"),
                "latin": "latin" in (f.get("subsets") or [])}
        if added and added >= now - timedelta(days=365) and info["latin"]:
            radar.append(info)
        if not added or added < window or not info["latin"]:
            continue
        url = "https://fonts.google.com/specimen/" + quote_plus(fam)
        it = _base_item(src, url)
        it.update({"title": fam, "author": ", ".join(info["designers"][:3]),
                   "date": iso(added), "dateType": "release", "font": info,
                   "summary": _font_summary(info)})
        # famiglia già molto usata con dateAdded recente = probabile re-release/upgrade
        if (info["popularity"] or 9999) <= 400:
            it["font"]["note"] = "rerelease"
        items.append(it)
    state["gfCatalog"] = catalog
    state["gfDates"] = {r["family"]: r["dateAdded"] for r in radar}
    state["gfRadar"] = sorted(radar, key=lambda x: x.get("trending") or 9999)[:40]
    return items, {"ok": True, "http": 200, "families": len(fams), "recent": len(items)}


def _font_summary(info: dict) -> str:
    bits = [info.get("category") or "Typeface"]
    axes = [a["tag"] for a in info.get("axes", []) if a.get("tag")]
    if axes:
        bits.append("variable (" + ", ".join(axes) + ")")
    if info.get("styles"):
        bits.append(f"{info['styles']} styles")
    return ", ".join(bits)


FETCHERS = {"rss": fetch_rss, "page": fetch_page, "googlefonts": fetch_googlefonts}
