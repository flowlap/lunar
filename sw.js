// ⚠️ APP_VERSION(src/app.js)과 항상 동일하게 유지
const CACHE_VERSION = '1.6';
const CACHE_NAME = `lunar-v${CACHE_VERSION}`;

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
    caches.open(CACHE_NAME).then((cache) => {
      // CDN: 버전 고정 URL이므로 HTTP 캐시 허용
      cache.addAll(CDN_ASSETS);
      // 앱 파일: HTTP 캐시 우회하여 항상 최신 파일로 저장
      return cache.addAll(
        APP_ASSETS.map((url) => new Request(url, { cache: 'reload' }))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        const oldCaches = keys.filter((k) => k !== CACHE_NAME);
        const isUpdate = oldCaches.length > 0;
        return Promise.all(oldCaches.map((k) => caches.delete(k))).then(() => isUpdate);
      })
      .then((isUpdate) => {
        if (!isUpdate) return;
        // 업데이트인 경우 열려 있는 모든 탭에 reload 요청
        return self.clients
          .matchAll({ type: 'window', includeUncontrolled: true })
          .then((clients) => {
            clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
          });
      })
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
    return;
  }

  // 외부 API는 캐시 없이 네트워크만 사용
  const isAPI = API_HOSTS.some((h) => event.request.url.includes(h));
  if (isAPI) {
    event.respondWith(
      fetch(event.request).catch(() => new Response('{}', { status: 503 }))
    );
    return;
  }

  // 앱 파일: HTTP 캐시 우회 네트워크 우선 → 오프라인 시 캐시 fallback
  event.respondWith(
    fetch(new Request(event.request, { cache: 'no-cache' }))
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
});
