// --SERVICE WORKER: CACHE STRATEGY--
const CACHE_NAME = '8saints-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/pages/auth.html',
  '/pages/catalog.html',
  '/pages/customer-orders.html',
  '/pages/admin-dashboard.html',
  '/css/style.css',
  '/js/config.js',
  '/js/app.js',
  '/js/auth.js',
  '/js/services.js',
  '/js/orders.js',
  '/assets/images/logo.png',
  '/assets/images/hero.png',
  '/assets/images/service_barong.png',
  '/assets/images/service_suit.png',
  '/assets/images/service_dress.png',
  '/assets/images/service_alterations.png',
  '/assets/images/service_uniform.png',
  '/manifest.json',
];

// --INSTALL EVENT: PRE-CACHE STATIC ASSETS--
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// --ACTIVATE EVENT: CLEAN OLD CACHES--
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// --FETCH EVENT: SAFE CACHING STRATEGY--
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Supabase API requests: network-first with offline JSON fallback
  if (url.hostname.includes('supabase.co') || url.pathname.startsWith('/rest/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // HTML page navigations: network-first with cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match('/index.html');
          return fallback || new Response('Offline mode', { status: 200, headers: { 'Content-Type': 'text/html' } });
        })
    );
    return;
  }

  // Static assets on the same origin: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
  }
});

// --CACHE-FIRST STRATEGY--
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const fallback = await caches.match('/index.html');
    return fallback || new Response('Asset unavailable offline', { status: 503 });
  }
}

// --NETWORK-FIRST STRATEGY--
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ error: 'Offline' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
