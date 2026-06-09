const CACHE = 'ag-studio-v2';
const PRECACHE = [
  '/', '/index.html', '/booking.html',
  '/pillar-radha.html', '/pillar-veronica.html', '/pillar-tour.html',
  '/assets/css/global.css', '/assets/css/style.css', '/assets/css/index.css',
  '/assets/css/vfx.css',
  '/assets/js/main.js', '/assets/js/ai-chat-widget.js',
  '/assets/media/icon-192.png', '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' }))))
      .catch(() => {}) // don't fail install on cache miss
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/')) return; // never cache API

  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
