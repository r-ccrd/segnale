"""Rilevanza interna (0-100) + motivi leggibili.

Principi:
- ogni punto del punteggio corrisponde a un FATTO verificabile (award, copertura
  multi-fonte, release ufficiale, rank di trending pubblico, font identificati...);
- i "motivi" mostrati nella UI sono gli stessi fatti, mai giudizi inventati;
- la novità (età) NON è nel punteggio salvato: la UI la combina con l'età al momento
  della visualizzazione, così il punteggio resta stabile nel tempo;
- niente "like = importanza": l'unico dato di engagement usato è il trending rank
  pubblico di Google Fonts, e pesa meno di award e copertura editoriale.
"""
from __future__ import annotations

from enrich import is_chromatic

CATEGORY_LABEL = {
    "type": "Typography", "branding": "Branding", "web": "Web", "uiux": "UI/UX", "editorial": "Editorial",
    "motion": "Motion", "3d": "3D", "colour": "Colour", "artdirection": "Art direction",
    "illustration": "Illustration", "packaging": "Packaging", "tools": "Tools",
}


def _axes(font: dict) -> str:
    tags = [a["tag"] for a in font.get("axes", []) if a.get("tag")]
    return ", ".join(tags)


def score_item(it: dict, src: dict, names: dict[str, str], trend_titles: dict[str, str] | None = None) -> None:
    w = float(src.get("weight", 0.5))
    s = 18 + 42 * w                      # autorevolezza della fonte: 18..60
    reasons: list[tuple[int, str]] = []

    award = src.get("award")
    if award:
        s += 10
        reasons.append((90, award))
    elif w >= 0.85:
        reasons.append((62, f"Editor's pick on {src.get('name', it['sid'])}"))

    others = []
    for a in it.get("alsoOn") or []:
        if a["sid"] != it["sid"] and a["sid"] not in others:
            others.append(a["sid"])
    if others:
        s += min(8 * len(others), 20)
        who = [src.get("name", it["sid"])] + [names.get(o, o) for o in others]
        reasons.append((95, f"Covered by {len(who)} sources: " + ", ".join(who[:4])))

    font = it.get("font")
    if font:
        if it.get("kind") == "release":
            s += 8
            reasons.append((80, "Official release on Google Fonts"))
        else:
            reasons.append((40, "Updated / re-released on Google Fonts"))
        tr = font.get("trending")
        if tr and tr <= 1000:
            s += 15 if tr <= 100 else 10 if tr <= 300 else 5
            reasons.append((86 if tr <= 300 else 52, f"Google Fonts trending rank #{tr}"))
        ax = _axes(font)
        if ax:
            s += 2
            reasons.append((34, f"Variable font ({ax})"))

    img = it.get("image")
    pal = it.get("palette") or []
    if img:
        s += 5
        if min(img.get("w", 0), img.get("h", 0)) >= 800:
            s += 3
        if sum(1 for c in pal if is_chromatic(c["hex"])) >= 2:
            s += 3
    elif not font and it.get("type") != "colour":
        s -= 10

    fonts = [f for f in (it.get("fonts") or []) if not font or f != font.get("family")]
    if fonts:
        s += 4
        reasons.append((60, "Uses " + ", ".join(fonts[:3])))

    kind = it.get("kind")
    if kind == "release" and not font:
        s += 4
        reasons.append((70, "New release"))
    elif kind == "story":
        s -= 6
    if it.get("video"):
        s += 2

    if trend_titles and it.get("trendIds"):
        s += 6
        t = trend_titles.get(it["trendIds"][0])
        if t:
            reasons.append((88, f"Part of the pattern: {t}"))

    if it.get("author") and not font:
        reasons.append((20, f"Credited to {it['author']}"))

    s *= 1 - float(it.get("pen", 0) or 0)
    it["score"] = max(0, min(100, round(s)))
    ordered = [t for _, t in sorted(reasons, key=lambda r: -r[0])]
    it["reasons"] = ordered[:4]
    it["why"] = ordered[0] if ordered else f"Published by {src.get('name', it['sid'])}"
