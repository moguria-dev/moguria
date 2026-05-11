const CACHE_NAME = 'moguria-core-v1.3.0';
const CORE_ASSETS = [
  './', './index.html', './style.css',
  './js/config.js', './js/debug.js', './js/save.js', './js/skills.js', './js/enemies.js',
  './js/validator.js', './js/player.js', './js/dungeon.js', './js/result.js', './js/home.js',
  './js/game.js', './js/ui.js', './js/assetManager.js', './js/performance.js', './js/network.js', './js/main.js',
  './assets/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('moguria-core-') && k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if(res && res.ok){
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
