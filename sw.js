/* Service Worker de PDM · Mantenimiento
   - La app (index.html, manifest, íconos) se abre desde caché si la red tarda
     más de 3 s, así no se queda en blanco con datos móviles lentos.
   - Las librerías de Firebase / QR (CDN) se guardan en caché la primera vez y
     después se sirven al instante: ya no se descargan en cada apertura.
   - Firestore, Monday.com y Open-Meteo NO se tocan (van directo a la red).
   Cambia CACHE_VERSION cada vez que subas cambios para forzar la actualización. */

const CACHE_VERSION = 'pdm-v2';
const APP_CACHE = CACHE_VERSION + '-app';
const CDN_CACHE = CACHE_VERSION + '-cdn';

const APP_SHELL = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];
const CDN_HOSTS = ['www.gstatic.com', 'cdnjs.cloudflare.com'];
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) =>
      // Uno por uno: si falta un archivo (p. ej. icon-512) no truena la instalación.
      Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Librerías de CDN (versión fija en la URL): caché primero.
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req, CDN_CACHE));
    return;
  }

  // Solo se manejan archivos de la propia app; todo lo demás va directo a la red.
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkWithTimeout(req, './index.html'));
    return;
  }
  event.respondWith(networkWithTimeout(req));
});

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) {
    const cache = await caches.open(cacheName);
    cache.put(req, res.clone());
  }
  return res;
}

/* Red primero, pero si no responde en NETWORK_TIMEOUT_MS se usa la copia en
   caché. La respuesta de red, cuando llega, actualiza la caché para la
   próxima vez. */
function networkWithTimeout(req, fallbackUrl) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (res) => { if (!settled && res) { settled = true; resolve(res); } };

    const fromCache = () => caches.match(req, { ignoreSearch: true })
      .then((c) => c || (fallbackUrl ? caches.match(fallbackUrl) : null));

    const timer = setTimeout(() => fromCache().then(finish), NETWORK_TIMEOUT_MS);

    fetch(req).then((res) => {
      clearTimeout(timer);
      if (res && res.ok) {
        // Los clones se hacen aquí mismo, antes de entregar la respuesta al navegador.
        const copy = res.clone();
        const shellCopy = req.mode === 'navigate' ? res.clone() : null;
        caches.open(APP_CACHE).then((cache) => {
          cache.put(req, copy);
          if (shellCopy) cache.put('./index.html', shellCopy);
        });
      }
      finish(res);
    }).catch(() => {
      clearTimeout(timer);
      fromCache().then((c) => finish(c || new Response('Sin conexión', { status: 503 })));
    });
  });
}
