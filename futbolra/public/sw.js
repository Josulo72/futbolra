// Futbolra como app: guarda la web para abrirla rápido y sin conexión.
// Los datos de la porra (/api/) van siempre a la red.
const CACHE = 'futbolra-v1';
const SHELL = [
  '/',
  '/styles.css',
  '/manifest.webmanifest',
  '/src/utils/formatters.js',
  '/src/core/Match.js',
  '/src/core/Participant.js',
  '/src/core/GameManager.js',
  '/src/services/ScheduleService.js',
  '/src/services/FixturesService.js',
  '/src/ui/App.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/assets/logos/placeholder.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Red primero: cada despliegue se ve al momento; la copia solo se usa sin conexión
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then(hit => hit || (request.mode === 'navigate' ? caches.match('/') : Response.error())))
  );
});
