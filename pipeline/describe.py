"""DSGNBRD · descrizione breve per le card: soggetto + tipo.

  "Ragged Edge creates refreshingly wholesome identity for AI notepad Granola"
      → {"s": "Granola", "k": "Identity by Ragged Edge"}

Solo regole deterministiche (niente AI, niente costi): pattern tipici delle fonti di design
(Brand New, BP&O, The Dieline, Packaging of the World, Fonts In Use, siti premiati, rubriche con i due punti).
Quando nessuna regola è sicura il titolo resta com'è, accorciato a un confine naturale della frase.
Il titolo completo resta sempre nella scheda di dettaglio.
"""
from __future__ import annotations

import re

CAT = {"type": "Typography", "branding": "Branding", "web": "Website", "uiux": "UI/UX", "editorial": "Editorial",
       "motion": "Motion", "3d": "3D", "colour": "Colour", "artdirection": "Art direction",
       "illustration": "Illustration", "packaging": "Packaging", "tools": "Tools"}
WEB_SHOWCASE = {"awwwards", "thefwa", "minimalgallery", "typewolf", "landbook", "onepagelove"}
TOOLS = {"figma_release": "Figma", "webflow_updates": "Webflow", "penpot": "Penpot", "blender": "Blender"}
MAGAZINES = {"magculture", "stack"}

OBJ_RX = re.compile(r"\b(brand identity|visual identity|identity|branding|rebrand|packaging|logo|wordmark|typeface|"
                    r"type system|campaign|livery|signage)\b", re.I)
OBJ_KIND = {"brand identity": "Identity", "visual identity": "Identity", "identity": "Identity", "branding": "Identity",
            "rebrand": "Rebrand", "packaging": "Packaging", "logo": "Logo", "wordmark": "Wordmark",
            "typeface": "Typeface", "type system": "Type system", "campaign": "Campaign", "livery": "Livery",
            "signage": "Signage"}
SERIES = {"website inspiration": "Website", "artist spotlight": "Artist spotlight", "font of the month": "Font of the month",
          "fonts in focus": "Fonts in focus", "recap": "Recap", "the daily heller": "The Daily Heller",
          "source material": "Source material", "branding design": "Identity", "brand identity": "Identity",
          "typography design": "Typography", "type design": "Typography", "packaging design": "Packaging",
          "illustration": "Illustration", "motion design": "Motion", "web design": "Website", "ui/ux design": "UI/UX",
          "interview": "Interview", "review": "Review", "opinion": "Opinion"}
FORMATS = {"study guide", "guide", "interview", "review", "explained", "primer", "a primer", "case study", "checklist",
           "template", "report", "podcast", "video", "roundup", "q&a", "profile", "in pictures", "the list"}
CONNECT = {"of", "&", "and", "de", "la", "le", "du", "des", "van", "von", "der", "y", "e", "di", "da"}
SMALLW = {"a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "at", "by", "with", "from", "into", "as",
          "its", "but", "nor", "vs", "via", "&", "is", "are", "be"}
SKIP_LEAD = {"how", "why", "what", "when", "where", "inside", "meet", "here’s", "here's"}
LONE_BAD = {"the", "a", "an", "this", "these", "our", "new", "how", "why", "what", "it", "its", "we", "i"}
BOUNDARY = {"with", "into", "for", "and", "that", "as", "while", "to", "behind", "rather", "because", "after",
            "before", "from", "through", "without", "but", "which", "who", "where", "when", "so", "than", "like",
            "over", "under", "amid", "across", "via", "using", "in", "on", "at", "about", "around", "toward", "towards"}
TC_VERBS = {"Gets", "Gives", "Turns", "Taps", "Takes", "Makes", "Brings", "Launches", "Unveils", "Reveals", "Debuts",
            "Introduces", "Celebrates", "Creates", "Is", "Are", "Has", "Goes", "Returns", "Adds", "Blends", "Puts",
            "Leans", "Keeps", "Shows", "Offers", "Serves", "Pours", "Rolls", "Drops", "Releases", "Rebrands",
            "Refreshes", "Redesigns", "Reimagines", "Embraces", "Finds", "Transforms", "Elevates", "Captures",
            "Honors", "Honours", "Invites", "Marks", "Meets", "Joins", "Evolves", "Lands", "Opens", "Enters", "Sets",
            "Stays", "Says", "Looks", "Explores", "Arrives", "Wraps", "Dresses", "Packs", "Bottles", "Cans", "Hits",
            "Sparks", "Delivers", "Revives", "Reinvents", "Channels", "Crafts", "Designs", "Aims", "Wants", "Uses"}
ROLES = {"artist": "Art", "photographer": "Photography", "illustrator": "Illustration", "painter": "Painting",
         "sculptor": "Sculpture", "designer": "Design", "animator": "Animation", "director": "Film"}
QUOTES = "“”\"'‘’«»"
DASH_RX = re.compile(r"\s+[–—|•]\s+|\s+-\s+")
GAVE_RX = re.compile(r"^(?P<pre>.*?)\b(?:gave|gives|give)\s+(?P<sub>.+?)\s+(?:a|an|the|its|their|his|her|one|some|new)\b",
                     re.I)
RB_RX = re.compile(r"^(?P<pre>.+?)\s+(?:rebrands|renames|redesigns|reimagines|refreshes|revamps)\s+(?P<sub>[^,]+)", re.I)
BN_RX = re.compile(r"^(?:New|Updated|Revised|Refreshed)\s+(?P<what>[A-Za-z ,&]+?)\s+for\s+(?P<sub>.+?)"
                   r"(?:\s+by\s+(?P<by>.+))?$")


def _clean(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "").replace(" ", " ")).strip()


def _unquote(s: str) -> str:
    s = s.strip()
    if len(s) > 2 and s[0] in "“\"‘'«" and s[-1] in "”\"’'»":
        return s[1:-1].strip()
    return s


def _core(tok: str) -> str:
    return tok.strip(QUOTES + "()[],.;:!?…")


def _is_cap(tok: str) -> bool:
    c = _core(tok)
    if not c:
        return False
    if c[0] == "&":
        return True
    ch = next((x for x in c if x.isalnum()), "")
    return bool(ch) and (ch.isupper() or ch.isdigit())


def _runs(tokens: list[str]) -> list[list[str]]:
    out, cur = [], []
    for i, t in enumerate(tokens):
        if _is_cap(t):
            cur.append(t)
        elif cur and t.lower() in CONNECT and i + 1 < len(tokens) and _is_cap(tokens[i + 1]):
            cur.append(t)
        else:
            if cur:
                out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


def _join(run: list[str]) -> str:
    s = " ".join(run).strip(QUOTES + " ,.;:")
    return re.sub(r"(?:’s|'s)$", "", s).strip(QUOTES + " ,.;:")


def _ok(s: str | None) -> bool:
    return bool(s) and s.lower() not in LONE_BAD and len(s) >= 2


def _title_case(tokens: list[str]) -> bool:
    words = [t for t in tokens if _core(t) and _core(t).lower() not in SMALLW]
    return len(words) >= 4 and sum(_is_cap(t) for t in words) / len(words) >= 0.85


def lead_run(text: str) -> str | None:
    toks = text.split()
    while toks and _core(toks[0]).lower() in SKIP_LEAD:
        toks = toks[1:]
    run = []
    for i, t in enumerate(toks):
        if _is_cap(t):
            run.append(t)
            if re.search(r"(?:’s|'s)[,.;:]?$", t):
                break
        elif run and t.lower() in CONNECT and i + 1 < len(toks) and _is_cap(toks[i + 1]):
            run.append(t)
        else:
            break
    s = _join(run) if 0 < len(run) <= 5 else None
    return s if _ok(s) else None


def last_run(text: str) -> str | None:
    runs = _runs(text.split())
    s = _join(runs[-1][-5:]) if runs else None
    return s if _ok(s) else None


def first_multi_run(text: str) -> str | None:
    for r in _runs(text.split()):
        if len(r) >= 2:
            s = _join(r[:5])
            if _ok(s):
                return s
    return None


def pick_subject(text: str) -> str | None:
    text = re.split(r"[,;:]|\s[–—-]\s", text, maxsplit=1)[0]
    return last_run(text)


def shorten(t: str) -> str:
    """Titolo lungo → frase breve, tagliata a un confine naturale (virgola, congiunzione, preposizione)."""
    t = _unquote(t)
    parts = DASH_RX.split(t)
    if len(parts) > 1:
        a, b = parts[0].strip(), " ".join(parts[1:]).strip()
        if a[:1] in "“\"‘" and len(b.split()) >= 3:
            t = b[:1].upper() + b[1:]
        elif len(a.split()) >= 4:
            t = a
    t = _unquote(t)
    words = t.split()
    if len(words) <= 10:
        return t
    for i in range(5, min(9, len(words) - 1)):
        if words[i - 1].endswith(","):
            return " ".join(words[:i]).rstrip(",")
    cands = [i for i in range(4, min(11, len(words))) if _core(words[i]).lower() in BOUNDARY]
    if cands:
        low = [i for i in cands if i <= 8]
        i = max(low) if low else min(cands)
        while i > 4 and _core(words[i - 1]).lower() in BOUNDARY:
            i -= 1
        return " ".join(words[:i]).rstrip(",;:—–- ")
    return " ".join(words[:8]).rstrip(",;:—–- ") + "…"


def _colon(t: str):
    m = re.match(r"^(?P<pre>[^:]{2,60}?):\s+(?P<post>.+)$", t)
    if not m:
        return None
    pre, post = m["pre"].strip(), _unquote(m["post"].strip())
    if len(pre.split()) > 6:
        return None
    key = re.sub(r"^.+?(?:’s|'s)\s+", "", pre).strip()
    series = SERIES.get(key.lower())
    if series:
        if len(post.split()) <= 5:
            return post, series
        person = None if _title_case(post.split()) else first_multi_run(post)
        return person or shorten(post), series
    if post.lower().strip(" .") in FORMATS:
        return pre, post[:1].upper() + post[1:].lower()
    if len(post.split()) <= 5:
        return post, key
    if pre[:1] not in QUOTES and all(_is_cap(x) or x.lower() in SMALLW for x in pre.split()) and post[:1].isupper():
        return pre, None                    # "In Chicken We Trust: Branding…" → il nome sta prima dei due punti
    if pre[:1] in QUOTES:                   # citazione come gancio: il contenuto è dopo
        r = _design_for(post)
        if r and r[2]:
            return r[0], f"{r[1]} by {r[2]}"
    s2 = shorten(post)
    return s2[:1].upper() + s2[1:], None


def _design_for(t: str):
    m = OBJ_RX.search(t)
    if not m:
        return None
    kind = OBJ_KIND[m.group(1).lower()]
    before, after = t[:m.start()], t[m.end():]
    subject = None
    fm = re.search(r"\bfor\s+(.+)$", after)
    if fm:
        subject = pick_subject(fm.group(1))
    if not subject:
        pm = re.search(r"\b(?:for|to)\s+(.+?)(?:’s|'s)\s+(?:[a-z-]+\s+){0,3}$", before)
        if pm:
            subject = pick_subject(pm.group(1))
    if not subject:
        pm = re.search(r"((?:[A-Z&][\w&.-]*\s?){1,4})(?:’s|'s)\s+(?:[a-z-]+\s+){0,2}$", before)
        if pm and before.strip().split()[0] != pm.group(1).split()[0]:
            subject = _join(pm.group(1).split())
    studio = lead_run(before)
    if not subject:
        subject, studio = (studio, None) if studio else (last_run(t), None)
    if not subject:
        return None
    if studio and studio.lower() == subject.lower():
        studio = None
    return subject, kind, studio


def _author(a: str | None) -> str | None:
    a = _clean(a).strip(" ,;")
    if not a or re.match(r"(?i)^fonts?\s*:", a):
        return None
    return a.split(",")[0].strip() or None


def describe(it: dict) -> dict:
    """Ritorna {"s": soggetto, "k": tipo} per la card. "_r" = regola usata (solo per i test)."""
    title = _clean(it.get("title"))
    sid, cat = it.get("sid"), it.get("category")
    author = _author(it.get("author"))
    fonts = [re.sub(r"\s*\(.*?\)", "", f).strip() for f in (it.get("fonts") or []) if f]
    s = k = by = None
    rule = "fallback"
    toks = title.split()

    if it.get("font"):
        s, k, by, rule = (it["font"].get("family") or title,
                          "Typeface update" if it.get("kind") == "update" else "New typeface", author, "font")
    elif sid in TOOLS:
        prod = TOOLS[sid]
        s = re.sub(r"\s+release$", "", title, flags=re.I)
        if re.fullmatch(r"v?[\d.]+", s):
            s = f"{prod} {s}"
        k, rule = (f"{prod} release" if sid in ("penpot", "blender") else f"{prod} update"), "tool"
    elif sid == "brandnew" and (m := BN_RX.match(title)):
        what = m["what"].lower()
        k = ("Packaging" if "packaging" in what and "identity" not in what else "Identity" if "identity" in what
             else "Logo" if "logo" in what else "Livery" if "livery" in what else "Name" if "name" in what
             else "Identity")
        s, by, rule = m["sub"].strip(), (m["by"] or author), "brandnew"
    elif sid == "potw":
        base = DASH_RX.split(title)[0]
        s = re.sub(r"\s+(?:[A-Z][a-z]+\s+)?Packaging(?:\s+Design)?$", "", base).strip() or base
        k, by, rule = "Packaging", author, "potw"
    elif sid == "fontsinuse":
        head = title.split(", ")[0]
        s = head if len(head.split()) >= 2 else title
        k = ("Set in " + " and ".join(fonts[:2])) if fonts else "Typography"
        rule = "fontsinuse"
    elif sid in WEB_SHOWCASE:
        t2 = re.sub(r"(?i)^website inspiration:\s*", "", title)
        parts = [p.strip() for p in DASH_RX.split(t2) if p.strip()]
        if sid == "landbook" and len(parts) > 1:
            names = [p for p in parts if len(p.split()) <= 4 and _is_cap(p.split()[0])]
            s = min(names or parts, key=len)
        else:
            s = parts[0] if parts else t2
        rest = [p for p in parts if p != s]
        if sid == "typewolf" and fonts:
            k = "Set in " + " and ".join(fonts[:2])
        elif "template" in title.lower():
            k = "Website template"
        elif rest and len(rest[0].split()) <= 3:
            k = rest[0]
        else:
            k = "Website"
        rule = "web"
    elif sid == "booooooom":
        c = _colon(title)
        if c:
            s, k = c
        else:
            s = shorten(title)
        rm = re.match(r"(?i)^(artist|photographer|illustrator|painter|sculptor|designer|animator|director)\s+(.+)$",
                      author or "")
        if rm:
            k, by = ROLES[rm.group(1).lower()], rm.group(2)
        else:
            by = author
        rule = "booooooom"
    elif sid == "behance":
        parts = [p.strip() for p in DASH_RX.split(title) if p.strip()]
        s, by, rule = (parts[0] if parts else title), author, "behance"
    elif sid in MAGAZINES:
        s, k, rule = shorten(title), "Magazines", "magazines"
    elif sid == "motionographer" and " | " in title:
        a, b = title.split(" | ", 1)
        s, k, by, rule = a.strip(), "Motion", b.strip(), "motion"

    if s is None and (c := _colon(title)):
        s, k = c
        by, rule = author, "colon"
    if s is None and cat in ("packaging", "branding") and _title_case(toks):
        for i, tok in enumerate(toks[1:6], start=1):
            if _core(tok) in TC_VERBS:
                s = _join(toks[:i])
                bm = re.search(r"\b(?:From|By)\s+((?:[A-Z&][\w&'’.-]*\s?){1,4})\s*$", title)
                k, by, rule = CAT.get(cat), (bm.group(1).strip() if bm else author), "titlecase"
                break
    if s is None and not _title_case(toks) and (m := GAVE_RX.match(title)):
        sub = last_run(m["sub"])
        if sub:
            s, by = sub, lead_run(m["pre"])
            ob = OBJ_RX.search(title)
            k, rule = (OBJ_KIND[ob.group(1).lower()] if ob else CAT.get(cat)), "gave"
    if s is None and (not _title_case(toks) or cat in ("branding", "packaging", "type")):
        r = _design_for(title)
        if r:
            s, k, by = r
            rule = "for"
    if s is None and not _title_case(toks) and (m := RB_RX.match(title)):
        sub = lead_run(m["sub"]) or last_run(m["sub"])
        if sub:
            s, k, by, rule = sub, "Rebrand", lead_run(m["pre"]), "rebrand"
    if s is None:
        s, by = shorten(title), author

    s = _clean(s) or title
    k = k or CAT.get(cat, "")
    if by and by.lower() not in s.lower() and not k.startswith("Set in") and len(k) + len(by) <= 44:
        k = f"{k} by {by}"
    return {"s": s[:90], "k": k, "_r": rule}
