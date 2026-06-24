const CACHE_NAME = 'lunar-v4';

const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/suncalc@1.9.0/suncalc.js',
];

const APP_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './src/app.js',
  './src/location.js',
  './src/moon.js',
  './src/compass.js',
  './src/orientation.js',
  './src/weather.js',
  './public/icons/icon.svg',
];

// 항상 최신 데이터가 필요한 외부 API — 캐시 제외
const API_HOSTS = ['api.open-meteo.com', 'timeapi.io'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([...APP_ASSETS, ...CDN_ASSETS]))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const isCDN = CDN_ASSETS.some((asset) => event.request.url.includes(asset));

  if (isCDN) {
    // CDN 라이브러리: 캐시 우선 (URL에 버전이 고정되어 있으므로 안전)
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response.status === 200) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        })
      )
    );
  } else {
    // 외부 API는 캐시 없이 네트워크만 사용
    const isAPI = API_HOSTS.some(h => event.request.url.includes(h));
    if (isAPI) {
      event.respondWith(
        fetch(event.request).catch(() => new Response('{}', { status: 503 }))
      );
      return;
    }

    // 앱 파일: 네트워크 우선 → 온라인 시 항상 최신 버전, 오프라인 시 캐시 fallback
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200 && event.request.method === 'GET') {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then(
            (cached) => cached || new Response('Service Unavailable', { status: 503 })
          )
        )
    );
  }
});
