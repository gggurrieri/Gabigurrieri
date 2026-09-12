/* Service worker mínimo: deja la app disponible sin conexión. */
const CACHE = 'perfumario-v2';
const ASSETS = ['./', './index.html', './assets/styles.css', './assets/app.js', './assets/datos.js',
  './assets/icon.svg', './assets/icon-180.png', './assets/icon-512.png', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  /* Solo se cachea lo propio. El clima es de otro origen y cambia todo el
     tiempo: servirlo desde la caché dejaría la temperatura congelada. */
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
