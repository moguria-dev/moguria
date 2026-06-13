const CACHE_NAME = 'moguria-core-v1.3.2-home-cave-bg-base';

const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './css/home-icons.css',
  './css/home-cave-bg.css',

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
  './js/home-cave-bg.js',
  './js/audio.js',
  './js/game.js',
  './js/ui.js',
  './js/assetManager.js',
  './js/performance.js',
  './js/network.js',
  './js/errorLog.js',
  './js/saveTools.js',
  './js/cheatMenu.js',
  './js/platform.js',
  './js/security.js',
  './js/main.js',

  './assets/manifest.json',
  './assets/images/home/home_cave_base.webp',
  './assets/images/home/home_cave_depth_wash.webp',
  './assets/images/home/home_cave_lamp_glow.png',
  './assets/images/home/home_cave_star_particle.png',
  './assets/images/home/home_cave_crystal_sprite.png',
  './assets/images/home/home_room_bg_v31b.png',
  './assets/images/home/home_room_bg.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('moguria-core-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
