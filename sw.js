// Service Worker — PDM Mantenimiento
// Cachea el "app shell" (HTML/manifest/iconos) para que la app abra offline o con red débil.
// Las llamadas a Firebase/Firestore, Monday.com y CDNs externos NUNCA se cachean aquí:
// se dejan pasar directo a la red para no interferir con datos en tiempo real.

const CACHE_NAME = 'pdm-shell-v1';
const APP_SHELL = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo interceptamos GET del mismo origen (el propio app shell).
  // Todo lo demás (Firestore, Firebase Auth, Monday.com, CDNs, fuentes) va directo a la red.
  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isAppShellFile = APP_SHELL.some((f) => req.url.endsWith(f.replace('./', '')));

  if (req.method !== 'GET' || !isSameOrigin || !isAppShellFile) {
    return; // deja pasar sin intervenir
  }

  // Network-first con fallback a caché: siempre intenta traer la versión más nueva,
  // y si no hay red, sirve lo último guardado.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
