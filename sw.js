/* Service Worker — PDM · Mantenimiento
   Sube el número de CACHE_VERSION cada vez que publiques cambios
   importantes en index.html para forzar la actualización en los
   teléfonos que ya tienen la app instalada. */
const CACHE_VERSION = 'pdm-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Instala: precachea el shell de la app.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activa: borra caches de versiones anteriores.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first para el HTML/manifest (para que se refresque en
// cuanto haya conexión), cache-first para el resto (íconos, assets).
// Las llamadas a Firebase/Monday/CDNs externos pasan directo a la red,
// sin tocar el cache, para no interferir con los datos en vivo.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo maneja peticiones GET del mismo origen (el shell de la app).
  if (req.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  const isShellDoc =
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    url.pathname.endsWith('manifest.json');

  if (isShellDoc) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((res) => res || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        return res;
      });
    })
  );
});
