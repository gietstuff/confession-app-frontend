// GIET Confessions — Service Worker v3.0
// Bump version = forces all clients to get fresh sw + fresh HTML
const CACHE = 'giet-conf-v3';
const SHELL = ['/manifest.json', '/manifest-admin.json'];

self.addEventListener('install', e => {
  // Skip waiting immediately so new SW activates right away
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL).catch(()=>{}))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    // Delete ALL old caches
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // ── API calls: always network, never cache ────────────
  if (url.pathname.startsWith('/api/') || url.hostname.includes('onrender.com')) {
    e.respondWith(fetch(e.request).catch(() =>
      new Response('{"error":"offline"}', {headers:{'Content-Type':'application/json'}})
    ));
    return;
  }

  // ── HTML pages: network-first so mobile always gets fresh ──
  if (e.request.mode === 'navigate' || e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(resp => {
          // Cache a fresh copy
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return resp;
        })
        .catch(() => caches.match(e.request)) // fallback to cache if offline
    );
    return;
  }

  // ── Everything else (fonts, assets): cache-first ─────
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      });
    })
  );
});

// ── Push Notifications ────────────────────────────────
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; }
  catch(err) { data = { title: '💌 GIET Confessions', body: e.data ? e.data.text() : 'New update!' }; }

  const options = {
    body: data.body || 'Check out the latest confessions!',
    icon: 'https://em-content.zobj.net/source/twitter/376/love-letter_1f48c.png',
    badge: 'https://em-content.zobj.net/source/twitter/376/love-letter_1f48c.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: 'giet-confession',
    renotify: true,
    requireInteraction: false,
    data: { url: data.url || 'https://page-confession.vercel.app' }
  };

  e.waitUntil(
    self.registration.showNotification(data.title || '💌 GIET Confessions', options)
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || 'https://page-confession.vercel.app';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      for (const win of wins) {
        if (win.url.includes('page-confession.vercel.app') && 'focus' in win) {
          win.navigate(url);
          return win.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
