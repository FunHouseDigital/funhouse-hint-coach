// Service worker: answers from the cache first, so the app works offline after one full load.
// The page (js/offline.js) fills the caches with progress. This file only serves and cleans up.
const SHELL = 'hint-coach-shell-v4';
const MODEL = 'hint-coach-model-74a4da8c'; // first 8 of the model sha256; change with the model
const KEEP = [SHELL, MODEL];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('hint-coach-') && !KEEP.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    // Only this version's caches answer, so a stale cache left by an older page can never win.
    for (const k of KEEP) {
      const hit = await (await caches.open(k)).match(e.request, { ignoreSearch: true });
      if (hit) return hit;
    }
    if (e.request.mode === 'navigate' && url.pathname.endsWith('/')) {
      const idx = await (await caches.open(SHELL)).match(new URL('index.html', e.request.url).href);
      if (idx) return idx;
    }
    return fetch(e.request);
  })());
});
