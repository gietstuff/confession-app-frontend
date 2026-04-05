// GIET Confessions — Service Worker v2.0
const CACHE = 'giet-conf-v2';
const SHELL = ['/', '/index.html', '/admin.html', '/manifest.json', '/manifest-admin.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL).catch(()=>{})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) {
    e.respondWith(fetch(e.request).catch(() =>
      new Response('{"error":"offline"}', {headers:{'Content-Type':'application/json'}})
    ));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
      if (resp && resp.status === 200) {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return resp;
    }))
  );
});

// ── Push Notifications ────────────────────────────────
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch(err) { data = { title: '💌 GIET Confessions', body: e.data ? e.data.text() : 'New update!' }; }

  const options = {
    body: data.body || 'Check out the latest confessions!',
    icon: 'https://em-content.zobj.net/source/twitter/376/love-letter_1f48c.png',
    badge: 'https://em-content.zobj.net/source/twitter/376/love-letter_1f48c.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: 'giet-confession',   // replaces previous notification of same tag
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
