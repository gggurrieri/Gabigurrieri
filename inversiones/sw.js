/* Service worker: la app tiene que abrir sin conexión, pero nunca quedarse
   pegada a una versión vieja.

   Primero la red, y la caché queda como respaldo para cuando no hay
   señal. Se pierde algo de velocidad en el arranque y se gana que lo que
   ves sea siempre lo último publicado. La versión se actualiza junto con
   la de app.js.                                                        */
const VERSION = '2026-09-21.1';
const CACHE = 'rentafija-' + VERSION;
const ASSETS = ['./', './index.html', './assets/styles.css', './assets/app.js',
  './assets/motor.js', './assets/datos.js', './assets/icon.svg',
  './assets/icon-180.png', './assets/icon-512.png', './manifest.json'];

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
  if (new URL(e.request.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copia = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
  );
});
