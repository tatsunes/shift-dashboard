const CACHE_NAME = 'shift-dashboard-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './env-loader.js',
  './app.js',
  './parser.js',
  './sheets-api.js',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

// Install: cache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching core assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => {
          console.log('[SW] Removing old cache:', key);
          return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API calls, cache-first for static assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Google API calls and OAuth: always go to network
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('accounts.google.com') ||
      url.hostname.includes('gstatic.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful GET responses
        if (response.ok && event.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache when offline
        return caches.match(event.request);
      })
  );
});
