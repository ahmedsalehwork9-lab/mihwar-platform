// MIHWAR PWA Service Worker
// Strategy:
//   - Static assets (JS/CSS/fonts/images): Cache First
//   - Supabase API calls: Network First (never cache)
//   - Navigation (HTML): Network First with offline fallback

const CACHE_NAME   = 'mihwar-v1';
const OFFLINE_URL  = '/';

// Assets to pre-cache on install
const PRECACHE = [
  '/',
  '/manifest.json',
];

// ── Install ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept Supabase or external API calls
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('qrserver.com') ||
      url.protocol === 'chrome-extension:') {
    return;
  }

  // Static assets: Cache First
  if (request.destination === 'script' ||
      request.destination === 'style'  ||
      request.destination === 'image'  ||
      request.destination === 'font') {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Navigation: Network First with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then(r => r ?? new Response('Offline', { status: 503 }))
      )
    );
    return;
  }
});

// ── Push Notifications (future) ───────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title ?? 'محور', {
    body:  data.body ?? '',
    icon:  '/icon-192.png',
    badge: '/icon-192.png',
    dir:   'rtl',
    lang:  'ar',
  });
});
