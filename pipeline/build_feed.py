#!/usr/bin/env python3
"""Segnale · pipeline completa.

FEEDS → NORMALIZZAZIONE → QUALITY GATE → DEDUP → ARRICCHIMENTO → CLASSIFICAZIONE
      → CLUSTER CROSS-FONTE → RANKING → TREND → data/*.json

  python pipeline/build_feed.py                  run completo (quello di GitHub Actions)
  python pipeline/build_feed.py --only bpo,tbi   solo alcune fonti (debug)
  python pipeline/build_feed.py --dry-run        non scrive niente su disco
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import rank  # noqa: E402
import trends  # noqa: E402
from classify import FontRadar, classify, cluster_duplicates, item_id, quality_gate  # noqa: E402
from enrich import enrich_item  # noqa: E402
from ingest import FETCHERS, iso  # noqa: E402
from net import dedup_key  # noqa: E402

ROOT = HERE.parent
DATA = ROOT / "data"
ARCH = DATA / "archive"
UTC = timezone.utc
SCHEMA = 1
LIST_DEFAULTS = ("tags", "images", "fonts", "alsoOn", "categories")
DROP_EMPTY = {"summary", "author", "tags", "images", "fonts", "alsoOn", "palette", "video", "font", "reasons",
              "trendIds", "pen", "dupOf", "image"}


def log(msg: str) -> None:
    print(msg, flush=True)


def _dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default
    except Exception as ex:  # file corrotto: meglio ripartire che bloccare il feed
        log(f"! {path.name} illeggibile ({ex}): riparto da vuoto")
        return default


def dump(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def load_store() -> dict[str, dict]:
    store: dict[str, dict] = {}
    for p in sorted(ARCH.glob("*.json")):
        for it in read_json(p, {}).get("items", []):
            if it.get("type") == "colour":      # le card palette si rigenerano a ogni run
                continue
            it.setdefault("summary", "")
            it.setdefault("author", "")
            for k in LIST_DEFAULTS:
                it.setdefault(k, [])
            fix_font_credit(it)
            store[it["id"]] = it
    return store


def fix_font_credit(it: dict) -> None:
    """Typewolf mette "Fonts: A, B" dove altri feed mettono l'autore: sono caratteri, non uno studio."""
    m = re.match(r"(?i)^(fonts?|typefaces?)\s*:\s*(.+)$", (it.get("author") or "").strip())
    if m:
        extra = [f.strip() for f in m.group(2).split(",") if f.strip()]
        it["fonts"] = list(dict.fromkeys((it.get("fonts") or []) + extra))
        it["author"] = ""


def slim(it: dict) -> dict:
    return {k: v for k, v in it.items()
            if k not in ("key", "penalty") and not (k in DROP_EMPTY and v in (None, "", [], 0))}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="id fonti separati da virgola")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-enrich", action="store_true", help="salta og:meta e analisi immagini (debug veloce)")
    ap.add_argument("--workers", type=int, default=12)
    args = ap.parse_args()

    t0 = time.time()
    now = datetime.now(UTC).replace(microsecond=0)
    cfg = read_json(HERE / "sources.json", {})
    retention = int(cfg.get("retentionDays", 120))
    all_sources = {s["id"]: s for s in cfg["sources"]}
    active = [s for s in cfg["sources"] if not s.get("disabled")]
    if args.only:
        wanted = set(args.only.split(","))
        active = [s for s in active if s["id"] in wanted]
    names = {sid: s["name"] for sid, s in all_sources.items()}
    weights = {sid: float(s.get("weight", 0.5)) for sid, s in all_sources.items()}

    state = read_json(DATA / "state.json", {})
    state.setdefault("firstRun", iso(now))
    state.setdefault("seenSources", [])
    rejected = state.setdefault("rejected", {})
    store = load_store()
    known = {dedup_key(it["url"]): it["id"] for it in store.values()}
    log(f"Segnale · {iso(now)} · archivio {len(store)} item · fonti attive {len(active)}")

    # 1 ── FETCH (in parallelo; una fonte rotta non blocca le altre)
    status: dict[str, dict] = {}
    raw: list[dict] = []
    with ThreadPoolExecutor(max_workers=10) as ex:
        futs = {ex.submit(FETCHERS[s["type"]], s, state, now, retention): s for s in active}
        for fut in as_completed(futs):
            s = futs[fut]
            try:
                items, st = fut.result()
                st["ok"] = True
                if s["id"] not in state["seenSources"]:
                    state["seenSources"].append(s["id"])
            except Exception as e:  # noqa: BLE001
                items, st = [], {"ok": False, "error": f"{type(e).__name__}: {str(e)[:180]}"}
            st["items"] = len(items)
            status[s["id"]] = st
            raw += items

    # 2 ── QUALITY GATE + DEDUP per URL canonico
    fresh, gated = [], 0
    for it in raw:
        k = it["key"]
        if k in known:
            continue
        rej = rejected.get(k)
        if rej and not (rej.get("retry") and now - _dt(rej["at"]) > timedelta(days=1)):
            continue
        src = all_sources[it["sid"]]
        if not quality_gate(it, src):
            rejected[k] = {"at": iso(now), "why": "quality"}
            gated += 1
            continue
        it["id"] = item_id(k)
        it["seen"] = iso(now)
        known[k] = it["id"]
        fresh.append(it)
    log(f"grezzi {len(raw)} · nuovi {len(fresh)} · scartati dal quality gate {gated}")

    # 3 ── ARRICCHIMENTO (og:meta se mancano immagine/testo/data + dimensioni e palette)
    if fresh and not args.no_enrich:
        t1 = time.time()

        def job(it: dict) -> dict:
            return enrich_item(it, delay=float(all_sources[it["sid"]].get("crawlDelay", 0)))

        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            list(ex.map(job, fresh))
        log(f"arricchiti {len(fresh)} item in {time.time() - t1:.0f}s")

    # 4 ── CLASSIFICAZIONE + FONT + controllo contesto
    explicit = sorted({f for it in list(store.values()) + fresh for f in (it.get("fonts") or [])})
    radar = FontRadar(state.get("gfCatalog", []), explicit)
    kept = []
    for it in fresh:
        src = all_sources[it["sid"]]
        classify(it, src)
        it["fonts"] = radar.detect(it)
        fix_font_credit(it)
        if it["fonts"] and "type" not in it["categories"]:
            it["categories"].append("type")
        if not it.get("image") and not it.get("font") and not it["summary"]:
            rejected[it["key"]] = {"at": iso(now), "why": "empty", "retry": True}
            continue
        main_img = (it.get("image") or {}).get("src")
        it["images"] = [u for u in it["images"] if u != main_img][:3]
        if it.get("penalty"):
            it["pen"] = round(it["penalty"], 2)
        store[it["id"]] = it
        kept.append(it)

    # retention
    cut = now - timedelta(days=retention)
    for k in [k for k, it in store.items() if _dt(it["date"]) < cut]:
        del store[k]
    items = list(store.values())

    # immagini "generiche" (stessa og:image su 3+ post = logo del sito, non il progetto)
    freq = Counter((i.get("image") or {}).get("src") for i in items if i.get("image"))
    generic = 0
    for i in items:
        s = (i.get("image") or {}).get("src")
        if s and freq[s] >= 3:
            i["image"], i["palette"] = None, None
            generic += 1

    # 5 ── CLUSTER: stesso progetto su più fonti → una card + "also covered by"
    dups = cluster_duplicates(items, weights, now)

    # 6 ── RANKING (due passate: la seconda sa quali item sono prove di un trend)
    def src_of(it: dict) -> dict:
        return all_sources.get(it["sid"]) or {"name": it["sid"], "weight": 0.5}

    for it in items:
        rank.score_item(it, src_of(it), names)
    tr = trends.compute(items, state, now, names)
    # Senza baseline un colore "frequente" misura solo il tasso di base (pelle, legno, cartone = arancio smorzato):
    # resta tra i segnali grezzi del tab Trending, niente etichetta di trend finché la crescita non è misurabile.
    if not tr["baseline"]["ok"]:
        drop = {t["id"] for t in tr["trends"] if t.get("family") == "colour"}
        tr["trends"] = [t for t in tr["trends"] if t["id"] not in drop]
        for it in items:
            if it.get("trendIds"):
                it["trendIds"] = [x for x in it["trendIds"] if x not in drop]
        for key in ("colours", "pairs"):
            for c in tr["signals"].get(key, []):
                c.pop("status", None)
    titles = {t["id"]: t["title"] for t in tr["trends"]}
    for it in items:
        rank.score_item(it, src_of(it), names, titles)
    bar = trends.colour_bar(items, now)
    pcards = trends.palette_cards(items)

    # 7 ── SCRITTURA: partizioni mensili (una riga per item = diff git leggibili)
    by_month: dict[str, list[dict]] = defaultdict(list)
    for it in items + pcards:
        by_month[it["date"][:7]].append(slim(it))
    heads = [i for i in items if not i.get("dupOf")]
    ss = state.setdefault("sourceStatus", {})
    for sid, st in status.items():
        rec = ss.setdefault(sid, {})
        rec["checked"] = iso(now)
        rec["ok"] = st["ok"]
        if st["ok"]:
            rec.update(lastOk=iso(now), http=st.get("http"), fails=0)
            rec.pop("error", None)
        else:
            rec.update(error=st["error"], fails=rec.get("fails", 0) + 1)
    counts = Counter(i["sid"] for i in heads)
    latest: dict[str, str] = {}
    for i in heads:
        latest[i["sid"]] = max(latest.get(i["sid"], ""), i["date"])

    index = {
        "schema": SCHEMA, "generatedAt": iso(now), "retentionDays": retention,
        "months": [{"id": m, "count": len(by_month[m])} for m in sorted(by_month, reverse=True)],
        "stats": {"items": len(heads), "merged": dups, "newThisRun": len(kept), "gated": gated,
                  "genericImagesDropped": generic,
                  "sourcesOk": sum(1 for s in status.values() if s["ok"]),
                  "sourcesFailed": sum(1 for s in status.values() if not s["ok"]),
                  "seconds": round(time.time() - t0)},
        "categories": dict(Counter(i["category"] for i in heads)),
        "sources": [{k: s[k] for k in ("id", "name", "home", "category", "type", "weight", "award", "note")
                     if k in s} | {"status": ss.get(s["id"], {}), "items": counts.get(s["id"], 0),
                                   "latest": latest.get(s["id"])}
                    for s in cfg["sources"]],
        "manual": cfg.get("manual", []),
        "trends": tr["trends"], "signals": tr["signals"], "baseline": tr["baseline"],
        "colourBar": bar,
    }

    # pulizia stato
    for k in [k for k, v in rejected.items() if now - _dt(v["at"]) > timedelta(days=retention)]:
        del rejected[k]
    for sid, seen in state.get("pageSeen", {}).items():
        for u in [u for u, t in seen.items() if now - _dt(t) > timedelta(days=200)]:
            del seen[u]

    if not args.dry_run:
        ARCH.mkdir(parents=True, exist_ok=True)
        written = 0
        for m, its in by_month.items():
            its.sort(key=lambda x: x["date"], reverse=True)
            text = '{"schema":%d,"month":"%s","items":[\n%s\n]}\n' % (SCHEMA, m, ",\n".join(dump(i) for i in its))
            p = ARCH / f"{m}.json"
            if not p.exists() or p.read_text(encoding="utf-8") != text:
                p.write_text(text, encoding="utf-8")
                written += 1
        for p in ARCH.glob("*.json"):
            if p.stem not in by_month:
                p.unlink()
        (DATA / "index.json").write_text(dump(index) + "\n", encoding="utf-8")
        (DATA / "state.json").write_text(dump(state) + "\n", encoding="utf-8")
        log(f"scritti {written} mesi + index.json + state.json")

    log("")
    log(f"{'fonte':20} {'stato':6} {'item':>5}  nota")
    for s in cfg["sources"]:
        st = status.get(s["id"])
        if not st:
            continue
        note = st.get("error") or st.get("note") or ""
        log(f"{s['id']:20} {'ok' if st['ok'] else 'ERR':6} {st['items']:>5}  {note}")
    log("")
    log(f"card nel feed {len(heads)} (+{len(pcards)} palette) · cluster uniti {dups} · trend {len(tr['trends'])} "
        f"· baseline {'ok' if tr['baseline']['ok'] else 'in costruzione'} · {time.time() - t0:.0f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
