/* DSGNBRD service worker
   - app shell: stale-while-revalidate (si apre offline, si aggiorna al giro dopo)
   - data/*.json: network-first con copia di riserva (offline vedi l'ultimo feed scaricato); se la rete
     resta appesa per NET_WAIT ms si mostra la copia e la risposta vera aggiorna la cache per la volta dopo
   - Google Fonts: cache-first solo per il CSS di Archivo e i file dei font
   - immagini dei progetti: NON in cache (restano sui server delle fonti) */
const VERSION = 'dsgnbrd-shell-3';
const NET_WAIT = 5000;
const DATA = 'dsgnbrd-data';
const FONTS = 'dsgnbrd-fonts';
const SHELL = ['./', './index.html', './assets/app.css', './assets/app.js', './manifest.webmanifest',
  './assets/icons/favicon-48.png', './assets/icons/icon-192.png', './assets/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  // cache: 'reload' = prende i file nuovi dal server, non dalla cache HTTP del browser
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
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
    if (url.pathname.includes('/data/')) e.respondWith(networkFirst(e));
    else e.respondWith(staleWhileRevalidate(req));
    return;
  }
  const archivoCss = url.hostname === 'fonts.googleapis.com' && url.search.includes('family=Archivo');
  if (archivoCss || url.hostname === 'fonts.gstatic.com') e.respondWith(cacheFirst(req));
});
async function networkFirst(e) {
  const req = e.request;
  const cache = await caches.open(DATA);
  const net = fetch(req).then((res) => {
    if (res.ok) e.waitUntil(cache.put(req, res.clone()).catch(() => {}));
    return res;
  });
  e.waitUntil(net.catch(() => {})); // il service worker resta vivo finché la risposta vera non arriva in cache
  const hit = await cache.match(req, { ignoreSearch: true });
  if (!hit) return net;
  // prima: senza copia di riserva a tempo, una rete "appesa" (Wi-Fi debole) lasciava lo scheletro per decine di secondi
  return Promise.race([net.catch(() => hit), new Promise((ok) => setTimeout(() => ok(hit), NET_WAIT))]);
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
