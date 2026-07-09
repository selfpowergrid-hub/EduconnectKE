// Minimal service worker — makes LogiQ-Taaluma installable as a desktop/mobile
// app and gives a graceful offline shell. Deliberately network-first with no
// asset precaching, so a new deploy is picked up immediately (no stale bundles)
// and API/data always hit the network.

const SHELL = 'logiq-taaluma-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(['/', '/index.html']).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Page loads: network-first (always fresh online), fall back to the cached
  // shell when offline so the app still opens.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(SHELL).then((c) => c.put('/index.html', res.clone())).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
  }
  // Everything else (hashed assets, Supabase) goes straight to the network.
});
