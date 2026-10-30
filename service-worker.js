const STATIC_CACHE = 'dpa-static-v1';
const RUNTIME_CACHE = 'dpa-runtime-v1';
const EVENT_CACHE = 'dpa-events-v1';

const APP_SHELL = [
  '/',
  '/index.html',
  '/drunk.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/assets/css/style.css',
  '/assets/css/drunk.css',
  '/assets/js/main.js',
  '/assets/js/i18n.js',
  '/assets/js/drunk.js',
  '/assets/js/pwa.js',
  '/assets/img/pwa/icon-192.png',
  '/assets/img/pwa/icon-512.png',
  '/assets/img/pwa/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  const valid = new Set([STATIC_CACHE, RUNTIME_CACHE, EVENT_CACHE]);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('dpa-') && !valid.has(key)).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch (_) {
    return (await cache.match(request, { ignoreSearch: true })) ||
      (fallbackUrl ? await caches.match(fallbackUrl, { ignoreSearch: true }) : undefined) ||
      new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const update = fetch(request).then(response => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || (await update) || new Response('', { status: 504 });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === '/assets/data/drunk-events.json') {
    event.respondWith(networkFirst(request, EVENT_CACHE));
    return;
  }

  if (request.mode === 'navigate') {
    const fallback = url.pathname === '/drunk.html' ? '/drunk.html' : '/offline.html';
    event.respondWith(networkFirst(request, RUNTIME_CACHE, fallback));
    return;
  }

  if (/\.(?:css|js|png|webp|svg|woff2?)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
