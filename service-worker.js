const CACHE_NAME = 'moguria-core-v3.1.1-hardening';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './css/home-icons.css',
  './css/home-hardening.css',
  './js/config.js',
  './js/debug.js',
  './js/save.js',
  './js/meta.js',
  './js/skills.js',
  './js/enemies.js',
  './js/validator.js',
  './js/player.js',
  './js/dungeon.js',
  './js/result.js',
  './js/home.js',
  './js/audio.js',
  './js/game.js',
  './js/ui.js',
  './js/assetManager.js',
  './js/performance.js',
  './js/network.js',
  './js/errorLog.js',
  './js/platform.js',
  './js/security.js',
  './js/saveTools.js',
  './js/cheatMenu.js',
  './js/main.js',
  './assets/manifest.json',
  './assets/images/home/home_room_bg.png',
  './assets/images/home/mogu_home.png',
  './assets/images/home/glass_panel.png',
  './assets/images/home/gold_button.png',
  './assets/images/home-icons/snack.svg',
  './assets/images/home-icons/dex.svg',
  './assets/images/home-icons/logs.svg',
  './assets/images/home-icons/gacha.svg',
  './assets/images/home-icons/equip.svg',
  './assets/images/home-icons/dungeon.svg',
  './assets/images/home-icons/outing.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(CORE_ASSETS.map(asset => cache.add(asset).catch(error => console.warn('[MoguriaSW] cache failed', asset, error)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('moguria-core-') && k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isDocumentOrCode(request){
  const accept = request.headers.get('accept') || '';
  const url = new URL(request.url);
  return request.mode === 'navigate' || accept.includes('text/html') || /\.(?:js|css|json)$/i.test(url.pathname);
}

async function networkFirst(request){
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    return await caches.match(request) || Response.error();
  }
}

async function cacheFirst(request){
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(isDocumentOrCode(req) ? networkFirst(req) : cacheFirst(req));
});
