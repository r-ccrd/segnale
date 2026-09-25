"""Classificazione, filtri di qualità, font rilevati, deduplicazione cross-fonte."""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timedelta

# ------------------------------------------------------------------ categorie
CATEGORY_RULES = {
    "type": r"\btypefaces?\b|\bfonts?\b|\btypograph\w*|\btype (?:design|foundry|family|specimen)|\bfoundry\b|"
            r"\blettering\b|\bglyphs?\b|\bvariable fonts?\b|\bsans[- ]serif\b|\bgrotesk\b|\bgrotesque\b|"
            r"\bspecimen\b|\bcalligraph\w*|\bletterforms?\b",
    "branding": r"\bbrand identity\b|\bvisual identity\b|\bnew identity\b|\bidentity (?:system|design|for)\b|"
                r"\brebrand\w*|\bbranding\b|\blogos?\b|\blogotype\b|\bwordmark\b|\bmonogram\b|\bbrand system\b|"
                r"\bmascot\b|\bbrand refresh\b",
    "web": r"\bwebsites?\b|\bweb design\b|\bsite of the day\b|\blanding pages?\b|\bwebgl\b|\bwebflow\b|"
           r"\bmicrosite\b|\bportfolio site\b|\bhomepage\b|\bcss\b|\bscrollytelling\b|\bweb experience\b",
    "uiux": r"\bui\b|\bux\b|\buser experience\b|\buser interface\b|\binterfaces?\b|\bapp design\b|"
            r"\bproduct design\b|\bdesign systems?\b|\busability\b|\bprototyp\w*|\baccessibility\b|"
            r"\binteraction design\b|\bdashboards?\b|\bmobile app\b|\bdesign tokens?\b",
    "editorial": r"\beditorial\b|\bmagazines?\b|\bpublications?\b|\bbook design\b|\bbook covers?\b|\bzines?\b|"
                 r"\bnewspapers?\b|\bposters?\b|\bpublishing\b|\bcatalogue\b|\bannual report\b|\bprint(?:ed)? matter\b|"
                 r"\bbook\b|\bindependent magazine\b",
    "motion": r"\bmotion\b|\banimat\w*|\btitle sequence\b|\bkinetic\b|\bshort film\b|\bmusic video\b|"
              r"\bstop[- ]motion\b|\bidents?\b|\bopening titles\b",
    "3d": r"\b3d\b|\bcgi\b|\brender(?:s|ing|ed)?\b|\bblender\b|\bcinema 4d\b|\bc4d\b|\bhoudini\b|"
          r"\bunreal engine\b|\bue5\b|\boctane\b|\bzbrush\b|\bgaussian splat\w*|\bmaya\b",
    "colour": r"\bcolou?r palettes?\b|\bpalettes?\b|\bcolou?r of the year\b|\bpantone\b|\bcolou?r trends?\b|"
              r"\bcolou?r systems?\b|\bchromatic\b|\bgradients?\b",
    "artdirection": r"\bart direct\w*|\bcampaigns?\b|\bphotograph\w*|\bphoto series\b|\blookbook\b|"
                    r"\badvertising\b|\bad campaign\b|\bset design\b|\bstill life\b|\bcreative direction\b",
    "illustration": r"\billustrat\w*|\bdrawings?\b|\bpaintings?\b|\bpainter\b|\bcomics?\b|\bmurals?\b|"
                    r"\bcollages?\b|\bprintmaking\b|\brisograph\b|\bsculpt\w*|\bceramic\w*|\bembroider\w*|"
                    r"\btextile\w*",
    "packaging": r"\bpackaging\b|\bpackage design\b|\blabel design\b|\bbottles?\b|\bpack design\b|"
                 r"\bcarton\b|\bwine\b|\bbeer\b|\bgin\b|\bspirits\b|\bskincare\b|\bcosmetics?\b",
    "tools": r"\btools?\b|\bplugins?\b|\brelease notes?\b|\bnew features?\b|\bbeta\b|\bopen[- ]source\b|"
             r"\bfigma\b|\bframer\b|\bpenpot\b|\badobe\b|\bai[- ]powered\b|\bworkflows?\b|\bextensions?\b|"
             r"\bv\d+(?:\.\d+)+\b",
}
RULES = {c: re.compile(p, re.I) for c, p in CATEGORY_RULES.items()}

PREFIX_MAP = {
    "brand identity": "branding", "branding": "branding", "branding and packaging": "branding",
    "packaging design": "packaging", "packaging": "packaging", "typography": "type",
    "type design": "type", "editorial design": "editorial", "editorial": "editorial",
    "ui/ux": "uiux", "ui/ux design": "uiux", "ux design": "uiux", "ui design": "uiux",
    "web design": "web", "3d": "3d", "3d design": "3d", "3d art": "3d", "illustration": "illustration",
    "motion design": "motion", "motion": "motion", "art direction": "artdirection",
    "photography": "artdirection", "poster design": "editorial", "graphic design": "editorial",
    "industrial design": "artdirection", "brand identity & ui/ux design": "branding",
    "product design": "uiux", "creative direction": "artdirection",
}

DROP = re.compile(
    r"\b(sponsored|partner content|advertorial|giveaway|win a |coupon|% off|black friday|cyber monday|"
    r"webinar|we'?re hiring|job opening|jobs? board|podcast episode|newsletter #\d+|weekly (?:roundup|digest)|"
    r"round-?up|top \d+|\d+ (?:best|free|essential|inspiring|beautiful|amazing|awesome|creative|stunning)\b|"
    r"free download|freebies?|mockups? (?:pack|bundle)|template pack|register now|early bird|last chance)",
    re.I)
SOFT_PENALTY = re.compile(r"\b(how to|tutorial|tips|guide to|course|mistakes|ways to|checklist|cheat ?sheet)\b", re.I)
RELEASE_WORDS = re.compile(r"\b(introducing|now available|out now|new typeface|releases?|released|launch(?:es|ed)?|"
                           r"unveil\w*|version \d|v\d+\.\d+)\b", re.I)
STORY_WORDS = re.compile(r"\b(interview|in conversation|essay|opinion|column|podcast|the story of|profile|"
                         r"q&a|lessons|why |what we|reflections?)\b", re.I)
OLD_NEWS = re.compile(r"\b(from the archives?|throwback|retrospective|anniversary|years? ago|revisit(?:ed|ing)?|"
                      r"remembering|obituary|dies at|has died|in memoriam|history of)\b", re.I)
PRERELEASE = re.compile(r"(-rc|\brc\d*\b|alpha|beta\b|nightly|pre-?release)", re.I)


def item_id(key: str) -> str:
    return hashlib.sha1(key.encode()).hexdigest()[:12]


def split_prefix(title: str) -> tuple[str | None, str]:
    m = re.match(r"^\s*([A-Za-z0-9/&' ]{2,40}):\s+(.+)$", title)
    if m and m.group(1).strip().lower() in PREFIX_MAP:
        return PREFIX_MAP[m.group(1).strip().lower()], m.group(2).strip()
    return None, title


def extract_author(title: str) -> tuple[str, str]:
    """'Identity for X by Studio Y' -> ('Identity for X', 'Studio Y')."""
    m = re.match(r"^(.{3,}?)\s+(?:by|from)\s+([A-Z0-9][^,|:]{1,60})$", title)
    if m and len(m.group(2).split()) <= 6:
        return m.group(1).strip(" –—-"), m.group(2).strip()
    return title, ""


def classify(it: dict, src: dict) -> None:
    title = it["title"]
    prefix_cat = None
    if src.get("titlePrefixCategory"):
        prefix_cat, title = split_prefix(title)
    if not it["author"] and not it.get("font"):
        t2, author = extract_author(title)
        if author:
            title, it["author"] = t2, author
    it["title"] = title

    fields = [(title, 2.0), (" ".join(it["tags"]), 1.5), (it["summary"], 0.7), (it["url"], 1.0)]
    scores = {c: 0.0 for c in RULES}
    scores[src["category"]] += float(src.get("categoryBoost", 3.0))
    if prefix_cat:
        scores[prefix_cat] += 5.0
    for cat, rx in RULES.items():
        for text, w in fields:
            n = len(rx.findall(text or ""))
            scores[cat] += w * min(n, 2)
    if it.get("font"):
        scores["type"] += 10
    if it.get("video"):
        scores["motion"] += 1.5
    ranked = sorted(scores.items(), key=lambda kv: -kv[1])
    it["category"] = ranked[0][0]
    it["categories"] = [ranked[0][0]] + [c for c, s in ranked[1:4] if s >= 2.4]

    blob = f"{title} {it['summary']}"
    if it.get("font"):
        it["kind"] = "update" if it["font"].get("note") == "rerelease" else "release"
    elif src.get("kind") == "release" or (RELEASE_WORDS.search(title) and it["category"] in ("type", "tools", "3d")):
        it["kind"] = "release"
    elif src.get("kind") == "product":
        it["kind"] = "product"
    elif STORY_WORDS.search(title) or src.get("kind") == "story":
        it["kind"] = "story"
    else:
        it["kind"] = "project"
    it["penalty"] = (0.12 if SOFT_PENALTY.search(blob) else 0.0) + (0.10 if OLD_NEWS.search(title) else 0.0)
    if OLD_NEWS.search(title) and it["kind"] == "project":
        it["kind"] = "story"


def quality_gate(it: dict, src: dict) -> bool:
    """False = scarta. Qualità > quantità."""
    if not it["title"] or len(it["title"]) < 2:
        return False
    blob = f"{it['title']} {it['summary']} {' '.join(it['tags'])}"
    if DROP.search(it["title"]) or DROP.search(it["summary"][:160]):
        return False
    if src.get("require") and not re.search(src["require"], blob, re.I):
        return False
    if src.get("exclude") and re.search(src["exclude"], blob, re.I):
        return False
    if src["id"] in ("penpot",) and PRERELEASE.search(it["title"]):
        return False
    return True


# ------------------------------------------------------------------ font radar
TYPE_CONTEXT = re.compile(r"\b(typefaces?|fonts?|typograph\w*|set in|lettering|type family|typeset)\b", re.I)
PHRASEY = {"Grand Hotel", "Coming Soon", "Special Elite", "Life Savers", "Rock Salt", "Days One", "Over the Rainbow",
           "Nothing You Could Do", "Just Another Hand", "Give You Glory", "Covered By Your Grace", "Love Light",
           "Just Me Again Down Here", "The Girl Next Door", "Happy Monkey", "Luckiest Guy", "Permanent Marker",
           "Black Ops One", "Mountains of Christmas", "Waiting for the Sunrise", "Shadows Into Light",
           "Homemade Apple", "Crafty Girls", "Kite One", "Open Sans", "Big Shoulders", "Stick No Bills",
           "New Rocker", "Press Start 2P", "Share Tech", "Road Rage", "Butterfly Kids", "Hanalei Fill"}


class FontRadar:
    def __init__(self, catalog: list[str], extra: list[str]):
        multi = sorted({f for f in catalog + extra if " " in f and f not in PHRASEY}, key=len, reverse=True)
        self.single = {f for f in catalog + extra if " " not in f and len(f) >= 3}
        self.rx_multi = re.compile(r"\b(" + "|".join(re.escape(f) for f in multi) + r")\b") if multi else None
        self.rx_single = re.compile(
            r"(?:typefaces?|fonts?|set in|typeset in)\s+(?:called\s+|named\s+)?([A-Z][A-Za-z0-9]{2,})"
            r"|\b([A-Z][A-Za-z0-9]{2,})\s+(?:typeface|font|type family)\b")

    def detect(self, it: dict) -> list[str]:
        found = list(it.get("fonts") or [])
        text = f"{it['title']} {it['summary']}"
        if it.get("font"):
            found.append(it["font"]["family"])
        elif TYPE_CONTEXT.search(text) or it["category"] == "type":
            if self.rx_multi:
                found += self.rx_multi.findall(text)
            for a, b in self.rx_single.findall(text):
                name = a or b
                if name in self.single:
                    found.append(name)
        return list(dict.fromkeys(found))[:6]


# --------------------------------------------------------------- dedup cluster
STOP = set("""the a an and or of for to in on at by with from new identity brand branding logo design designs
designed designer visual system studio agency project rebrand rebranding typeface font type website site packaging
campaign creates created launches introduces reveals unveils gets its their our your into this that is are was
brand's gives giving meets bold modern playful fresh first how why what behind""".split())


def sig_tokens(title: str) -> set[str]:
    _, t = split_prefix(title)
    t = re.sub(r"[^a-z0-9à-ÿ ]+", " ", t.lower())
    return {w for w in t.split() if len(w) >= 3 and w not in STOP}


def cluster_duplicates(items: list[dict], weights: dict[str, float], now: datetime, days: int = 21) -> int:
    """Raggruppa lo stesso progetto coperto da fonti diverse. Il 'primario' resta nel feed,
    gli altri diventano `alsoOn`. Ritorna il numero di duplicati trovati."""
    recent = [i for i in items if i.get("type") != "trend" and
              datetime.fromisoformat(i["date"].replace("Z", "+00:00")) >= now - timedelta(days=days)]
    for i in recent:
        i.pop("dupOf", None)
        i["alsoOn"] = []
    parent = {i["id"]: i["id"] for i in recent}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    toks = {i["id"]: sig_tokens(i["title"]) for i in recent}
    by_img: dict[str, tuple[str, str]] = {}
    for idx, a in enumerate(recent):
        img = (a.get("image") or {}).get("src")
        if img:  # stessa immagine = stesso progetto, ma solo tra fonti diverse
            if img in by_img and by_img[img][1] != a["sid"]:
                parent[find(a["id"])] = find(by_img[img][0])
            else:
                by_img.setdefault(img, (a["id"], a["sid"]))
        ta = toks[a["id"]]
        if len(ta) < 2:
            continue
        for b in recent[idx + 1:]:
            if a["sid"] == b["sid"]:
                continue
            tb = toks[b["id"]]
            if len(tb) < 2:
                continue
            inter = ta & tb
            if len(inter) < 2:
                continue
            jac = len(inter) / len(ta | tb)
            if jac >= 0.5 or len(inter) >= min(len(ta), len(tb)):
                parent[find(a["id"])] = find(b["id"])

    groups: dict[str, list[dict]] = {}
    for i in recent:
        groups.setdefault(find(i["id"]), []).append(i)
    dups = 0
    for members in groups.values():
        if len(members) < 2:
            continue
        members.sort(key=lambda m: (-(weights.get(m["sid"], 0.5) + (0.15 if m.get("image") else 0)), m["date"]))
        head = members[0]
        for m in members[1:]:
            m["dupOf"] = head["id"]
            head["alsoOn"].append({"sid": m["sid"], "url": m["url"], "date": m["date"]})
            dups += 1
    return dups
