/* Segnale service worker
   - app shell: stale-while-revalidate (si apre offline, si aggiorna al giro dopo)
   - data/*.json: network-first con copia di riserva (offline vedi l'ultimo feed scaricato)
   - Google Fonts: cache-first solo per il CSS di Archivo e i file .woff2
   - immagini dei progetti: NON in cache (restano sui server delle fonti) */
const VERSION = 'segnale-v1';
const DATA = 'segnale-data';
const FONTS = 'segnale-fonts';
const SHELL = ['./', './index.html', './assets/app.css', './assets/app.js', './manifest.webmanifest',
  './assets/icons/icon.svg', './assets/icons/icon-192.png', './assets/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => ![VERSION, DATA, FONTS].includes(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.includes('/data/')) e.respondWith(networkFirst(req));
    else e.respondWith(staleWhileRevalidate(req));
    return;
  }
  const archivoCss = url.hostname === 'fonts.googleapis.com' && url.search.includes('family=Archivo');
  if (archivoCss || url.hostname === 'fonts.gstatic.com') e.respondWith(cacheFirst(req));
});
async function networkFirst(req) {
  const cache = await caches.open(DATA);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}
async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}
async function cacheFirst(req) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
