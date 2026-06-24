const CACHE_NAME = 'lunar-v1';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './src/app.js',
  './src/location.js',
  './src/moon.js',
  './src/compass.js',
  './src/orientation.js',
  './public/icons/icon.svg',
  'https://cdn.jsdelivr.net/npm/suncalc@1.9.0/suncalc.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request)
        .then((response) => {
          if (event.request.method === 'GET' && response.status === 200) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        })
        .catch(() => new Response('Service Unavailable', { status: 503 }));
    })
  );
});
