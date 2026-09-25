/* Service worker: la app tiene que abrir sin conexión, pero nunca quedarse
   pegada a una versión vieja.

   La primera versión cacheaba "primero la caché": rapidísimo, y con un efecto
   feo — una vez guardada, la app no volvía a pedir los archivos nunca más y
   las correcciones no llegaban al teléfono aunque estuvieran publicadas.

   Ahora es al revés: primero la red, y la caché queda como respaldo para
   cuando no hay señal. Se pierde algo de velocidad en el arranque y se gana
   que lo que ves sea siempre lo último publicado.                          */
const VERSION = '2026-09-25.2';
const CACHE = 'perfumario-' + VERSION;
const ASSETS = ['./', './index.html', './assets/styles.css', './assets/app.js',
  './assets/datos.js', './assets/coleccion.js', './assets/icon.svg',
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
  /* Solo lo propio. El clima es de otro origen y cambia todo el tiempo:
     servirlo desde la caché dejaría la temperatura congelada. */
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
