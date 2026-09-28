"""Rete: richieste HTTP "educate" + parsing leggero dei meta tag.

Nessuna dipendenza oltre a `requests`. Regole di cortesia:
- User-Agent identificabile (con link al repo se gira su GitHub Actions)
- massimo 3 richieste parallele per host (1 se l'host chiede un crawl-delay)
- crawl-delay rispettato quando dichiarato in sources.json
"""
from __future__ import annotations

import html
import json
import os
import re
import threading
import time
from html.parser import HTMLParser
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

import requests
from requests.adapters import HTTPAdapter

REPO = os.environ.get("GITHUB_REPOSITORY", "")
UA = (
    f"DSGNBRD-feed/1.0 (+https://github.com/{REPO})"
    if REPO
    else "DSGNBRD-feed/1.0 (personal design feed reader)"
)
TIMEOUT = 20
RETRY_STATUS = {500, 502, 503, 504}   # errori temporanei del server: un secondo tentativo, con calma

_session = requests.Session()
_session.headers.update({"User-Agent": UA, "Accept-Language": "en;q=0.9,it;q=0.8"})
# ~50 host diversi a giro: con il pool di default (10 host) le connessioni venivano buttate e riaperte (TLS ogni volta)
_adapter = HTTPAdapter(pool_connections=64, pool_maxsize=32)
_session.mount("https://", _adapter)
_session.mount("http://", _adapter)
_guard = threading.Lock()
_sems: dict[str, threading.Semaphore] = {}
_last: dict[str, float] = {}


def polite_get(url: str, delay: float = 0.0, headers: dict | None = None,
               stream: bool = False, timeout: int = TIMEOUT, retries: int = 1) -> requests.Response:
    """GET educato: max 3 richieste per host (1 con crawl-delay), crawl-delay rispettato anche nei tentativi.
    Timeout, connessione caduta e 5xx vengono ritentati `retries` volte; 4xx mai (403/429 = il sito non vuole)."""
    host = urlparse(url).netloc
    with _guard:
        sem = _sems.setdefault(host, threading.Semaphore(1 if delay else 3))
    attempt = 0
    while True:
        r = None
        with sem:
            if delay:
                with _guard:
                    wait = _last.get(host, 0.0) + delay - time.time()
                if wait > 0:
                    time.sleep(wait)
            try:
                r = _session.get(url, headers=headers or {}, timeout=timeout,
                                 stream=stream, allow_redirects=True)
            except (requests.Timeout, requests.ConnectionError):
                if attempt >= retries:
                    raise
            finally:
                with _guard:
                    _last[host] = time.time()
        if r is not None and (r.status_code not in RETRY_STATUS or attempt >= retries):
            return r
        if r is not None:
            r.close()
        attempt += 1
        time.sleep(max(delay, 2.0))


def read_limited(r: requests.Response, max_bytes: int, deadline: float, truncate: bool = False) -> bytes | None:
    """Corpo di una risposta `stream=True` con un tetto di byte e di tempo TOTALE.
    (`timeout=` di requests vale per singola lettura: un server che manda a gocce non scade mai.)
    Oltre il tetto: None, oppure la parte letta se truncate=True (basta per i meta tag nell'<head>)."""
    buf, size, t0 = [], 0, time.monotonic()
    try:
        for chunk in r.iter_content(65536):
            buf.append(chunk)
            size += len(chunk)
            if size > max_bytes or time.monotonic() - t0 > deadline:
                return b"".join(buf) if truncate else None
    finally:
        r.close()
    return b"".join(buf)


def text_limited(r: requests.Response, max_bytes: int, deadline: float) -> str:
    """Come r.text (stessa scelta dell'encoding), ma con i tetti di read_limited."""
    r._content = read_limited(r, max_bytes, deadline, truncate=True) or b""
    r._content_consumed = True
    return r.text


# --------------------------------------------------------------------------- URL
TRACKING = re.compile(r"^(utm_|mc_|_hs|fbclid$|gclid$|igshid$|ref$|ref_src$|source$|si$|spm$)")


def canonical_url(url: str) -> str:
    """URL pulito per dedup: niente tracking, niente fragment, host minuscolo."""
    try:
        p = urlparse(url.strip())
    except Exception:
        return url
    q = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=False) if not TRACKING.match(k)]
    path = p.path or "/"
    if len(path) > 1 and path.endswith("/"):
        path = path[:-1]
    return urlunparse((p.scheme.lower() or "https", p.netloc.lower(), path, "", urlencode(q), ""))


def dedup_key(url: str) -> str:
    p = urlparse(canonical_url(url))
    host = p.netloc[4:] if p.netloc.startswith("www.") else p.netloc
    return host + p.path + (("?" + p.query) if p.query else "")


# ------------------------------------------------------------------- HTML meta
class _MetaParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta: dict[str, str] = {}
        self.title = ""
        self._in_title = False
        self.time_dt = None
        self._in_ld = False
        self._ld_buf: list[str] = []
        self.ld: list[str] = []

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "meta":
            key = (a.get("property") or a.get("name") or a.get("itemprop") or "").lower()
            if key and "content" in a and key not in self.meta:
                self.meta[key] = a["content"].strip()
        elif tag == "title" and not self.title:
            self._in_title = True
        elif tag == "time" and self.time_dt is None and a.get("datetime"):
            self.time_dt = a["datetime"]
        elif tag == "script" and "ld+json" in a.get("type", ""):
            self._in_ld = True
            self._ld_buf = []

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "script" and self._in_ld:
            self._in_ld = False
            self.ld.append("".join(self._ld_buf))

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif self._in_ld:
            self._ld_buf.append(data)


MONTHS = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*"
DATE_TEXT = re.compile(MONTHS + r"\.? (\d{1,2}), (20\d\d)")


def parse_page_meta(page_html: str, base_url: str) -> dict:
    """Estrae og:*, date (meta, JSON-LD, <time>) da una pagina pubblica."""
    p = _MetaParser()
    try:
        p.feed(page_html)
    except Exception:
        pass
    m = p.meta
    out = {
        "title": m.get("og:title") or m.get("twitter:title") or p.title.strip(),
        "description": m.get("og:description") or m.get("description") or m.get("twitter:description") or "",
        "image": m.get("og:image") or m.get("og:image:url") or m.get("twitter:image") or m.get("twitter:image:src") or "",
        "published": m.get("article:published_time") or m.get("date") or m.get("dc.date") or "",
        "author": m.get("article:author") or m.get("author") or "",
        "site": m.get("og:site_name") or "",
        "video": m.get("og:video:secure_url") or m.get("og:video") or "",
    }
    if not out["published"]:
        for blob in p.ld:
            mm = re.search(r'"datePublished"\s*:\s*"([^"]+)"', blob)
            if mm:
                out["published"] = mm.group(1)
                break
    if not out["published"] and p.time_dt:
        out["published"] = p.time_dt
    if out["image"]:
        out["image"] = urljoin(base_url, html.unescape(out["image"]))
    for k in ("title", "description", "author"):
        out[k] = html.unescape(out[k] or "").strip()
    return out


def first_text_date(page_html: str) -> str | None:
    """Fallback: prima data in formato 'Sep. 24, 2026' nel corpo pagina."""
    body = page_html.split("<body", 1)[-1]
    m = DATE_TEXT.search(body)
    if not m:
        return None
    mon = m.group(1)[:3].title()
    return f"{m.group(3)}-{mon}-{int(m.group(2)):02d}"


def get_json(url: str) -> dict | list:
    r = polite_get(url, headers={"Accept": "application/json"})
    r.raise_for_status()
    txt = r.text
    if txt.startswith(")]}'"):  # prefisso anti-XSSI di Google
        txt = txt[4:]
    return json.loads(txt)
