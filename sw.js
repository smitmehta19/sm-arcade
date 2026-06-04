/* Service worker — offline cache for S×M Arcade
   Strategy: stale-while-revalidate for same-origin GETs.
   - Serves from cache instantly (fast + offline), then refreshes the cache from
     the network in the background, so edits show up on the next open automatically.
   - Bump CACHE below whenever you want to force every device to drop old files. */
const CACHE = 'sm-arcade-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/styles.css',
  './assets/js/config.js',
  './assets/js/store.js',
  './assets/js/ui.js',
  './assets/js/games-classic.js',
  './assets/js/games-mind.js',
  './assets/js/games-arcade.js',
  './assets/js/app.js',
  './assets/icons/icon.svg',
  './assets/icons/favicon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only handle our own files. Firebase/Google Fonts go straight to the network.
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(req).then(cached => {
        const network = fetch(req).then(res => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        }).catch(() => cached || cache.match('./index.html'));
        // serve cached immediately if present, else wait for network
        return cached || network;
      })
    )
  );
});
