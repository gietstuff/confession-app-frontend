// GIET Confessions — Service Worker v4.0
// PWA-ready: offline fallback, push notifications, background sync
const CACHE = 'giet-conf-v4';
const OFFLINE_URL = '/offline.html';
const SHELL = [
  '/',
  '/index.html',
  '/confessions-v3.html',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// ── Install: cache shell immediately ──────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => {
      // Cache shell files, ignore failures (some may not exist yet)
      return Promise.allSettled(SHELL.map(url => c.add(url).catch(() => {})));
    })
  );
});

// ── Activate: delete old caches ───────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch strategy ────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API calls: always network, return error JSON if offline
  if (url.hostname.includes('onrender.com') || url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response('{"error":"offline"}', { headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }

  // External resources (fonts, CDN): network first, cache fallback
  if (!url.hostname.includes('page-confession.vercel.app') && url.hostname !== location.hostname) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // HTML navigation: network first → cache → offline fallback
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(resp => {
          if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return resp;
        })
        .catch(async () => {
          const cached = await caches.match(e.request);
          return cached || caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  // Static assets: cache first → network → cache update
  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request).then(resp => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      });
      return cached || networkFetch;
    })
  );
});

// ── Push Notifications ────────────────────────────────
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; }
  catch { data = { title: '💌 GIET Confessions', body: e.data?.text() || 'New update!' }; }

  const options = {
    body: data.body || 'Check out the latest confessions!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'giet-confession',
    renotify: true,
    requireInteraction: false,
    data: { url: data.url || 'https://page-confession.vercel.app/confessions-v3.html' },
    actions: [
      { action: 'open', title: '💌 Open' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  e.waitUntil(
    self.registration.showNotification(data.title || '💌 GIET Confessions', options)
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  const url = e.notification.data?.url || 'https://page-confession.vercel.app/confessions-v3.html';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      for (const win of wins) {
        if (win.url.includes('page-confession.vercel.app') && 'focus' in win) {
          win.navigate(url); return win.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ── Background Sync (for offline confession submission) ──
// LEARN: If user submits while offline, we queue it here and
// send it automatically when they reconnect.
self.addEventListener('sync', e => {
  if (e.tag === 'confession-queue') {
    e.waitUntil(sendQueuedConfessions());
  }
});

async function sendQueuedConfessions() {
  // Open IndexedDB queue
  const db = await openDB();
  const tx = db.transaction('queue', 'readonly');
  const all = await getAllFromStore(tx.objectStore('queue'));
  for (const item of all) {
    try {
      const r = await fetch('https://confession-app-1w0s.onrender.com/api/confessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.body)
      });
      if (r.ok) {
        // Remove from queue
        const tx2 = db.transaction('queue', 'readwrite');
        tx2.objectStore('queue').delete(item.id);
      }
    } catch (err) { /* will retry next sync */ }
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('giet-offline', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = reject;
  });
}

function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = reject;
  });
}
