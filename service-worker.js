const CACHE_NAME = 'moguria-core-v1.3.4-kv-asset-rich';

const CORE_ASSETS = [
  "./",
  "./style.css",
  "./css/home-icons.css",
  "./assets/manifest.json",
  "./js/config.js",
  "./js/debug.js",
  "./js/save.js",
  "./js/meta.js",
  "./js/skills.js",
  "./js/enemies.js",
  "./js/validator.js",
  "./js/player.js",
  "./js/dungeon.js",
  "./js/result.js",
  "./js/home.js",
  "./js/audio.js",
  "./js/game.js",
  "./js/ui.js",
  "./js/assetManager.js",
  "./js/performance.js",
  "./js/network.js",
  "./js/errorLog.js",
  "./js/saveTools.js",
  "./js/cheatMenu.js",
  "./js/platform.js",
  "./js/security.js",
  "./js/main.js",
  "./assets/images/home-icons/dex.png",
  "./assets/images/home-icons/dungeon.png",
  "./assets/images/home-icons/equip.png",
  "./assets/images/home-icons/gacha.png",
  "./assets/images/home-icons/logs.png",
  "./assets/images/home-icons/outing.png",
  "./assets/images/home-icons/snack.png",
  "./assets/images/home/home_cave_base.webp",
  "./assets/images/home/home_cave_crystal_sprite.png",
  "./assets/images/home/home_cave_depth_wash.webp",
  "./assets/images/home/home_cave_lamp_glow.png",
  "./assets/images/home/home_cave_star_particle.png",
  "./assets/images/home/home_room_bg.png",
  "./assets/images/home/home_room_bg_v31b.png",
  "./assets/images/home/mogu_home.png",
  "./assets/images/kv-icons/artifact_core.png",
  "./assets/images/kv-icons/bullet_icon.png",
  "./assets/images/kv-icons/drop_coin_icon.png",
  "./assets/images/kv-icons/drop_heal_icon.png",
  "./assets/images/kv-icons/mine_icon.png",
  "./assets/images/kv-icons/skill_cave.png",
  "./assets/images/kv-icons/skill_fire.png",
  "./assets/images/kv-icons/skill_guard.png",
  "./assets/images/kv-icons/skill_ice.png",
  "./assets/images/kv-icons/skill_poison.png",
  "./assets/images/kv-icons/skill_star.png",
  "./assets/images/kv-icons/skill_summon.png",
  "./assets/images/kv-sprites/boss_final.png",
  "./assets/images/kv-sprites/boss_mid.png",
  "./assets/images/kv-sprites/bullet_enemy.png",
  "./assets/images/kv-sprites/bullet_player.png",
  "./assets/images/kv-sprites/drop_heal.png",
  "./assets/images/kv-sprites/drop_star.png",
  "./assets/images/kv-sprites/enemy_bat.png",
  "./assets/images/kv-sprites/enemy_ghost.png",
  "./assets/images/kv-sprites/enemy_rare.png",
  "./assets/images/kv-sprites/enemy_soft.png",
  "./assets/images/kv-sprites/enemy_stone.png",
  "./assets/images/kv-sprites/mine_star.png",
  "./assets/images/kv-sprites/mogu_home_kv.png",
  "./assets/images/kv-sprites/mogu_player.png",
  "./assets/images/kv-ui/button_icon_round.png",
  "./assets/images/kv-ui/button_primary.png",
  "./assets/images/kv-ui/button_secondary.png",
  "./assets/images/kv-ui/button_small.png",
  "./assets/images/kv-ui/currency_pill.png",
  "./assets/images/kv-ui/dock_glass.png",
  "./assets/images/kv-ui/hud_pill.png",
  "./assets/images/kv-ui/panel_glass_large.png",
  "./assets/images/kv-ui/panel_glass_modal.png",
  "./assets/images/kv-ui/panel_glass_small.png",
  "./assets/images/kv-ui/progress_fill.png",
  "./assets/images/kv-ui/progress_frame.png",
  "./assets/images/kv-ui/skill_card_common.png",
  "./assets/images/kv-ui/skill_card_legendary.png",
  "./assets/images/kv-ui/skill_card_rare.png",
  "./assets/images/kv-ui/soft_gold_glow.png",
  "./assets/images/kv-ui/star_particle.png",
  "./assets/images/kv-ui/tag_pill.png",
  "./assets/images/kv-ui/title_plate.png",
  "./css/home-cave-bg.css",
  "./css/moguria-kv-visual-refresh.css",
  "./index.html",
  "./js/home-cave-bg.js",
  "./js/moguria-kv-visual-refresh.js"
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
