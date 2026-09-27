/* DSGNBRD · frontend (vanilla JS, nessuna dipendenza).
   Dati: data/index.json + data/archive/YYYY-MM.json, scritti dalla pipeline (GitHub Actions).
   Preferenze e salvati: localStorage, solo su questo dispositivo (export/import nel tab Saved). */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const SVGNS = 'http://www.w3.org/2000/svg';

function put(el, ...kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false || kid === '') continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'vars') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  return put(el, kids);
}
function icon(id) {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('class', 'ic');
  s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS(SVGNS, 'use');
  u.setAttribute('href', '#i-' + id);
  s.append(u);
  return s;
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const cap1 = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const motionOK = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;
function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* non supportato */ } }
function restart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

// localStorage con prefisso nuovo; legge anche le chiavi del vecchio nome, così salvati e preferenze non si perdono
const store = {
  get(k, d) {
    try {
      let v = localStorage.getItem('dsgnbrd:' + k);
      if (v == null) v = localStorage.getItem('segnale:' + k);
      return v == null ? d : JSON.parse(v);
    } catch { return d; }
  },
  set(k, v) { try { localStorage.setItem('dsgnbrd:' + k, JSON.stringify(v)); } catch { /* quota o modalità privata */ } },
};

const CATS = [
  ['all', 'All'], ['type', 'Typography'], ['branding', 'Branding'], ['web', 'Web'], ['uiux', 'UI/UX'],
  ['editorial', 'Editorial'], ['motion', 'Motion'], ['3d', '3D'], ['colour', 'Colour'],
  ['artdirection', 'Art direction'], ['illustration', 'Illustration'], ['packaging', 'Packaging'],
  ['tools', 'Tools'], ['trends', 'Trend alerts'],
];
const CAT_LABEL = Object.fromEntries(CATS);
const PREF_BOOST = { more: 12, normal: 0, less: -15, off: -999 };
const FLOOR = 26; // soglia di qualità nella vista All (si sposta con le preferenze apprese)

const S = {
  index: null, items: [], byId: new Map(), trendItems: [], months: [], loaded: new Set(), loading: false,
  view: 'feed', cat: 'all', period: 0, q: '', themePref: 'system',
  saved: store.get('saved', {}), hidden: new Set(store.get('hidden', [])), muted: new Set(store.get('muted', [])),
  prefs: store.get('prefs', {}), aff: store.get('aff', { cat: {}, src: {} }),
  since: null, srcNames: {}, groups: [], gi: 0, blocks: new Map(), renderedIds: new Set(), savedBlk: null,
  dlist: [], didx: 0, checkedAt: Date.now(), dirty: false, wheel: null,
};

const feedEl = $('#feed');
const trendEl = $('#trending');
const savedEl = $('#saved');
const statusEl = $('#status');
const sheet = $('#sheet');
const panel = $('#panel');

// ───────────────────────────────────────────── date
const fmtFull = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const fmtDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });
const fmtWeekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long' });
const fmtMonth = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fullDate = (iso) => fmtFull.format(new Date(iso));

function dayLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - date) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return fmtWeekday.format(date);
  return y === today.getFullYear() ? fmtDay.format(date) : fmtFull.format(date);
}
function rel(iso) {
  const t = Date.parse(iso);
  const m = Math.round((Date.now() - t) / 6e4);
  if (m < 1) return 'now';
  if (m < 60) return m + 'm';
  const hh = Math.round(m / 60);
  if (hh < 24) return hh + 'h';
  const d = Math.round(hh / 24);
  if (d < 7) return d + 'd';
  return fmtShort.format(t);
}
function dateLine(it) {
  const d = fullDate(it.date);
  const s = srcName(it.sid);
  if (it.type === 'trend') return 'First detected by DSGNBRD on ' + fullDate(it.firstDetected || it.date);
  switch (it.dateType) {
    case 'release': return (it.sid === 'googlefonts' ? 'Released on Google Fonts on ' : 'Released on ') + d;
    case 'project': return `Project published on ${d}, via ${s}`;
    case 'detected': return `First seen by DSGNBRD on ${d}. ${s} gives no publication date.`;
    default: return `Published by ${s} on ${d}`;
  }
}

// ───────────────────────────────────────────── helper
const srcName = (sid) => S.srcNames[sid] || sid || '';
const isNew = (it) => !!(S.since && it.seen && Date.parse(it.seen) > S.since);
function eff(it) {
  if (it.type === 'trend') return 90;
  const a = S.aff;
  return (it.score || 0) + 4 * (a.cat[it.category] || 0) + 3 * (a.src[it.sid] || 0) + (PREF_BOOST[S.prefs[it.category]] || 0);
}
// descrizione breve: soggetto + tipo (calcolata dalla pipeline); il titolo intero resta nella scheda
function shortOf(it) {
  if (it.type === 'trend') return { s: it.title, k: it.label };
  if (it.short && it.short.s) return it.short;
  return { s: it.title, k: CAT_LABEL[it.category] || '' };
}
function hay(it) {
  if (!it._h) {
    const sh = it.short || {};
    it._h = norm([it.title, sh.s, sh.k, it.summary, it.author, (it.tags || []).join(' '), (it.fonts || []).join(' '),
      srcName(it.sid), CAT_LABEL[it.category], it.matched, it.font && it.font.family].join(' '));
  }
  return it._h;
}
function findItem(id) {
  return S.byId.get(id) || S.trendItems.find((t) => t.id === id) || S.saved[id] || null;
}
function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let hh = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hh *= 60;
  }
  return [Math.round(hh), Math.round(s * 100), Math.round(l * 100)];
}
function inkOn(hex) { const [r, g, b] = hexRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.58 ? '#232220' : '#f3eee5'; }
function colCount() {
  const w = window.innerWidth;
  if (w < 1000) return 2;
  if (w < 1320) return 3;
  if (w < 1720) return 4;
  return 5;
}
function toast(msg, action, fn) {
  const t = $('#toast');
  const host = sheet.open ? sheet : panel.open ? panel : document.body;
  if (t.parentNode !== host) host.append(t);
  t.textContent = '';
  t.append(h('span', { text: msg }));
  if (action) t.append(h('button', { type: 'button', text: action, onclick: () => { t.classList.remove('on'); fn(); } }));
  t.classList.add('on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('on'), action ? 5000 : 1800);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = text;
    (sheet.open ? sheet : document.body).append(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* niente */ }
    ta.remove();
  }
  toast('Copied ' + text);
}

// ───────────────────────────────────────────── Google Fonts: anteprime vive, caricate solo quando servono
const gfCache = new Map();
function pickWeight(ws) {
  if (!ws || !ws.length) return null;
  if (ws.includes(400)) return 400;
  return ws.reduce((a, b) => (Math.abs(b - 450) < Math.abs(a - 450) ? b : a));
}
function loadGF(f, text) {
  const fam = f.family;
  const w = pickWeight(f.weights);
  const chars = [...new Set(text || fam)].join('');
  const key = `${fam}|${w}|${chars}`;
  if (gfCache.has(key)) return gfCache.get(key);
  const url = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(fam).replace(/%20/g, '+') +
    (w ? ':wght@' + w : '') + '&display=block&text=' + encodeURIComponent(chars);
  const p = new Promise((resolve) => {
    const link = h('link', { rel: 'stylesheet', href: url });
    link.onload = () => document.fonts.load(`${w || 400} 48px "${fam}"`, chars).then((r) => resolve(r.length > 0), () => resolve(false));
    link.onerror = () => resolve(false);
    document.head.append(link);
  });
  gfCache.set(key, p);
  return p;
}
const fontIO = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    fontIO.unobserve(e.target);
    const { fam, weights, text } = e.target._gf;
    loadGF({ family: fam, weights }, text).then((ok) => { e.target.classList.add('ready'); if (!ok) e.target.classList.add('nofont'); });
  }
}, { rootMargin: '600px 0px' });
function liveFont(el, f, text) {
  el.style.setProperty('--ff', `"${f.family}"`);
  el._gf = { fam: f.family, weights: f.weights, text };
  fontIO.observe(el);
  return el;
}

// ───────────────────────────────────────────── comparsa allo scroll (una volta per elemento)
let revealIO = null;
if ('IntersectionObserver' in window) {
  revealIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      revealIO.unobserve(e.target);
    }
  }, { rootMargin: '0px' });
}
function reveal(el, delay = 0) {
  if (!revealIO || !motionOK() || el.classList.contains('in')) return el;
  el.classList.add('rv');
  el.style.setProperty('--d', Math.round(delay) + 'ms');
  revealIO.observe(el);
  return el;
}

// ───────────────────────────────────────────── dati
async function getJSON(url, fresh) {
  const r = await fetch(url, { cache: fresh ? 'no-cache' : 'default' });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}
function addItems(list) {
  for (const it of list) {
    if (S.byId.has(it.id)) continue;
    it.tags = it.tags || []; it.fonts = it.fonts || []; it.categories = it.categories || [it.category];
    S.byId.set(it.id, it);
    S.items.push(it);
  }
}
async function loadMonth(m) {
  if (S.loaded.has(m)) return;
  const data = await getJSON(`data/archive/${m}.json`);
  addItems(data.items || []);
  S.loaded.add(m);
}
async function loadAll() {
  await Promise.all(S.months.filter((m) => !S.loaded.has(m)).map((m) => loadMonth(m).catch(() => null)));
}

// ───────────────────────────────────────────── filtro e raggruppamento per giorno
function visibleItems() {
  const now = Date.now();
  const maxAge = S.period ? S.period * 864e5 : Infinity;
  const q = S.q;
  const out = [];
  if (S.cat !== 'trends') {
    for (const it of S.items) {
      if (it.dupOf || S.hidden.has(it.id) || S.muted.has(it.sid)) continue;
      if (now - Date.parse(it.date) > maxAge) continue;
      if (S.cat === 'all') {
        if (S.prefs[it.category] === 'off') continue;
      } else if (S.cat === 'colour') {
        if (!(it.type === 'colour' || it.categories.includes('colour'))) continue;
      } else if (it.type === 'colour' || !it.categories.includes(S.cat)) continue;
      if (q && !hay(it).includes(q)) continue;
      if (S.cat === 'all' && !q && eff(it) < FLOOR && !S.saved[it.id]) continue;
      out.push(it);
    }
  }
  if (['all', 'trends', 'type', 'colour'].includes(S.cat)) {
    for (const t of S.trendItems) {
      if (S.cat === 'type' && t.family !== 'font') continue;
      if (S.cat === 'colour' && t.family !== 'colour') continue;
      if (now - Date.parse(t.date) > maxAge && S.cat !== 'trends') continue;
      if (q && !hay(t).includes(q)) continue;
      out.push(t);
    }
  }
  return out;
}
// ordina per rilevanza ma evita muri della stessa fonte: finestra di 12, penalità per fonte e categoria già viste
function diversify(list) {
  const out = [], bySrc = {}, byCat = {}, pool = list.slice();
  while (pool.length) {
    let best = 0, bestV = -Infinity;
    for (let i = 0; i < Math.min(pool.length, 12); i++) {
      const it = pool[i];
      const v = eff(it) - 7 * (bySrc[it.sid] || 0) - 3 * (byCat[it.category] || 0);
      if (v > bestV) { bestV = v; best = i; }
    }
    const [it] = pool.splice(best, 1);
    out.push(it);
    bySrc[it.sid] = (bySrc[it.sid] || 0) + 1;
    byCat[it.category] = (byCat[it.category] || 0) + 1;
  }
  return out;
}
function groupByDay(list) {
  const map = new Map();
  for (const it of list) {
    const k = dayKey(it.date);
    if (!map.has(k)) map.set(k, { day: k, items: [], trends: [], colours: [], lead: null, ii: 0 });
    const g = map.get(k);
    if (it.type === 'trend') g.trends.push(it);
    else if (it.type === 'colour' && S.cat === 'all') g.colours.push(it);
    else g.items.push(it);
  }
  const groups = [...map.values()].sort((a, b) => b.day.localeCompare(a.day));
  for (const g of groups) {
    g.items = diversify(g.items.sort((a, b) => eff(b) - eff(a) || b.date.localeCompare(a.date)));
    g.trends.sort((a, b) => (a.label === 'Detected trend' ? -1 : 0) - (b.label === 'Detected trend' ? -1 : 0) || b.count - a.count);
    if (g.colours.length) {
      g.colours.sort((a, b) => b.score - a.score);
      g.items.splice(Math.min(5, g.items.length), 0, g.colours[0]); // una palette al giorno nel feed generale
    }
    const top = g.items[0];
    if (top && top.image && !top.font && top.type !== 'colour' && g.items.length >= 5 && eff(top) >= 60) g.lead = g.items.shift();
    // una sola fascia trend per giorno: le altre diventano card nel mosaico, il feed resta un feed
    if (S.cat !== 'trends' && g.trends.length > 1) {
      g.trends.splice(1).forEach((t, k) => g.items.splice(Math.min(g.items.length, 3 + k * 5), 0, t));
    }
  }
  return groups;
}
function flatList() {
  const out = [];
  for (const g of S.groups) { out.push(...g.trends); if (g.lead) out.push(g.lead); out.push(...g.items); }
  return out;
}

// ───────────────────────────────────────────── card: foto + descrizione breve
function ariaFor(it) {
  const sh = shortOf(it);
  const bits = [sh.s];
  if (sh.k) bits.push(sh.k);
  if (it.title && norm(it.title) !== norm(sh.s)) bits.push(it.title);
  if (it.sid) bits.push('from ' + srcName(it.sid));
  return bits.join('. ');
}
function savedMark(it) { return S.saved[it.id] ? h('span', { class: 'mark', title: 'Saved' }, icon('save')) : null; }
function capEl(it) {
  const sh = shortOf(it);
  return h('div', { class: 'cap' }, h('div', {}, h('h3', { text: sh.s }), sh.k ? h('p', { text: sh.k }) : null), savedMark(it));
}
function openBtn(it, list) {
  return h('button', { class: 'open', type: 'button', 'aria-label': ariaFor(it), onclick: () => openDetail(it, list) });
}
function tile(it, cls, media, list) {
  return h('article', { class: 'tile' + (cls ? ' ' + cls : ''), 'data-id': it.id, 'data-sid': it.sid || '' }, media, capEl(it), openBtn(it, list));
}
function coverEl(it) {
  // immagine assente o bloccata: campo del colore dominante + palette, niente titolo (sta già nella didascalia)
  const pal = it.palette || [];
  const c0 = pal[0] ? pal[0].hex : null;
  const c = h('div', { class: 'cover', vars: c0 ? { '--c0': c0, '--ink': inkOn(c0) } : null }, h('small', { text: srcName(it.sid) }));
  if (pal.length > 1) {
    const st = h('div', { class: 'strip' });
    for (const p of pal) st.append(h('i', { vars: { '--c': p.hex, '--s': Math.max(p.share, 0.05) } }));
    c.append(st);
  }
  return c;
}
function mediaEl(it, fixed) {
  const m = h('div', { class: 'media', 'aria-hidden': 'true' });
  const pal = it.palette || [];
  if (pal[0]) m.style.setProperty('--ph', pal[0].hex);
  const img = it.image;
  if (img && img.src) {
    if (!fixed && img.w && img.h) m.style.setProperty('--ar', clamp(img.w / img.h, 0.66, 1.9).toFixed(3));
    const im = h('img', { alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', src: img.src });
    im.addEventListener('load', () => im.classList.add('ok'), { once: true });
    im.addEventListener('error', () => { im.remove(); m.append(coverEl(it)); }, { once: true });
    m.append(im);
  } else {
    if (!fixed) m.style.setProperty('--ar', '4 / 3');
    m.append(coverEl(it));
  }
  if (it.video) m.append(h('span', { class: 'play' }, icon('play')));
  return m;
}
function specimen(f, ar) {
  const text = f.family + 'Hamburgefonstiv 0123';
  const spec = liveFont(h('div', { class: 'spec' }, h('div', { class: 'big', text: f.family }), h('div', { class: 'line', text: 'Hamburgefonstiv 0123' })), f, text);
  return h('div', { class: 'media specimen', 'aria-hidden': 'true', vars: { '--ar': ar || '4 / 5' } }, spec);
}
function swatchMedia(pal, ar) {
  const m = h('div', { class: 'media swatches', 'aria-hidden': 'true', vars: { '--ar': ar || '5 / 4' } });
  for (const p of pal) m.append(h('i', { vars: { '--c': p.hex, '--s': Math.max(p.share, 0.06) } }));
  return m;
}
function cardEl(it, list) {
  if (it.type === 'trend') return trendTile(it, list);
  if (it.type === 'colour') return tile(it, 'colour', swatchMedia(it.palette), list);
  if (it.font) return tile(it, 'font', specimen(it.font), list);
  return tile(it, '', mediaEl(it), list);
}
function leadEl(it) { return tile(it, 'lead', mediaEl(it, true)); }
function labelEl(label) {
  return h('span', { class: 'label' + (label === 'Detected trend' ? ' detected' : '') }, h('i'), label);
}
function trendMeta(t) {
  const n = (t.sources || []).length;
  if (t.family === 'font') return `In ${plural(t.count || 0, 'project', 'projects')} from ${plural(n, 'source', 'sources')}`;
  return `${plural(t.count || 0, 'item', 'items')} from ${plural(n, 'source', 'sources')}, last 14 days`;
}
function evGrid(ev, n) {
  const g = h('div', { class: 'ev', 'aria-hidden': 'true' });
  for (const e of (ev || []).filter((x) => x.image).slice(0, n)) {
    const m = h('div', { class: 'm', vars: e.palette && e.palette[0] ? { '--ph': e.palette[0].hex } : null });
    const im = h('img', { alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', src: e.image.src });
    im.addEventListener('load', () => im.classList.add('ok'), { once: true });
    im.addEventListener('error', () => im.remove(), { once: true });
    m.append(im);
    g.append(m);
  }
  return g;
}
function trendVisual(t, n) {
  if (t.family === 'font') {
    const el = h('div', { class: 'fontprev', text: t.title });
    if (t.font && t.font.provider === 'google') liveFont(el, t.font, t.title);
    return el;
  }
  const wrap = h('div', { class: 'tvis' }, evGrid(t.evidence, n));
  if (t.swatches && t.swatches.length) wrap.append(h('div', { class: 'chips' }, t.swatches.slice(0, 5).map((c) => h('i', { vars: { '--c': c } }))));
  return wrap;
}
function trendBand(t) {
  return h('article', { class: 'tile band', 'data-id': t.id },
    h('div', {}, labelEl(t.label), h('h3', { text: t.title }), h('p', { text: trendMeta(t) })),
    trendVisual(t, 4), openBtn(t));
}
function trendTile(t, list) {
  return h('article', { class: 'tile ttile', 'data-id': t.id },
    labelEl(t.label), h('h3', { text: t.title }), h('p', { class: 'tt-meta', text: trendMeta(t) }),
    trendVisual(t, 4), openBtn(t, list));
}

// ───────────────────────────────────────────── mosaico per giorno
function setCols(blk) {
  const n = colCount();
  blk.n = n; blk.width = window.innerWidth; blk.cols.textContent = ''; blk.heights = new Array(n).fill(0); blk.colEls = [];
  for (let i = 0; i < n; i++) { const c = h('div', { class: 'col' }); blk.cols.append(c); blk.colEls.push(c); }
}
function place(blk, card) {
  let k = 0;
  for (let i = 1; i < blk.n; i++) if (blk.heights[i] < blk.heights[k] - 1) k = i;
  blk.colEls[k].append(card);
  blk.heights[k] += card.offsetHeight + 20;
  return k;
}
function makeBlock(g) {
  const all = [g.lead, ...g.items].filter((x) => x && x.type !== 'trend');
  const nNew = all.filter(isNew).length;
  const count = all.length ? plural(all.length, 'item', 'items') : plural(g.trends.length, 'pattern', 'patterns');
  const el = h('section', { class: 'day', 'data-day': g.day, 'aria-label': dayLabel(g.day) },
    h('header', { class: 'day-head' },
      h('h2', { text: dayLabel(g.day) }),
      h('p', {}, count, S.cat !== 'all' && S.cat !== 'trends' ? ' in ' + CAT_LABEL[S.cat] : '',
        nNew ? h('span', { class: 'new', text: `, ${nNew} new since your last visit` }) : null)));
  if (g.lead) { el.append(reveal(leadEl(g.lead))); S.renderedIds.add(g.lead.id); }
  for (const t of g.trends) { el.append(reveal(trendBand(t))); S.renderedIds.add(t.id); }
  const cols = h('div', { class: 'cols' });
  el.append(cols);
  const blk = { el, cols, cards: [] };
  setCols(blk);
  S.blocks.set(g.day, blk);
  return blk;
}
function renderMore(n = 30) {
  if (S.view !== 'feed') return;
  let budget = n;
  const list = flatList();
  while (budget > 0 && S.gi < S.groups.length) {
    const g = S.groups[S.gi];
    let blk = S.blocks.get(g.day);
    if (!blk) { blk = makeBlock(g); feedEl.append(blk.el); budget -= 2; }
    while (budget > 0 && g.ii < g.items.length) {
      const it = g.items[g.ii++];
      if (S.renderedIds.has(it.id)) continue;
      const c = cardEl(it, it.type === 'trend' ? list : undefined);
      blk.cards.push(c);
      const k = place(blk, c);
      reveal(c, k * 45);
      S.renderedIds.add(it.id);
      budget--;
    }
    if (g.ii >= g.items.length) S.gi++;
  }
  if (S.gi >= S.groups.length) loadOlder();
  else requestAnimationFrame(pump);
}
function pump() {
  if (S.view !== 'feed' || S.gi >= S.groups.length) return;
  if ($('#sentinel').getBoundingClientRect().top < window.innerHeight + 1400) renderMore(24);
}
async function loadOlder() {
  const next = S.months.find((m) => !S.loaded.has(m));
  if (!next) {
    statusEl.textContent = S.groups.length ? `That's everything from the last ${S.index ? S.index.retentionDays : 120} days.` : '';
    return;
  }
  if (S.loading) return;
  S.loading = true;
  const label = fmtMonth.format(new Date(next + '-15'));
  statusEl.textContent = `Loading ${label}…`;
  try {
    await loadMonth(next);
  } catch {
    S.loading = false;
    statusEl.textContent = `Couldn't load ${label}. Scroll again to retry.`;
    return;
  }
  S.loading = false;
  statusEl.textContent = '';
  mergeGroups();
  renderMore(24);
}
function mergeGroups() {
  const groups = groupByDay(visibleItems());
  for (const g of groups) {
    if (S.blocks.has(g.day) && g.lead && !S.renderedIds.has(g.lead.id)) { g.items.unshift(g.lead); g.lead = null; }
  }
  S.groups = groups;
  S.gi = 0;
  if (groups.length) { const e = $('.empty', feedEl); if (e) e.remove(); }
}
function relayout() {
  const n = colCount();
  const blocks = [...S.blocks.values()];
  if (S.savedBlk) blocks.push(S.savedBlk);
  for (const blk of blocks) {
    if (blk.n === n && Math.abs(blk.width - window.innerWidth) < 40) continue;
    setCols(blk);
    for (const c of blk.cards) place(blk, c);
  }
}
function removeCards(pred) {
  for (const blk of S.blocks.values()) {
    const before = blk.cards.length;
    blk.cards = blk.cards.filter((c) => !pred(c.dataset));
    if (blk.cards.length !== before) { setCols(blk); for (const c of blk.cards) place(blk, c); }
  }
  $$('.lead, .band', feedEl).forEach((n) => { if (pred(n.dataset)) n.remove(); });
}
function emptyState() {
  const cat = CAT_LABEL[S.cat];
  const per = { 1: 'the last 24 hours', 7: 'the last 7 days', 30: 'the last 30 days' }[S.period];
  let title = 'Nothing to show yet';
  let text = 'The feed fills up every time the update runs. Check the Sources panel to see what was read.';
  let action = null;
  if (S.q) {
    title = `No results for "${$('#q').value}"`;
    text = 'Search looks at titles, studios, typefaces, tags and sources. Try a shorter word.';
    action = h('button', { class: 'btn', type: 'button', text: 'Clear search', onclick: () => closeSearch(true) });
  } else if (S.cat === 'trends') {
    title = 'No trend alerts yet';
    text = 'A pattern needs at least four items from three independent sources before DSGNBRD flags it (three from two once it can measure growth). The Trending tab also shows the weaker signals.';
    action = h('button', { class: 'btn', type: 'button', text: 'Open Trending', onclick: () => setView('trending') });
  } else if (per) {
    title = S.cat === 'all' ? `Nothing new in ${per}` : `Nothing in ${cat} for ${per}`;
    text = 'Widen the period to see earlier items.';
    action = h('button', { class: 'btn', type: 'button', text: 'Show everything', onclick: () => setPeriod(0) });
  } else if (S.cat !== 'all') {
    title = `Nothing in ${cat} right now`;
    text = S.prefs[S.cat] === 'off' ? `${cat} is turned off in your preferences.` : 'No source has published in this category within the archive window.';
    action = h('button', { class: 'btn', type: 'button', text: 'Show all categories', onclick: () => setCat('all') });
  }
  return h('div', { class: 'empty' }, h('h2', { text: title }), h('p', { text }), action);
}
function rebuild(keepScroll) {
  S.blocks = new Map();
  S.renderedIds = new Set();
  S.groups = groupByDay(visibleItems());
  S.gi = 0;
  feedEl.textContent = '';
  statusEl.textContent = '';
  if (!S.groups.length) feedEl.append(emptyState());
  renderMore(36);
  if (!keepScroll) window.scrollTo(0, 0);
}

// ───────────────────────────────────────────── dettaglio / focus
function listForView() {
  if (S.view === 'saved') return savedList();
  if (S.view === 'feed') return flatList();
  return [];
}
function openDetail(it, list) {
  S.dlist = list && list.length ? list : listForView();
  S.didx = S.dlist.findIndex((x) => x.id === it.id);
  if (S.didx < 0) { S.dlist = [it]; S.didx = 0; }
  renderDetail(0);
  if (!sheet.open) {
    sheet.classList.remove('closing');
    sheet.showModal();
    history.pushState({ sheet: 1 }, '', '#' + encodeURIComponent(it.id));
    const t = $('#sheetBody h2');
    if (t) t.focus({ preventScroll: true });
  } else {
    history.replaceState({ sheet: 1 }, '', '#' + encodeURIComponent(it.id));
  }
  learn(it, 0.2);
}
function closeDialog(dlg) {
  if (!dlg.open || dlg.classList.contains('closing')) return;
  if (!motionOK()) { dlg.close(); return; }
  dlg.classList.add('closing');
  setTimeout(() => { dlg.classList.remove('closing'); if (dlg.open) dlg.close(); }, 190);
}
const closeSheet = () => closeDialog(sheet);
function step(d) {
  const n = S.didx + d;
  if (n < 0 || n >= S.dlist.length) return;
  S.didx = n;
  renderDetail(d);
  history.replaceState({ sheet: 1 }, '', '#' + encodeURIComponent(S.dlist[n].id));
}
function stageFor(it) {
  const stage = h('div', { class: 'stage' });
  const pal = it.palette || [];
  if (pal[0]) stage.style.background = pal[0].hex;
  if (it.type === 'trend') {
    const grid = h('div', { class: 'grid' });
    const evIds = (it.evidence || []).map((e) => e.id);
    for (const e of it.evidence || []) {
      const b = h('button', {
        type: 'button', 'aria-label': 'Open ' + e.title, vars: e.palette && e.palette[0] ? { '--ph': e.palette[0].hex } : null,
        onclick: () => {
          const full = S.byId.get(e.id);
          if (full) openDetail(full, evIds.map((id) => S.byId.get(id)).filter(Boolean));
          else window.open(e.url, '_blank', 'noopener');
        },
      });
      if (e.image) b.append(h('img', { alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', src: e.image.src }));
      b.append(h('span', { text: e.title }));
      grid.append(b);
    }
    stage.style.background = '';
    stage.append(grid);
  } else if (it.type === 'colour') {
    const sw = h('div', { class: 'swatches' });
    for (const p of it.palette) sw.append(h('i', { vars: { '--c': p.hex, '--s': Math.max(p.share, 0.06) } }));
    stage.append(sw);
  } else if (it.font) {
    stage.style.background = '';
    const spec = h('div', { class: 'spec ready' }, h('div', { class: 'big', text: it.font.family }),
      h('div', { class: 'line', text: 'The quick brown fox jumps over the lazy dog 0123456789' }));
    spec.style.setProperty('--ff', `"${it.font.family}"`);
    loadGF(it.font, it.font.family + 'The quick brown fox jumps over the lazy dog 0123456789');
    stage.append(spec);
  } else if (it.image && it.image.src) {
    const im = h('img', { alt: it.title, decoding: 'async', referrerpolicy: 'no-referrer', src: it.image.src });
    im.addEventListener('load', () => im.classList.add('ok'), { once: true });
    im.addEventListener('error', () => { im.remove(); stage.append(coverEl(it)); }, { once: true });
    stage.append(im);
    if (it.video) {
      stage.append(h('button', {
        class: 'playbig', type: 'button', 'aria-label': 'Play video',
        onclick: () => {
          const v = it.video;
          stage.textContent = '';
          stage.append(h('iframe', {
            src: v.embed + (v.embed.includes('?') ? '&' : '?') + 'autoplay=1', title: it.title,
            allow: 'autoplay; fullscreen; picture-in-picture', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin',
          }));
        },
      }, icon('play')));
    }
  } else {
    stage.append(coverEl(it));
  }
  if (S.dlist.length > 1) {
    stage.append(
      h('button', { class: 'nav prev', type: 'button', 'aria-label': 'Previous', disabled: S.didx === 0, onclick: () => step(-1) }, icon('prev')),
      h('button', { class: 'nav next', type: 'button', 'aria-label': 'Next', disabled: S.didx >= S.dlist.length - 1, onclick: () => step(1) }, icon('next')));
  }
  let x0 = null, y0 = 0;
  stage.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; });
  stage.addEventListener('pointerup', (e) => {
    if (x0 == null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
  });
  return stage;
}
function block(title, ...content) {
  const kids = content.flat().filter(Boolean);
  return kids.length ? h('section', { class: 'blk' }, h('h3', { text: title }), kids) : null;
}
function paletteBlock(pal) {
  if (!pal || !pal.length) return null;
  return h('div', { class: 'pal' }, pal.map((p) => {
    const rgb = hexRgb(p.hex);
    const [hh, s, l] = rgbHsl(rgb);
    return h('button', { type: 'button', 'aria-label': 'Copy ' + p.hex, onclick: () => copy(p.hex) },
      h('i', { vars: { '--c': p.hex } }),
      h('span', {}, p.hex, h('small', { text: `  RGB ${rgb.join(' ')}   HSL ${hh} ${s}% ${l}%` })),
      p.share ? h('em', { text: Math.round(p.share * 100) + '%' }) : h('em'));
  }));
}
function fontTagline(f) {
  const bits = [f.category ? cap1(f.category.replace(/_/g, ' ').toLowerCase()) : 'Typeface'];
  const axes = (f.axes || []).map((a) => a.tag).filter(Boolean);
  if (axes.length) bits.push('variable ' + axes.join(', '));
  else if (f.weights && f.weights.length > 1) bits.push(`${f.weights[0]} to ${f.weights[f.weights.length - 1]}`);
  if (f.italic) bits.push('with italics');
  return bits.join(', ');
}
function fontFacts(f) {
  const rows = [];
  if (f.designers && f.designers.length) rows.push('Designed by ' + f.designers.join(', '));
  if (f.category || (f.axes && f.axes.length) || (f.weights && f.weights.length)) rows.push(fontTagline(f));
  if (f.axes && f.axes.length) rows.push('Axes: ' + f.axes.map((a) => `${a.tag} ${a.min} to ${a.max}`).join(', '));
  if (f.styles) rows.push(plural(f.styles, 'style', 'styles'));
  if (f.dateAdded) rows.push('Added to Google Fonts on ' + fullDate(f.dateAdded));
  if (f.lastModified && f.lastModified !== f.dateAdded) rows.push('Last updated ' + fullDate(f.lastModified));
  if (f.trending) rows.push(`Trending rank #${f.trending} on Google Fonts`);
  if (f.popularity) rows.push(`Popularity rank #${f.popularity} on Google Fonts`);
  if (!rows.length) rows.push(f.provider === 'google' ? 'On Google Fonts' : 'Commercial or independent typeface: no live preview here');
  return h('ul', { class: 'reasons' }, rows.map((r) => h('li', { text: r })));
}
function srcList(sids, n = 5) {
  const names = (sids || []).map(srcName);
  return names.length > n ? names.slice(0, n).join(', ') + ` and ${names.length - n} more` : names.join(', ');
}
function renderDetail(dir) {
  const it = S.dlist[S.didx];
  const body = $('#sheetBody');
  body.textContent = '';
  body.classList.remove('from-r', 'from-l');
  if (dir && motionOK()) { void body.offsetWidth; body.classList.add(dir > 0 ? 'from-r' : 'from-l'); }
  const sh = shortOf(it);
  const info = h('div', { class: 'info' });
  put(info, h('button', { class: 'icon close', type: 'button', 'aria-label': 'Close', onclick: closeSheet }, icon('close')));
  if (S.dlist.length > 1) put(info, h('p', { class: 'pos', text: `${S.didx + 1} of ${S.dlist.length}` }));
  if (it.type === 'trend') put(info, labelEl(it.label));
  else if (sh.k) put(info, h('p', { class: 'kind', text: sh.k }));
  const title = h('h2', { tabindex: '-1', text: it.type === 'colour' ? 'Palette from ' + it.title : it.title });
  put(info, title);
  if (it.author && it.type !== 'trend') put(info, h('p', { class: 'by', text: it.author }));
  put(info, h('p', { class: 'when', text: dateLine(it) }));
  if (it.summary) put(info, h('p', { class: 'summary', text: it.summary }));

  if (it.type === 'trend') {
    put(info,
      block('How it was detected',
        h('ul', { class: 'reasons' },
          h('li', { text: it.basis === 'growth' ? 'Measured growth against the previous weeks.' : 'Recurrence across independent sources. Growth is not measured yet.' }),
          it.matched ? h('li', { text: 'Words that matched: ' + it.matched }) : null,
          h('li', { text: 'Sources: ' + srcList(it.sources, 12) }))),
      block('Evidence', h('ul', { class: 'reasons' }, (it.evidence || []).map((e) =>
        h('li', {}, h('a', { href: e.url, target: '_blank', rel: 'noopener noreferrer', text: e.title }), ` (${srcName(e.sid)}, ${fmtShort.format(new Date(e.date))})`)))),
      it.font ? block('Typeface', fontFacts(it.font)) : null,
      it.swatches ? block('Colours', paletteBlock(it.swatches.map((hex) => ({ hex, share: 0 })))) : null,
      it.id.startsWith('sig-') ? null : h('div', { class: 'actions' }, detailSave(it)));
  } else {
    put(info, h('div', { class: 'actions' },
      h('a', { class: 'btn primary', href: it.url, target: '_blank', rel: 'noopener noreferrer', onclick: () => learn(it, 0.5) }, 'Open original', icon('out')),
      it.id.startsWith('gf-') ? null : detailSave(it),
      it.sid && !it.id.startsWith('gf-') ? h('button', { class: 'btn', type: 'button', onclick: () => hideItem(it) }, icon('hide'), 'Hide') : null,
      it.sid ? h('button', { class: 'btn', type: 'button', onclick: () => muteSource(it.sid) }, icon('mute'), 'Mute ' + srcName(it.sid)) : null));
    const reasons = (it.reasons && it.reasons.length ? it.reasons : [it.why]).filter(Boolean);
    put(info,
      block('Why it is here', h('ul', { class: 'reasons' }, reasons.map((r) => h('li', { text: r })))),
      it.font ? block('Typeface', fontFacts(it.font)) : null,
      block('Palette', paletteBlock(it.palette)),
      it.fonts && it.fonts.length && !it.font ? block('Typefaces', h('div', { class: 'fontlist' }, it.fonts.map((f) => h('div', { class: 'row' }, h('span', { text: f }))))) : null,
      it.tags && it.tags.length ? block('Tags', h('div', { class: 'tags' }, it.tags.map((t) => h('button', { type: 'button', text: t, onclick: () => searchFor(t) })))) : null,
      it.alsoOn && it.alsoOn.length ? block('Also covered by', h('div', { class: 'also' }, h('ul', {}, it.alsoOn.map((a) =>
        h('li', {}, h('a', { href: a.url, target: '_blank', rel: 'noopener noreferrer', text: srcName(a.sid) }), ', ' + fullDate(a.date)))))) : null,
      it.images && it.images.length ? block('More images', h('div', { class: 'thumbs' }, it.images.map((u) => {
        const im = h('img', { alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', src: u });
        im.addEventListener('error', () => im.remove(), { once: true });
        return im;
      }))) : null,
      it.sid ? h('p', { class: 'srcline' }, 'Source → ', h('a', { href: it.url, target: '_blank', rel: 'noopener noreferrer', text: srcName(it.sid) })) : null);
  }
  body.append(stageFor(it), info);
  info.scrollTop = 0;
  body.scrollTop = 0;
  if (sheet.open) title.focus({ preventScroll: true });
}
function detailSave(it) {
  const on = !!S.saved[it.id];
  return h('button', { class: 'btn', type: 'button', 'data-save': it.id, 'aria-pressed': String(on), onclick: () => toggleSave(it) },
    icon('save'), h('span', { class: 'lbl', text: on ? 'Saved' : 'Save' }));
}
function searchFor(term) {
  if (sheet.open) sheet.close();
  openSearch(true);
  $('#q').value = term;
  S.q = norm(term);
  loadAll().then(() => { if (S.view !== 'feed') setView('feed'); rebuild(); });
}

// ───────────────────────────────────────────── azioni + apprendimento
function learn(it, w) {
  if (!it || it.type === 'trend' || !it.category) return;
  const a = S.aff;
  a.cat[it.category] = clamp((a.cat[it.category] || 0) + w, -6, 6);
  a.src[it.sid] = clamp((a.src[it.sid] || 0) + w * 0.6, -6, 6);
  store.set('aff', a);
}
function syncSave(id, animate) {
  if (id) {
    const on = !!S.saved[id];
    for (const b of $$(`[data-save="${CSS.escape(id)}"]`)) {
      b.setAttribute('aria-pressed', String(on));
      const l = $('.lbl', b);
      if (l) l.textContent = on ? 'Saved' : 'Save';
    }
    for (const t of $$(`.tile[data-id="${CSS.escape(id)}"]`)) {
      const cap = $(':scope > .cap', t);
      if (cap) {
        const m = $('.mark', cap);
        if (on && !m) cap.append(h('span', { class: 'mark', title: 'Saved' }, icon('save')));
        if (!on && m) m.remove();
      }
      if (animate && motionOK()) restart(t, 'pop');
    }
  }
  const n = Object.keys(S.saved).length;
  const c = $('#savedCount');
  const txt = n ? String(n) : '';
  if (c.textContent !== txt) {
    c.textContent = txt;
    if (animate && motionOK()) restart(c, 'bump');
  }
}
function toggleSave(it) {
  const was = !!S.saved[it.id];
  if (was) {
    delete S.saved[it.id];
  } else {
    const snap = { ...it, savedAt: new Date().toISOString() };
    delete snap._h;
    S.saved[it.id] = snap;
    learn(it, 1);
  }
  store.set('saved', S.saved);
  syncSave(it.id, true);
  toast(was ? 'Removed from saved' : 'Saved', 'Undo', () => toggleSave(it));
  if (S.view === 'saved' && !sheet.open) renderSaved();
}
function hideItem(it) {
  S.hidden.add(it.id);
  store.set('hidden', [...S.hidden]);
  learn(it, -1);
  removeCards((d) => d.id === it.id);
  if (sheet.open) {
    S.dlist.splice(S.didx, 1);
    if (S.dlist.length) { S.didx = Math.min(S.didx, S.dlist.length - 1); renderDetail(0); } else closeSheet();
  }
  toast('Hidden. You will see a bit less like this.', 'Undo', () => {
    S.hidden.delete(it.id);
    store.set('hidden', [...S.hidden]);
    learn(it, 1);
    rebuild(true);
  });
}
function muteSource(sid) {
  S.muted.add(sid);
  store.set('muted', [...S.muted]);
  if (sheet.open) closeSheet();
  removeCards((d) => d.sid === sid);
  toast(`Muted ${srcName(sid)}`, 'Undo', () => { S.muted.delete(sid); store.set('muted', [...S.muted]); rebuild(true); });
}

// ───────────────────────────────────────────── viste e filtri
function setView(v) {
  S.view = v;
  document.body.classList.remove('v-feed', 'v-trending', 'v-saved');
  document.body.classList.add('v-' + v);
  for (const b of $$('.views button')) b.setAttribute('aria-current', b.dataset.view === v ? 'page' : 'false');
  feedEl.hidden = v !== 'feed';
  trendEl.hidden = v !== 'trending';
  savedEl.hidden = v !== 'saved';
  $('#filters').hidden = v !== 'feed';
  statusEl.textContent = '';
  if (S.wheel) S.wheel.close();
  if (v === 'trending') renderTrending();
  if (v === 'saved') renderSaved();
  if (v === 'feed' && !S.blocks.size) rebuild();
  const sec = { feed: feedEl, trending: trendEl, saved: savedEl }[v];
  if (motionOK()) restart(sec, 'enter');
  window.scrollTo(0, 0);
}
function setPeriod(p) {
  S.period = p;
  for (const b of $$('#period button')) b.setAttribute('aria-pressed', String(Number(b.dataset.p) === p));
  rebuild();
}
function setCat(k) {
  S.cat = k;
  const label = CAT_LABEL[k];
  $('#catLbl').textContent = k === 'all' ? '' : label;
  $('#catHandle').setAttribute('aria-label', `Categories, showing ${k === 'all' ? 'everything' : label}. Hold and slide to choose, or press to open the wheel.`);
  const chip = $('#catChip');
  chip.hidden = k === 'all';
  $('.t', chip).textContent = label;
  chip.setAttribute('aria-label', `Showing ${label}. Remove this filter`);
  if (S.view !== 'feed') setView('feed');
  rebuild();
}
function savedList() {
  return Object.values(S.saved)
    .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''))
    .map((s) => S.byId.get(s.id) || S.trendItems.find((t) => t.id === s.id) || s);
}
function renderSaved() {
  savedEl.textContent = '';
  const list = savedList();
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: (e) => importData(e.target.files[0]) });
  savedEl.append(h('header', { class: 'saved-head' },
    h('h1', { text: 'Saved' }),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', type: 'button', text: 'Export', onclick: exportData }),
      h('button', { class: 'btn', type: 'button', text: 'Import', onclick: () => fileIn.click() }),
      list.length ? h('button', { class: 'btn', type: 'button', text: 'Clear all', onclick: clearSaved }) : null,
      fileIn),
    list.length ? h('p', { text: `${plural(list.length, 'item', 'items')} on this device. Long-press a card anywhere to save or remove it.` }) : null));
  S.savedBlk = null;
  if (!list.length) {
    savedEl.append(h('div', { class: 'empty' }, h('h2', { text: 'Nothing saved yet' }),
      h('p', { text: 'Long-press a card to keep it here, or use Save when a card is open. Saved items stay after they leave the feed, on this device. Export moves them to another device.' })));
    return;
  }
  const cols = h('div', { class: 'cols' });
  savedEl.append(cols);
  const blk = { el: savedEl, cols, cards: [] };
  setCols(blk);
  for (const it of list) { const c = cardEl(it, list); blk.cards.push(c); reveal(c, place(blk, c) * 45); }
  S.savedBlk = blk;
}
function exportData() {
  const data = { app: 'dsgnbrd', version: 1, exportedAt: new Date().toISOString(), saved: S.saved, hidden: [...S.hidden], muted: [...S.muted], prefs: S.prefs, aff: S.aff };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  const a = h('a', { href: url, download: `dsgnbrd-${dayKey(new Date().toISOString())}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Exported saved items and preferences');
}
async function importData(file) {
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (d.app !== 'dsgnbrd' && d.app !== 'segnale') throw new Error('not a DSGNBRD export');
    const before = Object.keys(S.saved).length;
    Object.assign(S.saved, d.saved || {});
    (d.hidden || []).forEach((x) => S.hidden.add(x));
    (d.muted || []).forEach((x) => S.muted.add(x));
    S.prefs = { ...(d.prefs || {}), ...S.prefs };
    store.set('saved', S.saved); store.set('hidden', [...S.hidden]); store.set('muted', [...S.muted]); store.set('prefs', S.prefs);
    syncSave('');
    renderSaved();
    toast(`Imported ${Object.keys(S.saved).length - before} saved items`);
  } catch (e) {
    toast("Couldn't import this file: " + e.message);
  }
}
function clearSaved() {
  const backup = S.saved;
  S.saved = {};
  store.set('saved', S.saved);
  syncSave('');
  renderSaved();
  toast('Cleared saved items', 'Undo', () => { S.saved = backup; store.set('saved', S.saved); syncSave(''); renderSaved(); });
}

// ───────────────────────────────────────────── Trending: sezioni nette con titoli grandi
function asTrend(t) { return { ...t, type: 'trend', date: t.firstDetected }; }
function pseudoTrend(id, label, title, summary, sources, evidence, extra) {
  return { id, type: 'trend', label, title, summary, sources, evidence, family: 'signal', basis: 'recurrence',
    firstDetected: S.index.generatedAt, date: S.index.generatedAt, count: evidence.length, ...extra };
}
function plainTile(id, media, title, sub, onOpen, cls) {
  return h('article', { class: 'tile' + (cls ? ' ' + cls : ''), 'data-id': id, 'data-nosave': '' }, media,
    h('div', { class: 'cap' }, h('div', {}, h('h3', { text: title }), sub ? h('p', { text: sub }) : null)),
    h('button', { class: 'open', type: 'button', 'aria-label': `${title}. ${sub || ''}`, onclick: onOpen }));
}
function swatchTile(pt, hexes, title, sub, showHex) {
  const m = h('div', { class: 'media swatchbox', 'aria-hidden': 'true', vars: { '--ar': '4 / 3' } },
    hexes.map((x) => h('i', { vars: { '--c': x } })),
    showHex ? h('span', { class: 'hex', vars: { '--ink': inkOn(hexes[0]) }, text: hexes[0].toUpperCase() }) : null);
  return plainTile(pt.id, m, title, sub, () => openDetail(pt, [pt]));
}
function jumpTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: motionOK() ? 'smooth' : 'auto', block: 'start' });
}
function renderTrending() {
  trendEl.textContent = '';
  const idx = S.index;
  if (!idx) return;
  const b = idx.baseline || {};
  const sig = idx.signals || {};
  const days = b.recentDays || 14;
  const secs = [];
  const stagger = (tiles) => tiles.map((t, i) => reveal(t, (i % 6) * 40));

  const active = (idx.trends || []).filter((t) => t.label !== 'Consolidated').map(asTrend);
  if (active.length) {
    secs.push({ id: 'patterns', title: 'Patterns', n: active.length,
      lede: 'Inferred automatically from what the sources publish. Every pattern lists the projects behind it.',
      body: h('div', { class: 'tgrid wide' }, stagger(active.map((t) => trendTile(t, active)))) });
  }
  const colours = (sig.colours || []).slice(0, 12);
  const pairs = (sig.pairs || []).slice(0, 4);
  if (colours.length || pairs.length) {
    const tiles = [
      ...colours.map((c) => {
        const title = cap1(c.bin);
        const pt = pseudoTrend('sig-col-' + c.bin, 'Colour signal', title, `${c.count} palettes from ${c.sources.length} sources in the last ${days} days.`,
          c.sources, c.evidence, { swatches: [c.hex], family: 'colour' });
        return swatchTile(pt, [c.hex], title, `${c.count} palettes, ${plural(c.sources.length, 'source', 'sources')}`, true);
      }),
      ...pairs.map((p) => {
        const title = cap1(p.bins.join(' + '));
        const pt = pseudoTrend('sig-pair-' + p.bins.join('-'), 'Recurring pairing', title, `Seen together in ${p.count} palettes from ${p.sources.length} sources.`,
          p.sources, p.evidence, { swatches: p.hex, family: 'colour' });
        return swatchTile(pt, p.hex, title, `Together in ${p.count} palettes`, false);
      }),
    ];
    secs.push({ id: 'colour', title: 'Colour', n: tiles.length,
      lede: 'Dominant colours from the lead image of each recent project, grouped by hue and tone. These are counts: a colour becomes a trend only once it can be compared with earlier weeks.',
      body: h('div', { class: 'tgrid' }, stagger(tiles)) });
  }
  const fonts = (sig.fonts || []).filter((f) => f.count >= 2).slice(0, 12);
  if (fonts.length) {
    const tiles = fonts.map((f) => {
      const pt = pseudoTrend('sig-font-' + f.family, f.new ? 'New release in use' : 'Recurring typeface', f.family,
        `Credited in ${f.count} recent projects from ${f.sources.length} sources.`, f.sources, f.evidence,
        { family: 'font', font: { family: f.family, provider: f.google ? 'google' : null } });
      const spec = h('div', { class: 'spec' + (f.google ? '' : ' nofont ready') }, h('div', { class: 'big', text: f.family }),
        h('div', { class: 'line', text: f.google ? 'Hamburgefonstiv 0123' : 'Preview not available' }));
      if (f.google) liveFont(spec, { family: f.family }, f.family + 'Hamburgefonstiv 0123');
      const media = h('div', { class: 'media specimen', 'aria-hidden': 'true', vars: { '--ar': '5 / 4' } }, spec);
      const sub = `In ${plural(f.count, 'project', 'projects')}, ${plural(f.sources.length, 'source', 'sources')}${f.new ? ', new on Google Fonts' : ''}`;
      return plainTile(pt.id, media, f.family, sub, () => openDetail(pt, [pt]), 'font');
    });
    secs.push({ id: 'typefaces', title: 'Typefaces', n: tiles.length,
      lede: 'Typefaces credited or named in recent projects (Fonts In Use, Typewolf, articles). Live previews load for Google Fonts families.',
      body: h('div', { class: 'tgrid' }, stagger(tiles)) });
  }
  const radar = (sig.radar || []).slice(0, 12);
  if (radar.length) {
    const tiles = radar.map((f) => {
      const url = 'https://fonts.google.com/specimen/' + encodeURIComponent(f.family).replace(/%20/g, '+');
      const item = S.items.find((x) => x.url === url) || {
        id: 'gf-' + f.family, sid: 'googlefonts', url, title: f.family, author: (f.designers || []).join(', '), date: f.dateAdded || S.index.generatedAt,
        dateType: 'release', category: 'type', categories: ['type'], kind: 'release', font: { ...f, provider: 'google' },
        reasons: [`Google Fonts trending rank #${f.trending}`], why: `Google Fonts trending rank #${f.trending}`,
      };
      const sub = `Trending #${f.trending}${f.dateAdded ? ', added ' + fmtShort.format(new Date(f.dateAdded)) : ''}`;
      return plainTile('r-' + f.family, specimen(f, '5 / 4'), f.family, sub, () => openDetail(item, [item]), 'font');
    });
    secs.push({ id: 'googlefonts', title: 'New on Google Fonts', n: tiles.length,
      lede: "Families added in the last year, ordered by Google Fonts' own trending rank. This is Google's usage data, not DSGNBRD's opinion.",
      body: h('div', { class: 'tgrid' }, stagger(tiles)) });
  }
  const cov = (sig.coverage || []).slice(0, 12);
  if (cov.length) {
    const tiles = cov.map((c) => {
      const it = S.byId.get(c.id);
      const base = it || { id: 'cov-' + c.id, title: c.title, image: c.image, sid: c.sid, url: c.url };
      const title = it ? shortOf(it).s : c.title;
      return plainTile('cov-' + c.id, mediaEl(base), title, `${c.sources.length} sources: ${srcList(c.sources, 3)}`,
        () => (it ? openDetail(it, [it]) : window.open(c.url, '_blank', 'noopener')));
    });
    secs.push({ id: 'coverage', title: 'Covered everywhere', n: tiles.length,
      lede: 'The same project published by several independent sources in the last three weeks.',
      body: h('div', { class: 'tgrid' }, stagger(tiles)) });
  }
  const ph = (sig.phrases || []).slice(0, 16);
  if (ph.length) {
    secs.push({ id: 'conversation', title: 'In the conversation', n: ph.length,
      lede: 'Word pairs that recur in titles across different sources. Raw frequency, useful for spotting events and subjects. Tap one to search it.',
      body: h('div', { class: 'phrases' }, ph.map((p) => h('button', { type: 'button', onclick: () => searchFor(p.phrase) }, p.phrase, h('small', { text: String(p.count) })))) });
  }
  const cons = (idx.trends || []).filter((t) => t.label === 'Consolidated').map(asTrend);
  if (cons.length) {
    secs.push({ id: 'consolidated', title: 'Consolidated', n: cons.length,
      lede: 'Still everywhere, but not new: present at a steady rate in both the recent window and the weeks before.',
      body: h('div', { class: 'tgrid wide' }, stagger(cons.map((t) => trendTile(t, cons)))) });
  }

  const lede = b.ok
    ? `Built from ${b.recentItems} items published in the last ${days} days, compared with ${b.baselineItems} items from the ${b.baseDays - days} days before.`
    : `Built from ${b.recentItems} items published in the last ${days} days. DSGNBRD measures growth once it has three weeks of its own history; until then a pattern means recurrence across independent sources, not proven growth.`;
  trendEl.append(h('header', { class: 'tr-head' }, h('h1', { text: 'Trending now' }), h('p', { text: lede }),
    secs.length > 1 ? h('nav', { class: 'tr-nav', 'aria-label': 'Sections' },
      secs.map((s) => h('button', { type: 'button', onclick: () => jumpTo('ts-' + s.id) }, s.title, h('small', { text: String(s.n) })))) : null));
  for (const s of secs) {
    trendEl.append(h('section', { class: 'tsec', id: 'ts-' + s.id, 'aria-labelledby': 'tsh-' + s.id },
      h('header', { class: 'tsec-head' }, h('h2', { id: 'tsh-' + s.id, text: s.title }), h('span', { class: 'n', text: String(s.n) })),
      s.lede ? h('p', { class: 'lede', text: s.lede }) : null, s.body));
  }
  if (!secs.length) {
    trendEl.append(h('div', { class: 'empty' }, h('h2', { text: 'No signals yet' }),
      h('p', { text: 'Patterns need at least four items from three independent sources. They appear here after a few runs of the update.' })));
  }
}

// ───────────────────────────────────────────── pannello fonti e preferenze
function renderPanel() {
  const body = $('#panelBody');
  body.textContent = '';
  const idx = S.index;
  const w = h('div', { class: 'wrap' });
  w.append(h('button', { class: 'icon close', type: 'button', 'aria-label': 'Close', onclick: () => closeDialog(panel), style: 'position:absolute;top:14px;right:14px' }, icon('close')));
  w.append(h('h2', { text: 'Sources and preferences' }));
  if (idx) {
    const ok = idx.sources.filter((s) => s.status && s.status.ok).length;
    w.append(h('p', { text: `Last update ${fullDate(idx.generatedAt)} at ${new Date(idx.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}. ${idx.stats.items} items in the last ${idx.retentionDays} days, ${ok} of ${idx.sources.length} automatic sources answered.` }));
  }
  put(w, installBlock());

  w.append(h('h3', { text: 'Appearance' }), h('div', { class: 'prefs' }, h('div', { class: 'row' }, h('span', { text: 'Theme' }),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Theme' },
      [['night', 'Night'], ['day', 'Day'], ['system', 'Auto']].map(([v, l]) => h('button', {
        type: 'button', 'aria-pressed': String(S.themePref === v), text: l,
        onclick: () => { setThemePref(v); renderPanel(); },
      }))))));

  w.append(h('h3', { text: 'Categories in All' }), h('p', { text: 'More pushes a category up inside each day, Less and Off thin it out. Choosing a category from the wheel always shows everything in it.' }));
  const prefs = h('div', { class: 'prefs' });
  for (const [k, label] of CATS.filter(([k]) => !['all', 'trends'].includes(k))) {
    const cur = S.prefs[k] || 'normal';
    prefs.append(h('div', { class: 'row' }, h('span', { text: label }),
      h('div', { class: 'seg', role: 'group', 'aria-label': label },
        ['more', 'normal', 'less', 'off'].map((v) => h('button', {
          type: 'button', 'aria-pressed': String(cur === v), text: cap1(v),
          onclick: () => { if (v === 'normal') delete S.prefs[k]; else S.prefs[k] = v; store.set('prefs', S.prefs); renderPanel(); S.dirty = true; },
        })))));
  }
  w.append(prefs);

  const aff = Object.entries(S.aff.cat).filter(([, v]) => Math.abs(v) >= 0.2).sort((a, b) => b[1] - a[1]);
  w.append(h('h3', { text: 'Learned from what you do' }),
    h('p', { text: 'Saving (+1), opening the original (+0.5) and opening a card (+0.2) raise a category; hiding (−1) lowers it. Low categories show fewer items in All.' }));
  if (aff.length) {
    w.append(h('div', {}, aff.map(([k, v]) => h('div', { class: 'aff' }, h('span', { text: CAT_LABEL[k] || k }),
      h('span', { class: 'track' }, h('i', { style: v >= 0 ? `left:50%;width:${(v / 6) * 50}%` : `left:${50 + (v / 6) * 50}%;width:${(-v / 6) * 50}%` })),
      h('span', { text: (v > 0 ? '+' : '') + v.toFixed(1) })))));
    w.append(h('p', {}, h('button', { class: 'btn', type: 'button', text: 'Reset what it learned', onclick: () => { S.aff = { cat: {}, src: {} }; store.set('aff', S.aff); renderPanel(); S.dirty = true; } })));
  } else {
    w.append(h('p', { text: 'Nothing learned yet.' }));
  }
  if (S.hidden.size) {
    w.append(h('p', {}, h('button', { class: 'btn', type: 'button', text: `Show ${plural(S.hidden.size, 'hidden item', 'hidden items')} again`, onclick: () => { S.hidden.clear(); store.set('hidden', []); renderPanel(); S.dirty = true; } })));
  }

  if (idx) {
    w.append(h('h3', { text: 'Automatic sources' }), h('p', { text: 'Read three times a day by the update job. Turn a source off to hide its items on this device.' }));
    const list = h('div', {});
    for (const s of [...idx.sources].sort((a, b) => a.name.localeCompare(b.name))) {
      const st = s.status || {};
      const state = st.ok === false ? h('small', { class: 'bad', text: `Last check failed: ${st.error || 'unknown error'}` })
        : h('small', { text: `${CAT_LABEL[s.category] || s.category}, ${plural(s.items || 0, 'item', 'items')}${s.latest ? ', latest ' + rel(s.latest) : ''}` });
      const on = !S.muted.has(s.id);
      list.append(h('div', { class: 'srcrow' },
        h('span', { class: 'name' }, h('a', { href: s.home, target: '_blank', rel: 'noopener noreferrer', text: s.name }), state),
        h('button', {
          class: 'toggle', type: 'button', 'aria-pressed': String(on), 'aria-label': (on ? 'Mute ' : 'Unmute ') + s.name,
          onclick: () => { if (S.muted.has(s.id)) S.muted.delete(s.id); else S.muted.add(s.id); store.set('muted', [...S.muted]); renderPanel(); S.dirty = true; },
        })));
    }
    w.append(list);
    if (idx.manual && idx.manual.length) {
      w.append(h('h3', { text: 'Check these by hand' }), h('p', { text: 'Worth following, but they block automated reading, have no feed, or have gone quiet. Checked on 25 September 2026.' }),
        h('div', { class: 'manual' }, h('ul', {}, idx.manual.map((m) => h('li', {}, h('a', { href: m.url, target: '_blank', rel: 'noopener noreferrer', text: m.name }), h('small', { text: m.reason }))))));
    }
  }
  body.append(w);
}

// ───────────────────────────────────────────── installazione come app (WebAPK su Android)
let installEvt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvt = e;
  $('#installBtn').hidden = false;
});
window.addEventListener('appinstalled', () => {
  installEvt = null;
  $('#installBtn').hidden = true;
  toast('Installed. DSGNBRD is now in your apps.');
});
async function installApp() {
  if (!installEvt) return;
  const evt = installEvt;
  installEvt = null;
  $('#installBtn').hidden = true;
  evt.prompt();
  try {
    const { outcome } = await evt.userChoice;
    if (outcome !== 'accepted') toast('Not installed. You can do it later from the browser menu.');
  } catch { /* il browser ha chiuso il dialogo */ }
  if (panel.open) renderPanel();
}
function installBlock() {
  if (isStandalone()) return null;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const how = installEvt ? 'Its own icon and window, and it opens offline with the last feed it downloaded.'
    : ios ? 'On iPad or iPhone: Share, then Add to Home Screen.'
      : 'In Chrome on Android: open the menu (three dots), then Install app. In Samsung Internet: menu, then Add page to, then Home screen.';
  return [h('h3', { text: 'Install as an app' }), h('p', { text: how }),
    installEvt ? h('p', {}, h('button', { class: 'btn primary', type: 'button', text: 'Install app', onclick: installApp })) : null];
}

// ───────────────────────────────────────────── tema giorno / notte
const themeMQ = matchMedia('(prefers-color-scheme: light)');
const resolveTheme = (pref) => (pref === 'day' || pref === 'night' ? pref : themeMQ.matches ? 'day' : 'night');
function applyTheme(pref) {
  S.themePref = pref === 'day' || pref === 'night' ? pref : 'system';
  const t = resolveTheme(S.themePref);
  document.documentElement.setAttribute('data-theme', t);
  const m = $('meta[name="theme-color"]');
  if (m) m.setAttribute('content', t === 'day' ? '#e9e0d2' : '#232220');
  $('#themeBtn').setAttribute('aria-label', t === 'day' ? 'Switch to night mode' : 'Switch to day mode');
}
function setThemePref(pref) { store.set('theme', pref); applyTheme(pref); }

// ───────────────────────────────────────────── ruota delle categorie
// Tieni premuta la maniglia: la ruota si apre sotto il dito, scegli con la direzione e rilasci.
// Tocco veloce: la ruota resta aperta, si gira trascinando (o con rotella/frecce) e si tocca la voce.
function initWheel() {
  const root = $('#wheel');
  const handle = $('#catHandle');
  const disc = $('.disc', root), hub = $('.hub', root), needle = $('.needle', root), ring = $('.ring', root), spokesEl = $('.spokes', root);
  const N = CATS.length;
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  let G = null, rot = 0, target = null, hi = -1, mode = null, pend = null, autoV = 0, raf = 0, openT = 0, lastT = 0;
  let spin = null, ptype = 'mouse', ringG = null, ticks = [], fx = 0, fy = 0;
  const labels = CATS.map(([, label], i) => h('button', { class: 'spoke', type: 'button', role: 'menuitemradio', tabindex: '-1', 'data-i': i, text: label }));
  spokesEl.append(...labels);

  function geom() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const R = clamp(Math.min(vh * 0.46, vw * 0.88), 220, 400);
    const rl = R * 0.6;
    const r = handle.getBoundingClientRect();
    const hy = r.height ? r.top + r.height / 2 : vh / 2;
    const A = 72, s = R >= 330 ? 19 : 22;
    const cy = vh > rl * 2.3 ? clamp(hy, rl * 1.08, vh - rl * 1.08) : vh / 2;
    return { R, rl, A, s, cy, hubR: Math.round(Math.max(34, R * 0.12)), dead: Math.max(50, R * 0.2), rotMin: A - (N - 1) * s, rotMax: -A };
  }
  function layout() {
    G = geom();
    const { R, cy, hubR, s } = G;
    root.style.setProperty('--wf', clamp(R * 0.043, 15, 18).toFixed(1) + 'px');
    Object.assign(disc.style, { width: 2 * R + 'px', height: 2 * R + 'px', left: -R + 'px', top: cy - R + 'px' });
    Object.assign(hub.style, { width: 2 * hubR + 'px', height: 2 * hubR + 'px', left: -hubR + 'px', top: cy - hubR + 'px' });
    needle.style.top = cy + 'px';
    needle.style.width = Math.round(G.rl - 22) + 'px';
    ring.setAttribute('width', 2 * R);
    ring.setAttribute('height', 2 * R);
    ring.setAttribute('viewBox', `${-R} ${-R} ${2 * R} ${2 * R}`);
    Object.assign(ring.style, { left: -R + 'px', top: cy - R + 'px' });
    ring.textContent = '';
    ringG = document.createElementNS(SVGNS, 'g');
    ticks = [];
    const minor = s / 2;
    // tacche su tutta la corsa della ruota: una lunga per voce, una corta in mezzo (texture da ghiera)
    for (let k = -8; k * minor <= (N - 1) * s + 100; k++) {
      const a = (k * minor * Math.PI) / 180;
      const item = k % 2 === 0 ? k / 2 : -1;
      const major = item >= 0 && item < N;
      const r1 = R - (major ? 20 : 11), r2 = R - 6;
      const ln = document.createElementNS(SVGNS, 'line');
      ln.setAttribute('x1', (r1 * Math.cos(a)).toFixed(1)); ln.setAttribute('y1', (r1 * Math.sin(a)).toFixed(1));
      ln.setAttribute('x2', (r2 * Math.cos(a)).toFixed(1)); ln.setAttribute('y2', (r2 * Math.sin(a)).toFixed(1));
      if (major) { ln.setAttribute('class', 'major'); ticks[item] = ln; }
      ringG.append(ln);
    }
    ring.append(ringG);
  }
  const angleOf = (i) => i * G.s + rot;
  const angleAt = (x, y) => (Math.atan2(y - G.cy, Math.max(x, 0.001)) * 180) / Math.PI;
  function draw(now) {
    const { rl, A, s, cy } = G;
    const t = motionOK() ? now - openT : 1e9;
    for (let i = 0; i < N; i++) {
      const th = angleOf(i);
      const vis = clamp(1 - (Math.abs(th) - A) / s, 0, 1);
      const slot = clamp((th + A) / s, 0, 10);
      const p = t > 900 ? 1 : ease(clamp((t - slot * 24) / 300, 0, 1));
      const r = rl * (0.86 + 0.14 * p);
      const rad = (th * Math.PI) / 180;
      const el = labels[i];
      el.style.transform = `translate(${(r * Math.cos(rad)).toFixed(1)}px, ${(cy + r * Math.sin(rad)).toFixed(1)}px) translateY(-50%)`;
      el.style.opacity = (vis * p).toFixed(3);
      el.style.visibility = vis > 0.02 ? 'visible' : 'hidden'; // solo la rotazione nasconde: durante l'apertura resta focalizzabile
      el.classList.toggle('hi', i === hi);
    }
    if (ringG) ringG.setAttribute('transform', `rotate(${rot.toFixed(2)})`);
    ticks.forEach((tk, i) => { if (tk) tk.classList.toggle('hi', i === hi); });
  }
  function setHi(i) {
    if (i === hi) return;
    hi = i;
    if (mode === 'hold' && i >= 0 && ptype === 'touch') buzz(4);
  }
  function nearest(phi, tol) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < N; i++) {
      const th = angleOf(i);
      if (Math.abs(th) > G.A + G.s * 0.5) continue;
      const dd = Math.abs(th - phi);
      if (dd < bd) { bd = dd; best = i; }
    }
    return bd <= tol ? best : -1;
  }
  function pick() {
    const dy = fy - G.cy, d = Math.hypot(fx, dy);
    const phi = angleAt(fx, fy);
    setHi(d >= G.dead ? nearest(phi, 90) : -1);
    // vicino ai bordi dell'arco la ruota scorre da sola verso le voci nascoste
    const edge = G.A - G.s * 0.4;
    autoV = d >= G.dead && Math.abs(phi) > edge ? -Math.sign(phi) * clamp((Math.abs(phi) - edge) * 7, 30, 170) : 0;
    needle.style.opacity = d >= G.dead ? '1' : '0';
    needle.style.transform = `rotate(${phi.toFixed(1)}deg)`;
  }
  function loop(now) {
    raf = 0;
    if (!mode) return;
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0;
    lastT = now;
    if (mode === 'hold' && autoV) {
      const before = rot;
      rot = clamp(rot + autoV * dt, G.rotMin, G.rotMax);
      if (rot !== before) pick();
    }
    if (target != null) {
      const d = target - rot;
      if (Math.abs(d) < 0.05) { rot = target; target = null; } else rot += d * Math.min(1, dt * 12);
    }
    if (spin && !spin.active && spin.v) {
      rot = clamp(rot + spin.v * dt, G.rotMin, G.rotMax);
      spin.v *= Math.pow(0.015, dt);
      if (Math.abs(spin.v) < 4 || rot === G.rotMin || rot === G.rotMax) spin.v = 0;
    }
    draw(now);
    raf = requestAnimationFrame(loop);
  }
  function open(m) {
    if (mode) return;
    mode = m;
    layout();
    const cur = Math.max(0, CATS.findIndex(([k]) => k === S.cat));
    rot = clamp(-cur * G.s, G.rotMin, G.rotMax);
    hi = m === 'sticky' ? cur : -1;
    target = null; spin = null; autoV = 0;
    labels.forEach((el, i) => {
      el.classList.toggle('cur', i === cur);
      el.classList.remove('chosen');
      el.setAttribute('aria-checked', String(i === cur));
    });
    root.hidden = false;
    root.classList.remove('closing');
    document.body.classList.add('wheel-on');
    handle.setAttribute('aria-expanded', 'true');
    openT = performance.now(); lastT = 0;
    draw(openT);
    void root.offsetWidth;
    root.classList.add('open');
    if (!raf) raf = requestAnimationFrame(loop);
    if (m === 'sticky') labels[cur].focus({ preventScroll: true });
    hideHint();
  }
  function close() {
    if (!mode) return;
    const wasSticky = mode === 'sticky';
    mode = null; autoV = 0; target = null; spin = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    root.classList.remove('open');
    handle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('wheel-on');
    needle.style.opacity = '0';
    if (motionOK()) {
      root.classList.add('closing');
      setTimeout(() => { if (!mode) { root.hidden = true; root.classList.remove('closing'); } }, 220);
    } else {
      root.hidden = true;
    }
    if (wasSticky) handle.focus({ preventScroll: true });
  }
  function commit(i) {
    if (i < 0) { close(); return; }
    const k = CATS[i][0];
    labels[i].classList.add('chosen');
    if (ptype === 'touch') buzz(10);
    setTimeout(() => { close(); if (k !== S.cat) setCat(k); }, motionOK() ? 130 : 0);
  }
  function ensureVisible(i) {
    const lim = G.A - G.s * 0.5, th = angleOf(i);
    if (th > lim) target = clamp(rot - (th - lim), G.rotMin, G.rotMax);
    else if (th < -lim) target = clamp(rot + (-lim - th), G.rotMin, G.rotMax);
  }

  // maniglia: premi e tieni (o trascina) per il gesto; tocco breve per la ruota fissa
  function startHold() {
    if (!pend || pend.holding) return;
    clearTimeout(pend.timer);
    pend.holding = true;
    open('hold');
    fx = pend.lx != null ? pend.lx : pend.x;
    fy = pend.ly != null ? pend.ly : pend.y;
    pick();
    if (ptype === 'touch') buzz(8);
  }
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || mode) return;
    e.preventDefault();
    ptype = e.pointerType || 'mouse';
    try { handle.setPointerCapture(e.pointerId); } catch { /* ok */ }
    handle.classList.add('pressed');
    pend = { id: e.pointerId, x: e.clientX, y: e.clientY, holding: false };
    pend.timer = setTimeout(startHold, 260);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!pend || e.pointerId !== pend.id) return;
    pend.lx = e.clientX; pend.ly = e.clientY;
    if (!pend.holding) {
      if (Math.hypot(e.clientX - pend.x, e.clientY - pend.y) > 10) startHold();
      return;
    }
    fx = e.clientX; fy = e.clientY;
    pick();
  });
  handle.addEventListener('pointerup', (e) => {
    if (!pend || e.pointerId !== pend.id) return;
    handle.classList.remove('pressed');
    clearTimeout(pend.timer);
    const holding = pend.holding;
    pend = null;
    if (!holding) { open('sticky'); return; }
    if (mode === 'hold') commit(hi);
  });
  handle.addEventListener('pointercancel', () => {
    if (pend) clearTimeout(pend.timer);
    pend = null;
    handle.classList.remove('pressed');
    if (mode === 'hold') close();
  });
  handle.addEventListener('contextmenu', (e) => e.preventDefault());
  handle.addEventListener('click', (e) => e.preventDefault());
  handle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); ptype = 'keyboard'; open('sticky'); }
  });

  // ruota fissa: trascina per girarla (con un po' di inerzia), tocca una voce per sceglierla
  root.addEventListener('pointerdown', (e) => {
    if (mode !== 'sticky') return;
    e.preventDefault();
    ptype = e.pointerType || 'mouse';
    const d = Math.hypot(e.clientX, e.clientY - G.cy);
    const spoke = e.target.closest('.spoke');
    if (!spoke && d > G.R + 6) { spin = { outside: true, id: e.pointerId }; return; }
    try { root.setPointerCapture(e.pointerId); } catch { /* ok */ }
    const a = angleAt(e.clientX, e.clientY);
    spin = { active: true, id: e.pointerId, a0: a, r0: rot, last: a, t: performance.now(), v: 0, moved: false, sx: e.clientX, sy: e.clientY, spoke, d };
    target = null;
  });
  root.addEventListener('pointermove', (e) => {
    if (mode !== 'sticky') return;
    if (!spin || !spin.active || e.pointerId !== spin.id) {
      if (e.pointerType === 'mouse') { const sp = e.target.closest('.spoke'); if (sp) setHi(Number(sp.dataset.i)); }
      return;
    }
    if (!spin.moved && Math.hypot(e.clientX - spin.sx, e.clientY - spin.sy) < 8) return;
    spin.moved = true;
    const a = angleAt(e.clientX, e.clientY), now = performance.now();
    spin.v = ((a - spin.last) / Math.max(8, now - spin.t)) * 1000;
    spin.last = a; spin.t = now;
    rot = clamp(spin.r0 + (a - spin.a0), G.rotMin, G.rotMax);
  });
  root.addEventListener('pointerup', (e) => {
    if (!spin || e.pointerId !== spin.id) return;
    const s = spin;
    if (s.outside) { spin = null; close(); return; }
    s.active = false;
    if (s.moved) return;
    spin = null;
    if (s.spoke) { commit(Number(s.spoke.dataset.i)); return; }
    if (s.d < G.dead) { close(); return; }
    const i = nearest(angleAt(e.clientX, e.clientY), G.s * 0.6);
    if (i >= 0) commit(i);
  });
  root.addEventListener('pointercancel', () => { if (spin) spin.active = false; });
  root.addEventListener('wheel', (e) => {
    if (!mode) return;
    e.preventDefault();
    rot = clamp(rot - e.deltaY * 0.12, G.rotMin, G.rotMax);
    target = null;
  }, { passive: false });
  root.addEventListener('keydown', (e) => {
    if (!mode) return;
    const cur = hi >= 0 ? hi : Math.max(0, CATS.findIndex(([k]) => k === S.cat));
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const i = e.key === 'Home' ? 0 : e.key === 'End' ? N - 1 : clamp(cur + (e.key === 'ArrowDown' ? 1 : -1), 0, N - 1);
      setHi(i);
      ensureVisible(i);
      labels[i].focus({ preventScroll: true });
    } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(cur); }
    else if (e.key === 'Tab') e.preventDefault();
  });
  window.addEventListener('resize', () => { if (mode) { layout(); draw(performance.now() + 1e4); } });
  return { open, close, isOpen: () => !!mode };
}
function showHint() {
  if (store.get('wheelHint', 0) || S.view !== 'feed' || (S.wheel && S.wheel.isOpen())) return;
  const hint = $('#wheelHint'), handle = $('#catHandle');
  const r = handle.getBoundingClientRect();
  hint.style.top = r.top + r.height / 2 + 'px';
  hint.hidden = false;
  requestAnimationFrame(() => hint.classList.add('on'));
  if (motionOK()) restart(handle, 'nudge');
  store.set('wheelHint', 1);
  setTimeout(hideHint, 5200);
}
function hideHint() {
  const hint = $('#wheelHint');
  if (hint.hidden) return;
  hint.classList.remove('on');
  setTimeout(() => { hint.hidden = true; }, 450);
}

// ───────────────────────────────────────────── pressione lunga su una card = salva / togli
function bindLongPress(host) {
  let lp = null;
  const clear = () => { if (!lp) return; clearTimeout(lp.timer); clearTimeout(lp.t2); lp.tile.classList.remove('holding'); };
  function fire() {
    if (!lp || lp.fired) return;
    clear();
    lp.fired = true;
    const it = findItem(lp.tile.dataset.id);
    if (it) { toggleSave(it); if (lp.type === 'touch') buzz(12); }
    const done = lp;
    setTimeout(() => { if (lp === done) lp = null; }, 700);
  }
  host.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const t = e.target.closest('.tile[data-id]');
    if (!t || t.hasAttribute('data-nosave')) { lp = null; return; }
    lp = { tile: t, x: e.clientX, y: e.clientY, fired: false, type: e.pointerType };
    lp.t2 = setTimeout(() => { if (lp && !lp.fired && motionOK()) lp.tile.classList.add('holding'); }, 140);
    lp.timer = setTimeout(fire, 520);
  });
  host.addEventListener('pointermove', (e) => {
    if (lp && !lp.fired && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 9) { clear(); lp = null; }
  }, { passive: true });
  host.addEventListener('pointerup', () => { if (lp && !lp.fired) { clear(); lp = null; } });
  host.addEventListener('pointercancel', () => { if (lp && !lp.fired) { clear(); lp = null; } });
  host.addEventListener('contextmenu', (e) => {
    const t = e.target.closest('.tile[data-id]');
    if (t && lp && lp.tile === t) { e.preventDefault(); fire(); }
  });
  host.addEventListener('click', (e) => {
    if (lp && lp.fired) { e.preventDefault(); e.stopPropagation(); lp = null; }
  }, true);
}

// ───────────────────────────────────────────── header: ricerca e scroll
function openSearch(silent) {
  const top = $('#top');
  top.classList.add('searching');
  top.classList.remove('away');
  $('#searchBtn').setAttribute('aria-expanded', 'true');
  if (!silent) setTimeout(() => $('#q').focus({ preventScroll: true }), 40);
}
function closeSearch(clear) {
  const q = $('#q');
  if (clear && q.value) { q.value = ''; S.q = ''; rebuild(); }
  $('#top').classList.remove('searching');
  $('#searchBtn').setAttribute('aria-expanded', 'false');
}

function bindChrome() {
  for (const b of $$('#period button')) b.addEventListener('click', () => setPeriod(Number(b.dataset.p)));
  for (const b of $$('.views button')) b.addEventListener('click', () => { if (b.dataset.view !== S.view) setView(b.dataset.view); });
  $('#home').addEventListener('click', () => { if (S.view !== 'feed') setView('feed'); else window.scrollTo({ top: 0, behavior: motionOK() ? 'smooth' : 'auto' }); });
  $('#catChip').addEventListener('click', () => setCat('all'));
  $('#themeBtn').addEventListener('click', () => setThemePref(resolveTheme(S.themePref) === 'day' ? 'night' : 'day'));
  themeMQ.addEventListener('change', () => { if (S.themePref === 'system') applyTheme('system'); });
  $('#focusBtn').addEventListener('click', () => {
    const list = S.view === 'saved' ? savedList() : flatList();
    if (list.length) openDetail(list[0], list);
  });
  $('#sourcesBtn').addEventListener('click', () => { renderPanel(); panel.classList.remove('closing'); panel.showModal(); });
  $('#installBtn').addEventListener('click', installApp);
  panel.addEventListener('click', (e) => { if (e.target === panel) closeDialog(panel); });
  panel.addEventListener('cancel', (e) => { e.preventDefault(); closeDialog(panel); });
  panel.addEventListener('close', () => { if (S.dirty) { S.dirty = false; rebuild(true); } });

  const q = $('#q');
  $('#searchBtn').addEventListener('click', () => ($('#top').classList.contains('searching') ? closeSearch(false) : openSearch()));
  $('#searchClose').addEventListener('click', () => { closeSearch(true); $('#searchBtn').focus({ preventScroll: true }); });
  q.addEventListener('input', debounce(async () => {
    S.q = norm(q.value.trim());
    if (S.q) await loadAll();
    if (S.view !== 'feed') setView('feed');
    rebuild();
  }, 180));
  q.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closeSearch(true); $('#searchBtn').focus({ preventScroll: true }); } });
  q.addEventListener('blur', () => { if (!q.value.trim()) setTimeout(() => { if (document.activeElement !== q && !q.value.trim()) closeSearch(false); }, 150); });

  sheet.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(); });
  sheet.addEventListener('close', () => {
    $('#sheetBody').textContent = '';
    if (history.state && history.state.sheet) history.back();
  });
  window.addEventListener('popstate', () => { if (sheet.open) closeSheet(); });
  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest && e.target.closest('input, textarea, [contenteditable]');
    if (sheet.open) {
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const it = S.dlist[S.didx];
      if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); }
      else if (e.key === 's' && it && !String(it.id).startsWith('sig-')) toggleSave(it);
      else if (e.key === 'o' && it && it.url) { learn(it, 0.5); window.open(it.url, '_blank', 'noopener'); }
      return;
    }
    if (panel.open || (S.wheel && S.wheel.isOpen()) || typing) return;
    if (e.key === '/') { e.preventDefault(); openSearch(); }
  });

  let lastY = window.scrollY;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const top = $('#top');
    top.classList.toggle('scrolled', y > 8);
    if (!top.classList.contains('searching')) {
      if (y > lastY + 6 && y > 260) top.classList.add('away');
      else if (y < lastY - 6 || y < 140) top.classList.remove('away');
    }
    lastY = y;
  }, { passive: true });
  window.addEventListener('resize', debounce(relayout, 160));
  new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) renderMore(24); }, { rootMargin: '1400px 0px' }).observe($('#sentinel'));
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !S.index || Date.now() - S.checkedAt < 15 * 6e4) return;
    S.checkedAt = Date.now();
    try {
      const idx = await getJSON('data/index.json', true);
      if (idx.generatedAt !== S.index.generatedAt) toast('New items are available', 'Refresh', () => location.reload());
    } catch { /* offline: pazienza */ }
  });
  bindLongPress($('#main'));
}

// ───────────────────────────────────────────── avvio
async function init() {
  applyTheme(store.get('theme', 'system'));
  const prev = store.get('lastVisit', null);
  S.since = prev ? Date.parse(prev) : null;
  store.set('lastVisit', new Date().toISOString());
  bindChrome();
  S.wheel = initWheel();
  syncSave('');
  feedEl.append(h('div', { class: 'cols', 'aria-hidden': 'true', style: 'padding-top:40px' },
    [0, 1, 2].slice(0, colCount()).map((i) => h('div', { class: 'col' }, [0, 1].map((j) => h('div', { class: 'skel', style: `height:${[260, 180, 320, 220, 280, 200][i * 2 + j]}px` }))))));
  try {
    if (location.protocol === 'file:') throw new Error('file');
    const idx = await getJSON('data/index.json', true);
    S.index = idx;
    S.srcNames = Object.fromEntries(idx.sources.map((s) => [s.id, s.name]));
    S.months = (idx.months || []).map((m) => m.id);
    S.trendItems = (idx.trends || []).filter((t) => t.label !== 'Consolidated').map(asTrend);
    await Promise.all(S.months.slice(0, 2).map((m) => loadMonth(m)));
    rebuild(true);
    const want = new URLSearchParams(location.search).get('view'); // scorciatoie dell'icona (manifest)
    if (want === 'trending' || want === 'saved') setView(want);
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) {
      history.replaceState(null, '', location.pathname + location.search);
      await loadAll();
      const it = findItem(id);
      if (it) openDetail(it);
    }
    setTimeout(showHint, 1600);
  } catch (e) {
    feedEl.textContent = '';
    const local = e.message === 'file';
    feedEl.append(h('div', { class: 'empty' },
      h('h2', { text: local ? 'Open DSGNBRD from a local server' : "Couldn't load the feed" }),
      h('p', { text: local ? 'Browsers block data files opened straight from disk. In the project folder run: python3 -m http.server 8000, then open http://localhost:8000'
        : `The data files did not load (${e.message}). If you are offline, the last copy loads once it has been cached; if this is a fresh install, run the pipeline once (see README).` }),
      local ? null : h('button', { class: 'btn', type: 'button', text: 'Try again', onclick: () => location.reload() })));
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) toast('DSGNBRD was updated', 'Refresh', () => location.reload());
    });
  }
}

window.__dsgnbrd = S; // appiglio per debug e test automatici
init();
