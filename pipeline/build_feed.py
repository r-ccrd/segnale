#!/usr/bin/env python3
"""DSGNBRD · pipeline completa.

FEEDS → NORMALIZZAZIONE → QUALITY GATE → DEDUP → ARRICCHIMENTO → CLASSIFICAZIONE
      → CLUSTER CROSS-FONTE → RANKING → TREND → data/*.json

Le prime quattro fasi girano in flusso: appena una fonte ha finito, i suoi item nuovi passano il filtro
e vanno subito in arricchimento, mentre le fonti lente (crawl-delay di 10 s) continuano a leggere.

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
from describe import describe  # noqa: E402
from classify import FontRadar, classify, cluster_duplicates, item_id, quality_gate  # noqa: E402
from enrich import enrich_item, retry_image  # noqa: E402
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


IMG_RETRIES = 3           # nuovi tentativi per un'immagine non scaricata (entro IMG_RETRY_DAYS)
IMG_RETRY_DAYS = 5
BLOCKED = re.compile(r"HTTPError: (401|403|429|451)\b")
BLOCK_RUNS = 6            # giri falliti di fila con "non vuoi me" prima di rallentare
BLOCK_PAUSE = timedelta(hours=24)


def blocked_pause(rec: dict | None, now: datetime) -> str | None:
    """Fonte che ci blocca da BLOCK_RUNS giri (403/401/429/451): la si riprova una volta al giorno,
    invece di bussare a ogni giro. Ritorna la data del prossimo tentativo, o None se va letta."""
    if not rec or rec.get("ok") or rec.get("fails", 0) < BLOCK_RUNS:
        return None
    if not BLOCKED.search(rec.get("error", "")) or not rec.get("checked"):
        return None
    nxt = _dt(rec["checked"]) + BLOCK_PAUSE
    return iso(nxt) if now < nxt else None


def missing_images(store: dict[str, dict], state: dict, now: datetime) -> list[dict]:
    """Item recenti rimasti senza immagine per un errore temporaneo (timeout, server giù in quel giro):
    fino a IMG_RETRIES nuovi tentativi nei primi IMG_RETRY_DAYS giorni. Prima restavano senza foto per sempre."""
    tries = state.setdefault("imgRetry", {})
    todo = []
    for it in store.values():
        if it.get("image") or it.get("font") or it.get("type") or not it.get("images"):
            continue
        if now - _dt(it.get("seen") or it["date"]) > timedelta(days=IMG_RETRY_DAYS):
            continue
        n = tries.get(it["id"], 0)
        if n >= IMG_RETRIES:
            continue
        tries[it["id"]] = n + 1
        todo.append(it)
    for k in [k for k in tries if k not in store]:
        del tries[k]
    return todo


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
    log(f"DSGNBRD · {iso(now)} · archivio {len(store)} item · fonti attive {len(active)}")

    # 1-3 ── FETCH → QUALITY GATE + DEDUP → ARRICCHIMENTO, in flusso
    # (una fonte rotta non blocca le altre; gli item nuovi si arricchiscono mentre le fonti lente leggono ancora)
    status: dict[str, dict] = {}
    ss = state.setdefault("sourceStatus", {})
    fresh: list[dict] = []
    raw_n, gated, paused = 0, 0, []
    enrich_pool = None if args.no_enrich else ThreadPoolExecutor(max_workers=args.workers)
    enrich_futs = []

    def job(it: dict) -> dict:
        src = all_sources[it["sid"]]
        return enrich_item(it, delay=float(src.get("crawlDelay", 0)), now=now, og=src["type"] != "page")

    retry = [] if args.no_enrich else missing_images(store, state, now)
    retry_futs = [enrich_pool.submit(retry_image, it) for it in retry] if enrich_pool else []

    def admit(items: list[dict]) -> None:
        nonlocal gated
        for it in items:
            k = it["key"]
            if k in known:
                continue
            rej = rejected.get(k)
            if rej and not (rej.get("retry") and now - _dt(rej["at"]) > timedelta(days=1)):
                continue
            if not quality_gate(it, all_sources[it["sid"]]):
                rejected[k] = {"at": iso(now), "why": "quality"}
                gated += 1
                continue
            it["id"] = item_id(k)
            it["seen"] = iso(now)
            known[k] = it["id"]
            fresh.append(it)
            if enrich_pool:
                enrich_futs.append(enrich_pool.submit(job, it))

    def timed(fetcher, s: dict):
        t = time.time()
        items, st = fetcher(s, state, now, retention)
        st["ms"] = round((time.time() - t) * 1000)
        return items, st

    t1 = time.time()
    todo = []
    for s in active:
        nxt = None if args.only else blocked_pause(ss.get(s["id"]), now)
        if nxt:
            paused.append((s["id"], nxt))
        else:
            todo.append(s)
    with ThreadPoolExecutor(max_workers=16) as ex:
        futs = {ex.submit(timed, FETCHERS[s["type"]], s): s for s in todo}
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
            raw_n += len(items)
            admit(items)
    t_fetch = time.time() - t1
    log(f"grezzi {raw_n} · nuovi {len(fresh)} · scartati dal quality gate {gated} · fonti lette in {t_fetch:.0f}s")

    if enrich_pool:
        for f in enrich_futs:
            f.result()
        recovered = sum(1 for f in retry_futs if f.result())
        enrich_pool.shutdown()
        for it in retry:
            if it.get("image"):
                state["imgRetry"].pop(it["id"], None)
        log(f"arricchiti {len(fresh)} item (finito {time.time() - t1 - t_fetch:.0f}s dopo le fonti)"
            + (f" · immagini recuperate {recovered}/{len(retry)}" if retry else ""))

    # 4 ── CLASSIFICAZIONE + FONT + controllo contesto
    explicit = sorted({f for it in list(store.values()) + fresh for f in (it.get("fonts") or [])})
    radar = FontRadar(state.get("gfCatalog", []), explicit)
    cut = now - timedelta(days=retention)
    kept = []
    for it in fresh:
        if _dt(it["date"]) < cut:
            # la pagina ha rivelato una data più vecchia dell'archivio: prima l'item veniva salvato, cancellato
            # subito dalla retention e poi riscaricato e rianalizzato a ogni giro
            rejected[it["key"]] = {"at": iso(now), "why": "old"}
            continue
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
            state.setdefault("imgRetry", {})[i["id"]] = IMG_RETRIES   # tolta apposta: da non "recuperare"

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
    pcards = trends.palette_cards(items)
    # descrizione breve delle card (soggetto + tipo), ricalcolata a ogni run:
    # quando le regole migliorano, valgono anche per tutto l'archivio
    for it in items:
        d = describe(it)
        it["short"] = {"s": d["s"], "k": d["k"]}
    for pc in pcards:
        src = store.get(pc.get("derivedFrom") or pc["id"][2:])
        pc["short"] = {"s": ((src or {}).get("short") or {}).get("s") or pc["title"], "k": "Palette"}

    # 7 ── SCRITTURA: partizioni mensili (una riga per item = diff git leggibili)
    by_month: dict[str, list[dict]] = defaultdict(list)
    for it in items + pcards:
        by_month[it["date"][:7]].append(slim(it))
    heads = [i for i in items if not i.get("dupOf")]
    for sid, st in status.items():
        rec = ss.setdefault(sid, {})
        rec["checked"] = iso(now)
        rec["ok"] = st["ok"]
        if st["ok"]:
            rec.update(lastOk=iso(now), http=st.get("http"), fails=0)
            rec.pop("error", None)
        else:
            rec.update(error=st["error"], fails=rec.get("fails", 0) + 1)
    for sid, nxt in paused:
        ss.setdefault(sid, {})["pausedUntil"] = nxt
    for sid in status:
        ss.get(sid, {}).pop("pausedUntil", None)
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
                  "sourcesPaused": len(paused),
                  "seconds": round(time.time() - t0)},
        "categories": dict(Counter(i["category"] for i in heads)),
        "sources": [{k: s[k] for k in ("id", "name", "home", "category", "type", "weight", "award", "note")
                     if k in s} | {"status": ss.get(s["id"], {}), "items": counts.get(s["id"], 0),
                                   "latest": latest.get(s["id"])}
                    for s in cfg["sources"] if not s.get("disabled")],
        "manual": cfg.get("manual", []),
        "trends": tr["trends"], "signals": tr["signals"], "baseline": tr["baseline"],
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
    log(f"{'fonte':20} {'stato':6} {'item':>5} {'tempo':>6}  nota")
    pause_of = dict(paused)
    for s in cfg["sources"]:
        st = status.get(s["id"])
        if s["id"] in pause_of:
            log(f"{s['id']:20} {'PAUSA':6} {0:>5} {'':>6}  ci blocca da {BLOCK_RUNS}+ giri: riprovo dal {pause_of[s['id']]}")
        if not st:
            continue
        note = st.get("error") or st.get("note") or ""
        log(f"{s['id']:20} {'ok' if st['ok'] else 'ERR':6} {st['items']:>5} {st.get('ms', 0) / 1000:5.1f}s  {note}")
    log("")
    log(f"card nel feed {len(heads)} (+{len(pcards)} palette) · cluster uniti {dups} · trend {len(tr['trends'])} "
        f"· baseline {'ok' if tr['baseline']['ok'] else 'in costruzione'} · {time.time() - t0:.0f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
