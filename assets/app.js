/* Segnale · frontend (vanilla JS, nessuna dipendenza).
   Dati: data/index.json + data/archive/YYYY-MM.json, scritti dalla pipeline (GitHub Actions).
   Preferenze e salvati: localStorage, solo su questo dispositivo (export/import nel tab Saved). */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const SVGNS = 'http://www.w3.org/2000/svg';

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
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false || kid === '') continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
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
function put(el, ...kids) { el.append(...kids.flat(Infinity).filter((k) => k != null && k !== false && k !== '')); return el; }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const store = {
  get(k, d) { try { const v = localStorage.getItem('segnale:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('segnale:' + k, JSON.stringify(v)); } catch { /* quota o modalità privata */ } },
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
  view: 'feed', cat: 'all', period: 0, q: '',
  saved: store.get('saved', {}), hidden: new Set(store.get('hidden', [])), muted: new Set(store.get('muted', [])),
  prefs: store.get('prefs', {}), aff: store.get('aff', { cat: {}, src: {} }),
  since: null, srcNames: {}, groups: [], gi: 0, blocks: new Map(), renderedIds: new Set(), savedBlk: null,
  dlist: [], didx: 0, checkedAt: Date.now(),
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
  if (it.type === 'trend') return 'First detected by Segnale on ' + d;
  switch (it.dateType) {
    case 'release': return (it.sid === 'googlefonts' ? 'Released on Google Fonts on ' : 'Released on ') + d;
    case 'project': return `Project published on ${d}, via ${s}`;
    case 'detected': return `First seen by Segnale on ${d}. ${s} gives no publication date.`;
    default: return `Published by ${s} on ${d}`;
  }
}

// ───────────────────────────────────────────── helpers
const srcName = (sid) => S.srcNames[sid] || sid;
const isNew = (it) => !!(S.since && it.seen && Date.parse(it.seen) > S.since);
function eff(it) {
  if (it.type === 'trend') return 90;
  const a = S.aff;
  return (it.score || 0) + 4 * (a.cat[it.category] || 0) + 3 * (a.src[it.sid] || 0) + (PREF_BOOST[S.prefs[it.category]] || 0);
}
function hay(it) {
  if (!it._h) {
    it._h = norm([it.title, it.summary, it.author, (it.tags || []).join(' '), (it.fonts || []).join(' '),
      srcName(it.sid), CAT_LABEL[it.category], it.matched, it.font && it.font.family].join(' '));
  }
  return it._h;
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
function inkOn(hex) { const [r, g, b] = hexRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.58 ? '#000000' : '#f2f1ec'; }
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
  toast.timer = setTimeout(() => t.classList.remove('on'), action ? 5200 : 1800);
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
    loadGF({ family: fam, weights }, text).then((ok) => { if (ok) e.target.classList.add('ready'); else e.target.classList.add('ready', 'nofont'); });
  }
}, { rootMargin: '600px 0px' });
function liveFont(el, f, text) {
  el.style.setProperty('--ff', `"${f.family}"`);
  el._gf = { fam: f.family, weights: f.weights, text };
  fontIO.observe(el);
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

// ───────────────────────────────────────────── filtro, raggruppamento
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
// Ordina per rilevanza ma evita muri della stessa fonte: finestra di 12, penalità per fonte e categoria già viste.
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
    // una sola fascia trend per giorno; le altre diventano card nel masonry (il feed resta un feed)
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

// ───────────────────────────────────────────── card
function openBtn(it, label) {
  return h('button', { class: 'open', type: 'button', 'aria-label': (label || 'Open') + ': ' + it.title, onclick: () => openDetail(it) });
}
function saveBtn(it) {
  const on = !!S.saved[it.id];
  const b = h('button', {
    class: 'save', type: 'button', 'data-save': it.id, 'aria-pressed': String(on),
    'aria-label': (on ? 'Remove from saved: ' : 'Save: ') + it.title,
    onclick: (e) => { e.stopPropagation(); toggleSave(it); },
  });
  b.append(icon('save'));
  return b;
}
function metaRow(it) {
  return h('div', { class: 'meta' },
    isNew(it) ? h('span', { class: 'dot', title: 'New since your last visit' }) : null,
    h('span', { class: 'src', text: srcName(it.sid) }),
    h('time', { datetime: it.date, title: dateLine(it), text: rel(it.date) }),
    saveBtn(it));
}
const showWhy = (it) => it.why && (it.score || 0) >= 55 && !/^(Credited to|Published by)/.test(it.why);

function coverEl(it) {
  const pal = it.palette || [];
  const c0 = pal[0] ? pal[0].hex : '#161616';
  const c = h('div', { class: 'cover', vars: { '--c0': c0, '--ink': inkOn(c0) } },
    h('small', { text: srcName(it.sid) }), h('b', { text: it.title }));
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
function fontTagline(f) {
  const bits = [f.category ? f.category.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : 'Typeface'];
  const axes = (f.axes || []).map((a) => a.tag).filter(Boolean);
  if (axes.length) bits.push('variable ' + axes.join(', '));
  else if (f.weights && f.weights.length > 1) bits.push(`${f.weights[0]} to ${f.weights[f.weights.length - 1]}`);
  if (f.italic) bits.push('with italics');
  return bits.join(', ');
}
function fontCard(it) {
  const f = it.font;
  const spec = liveFont(h('div', { class: 'spec' }, h('div', { class: 'big', text: f.family }), h('div', { class: 'line', text: 'Hamburgefonstiv 0123' })),
    f, f.family + 'Hamburgefonstiv 0123');
  return h('article', { class: 'card fontcard', 'data-id': it.id, 'data-sid': it.sid },
    h('div', { class: 'media', 'aria-hidden': 'true', vars: { '--ar': '4 / 5' } }, spec, h('div', { class: 'tagline', text: fontTagline(f) })),
    openBtn(it),
    h('div', { class: 'body' },
      h('h3', { text: f.family + (it.kind === 'update' ? ' (updated)' : '') }),
      h('p', { class: 'by', text: it.author || 'Google Fonts' }),
      showWhy(it) ? h('p', { class: 'why', text: it.why }) : null,
      metaRow(it)));
}
function colourCard(it) {
  const sw = h('div', { class: 'swatches' });
  for (const p of it.palette) sw.append(h('i', { vars: { '--c': p.hex, '--s': Math.max(p.share, 0.06) } }));
  const hexes = h('p', { class: 'hexes' }, it.palette.slice(0, 6).map((p) => h('span', { vars: { '--c': p.hex }, text: p.hex })));
  return h('article', { class: 'card colourcard', 'data-id': it.id, 'data-sid': it.sid },
    h('div', { class: 'media', 'aria-hidden': 'true', vars: { '--ar': '5 / 4' } }, sw),
    openBtn(it, 'Open palette'),
    h('div', { class: 'body' }, h('h3', { text: 'Palette from ' + it.title }), hexes, metaRow(it)));
}
function cardEl(it) {
  if (it.type === 'trend') return trendCard(it);
  if (it.type === 'colour') return colourCard(it);
  if (it.font) return fontCard(it);
  return h('article', { class: 'card', 'data-id': it.id, 'data-sid': it.sid },
    mediaEl(it),
    openBtn(it),
    h('div', { class: 'body' },
      h('h3', { text: it.title }),
      it.author ? h('p', { class: 'by', text: it.author }) : null,
      it.fonts && it.fonts.length ? h('p', { class: 'set', text: 'Set in ' + it.fonts.slice(0, 3).join(', ') }) : null,
      showWhy(it) ? h('p', { class: 'why', text: it.why }) : null,
      metaRow(it)));
}
function leadEl(it) {
  return h('article', { class: 'card lead', 'data-id': it.id, 'data-sid': it.sid },
    mediaEl(it, true),
    openBtn(it),
    h('div', { class: 'body' },
      h('h3', { text: it.title }),
      it.author ? h('p', { class: 'by', text: it.author }) : null,
      it.summary ? h('p', { class: 'summary', text: it.summary.length > 230 ? it.summary.slice(0, 228).replace(/\s+\S*$/, '') + '…' : it.summary }) : null,
      showWhy(it) ? h('p', { class: 'why', text: it.why }) : null,
      metaRow(it)));
}
function labelEl(label) {
  return h('span', { class: 'label' + (label === 'Detected trend' ? ' detected' : '') }, h('i'), label);
}
function evGrid(ev, n = 4) {
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
function srcList(sids, n = 5) {
  const names = sids.map(srcName);
  return names.length > n ? names.slice(0, n).join(', ') + ` and ${names.length - n} more` : names.join(', ');
}
function trendVisual(t, big) {
  if (t.family === 'font') {
    const el = h('div', { class: 'fontprev', text: t.title });
    if (t.font && t.font.provider === 'google') liveFont(el, t.font, t.title);
    return el;
  }
  const wrap = h('div', {}, evGrid(t.evidence));
  if (t.swatches && t.swatches.length) wrap.append(h('div', { class: 'chips' }, t.swatches.slice(0, big ? 6 : 4).map((c) => h('i', { vars: { '--c': c }, title: c }))));
  return wrap;
}
function trendBand(t) {
  return h('article', { class: 'trend', 'data-id': t.id },
    h('div', {},
      labelEl(t.label),
      h('h3', { text: t.title }),
      h('p', { text: t.summary }),
      h('p', { class: 'srcs', text: `Sources: ${srcList(t.sources)}. First detected ${fullDate(t.firstDetected)}.` })),
    trendVisual(t, true),
    openBtn(t, 'Open trend'));
}
function trendCard(t, list) {
  return h('article', { class: 'tcard', 'data-id': t.id },
    labelEl(t.label),
    t.family === 'font' ? trendVisual(t) : null,
    h('h3', { text: t.title }),
    h('p', { text: t.summary }),
    t.family !== 'font' ? trendVisual(t) : null,
    h('p', { class: 'srcs', text: `${srcList(t.sources, 4)}. First detected ${fullDate(t.firstDetected)}.` }),
    h('button', { class: 'open', type: 'button', 'aria-label': 'Open trend: ' + t.title, onclick: () => openDetail(t, list) }));
}

// ───────────────────────────────────────────── masonry per giorno
function setCols(blk) {
  const n = colCount();
  blk.n = n; blk.width = window.innerWidth; blk.cols.textContent = ''; blk.heights = new Array(n).fill(0); blk.colEls = [];
  for (let i = 0; i < n; i++) { const c = h('div', { class: 'col' }); blk.cols.append(c); blk.colEls.push(c); }
}
function place(blk, card) {
  let k = 0;
  for (let i = 1; i < blk.n; i++) if (blk.heights[i] < blk.heights[k] - 1) k = i;
  blk.colEls[k].append(card);
  blk.heights[k] += card.offsetHeight + 24;
}
function makeBlock(g) {
  const all = [g.lead, ...g.items].filter((x) => x && x.type !== 'trend');
  const nNew = all.filter(isNew).length;
  const el = h('section', { class: 'day', 'data-day': g.day, 'aria-label': dayLabel(g.day) },
    h('header', { class: 'day-head' },
      h('h2', { text: dayLabel(g.day) }),
      h('p', {}, all.length ? plural(all.length, 'item', 'items') : plural(g.trends.length, 'pattern', 'patterns'),
        nNew ? h('span', { class: 'new', text: `, ${nNew} new since your last visit` }) : null)));
  if (g.lead) { el.append(leadEl(g.lead)); S.renderedIds.add(g.lead.id); }
  for (const t of g.trends) { el.append(trendBand(t)); S.renderedIds.add(t.id); }
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
  while (budget > 0 && S.gi < S.groups.length) {
    const g = S.groups[S.gi];
    let blk = S.blocks.get(g.day);
    if (!blk) { blk = makeBlock(g); feedEl.append(blk.el); budget -= 2; }
    while (budget > 0 && g.ii < g.items.length) {
      const it = g.items[g.ii++];
      if (S.renderedIds.has(it.id)) continue;
      const c = cardEl(it);
      blk.cards.push(c);
      place(blk, c);
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
  $$('.lead, .trend', feedEl).forEach((n) => { if (pred(n.dataset)) n.remove(); });
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
    action = h('button', { class: 'btn', type: 'button', text: 'Clear search', onclick: () => { $('#q').value = ''; S.q = ''; rebuild(); } });
  } else if (S.cat === 'trends') {
    title = 'No trend alerts yet';
    text = 'A pattern needs at least four items from three independent sources before Segnale flags it (three from two once it can measure growth). The Trending tab also shows the weaker signals.';
    action = h('button', { class: 'btn', type: 'button', text: 'Open Trending', onclick: () => setView('trending') });
  } else if (per) {
    title = S.cat === 'all' ? `Nothing new in ${per}` : `Nothing in ${cat} for ${per}`;
    text = 'Widen the period to see earlier items.';
    action = h('button', { class: 'btn', type: 'button', text: 'Show everything', onclick: () => setPeriod(0) });
  } else if (S.cat !== 'all') {
    title = `Nothing in ${cat} right now`;
    text = S.prefs[S.cat] === 'off' ? `${cat} is turned off in your preferences.` : 'No source has published in this category within the archive window.';
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
  renderDetail();
  if (!sheet.open) {
    sheet.showModal();
    const ttl = $('#sheetBody h2'); if (ttl) ttl.focus({ preventScroll: true });
    history.pushState({ sheet: 1 }, '', '#' + encodeURIComponent(it.id));
  } else {
    history.replaceState({ sheet: 1 }, '', '#' + encodeURIComponent(it.id));
  }
  learn(it, 0.2);
}
function step(d) {
  const n = S.didx + d;
  if (n < 0 || n >= S.dlist.length) return;
  S.didx = n;
  renderDetail();
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
    stage.style.background = 'var(--carbon)';
    stage.append(grid);
  } else if (it.type === 'colour') {
    const sw = h('div', { class: 'swatches' });
    for (const p of it.palette) sw.append(h('i', { vars: { '--c': p.hex, '--s': Math.max(p.share, 0.06) } }));
    stage.append(sw);
  } else if (it.font) {
    stage.style.background = 'var(--carbon)';
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
      h('em', { text: Math.round(p.share * 100) + '%' }));
  }));
}
function fontFacts(f) {
  const rows = [];
  if (f.designers && f.designers.length) rows.push('Designed by ' + f.designers.join(', '));
  rows.push(fontTagline(f));
  if (f.axes && f.axes.length) rows.push('Axes: ' + f.axes.map((a) => `${a.tag} ${a.min} to ${a.max}`).join(', '));
  if (f.styles) rows.push(plural(f.styles, 'style', 'styles'));
  if (f.dateAdded) rows.push('Added to Google Fonts on ' + fullDate(f.dateAdded));
  if (f.lastModified && f.lastModified !== f.dateAdded) rows.push('Last updated ' + fullDate(f.lastModified));
  if (f.trending) rows.push(`Trending rank #${f.trending} on Google Fonts`);
  if (f.popularity) rows.push(`Popularity rank #${f.popularity} on Google Fonts`);
  return h('ul', { class: 'reasons' }, rows.map((r) => h('li', { text: r })));
}
function renderDetail() {
  const it = S.dlist[S.didx];
  const body = $('#sheetBody');
  body.textContent = '';
  const info = h('div', { class: 'info' });
  put(info, h('button', { class: 'icon close', type: 'button', 'aria-label': 'Close', onclick: () => sheet.close() }, icon('close')));
  if (S.dlist.length > 1) put(info, h('p', { class: 'pos', text: `${S.didx + 1} of ${S.dlist.length}` }));
  if (it.type === 'trend') put(info, labelEl(it.label));
  const title = h('h2', { tabindex: '-1', text: it.type === 'colour' ? 'Palette from ' + it.title : it.title });
  put(info, title);
  if (it.author) put(info, h('p', { class: 'by', text: it.author }));
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
      it.swatches ? block('Colours', paletteBlock(it.swatches.map((hex) => ({ hex, share: 0 })))) : null);
    put(info, h('div', { class: 'actions' }, detailSave(it)));
  } else {
    const out = h('a', { class: 'btn primary', href: it.url, target: '_blank', rel: 'noopener noreferrer', onclick: () => learn(it, 0.5) }, 'Open original', icon('out'));
    put(info, h('div', { class: 'actions' },
      out, detailSave(it),
      h('button', { class: 'btn', type: 'button', onclick: () => hideItem(it) }, icon('hide'), 'Hide'),
      h('button', { class: 'btn', type: 'button', onclick: () => muteSource(it.sid) }, icon('mute'), 'Mute ' + srcName(it.sid))));
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
      h('p', { class: 'srcline' }, 'Source → ', h('a', { href: it.url, target: '_blank', rel: 'noopener noreferrer', text: srcName(it.sid) })));
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
  $('#q').value = term;
  S.q = norm(term);
  loadAll().then(() => { setView('feed'); rebuild(); });
}

// ───────────────────────────────────────────── azioni + apprendimento
function learn(it, w) {
  if (!it || it.type === 'trend' || !it.category) return;
  const a = S.aff;
  a.cat[it.category] = clamp((a.cat[it.category] || 0) + w, -6, 6);
  a.src[it.sid] = clamp((a.src[it.sid] || 0) + w * 0.6, -6, 6);
  store.set('aff', a);
}
function syncSave(id) {
  const on = !!S.saved[id];
  for (const b of $$(`[data-save="${CSS.escape(id)}"]`)) {
    b.setAttribute('aria-pressed', String(on));
    const l = $('.lbl', b);
    if (l) l.textContent = on ? 'Saved' : 'Save';
  }
  const n = Object.keys(S.saved).length;
  $('#savedCount').textContent = n ? String(n) : '';
}
function toggleSave(it) {
  if (S.saved[it.id]) {
    delete S.saved[it.id];
    toast('Removed from saved');
  } else {
    const snap = { ...it, savedAt: new Date().toISOString() };
    delete snap._h;
    S.saved[it.id] = snap;
    learn(it, 1);
    toast('Saved');
  }
  store.set('saved', S.saved);
  syncSave(it.id);
  if (S.view === 'saved' && !sheet.open) renderSaved();
}
function hideItem(it) {
  S.hidden.add(it.id);
  store.set('hidden', [...S.hidden]);
  learn(it, -1);
  removeCards((d) => d.id === it.id);
  if (sheet.open) {
    S.dlist.splice(S.didx, 1);
    if (S.dlist.length) { S.didx = Math.min(S.didx, S.dlist.length - 1); renderDetail(); } else sheet.close();
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
  if (sheet.open) sheet.close();
  removeCards((d) => d.sid === sid);
  toast(`Muted ${srcName(sid)}`, 'Undo', () => { S.muted.delete(sid); store.set('muted', [...S.muted]); rebuild(true); });
}

// ───────────────────────────────────────────── viste
function setView(v) {
  S.view = v;
  for (const b of $$('.views button')) b.setAttribute('aria-current', b.dataset.view === v ? 'page' : 'false');
  feedEl.hidden = v !== 'feed';
  trendEl.hidden = v !== 'trending';
  savedEl.hidden = v !== 'saved';
  $('#filters').classList.toggle('off', v !== 'feed');
  statusEl.textContent = '';
  if (v === 'trending') renderTrending();
  if (v === 'saved') renderSaved();
  if (v === 'feed' && !S.blocks.size) rebuild();
  window.scrollTo(0, 0);
}
function setPeriod(p) {
  S.period = p;
  for (const b of $$('#period button')) b.setAttribute('aria-pressed', String(Number(b.dataset.p) === p));
  rebuild();
}
function savedList() {
  return Object.values(S.saved).sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
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
      fileIn)));
  S.savedBlk = null;
  if (!list.length) {
    savedEl.append(h('div', { class: 'empty' }, h('h2', { text: 'Nothing saved yet' }),
      h('p', { text: 'Tap the bookmark on a card to keep it here. Saved items stay after they leave the feed, on this device. Export moves them to another device.' })));
    return;
  }
  const cols = h('div', { class: 'cols' });
  savedEl.append(cols);
  const blk = { el: savedEl, cols, cards: [] };
  setCols(blk);
  for (const it of list) { const c = cardEl(it); blk.cards.push(c); place(blk, c); }
  S.savedBlk = blk;
}
function exportData() {
  const data = { app: 'segnale', version: 1, exportedAt: new Date().toISOString(), saved: S.saved, hidden: [...S.hidden], muted: [...S.muted], prefs: S.prefs, aff: S.aff };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  const a = h('a', { href: url, download: `segnale-${dayKey(new Date().toISOString())}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Exported saved items and preferences');
}
async function importData(file) {
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (d.app !== 'segnale') throw new Error('not a Segnale export');
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

// Trending
function sec(title, lede, ...content) {
  return h('section', { class: 'tr-sec' }, h('h2', { text: title }), lede ? h('p', { text: lede }) : null, content);
}
function pseudoTrend(id, label, title, summary, sources, evidence, extra) {
  return { id, type: 'trend', label, title, summary, sources, evidence, family: 'signal', basis: 'recurrence',
    firstDetected: S.index.generatedAt, date: S.index.generatedAt, count: evidence.length, ...extra };
}
function miniThumbs(ev) {
  return h('span', { class: 'mini', 'aria-hidden': 'true' }, (ev || []).filter((e) => e.image).slice(0, 3).map((e) =>
    h('i', { vars: e.palette && e.palette[0] ? { '--ph': e.palette[0].hex } : null },
      h('img', { alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', src: e.image.src, onerror: (ev2) => ev2.target.remove() }))));
}
function renderTrending() {
  trendEl.textContent = '';
  const idx = S.index;
  if (!idx) return;
  const b = idx.baseline || {};
  const lede = b.ok
    ? `Built from ${b.recentItems} items published in the last ${b.recentDays} days, compared with ${b.baselineItems} items from the ${b.baseDays - b.recentDays} days before.`
    : `Built from ${b.recentItems} items published in the last ${b.recentDays} days. Segnale has been watching for ${plural(b.observedDays || 0, 'day', 'days')}: growth is measured once it has three weeks of its own history. Until then a pattern means recurrence across independent sources, not proven growth.`;
  trendEl.append(h('header', { class: 'tr-head' }, h('h1', { text: 'Trending now' }), h('p', { text: lede })));
  const sig = idx.signals || {};
  const active = (idx.trends || []).filter((t) => t.label !== 'Consolidated').map(asTrend);
  trendEl.append(sec('Patterns', 'Inferred automatically from what the sources publish. Every pattern lists the projects behind it.',
    active.length ? h('div', { class: 'tgrid' }, active.map((t) => trendCard(t, active)))
      : h('p', { class: 'status', text: 'No pattern has enough evidence yet: it takes at least four items from three independent sources (three from two once growth can be measured).' })));

  const cols = (sig.colours || []).slice(0, 8);
  if (cols.length) {
    trendEl.append(sec('Colour signals', 'Dominant colours from the lead image of each project, grouped by hue and tone. These are counts: a colour is called a trend only once Segnale can compare it with earlier weeks.',
      h('div', { class: 'rows' }, cols.map((c) => {
        const t = pseudoTrend('sig-col-' + c.bin, c.status || 'Colour signal', c.bin.replace(/^\w/, (x) => x.toUpperCase()),
          `${c.count} palettes from ${c.sources.length} sources in the last ${b.recentDays || 14} days.`, c.sources, c.evidence, { swatches: [c.hex], family: 'colour' });
        return h('div', { class: 'row' },
          h('span', { class: 'sw', vars: { '--c': c.hex } }),
          h('span', {}, h('span', { class: 't', text: t.title }),
            h('small', { text: `${c.count} palettes, ${c.sources.length} sources${c.lift ? `, ${c.lift}x the previous rate` : ''}${c.status ? '. ' + c.status : ''}` })),
          miniThumbs(c.evidence),
          h('button', { class: 'open', type: 'button', 'aria-label': 'Open colour signal ' + t.title, onclick: () => openDetail(t, [t]) }));
      })),
      (sig.pairs || []).length ? h('div', { class: 'rows' }, sig.pairs.slice(0, 3).map((p) => {
        const title = p.bins.map((x, i) => (i ? x : x.replace(/^\w/, (c) => c.toUpperCase()))).join(' + ');
        const t = pseudoTrend('sig-pair-' + p.bins.join('-'), 'Recurring pairing', title,
          `Seen together in ${p.count} palettes from ${p.sources.length} sources.`, p.sources, p.evidence, { swatches: p.hex, family: 'colour' });
        return h('div', { class: 'row' },
          h('span', { class: 'sw', vars: { '--c': `linear-gradient(90deg, ${p.hex[0]} 50%, ${p.hex[1]} 50%)` } }),
          h('span', {}, h('span', { class: 't', text: title }), h('small', { text: `Together in ${p.count} palettes, ${p.sources.length} sources` })),
          miniThumbs(p.evidence),
          h('button', { class: 'open', type: 'button', 'aria-label': 'Open pairing ' + title, onclick: () => openDetail(t, [t]) }));
      })) : null));
  }

  const fonts = (sig.fonts || []).filter((f) => f.count >= 2).slice(0, 10);
  if (fonts.length) {
    trendEl.append(sec('Typefaces in use', 'Typefaces credited or named in recent projects (Fonts In Use, Typewolf, articles). Live previews load for Google Fonts families.',
      h('div', { class: 'rows' }, fonts.map((f) => {
        const t = pseudoTrend('sig-font-' + f.family, f.new ? 'New release in use' : 'Recurring typeface', f.family,
          `Credited in ${f.count} recent projects from ${f.sources.length} sources.`, f.sources, f.evidence,
          { family: 'font', font: { family: f.family, provider: f.google ? 'google' : null } });
        const ff = h('span', { class: 'ff', text: f.family });
        if (f.google) liveFont(ff, { family: f.family }, f.family);
        return h('div', { class: 'row font' }, ff,
          h('small', { text: `${f.count} projects, ${srcList(f.sources, 3)}${f.new ? '. New on Google Fonts' : ''}` }),
          h('button', { class: 'open', type: 'button', 'aria-label': 'Open typeface ' + f.family, onclick: () => openDetail(t, [t]) }));
      }))));
  }

  const radar = (sig.radar || []).slice(0, 12);
  if (radar.length) {
    trendEl.append(sec('New on Google Fonts, gaining traction', "Families added in the last year, ordered by Google Fonts' own trending rank. This is Google's usage data, not Segnale's opinion.",
      h('div', { class: 'rows' }, radar.map((f) => {
        const url = 'https://fonts.google.com/specimen/' + encodeURIComponent(f.family).replace(/%20/g, '+');
        const item = S.items.find((x) => x.url === url) || {
          id: 'gf-' + f.family, sid: 'googlefonts', url, title: f.family, author: (f.designers || []).join(', '), date: f.dateAdded || S.index.generatedAt,
          dateType: 'release', category: 'type', categories: ['type'], kind: 'release', font: { ...f, provider: 'google' },
          reasons: [`Google Fonts trending rank #${f.trending}`], why: `Google Fonts trending rank #${f.trending}`,
        };
        const ff = liveFont(h('span', { class: 'ff', text: f.family }), f, f.family);
        return h('div', { class: 'row font' }, ff,
          h('small', { text: `Trending #${f.trending}${f.dateAdded ? ', added ' + fmtShort.format(new Date(f.dateAdded)) : ''}${f.designers && f.designers.length ? ', ' + f.designers.slice(0, 2).join(', ') : ''}` }),
          h('button', { class: 'open', type: 'button', 'aria-label': 'Open ' + f.family, onclick: () => openDetail(item, [item]) }));
      }))));
  }

  const cov = (sig.coverage || []).slice(0, 10);
  if (cov.length) {
    trendEl.append(sec('Covered everywhere', 'The same project published by several independent sources in the last three weeks.',
      h('div', { class: 'rows' }, cov.map((c) => {
        const it = S.byId.get(c.id);
        return h('div', { class: 'row' },
          h('span', { class: 'sw', vars: { '--c': 'var(--carbon)' } }, c.image ? h('img', { alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', src: c.image.src, style: 'width:100%;height:100%;object-fit:cover;border-radius:3px', onerror: (e) => e.target.remove() }) : null),
          h('span', {}, h('span', { class: 't', text: c.title }), h('small', { text: `${c.sources.length} sources: ${srcList(c.sources, 4)}` })),
          h('span'),
          h('button', { class: 'open', type: 'button', 'aria-label': 'Open ' + c.title, onclick: () => (it ? openDetail(it, [it]) : window.open(c.url, '_blank', 'noopener')) }));
      }))));
  }

  const ph = (sig.phrases || []).slice(0, 14);
  if (ph.length) {
    trendEl.append(sec('In the conversation', 'Word pairs that recur in titles across different sources. Raw frequency, useful for spotting events and subjects. Tap one to search it.',
      h('div', { class: 'phrases' }, ph.map((p) => h('button', { type: 'button', onclick: () => searchFor(p.phrase) }, p.phrase, h('small', { text: String(p.count) }))))));
  }

  const cons = (idx.trends || []).filter((t) => t.label === 'Consolidated').map(asTrend);
  if (cons.length) {
    trendEl.append(sec('Consolidated', 'Still everywhere, but not new: present at a steady rate in both the recent window and the weeks before.',
      h('div', { class: 'tgrid' }, cons.map((t) => trendCard(t, cons)))));
  }
}
function asTrend(t) { return { ...t, type: 'trend', date: t.firstDetected }; }

// Pannello fonti e preferenze
function renderPanel() {
  const body = $('#panelBody');
  body.textContent = '';
  const idx = S.index;
  const w = h('div', { class: 'wrap' });
  w.append(h('button', { class: 'icon close', type: 'button', 'aria-label': 'Close', onclick: () => panel.close(), style: 'position:absolute;top:14px;right:14px' }, icon('close')));
  w.append(h('h2', { text: 'Sources and preferences' }));
  if (idx) {
    const ok = idx.sources.filter((s) => s.status && s.status.ok).length;
    w.append(h('p', { text: `Last update ${fullDate(idx.generatedAt)} at ${new Date(idx.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}. ${idx.stats.items} items in the last ${idx.retentionDays} days, ${ok} of ${idx.sources.length} automatic sources answered.` }));
  }

  w.append(h('h3', { text: 'Categories in All' }), h('p', { text: 'More pushes a category up inside each day, Less and Off thin it out. Choosing a category from the filter bar always shows everything in it.' }));
  const prefs = h('div', { class: 'prefs' });
  for (const [k, label] of CATS.filter(([k]) => !['all', 'trends'].includes(k))) {
    const cur = S.prefs[k] || 'normal';
    prefs.append(h('div', { class: 'row' }, h('span', { text: label }),
      h('div', { class: 'seg', role: 'group', 'aria-label': label },
        ['more', 'normal', 'less', 'off'].map((v) => h('button', {
          type: 'button', 'aria-pressed': String(cur === v), text: v[0].toUpperCase() + v.slice(1),
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
    w.append(h('h3', { text: 'Automatic sources' }), h('p', { text: 'Read two or three times a day by the update job. Turn a source off to hide its items on this device.' }));
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
    w.append(h('h3', { text: 'The colour bar' }), h('p', { text: 'The strip under the name is built from the lead images of the latest projects: one patch per project, its dominant colour, sorted by hue. Tap a patch to open the project.' }));
  }
  body.append(w);
}

// barra colore
function renderColourBar() {
  const bar = $('#colourbar');
  bar.textContent = '';
  const cb = S.index && S.index.colourBar;
  const segs = (cb && cb.segments) || [];
  segs.forEach((s, i) => {
    bar.append(h('button', {
      type: 'button', title: `${s.title}, ${srcName(s.sid)}`, 'aria-label': `${s.hex} from ${s.title}`, vars: { '--c': s.hex, '--i': i },
      onclick: () => { const it = S.byId.get(s.id); if (it) openDetail(it, segs.map((x) => S.byId.get(x.id)).filter(Boolean)); },
    }));
  });
  if (segs.length) {
    const hrs = cb.hours;
    bar.append(h('span', { class: 'cap', text: hrs <= 24 ? 'Colour of the last 24 hours' : hrs <= 72 ? `Colour of the last ${hrs} hours` : 'Colour of the week' }));
    bar.classList.add('tune');
  }
}

// ───────────────────────────────────────────── avvio
function bindChrome() {
  const cats = $('#cats');
  for (const [k, label] of CATS) {
    cats.append(h('button', {
      type: 'button', 'data-cat': k, 'aria-pressed': String(k === S.cat), text: label,
      onclick: (e) => {
        S.cat = k;
        for (const b of $$('button', cats)) b.setAttribute('aria-pressed', String(b.dataset.cat === k));
        e.currentTarget.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
        if (S.view !== 'feed') setView('feed');
        rebuild();
      },
    }));
  }
  for (const b of $$('#period button')) b.addEventListener('click', () => setPeriod(Number(b.dataset.p)));
  for (const b of $$('.views button')) b.addEventListener('click', () => setView(b.dataset.view));
  $('#home').addEventListener('click', () => { if (S.view !== 'feed') setView('feed'); else window.scrollTo({ top: 0, behavior: 'smooth' }); });
  $('#focusBtn').addEventListener('click', () => {
    const list = S.view === 'saved' ? savedList() : flatList();
    if (list.length) openDetail(list[0], list);
  });
  $('#sourcesBtn').addEventListener('click', () => { renderPanel(); panel.showModal(); });
  panel.addEventListener('click', (e) => { if (e.target === panel) panel.close(); });
  panel.addEventListener('close', () => { if (S.dirty) { S.dirty = false; rebuild(true); } });
  const q = $('#q');
  q.addEventListener('input', debounce(async () => {
    S.q = norm(q.value.trim());
    if (S.q) await loadAll();
    if (S.view !== 'feed') setView('feed');
    rebuild();
  }, 180));
  sheet.addEventListener('close', () => {
    $('#sheetBody').textContent = '';
    if (history.state && history.state.sheet) history.back();
  });
  window.addEventListener('popstate', () => { if (sheet.open) sheet.close(); });
  // scorciatoie a livello documento: dopo Next/Prev il focus non deve "perdersi" fuori dalla scheda
  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest && e.target.closest('input, textarea, [contenteditable]');
    if (sheet.open) {
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const it = S.dlist[S.didx];
      if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); }
      else if (e.key === 's' && it) toggleSave(it);
      else if (e.key === 'o' && it && it.url) { learn(it, 0.5); window.open(it.url, '_blank', 'noopener'); }
      return;
    }
    if (e.key === '/' && !typing && !panel.open) { e.preventDefault(); $('#top').classList.remove('away'); q.focus(); }
  });
  let lastY = window.scrollY;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const top = $('#top');
    if (y > lastY + 6 && y > 260) top.classList.add('away');
    else if (y < lastY - 6 || y < 140) top.classList.remove('away');
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
}

async function init() {
  const prev = store.get('lastVisit', null);
  S.since = prev ? Date.parse(prev) : null;
  store.set('lastVisit', new Date().toISOString());
  bindChrome();
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
    renderColourBar();
    rebuild(true);
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) {
      history.replaceState(null, '', location.pathname + location.search);
      await loadAll();
      const it = S.byId.get(id) || S.trendItems.find((t) => t.id === id);
      if (it) openDetail(it);
    }
  } catch (e) {
    feedEl.textContent = '';
    const local = e.message === 'file';
    feedEl.append(h('div', { class: 'empty' },
      h('h2', { text: local ? 'Open Segnale from a local server' : "Couldn't load the feed" }),
      h('p', { text: local ? 'Browsers block data files opened straight from disk. In the project folder run: python3 -m http.server 8000, then open http://localhost:8000'
        : `The data files did not load (${e.message}). If you are offline, the last copy loads once it has been cached; if this is a fresh install, run the pipeline once (see README).` }),
      local ? null : h('button', { class: 'btn', type: 'button', text: 'Try again', onclick: () => location.reload() })));
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

window.__segnale = S; // handle for debugging and automated tests
init();
