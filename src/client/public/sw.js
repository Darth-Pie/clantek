/**
 * ClanTek service worker — a deliberately conservative first pass.
 *
 * Goals: make the app installable and give it a usable offline shell without
 * ever risking a stale or broken UI.
 *   - Navigations (HTML): network-first, so a deployed update always wins when
 *     online; only when offline do we fall back to the cached shell.
 *   - Static assets (hashed, immutable): cache-first with a background refresh.
 *   - /api/* and /media/*: never touched — always live from the network, so
 *     auth, data, and uploads are never served from a stale cache.
 *
 * Bump CACHE to invalidate everything on the next activate.
 */

const CACHE = 'clantek-v1';
const SHELL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.add(SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Dynamic + authenticated surfaces are always live.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) return;

  // HTML navigations: network-first so updates land immediately when online.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(SHELL, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(SHELL)),
    );
    return;
  }

  // Everything else (hashed JS/CSS/images): cache-first, refresh in background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
