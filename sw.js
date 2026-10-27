// Network-first: online visitors always get the latest deploy; the cache is only an offline fallback.
// Because fresh responses refresh the cache, CACHE_NAME no longer needs bumping on each deploy.
const CACHE_NAME = 'trackfinance-v1';
// Caches written by the old cache-first worker, which kept serving stale pages after a deploy.
const LEGACY_CACHE_PREFIX = 'expense-tracker-';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=34',
  './themes.css?v=6',
  './app.js?v=33',
  './firebase-config.js',
  './i18n.js',
  './landing-motion.js',
  './dialog.js',
  './manifest.json',
  './privacy.html',
  './terms.html',
  './legal.css?v=1',
  './legal.js?v=1',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const stale = (await caches.keys()).filter((k) => k !== CACHE_NAME);
    await Promise.all(stale.map((k) => caches.delete(k)));
    await self.clients.claim();
    // Pages opened under the old worker were served from its stale cache: reload them once
    // so returning visitors see the new version on their first visit.
    if (stale.some((k) => k.startsWith(LEGACY_CACHE_PREFIX))) {
      const windows = await self.clients.matchAll({ type: 'window' });
      windows.forEach((client) => client.navigate(client.url));
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Firebase, Google Fonts and other cross-origin or non-GET requests go straight to the network.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      // no-cache revalidates with the server, so a fresh deploy isn't hidden behind the HTTP cache.
      const response = await fetch(new Request(request, { cache: 'no-cache' }));
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    } catch (err) {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') return caches.match('./index.html');
      throw err;
    }
  })());
});
