"""TRENDING NOW: pattern dedotti automaticamente dagli item del feed.

Tutto ciò che esce da qui è un'INFERENZA e viene etichettato come tale:
  - "Detected trend"   crescita misurata: finestra recente (14 gg) vs baseline (15-90 gg)
  - "Emerging pattern" ricorrenza su più fonti; crescita moderata o baseline ancora corta
  - "Consolidated"     presente in modo stabile in entrambe le finestre (non è una novità)
Ogni pattern porta con sé le prove: item, fonti, parole che hanno fatto match, numeri.
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime, timedelta
from itertools import combinations

from enrich import hex_to_hls, is_chromatic

RECENT_DAYS = 14
BASE_DAYS = 90

# (id, etichetta, regex, famiglia) — vocabolario di stili/tecniche/motivi visivi.
# È volutamente esplicito: ogni match è spiegabile ("ha trovato 'dither' nel titolo").
LEXICON = [
    ("pixel", "Pixel & bitmap aesthetics", r"\bpixel(?:ated|s| art| font| type)?\b|\bbitmap\b|\b8-?bit\b|\bdither\w*"),
    ("brutalist", "Brutalist, raw layouts", r"\bbrutalis[tm]\w*|\banti-?design\b|\braw layout"),
    ("y2k", "Y2K / early-web revival", r"\by2k\b|\bnoughties\b|\bearly (?:web|internet)\b|\bweb 1\.0\b"),
    ("chrome", "Chrome & liquid metal", r"\bchrome\b|\bliquid metal\b|\bmetallic\b"),
    ("grain", "Grain, noise & tactile texture", r"\bgrain(?:y)?\b|\bnoise\b|\bgritty\b|\btactil\w*"),
    ("gradient", "Gradients, blur & glow", r"\bgradients?\b|\bblur(?:red|ry)?\b|\bglow(?:ing)?\b|\baura\b"),
    ("riso", "Risograph & print processes", r"\brisograph\w*|\briso\b|\bscreen-?print\w*|\bletterpress\b|\bphotocop\w*|\bxerox\b"),
    ("collage", "Collage & cut-out", r"\bcollages?\b|\bcut-?outs?\b|\bpaper[- ]cut\w*|\bscrapbook\w*"),
    ("handmade", "Hand-drawn & analogue marks", r"\bhand-?drawn\b|\bhand-?made\b|\bhandcraft\w*|\bscribbl\w*|\bdoodl\w*|\bcrayon\b|\bbrush ?strokes?\b"),
    ("kinetic", "Kinetic & animated type", r"\bkinetic typ\w*|\banimated (?:type|typography|logo|identity)\b|\bmotion typ\w*|\blogo animation\b"),
    ("variable", "Variable fonts in use", r"\bvariable fonts?\b|\bvariable typeface\b|\bvariable axes\b|\bvariable type\b"),
    ("mono", "Monospaced type", r"\bmonospaced?\b|\bmono(?:space)? (?:font|type|typeface)\b"),
    ("serif", "Expressive display serifs", r"\bdisplay serifs?\b|\bdidone\b|\bwedge serif\b|\bsoft serif\b|\bserif revival\b"),
    ("blackletter", "Blackletter & gothic forms", r"\bblackletter\b|\bfraktur\b|\bgothic (?:type|letters|script)\b"),
    ("widths", "Extreme widths (condensed / extended)", r"\b(?:ultra|extra|super)[- ]?condensed\b|\bcompressed type\b|\bextended (?:type|sans|typeface)\b|\bultra[- ]wide\b"),
    ("soft", "Soft, inflated, rounded forms", r"\binflated\b|\bpuffy\b|\bbubbl(?:e|y) (?:type|letters?|font)\b|\bblobby\b|\bsquishy\b"),
    ("stencil", "Stencil & modular letterforms", r"\bstencil\w*|\bmodular (?:type|typeface|letters?|alphabet)\b"),
    ("mascot", "Characters & mascots", r"\bmascots?\b|\bcharacter design\b|\bbrand characters?\b"),
    ("generative", "Generative & parametric systems", r"\bgenerative (?:design|system|identity|art)\b|\bparametric\b|\bcode-?based\b|\balgorithmic\b"),
    ("ai", "AI in the creative workflow", r"\bai-?generated\b|\bgenerative ai\b|\bai tools?\b|\bmidjourney\b|\bartificial intelligence\b|\bai\b"),
    ("3dtype", "3D & sculptural type", r"\b3d (?:type|typography|lettering|letters|logo|wordmark)\b|\bsculpt\w* (?:type|letters)\b"),
    ("glass", "Glass & translucency", r"\bglass(?:morphism)?\b|\btranslucen\w*|\bfrosted\b|\biridescen\w*"),
    ("bento", "Bento-grid layouts", r"\bbento\b"),
    ("scroll", "Scroll-driven storytelling", r"\bscroll(?:ytelling|-driven|-triggered| animations?)\b|\bparallax\b"),
    ("webgl", "WebGL & real-time 3D on the web", r"\bwebgl\b|\bthree\.?js\b|\bshaders?\b|\bwebgpu\b|\breal-?time 3d\b"),
    ("sustainable", "Sustainable & refill packaging", r"\bsustainab\w*|\brecycl\w*|\brefill\w*|\bcompostable\b|\bmono-?material\b|\bplastic-?free\b"),
    ("heritage", "Heritage, archive & retro revival", r"\bheritage\b|\barchiv(?:e|al)\b|\bretro\b|\bnostalgi\w*|\bvintage\b|\brevival\b"),
    ("swiss", "Swiss / modernist grid rigour", r"\bswiss\b|\binternational typographic style\b|\bgrid system\b|\bmodernis[tm]\w*"),
    ("maximal", "Maximalism", r"\bmaximalis[tm]\w*|\bmore is more\b"),
    ("minimal", "Reductive minimalism", r"\bminimalis[tm]\w*|\breductive\b|\bpared[- ]back\b|\bstripped[- ]back\b"),
    ("optical", "Psychedelic & optical effects", r"\bpsychedeli\w*|\boptical illusions?\b|\bop art\b|\bmoir[eé]\b|\btrippy\b"),
    ("stopmotion", "Stop-motion & claymation", r"\bstop[- ]motion\b|\bclaymation\b|\bplasticine\b"),
    ("wayfinding", "Wayfinding & signage", r"\bwayfinding\b|\bsignage\b"),
    ("sonic", "Sonic & multisensory branding", r"\bsonic (?:identity|branding|logo)\b|\bsound identity\b|\bmultisensory\b"),
    ("dataviz", "Data as visual language", r"\bdata[- ]vi[sz]\w*|\binfographic\w*|\bdata-driven (?:design|identity)\b"),
    ("illusystem", "Illustration-led identities", r"\billustrat\w* (?:identity|system|language)\b|\billustration-led\b"),
    ("sticker", "Sticker & badge systems", r"\bstickers?\b|\bbadges\b"),
    ("isometric", "Isometric worlds", r"\bisometric\b"),
    ("halftone", "Halftone & print artefacts", r"\bhalftone\b|\bmisregistration\b|\bink bleed\b"),
    ("neon", "Neon, acid & fluorescent colour", r"\bneon\b|\bacid (?:green|colou?rs?|yellow)\b|\bfluo(?:rescent)?\b"),
    ("pastel", "Pastel palettes", r"\bpastels?\b"),
    ("earthy", "Earthy palettes", r"\bearthy\b|\bterracotta\b|\bearth tones?\b|\bochre\b"),
    ("mono_col", "Monochrome & black-and-white", r"\bmonochrom\w*|\bblack[- ]and[- ]white\b"),
]
LEX_RX = [(k, label, re.compile(rx, re.I)) for k, label, rx in LEXICON]

FAMILIES = [(15, "red"), (40, "orange"), (65, "yellow"), (95, "lime"), (150, "green"), (180, "teal"),
            (200, "cyan"), (245, "blue"), (270, "indigo"), (295, "violet"), (330, "magenta"), (348, "pink"),
            (361, "red")]

PHRASE_STOP = set("""the a an and or of for to in on at by with from new its it this that is are was be as
into over under about after before your our their his her you we they them us how why what when where who
design designs designed designer designers studio agency project projects identity identities brand brands
branding visual system systems work works first latest year years day days week weeks world people time
series collection edition issue part one two three four five six seven eight nine ten more most best all
new-look look looks meet meets introduces introducing launches launched unveils reveals gets makes make
made using use uses via inside behind through between against without within across around rebrand
rebrands rebranding logo logos website websites site type typeface font fonts""".split())


def _dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def _text(it: dict) -> str:
    return f"{it.get('title', '')} {' '.join(it.get('tags') or [])} {it.get('summary', '')}"


def _srcs(it: dict) -> set[str]:
    return {it["sid"]} | {a["sid"] for a in it.get("alsoOn") or []}


def _evidence(its: list[dict], k: int = 8) -> list[dict]:
    its = sorted(its, key=lambda i: (-(i.get("image") is not None), -i.get("score", 0)))[:k]
    return [{"id": i["id"], "title": i["title"], "sid": i["sid"], "url": i["url"], "date": i["date"],
             "image": i.get("image"), "palette": (i.get("palette") or [])[:5]} for i in its]


def colour_bin(hex_: str) -> str:
    h, l, s = hex_to_hls(hex_)
    deg = h * 360
    fam = next(name for bound, name in FAMILIES if deg < bound)
    if l < 0.3:
        tone = "deep"
    elif l > 0.74:
        tone = "pale"
    elif s > 0.62:
        tone = "bright"
    else:
        tone = "muted"
    return f"{tone} {fam}"


def _status(r: int, rs: int, b: int, n_r: int, n_b: int, baseline_ok: bool,
            min_r: int = 3, min_rs: int = 2) -> tuple[str | None, float | None]:
    if r < min_r or rs < min_rs:
        return None, None
    rate_r = r / max(n_r, 1)
    rate_b = (b + 0.5) / (n_b + 1)
    lift = rate_r / rate_b
    if baseline_ok:
        if lift >= 2.0 and r >= min_r + 1 and rs >= min_rs + 1:
            return "Detected trend", lift
        if lift >= 1.4:
            return "Emerging pattern", lift
        if b >= 3:
            return "Consolidated", lift
        return None, lift
    if r >= min_r + 1 and rs >= min_rs + 1:
        return "Emerging pattern", None
    return None, None


def compute(items: list[dict], state: dict, now: datetime, names: dict[str, str]) -> dict:
    heads = [i for i in items if not i.get("dupOf") and i.get("type") not in ("colour", "trend")]
    for i in items:
        i.pop("trendIds", None)
    recent = [i for i in heads if now - _dt(i["date"]) <= timedelta(days=RECENT_DAYS)]
    base = [i for i in heads if timedelta(days=RECENT_DAYS) < now - _dt(i["date"]) <= timedelta(days=BASE_DAYS)]
    oldest = min((_dt(i["date"]) for i in heads), default=now)
    history_days = (now - oldest).days
    # la baseline conta solo se abbiamo abbastanza storia *osservata*, non solo item vecchi nei feed
    runs_since = state.get("firstRun") or now.isoformat()
    observed_days = (now - _dt(runs_since)).days if isinstance(runs_since, str) else 0
    baseline_ok = len(base) >= 60 and history_days >= 40 and observed_days >= 21
    n_r, n_b = len(recent), len(base)

    trends: list[dict] = []
    tstate = state.setdefault("trends", {})

    def remember(tid: str, label: str) -> str:
        rec = tstate.setdefault(tid, {"firstDetected": now.strftime("%Y-%m-%dT%H:%M:%SZ")})
        rec["lastSeen"] = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        rec["label"] = label
        return rec["firstDetected"]

    def source_names(its: list[dict]) -> list[str]:
        seen: list[str] = []
        for i in its:
            for s in sorted(_srcs(i)):
                if s not in seen:
                    seen.append(s)
        return seen

    # ---------------------------------------------------------------- 1. lessico visivo
    for key, label, rx in LEX_RX:
        hits_r, terms = [], defaultdict(int)
        for i in recent:
            found = rx.findall(_text(i))
            if found:
                hits_r.append(i)
                for f in found:
                    terms[(f if isinstance(f, str) else f[0]).lower()] += 1
        b = sum(1 for i in base if rx.search(_text(i)))
        srcs = source_names(hits_r)
        status, lift = _status(len(hits_r), len(srcs), b, n_r, n_b, baseline_ok,
                               min_r=4 if key == "ai" else 3, min_rs=3 if key == "ai" else 2)
        if not status:
            continue
        tid = f"t-lex-{key}"
        matched = ", ".join(t for t, _ in sorted(terms.items(), key=lambda kv: -kv[1])[:4])
        if status == "Detected trend":
            summary = (f"{len(hits_r)} items from {len(srcs)} sources in the last {RECENT_DAYS} days, "
                       f"{lift:.1f}x the rate of the previous {BASE_DAYS - RECENT_DAYS} days.")
        elif status == "Consolidated":
            summary = (f"{len(hits_r)} recent items and {b} in the previous {BASE_DAYS - RECENT_DAYS} days: "
                       f"steady presence rather than something new.")
        elif lift:
            summary = (f"{len(hits_r)} items from {len(srcs)} sources in the last {RECENT_DAYS} days, "
                       f"{lift:.1f}x the previous rate. Early signal, still small numbers.")
        else:
            summary = (f"{len(hits_r)} items from {len(srcs)} independent sources in the last {RECENT_DAYS} days. "
                       f"History is still short: this measures recurrence across sources, not growth yet.")
        first = remember(tid, status)
        for i in hits_r:
            i.setdefault("trendIds", []).append(tid)
        trends.append({
            "id": tid, "type": "trend", "family": "pattern", "label": status, "title": label,
            "summary": summary, "matched": matched, "count": len(hits_r), "baseline": b,
            "lift": round(lift, 2) if lift else None, "basis": "growth" if (lift and baseline_ok) else "recurrence",
            "sources": srcs, "firstDetected": first, "evidence": _evidence(hits_r),
        })

    # ---------------------------------------------------------------- 2. font in uso
    gf = {f["family"]: f for f in state.get("gfRadar", [])}
    gf_catalog_dates = state.get("gfDates", {})
    gf_all = set(state.get("gfCatalog", []))
    mentions: dict[str, list[dict]] = defaultdict(list)
    base_mentions: dict[str, int] = defaultdict(int)
    for i in heads:
        if i.get("font"):
            continue
        age = now - _dt(i["date"])
        for f in i.get("fonts") or []:
            if age <= timedelta(days=30):
                mentions[f].append(i)
            elif age <= timedelta(days=BASE_DAYS):
                base_mentions[f] += 1
    font_signals = []
    for fam, its in mentions.items():
        srcs = source_names(its)
        added = (gf.get(fam) or {}).get("dateAdded") or gf_catalog_dates.get(fam)
        is_new = bool(added) and (now - _dt(added + "T12:00:00Z" if len(added) == 10 else added)) <= timedelta(days=120)
        n = len(its)
        entry = {"family": fam, "count": n, "sources": srcs, "new": is_new, "dateAdded": added,
                 "google": fam in gf_all, "evidence": _evidence(its, 6)}
        font_signals.append(entry)
        status = None
        if is_new and n >= 2:
            status = "Detected trend" if (n >= 3 and len(srcs) >= 2) else "Emerging pattern"
            summary = (f"Released on Google Fonts on {added[:10]}, now spotted in {n} projects "
                       f"from {len(srcs)} source{'s' if len(srcs) > 1 else ''} in the last 30 days.")
        elif n >= 3 and len(srcs) >= 2:
            if baseline_ok and base_mentions[fam] >= 2:
                status = "Consolidated"
                summary = f"Used in {n} recent projects and {base_mentions[fam]} before that: an established favourite."
            else:
                status = "Emerging pattern"
                summary = (f"Credited in {n} recent projects from {len(srcs)} sources in 30 days"
                           + ("." if baseline_ok else ". Not enough history yet to tell new from established."))
        if not status:
            continue
        tid = "t-font-" + re.sub(r"[^a-z0-9]+", "-", fam.lower()).strip("-")
        first = remember(tid, status)
        for i in its:
            i.setdefault("trendIds", []).append(tid)
        trends.append({"id": tid, "type": "trend", "family": "font", "label": status, "title": fam,
                       "summary": summary, "count": n, "sources": srcs, "firstDetected": first,
                       "font": (gf.get(fam) | {"provider": "google"}) if fam in gf else {"family": fam, "provider": "google" if fam in gf_all else None},
                       "basis": "growth" if is_new else "recurrence", "evidence": _evidence(its)})
    font_signals.sort(key=lambda e: (-e["count"], -len(e["sources"])))

    # ---------------------------------------------------------------- 3. colore
    def bins_of(i: dict) -> dict[str, list[str]]:
        out: dict[str, list[str]] = defaultdict(list)
        for c in i.get("palette") or []:
            if c["share"] >= 0.06 and is_chromatic(c["hex"]):
                out[colour_bin(c["hex"])].append(c["hex"])
        return out

    rb: dict[str, list[dict]] = defaultdict(list)
    rhex: dict[str, list[str]] = defaultdict(list)
    pairs: dict[tuple[str, str], list[dict]] = defaultdict(list)
    pal_r = [i for i in recent if i.get("palette")]
    pal_b = [i for i in base if i.get("palette")]
    for i in pal_r:
        bins = bins_of(i)
        for bname, hexes in bins.items():
            rb[bname].append(i)
            rhex[bname] += hexes
        for a, b2 in combinations(sorted(bins), 2):
            if a.split()[-1] != b2.split()[-1]:
                pairs[(a, b2)].append(i)
    bb: dict[str, int] = defaultdict(int)
    for i in pal_b:
        for bname in bins_of(i):
            bb[bname] += 1

    def central(hexes: list[str]) -> str:
        hls = [hex_to_hls(h) for h in hexes]
        cl = sum(x[1] for x in hls) / len(hls)
        cs = sum(x[2] for x in hls) / len(hls)
        return min(hexes, key=lambda h: abs(hex_to_hls(h)[1] - cl) + abs(hex_to_hls(h)[2] - cs))

    colour_signals = []
    for bname, its in rb.items():
        srcs = source_names(its)
        status, lift = _status(len(its), len(srcs), bb.get(bname, 0), len(pal_r), len(pal_b), baseline_ok,
                               min_r=4, min_rs=3)
        colour_signals.append({"bin": bname, "hex": central(rhex[bname]), "count": len(its),
                               "share": round(len(its) / max(len(pal_r), 1), 3), "sources": srcs,
                               "status": status, "lift": round(lift, 2) if lift else None,
                               "evidence": _evidence(its, 6)})
    colour_signals.sort(key=lambda c: (-(c["lift"] or 0), -c["count"]))
    for c in [c for c in colour_signals if c["status"] in ("Detected trend", "Emerging pattern")][:2]:
        tid = "t-col-" + c["bin"].replace(" ", "-")
        first = remember(tid, c["status"])
        its = rb[c["bin"]]
        for i in its:
            i.setdefault("trendIds", []).append(tid)
        pct = round(100 * c["share"])
        summary = (f"Dominant in {c['count']} project palettes ({pct}% of those analysed) from "
                   f"{len(c['sources'])} sources in {RECENT_DAYS} days"
                   + (f", {c['lift']:.1f}x the previous rate." if c["lift"] else
                      ". Colour extracted automatically from project images."))
        trends.append({"id": tid, "type": "trend", "family": "colour", "label": c["status"],
                       "title": c["bin"].capitalize(), "summary": summary, "count": c["count"],
                       "sources": c["sources"], "firstDetected": first, "swatches": [c["hex"]] +
                       [h for h in dict.fromkeys(rhex[c["bin"]]) if h != c["hex"]][:5],
                       "basis": "growth" if (c["lift"] and baseline_ok) else "recurrence",
                       "evidence": _evidence(its)})
    pair_signals = []
    for (a, b2), its in pairs.items():
        srcs = source_names(its)
        if len(its) >= 3 and len(srcs) >= 3:
            pair_signals.append({"bins": [a, b2], "hex": [central(rhex[a]), central(rhex[b2])],
                                 "count": len(its), "sources": srcs, "evidence": _evidence(its, 6)})
    pair_signals.sort(key=lambda p: (-p["count"], -len(p["sources"])))
    if pair_signals:
        p = pair_signals[0]
        tid = "t-pair-" + "-".join(x.replace(" ", "_") for x in p["bins"])
        first = remember(tid, "Emerging pattern")
        trends.append({"id": tid, "type": "trend", "family": "colour", "label": "Emerging pattern",
                       "title": f"{p['bins'][0].capitalize()} + {p['bins'][1]}",
                       "summary": (f"This pairing shows up together in {p['count']} palettes from "
                                   f"{len(p['sources'])} sources in {RECENT_DAYS} days."),
                       "count": p["count"], "sources": p["sources"], "firstDetected": first,
                       "swatches": p["hex"], "basis": "recurrence", "evidence": p["evidence"]})

    # ---------------------------------------------------------------- 4. copertura multi-fonte
    coverage = []
    for i in heads:
        if now - _dt(i["date"]) > timedelta(days=21):
            continue
        srcs = sorted(_srcs(i))
        if len(srcs) >= 2:
            coverage.append({"id": i["id"], "title": i["title"], "sid": i["sid"], "url": i["url"],
                             "date": i["date"], "image": i.get("image"), "sources": srcs})
    coverage.sort(key=lambda c: c["date"], reverse=True)
    coverage.sort(key=lambda c: -len(c["sources"]))

    # ---------------------------------------------------------------- 5. frasi ricorrenti (segnale grezzo)
    def bigrams(title: str) -> set[str]:
        words = [w for w in re.sub(r"[^a-z0-9à-ÿ'\- ]+", " ", title.lower()).split()]
        out = set()
        for a, b2 in zip(words, words[1:]):
            if a in PHRASE_STOP or b2 in PHRASE_STOP or len(a) < 3 or len(b2) < 3:
                continue
            if a.isdigit() or b2.isdigit():
                continue
            out.add(f"{a} {b2}")
        return out

    ph_r: dict[str, list[dict]] = defaultdict(list)
    for i in recent:
        for g in bigrams(i["title"] + " " + " ".join(i.get("tags") or [])):
            ph_r[g].append(i)
    ph_b: dict[str, int] = defaultdict(int)
    for i in base:
        for g in bigrams(i["title"]):
            ph_b[g] += 1
    lower_names = {n.lower() for n in names.values()}
    phrases = []
    for g, its in ph_r.items():
        srcs = source_names(its)
        if len(its) >= 3 and len(srcs) >= 2 and g not in lower_names:
            phrases.append({"phrase": g, "count": len(its), "sources": srcs, "baseline": ph_b.get(g, 0),
                            "ids": [i["id"] for i in its[:8]]})
    phrases.sort(key=lambda p: (-len(p["sources"]), -p["count"]))

    # ---------------------------------------------------------------- 6. radar Google Fonts
    radar = [{"family": f["family"], "category": f.get("category"), "designers": f.get("designers", [])[:3],
              "dateAdded": f.get("dateAdded"), "trending": f.get("trending"), "popularity": f.get("popularity"),
              "axes": f.get("axes", []), "weights": f.get("weights", []), "italic": f.get("italic")}
             for f in state.get("gfRadar", [])[:16]]

    # pulizia stato trend: dimentica ciò che non si vede da 45 giorni
    for tid in list(tstate):
        if now - _dt(tstate[tid]["lastSeen"]) > timedelta(days=45):
            del tstate[tid]

    order = {"Detected trend": 0, "Emerging pattern": 1, "Consolidated": 2}
    trends.sort(key=lambda t: (order[t["label"]], -t["count"]))
    return {
        "trends": trends,
        "signals": {"fonts": font_signals[:14], "colours": colour_signals[:14], "pairs": pair_signals[:6],
                    "coverage": coverage[:14], "phrases": phrases[:14], "radar": radar},
        "baseline": {"ok": baseline_ok, "recentItems": n_r, "baselineItems": n_b, "historyDays": history_days,
                     "observedDays": observed_days, "recentDays": RECENT_DAYS, "baseDays": BASE_DAYS},
    }


# -------------------------------------------------------------------- colour bar + palette cards
def colour_bar(items: list[dict], now: datetime, max_n: int = 16) -> dict:
    heads = [i for i in items if not i.get("dupOf") and i.get("palette") and i.get("type") != "colour"]
    for hours in (24, 48, 72, 168):
        pool = [i for i in heads if now - _dt(i["seen"] if i.get("seen") else i["date"]) <= timedelta(hours=hours)
                and now - _dt(i["date"]) <= timedelta(hours=hours + 48)]
        if len(pool) >= 8:
            break
    pool.sort(key=lambda i: -i.get("score", 0))
    segs = []
    for i in pool[: max_n]:
        chrom = [c for c in i["palette"] if is_chromatic(c["hex"]) and c["share"] >= 0.04]
        c = (chrom or i["palette"])[0]
        segs.append({"hex": c["hex"], "id": i["id"], "title": i["title"], "sid": i["sid"]})
    segs.sort(key=lambda s: (not is_chromatic(s["hex"]), hex_to_hls(s["hex"])[0]))
    return {"hours": hours, "segments": segs}


def palette_cards(items: list[dict], per_day: int = 2) -> list[dict]:
    by_day: dict[str, list[dict]] = defaultdict(list)
    for i in items:
        if i.get("dupOf") or i.get("type") or not i.get("palette") or not i.get("image"):
            continue
        pal = i["palette"]
        chrom = [c for c in pal if is_chromatic(c["hex"])]
        if len(pal) < 4 or len(chrom) < 3 or pal[0]["share"] > 0.62 or i.get("score", 0) < 45:
            continue
        spread = len({colour_bin(c["hex"]).split()[-1] for c in chrom})
        by_day[i["date"][:10]].append((spread * 10 + i.get("score", 0), i))
    cards = []
    for day, cands in by_day.items():
        cands.sort(key=lambda x: -x[0])
        for _, i in cands[:per_day]:
            cards.append({
                "id": "c-" + i["id"], "type": "colour", "sid": i["sid"], "url": i["url"], "title": i["title"],
                "author": i.get("author", ""), "derivedFrom": i["id"], "date": i["date"], "dateType": i["dateType"],
                "seen": i.get("seen"), "category": "colour", "categories": ["colour"], "kind": "project",
                "palette": i["palette"], "image": i["image"], "score": max(0, i.get("score", 0) - 4),
                "why": "Palette extracted from the project's lead image",
                "reasons": ["Palette extracted from the project's lead image"] + (i.get("reasons") or [])[:2],
            })
    return cards
