/* Service worker — offline cache for S×M Arcade
   Strategy: NETWORK-FIRST for same-origin GETs.
   - When online, always fetch the latest file (so bug fixes & new games reach
     every device immediately — no stale cached code).
   - When offline, fall back to the cached copy so the app still works.
   - Bump CACHE to force-drop old caches. */
const CACHE = 'sm-arcade-v26';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/styles.css',
  './assets/js/config.js',
  './assets/js/store.js',
  './assets/js/icons.js',
  './assets/js/ui.js',
  './assets/js/words.js',
  './assets/js/games-classic.js',
  './assets/js/games-mind.js',
  './assets/js/games-fun2.js',
  './assets/js/games-strategy2.js',
  './assets/js/games-dice.js',
  './assets/js/games-abstract.js',
  './assets/js/games-cards.js',
  './assets/js/games-word2.js',
  './assets/js/games-draw.js',
  './assets/js/games-ultimate.js',
  './assets/js/games-tournament.js',
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
  if (url.origin !== location.origin) return; // Firebase/fonts → straight to network
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});
