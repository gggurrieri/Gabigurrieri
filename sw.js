/* Service worker mínimo: deja la app disponible sin conexión. */
const CACHE = 'desafio12-v3';
const ASSETS = ['./', './index.html', './assets/styles.css', './assets/app.js',
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

/* Se responde con lo guardado —instantáneo, y anda sin señal— y se revalida
   en segundo plano. Solo con caché, una app ya instalada se quedaba pegada a
   la versión vieja mientras no cambiara el nombre del caché. */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => {
      const red = fetch(e.request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit || caches.match('./index.html'));
      return hit || red;
    })
  );
});
