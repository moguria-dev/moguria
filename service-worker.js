const CACHE_NAME = 'moguria-core-v1.3.4-final-faithful-visual';

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./css/home-icons.css",
  "./css/home-cave-bg.css",
  "./css/moguria-kv-visual-refresh.css",
  "./css/moguria-final-ui.css",
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
  "./js/home-cave-bg.js",
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
  "./js/moguria-kv-visual-refresh.js",
  "./js/moguria-final-ui.js",
  "./assets/images/home/home_cave_base.webp",
  "./assets/images/home/home_cave_crystal_sprite.png",
  "./assets/images/home/home_cave_depth_wash.webp",
  "./assets/images/home/home_cave_lamp_glow.png",
  "./assets/images/home/home_cave_star_particle.png",
  "./assets/images/home/home_room_bg.png",
  "./assets/images/home/home_room_bg_v31b.png",
  "./assets/images/home/mogu_home.png",
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
  "./assets/images/moguria-final/screens/home.webp",
  "./assets/images/moguria-final/screens/game.webp",
  "./assets/images/moguria-final/screens/level.webp",
  "./assets/images/moguria-final/screens/result.webp",
  "./assets/images/moguria-final/screens/dex.webp",
  "./assets/images/moguria-final/screens/equip.webp",
  "./assets/images/moguria-final/screens/gacha.webp",
  "./assets/images/moguria-final/backgrounds/home-live.webp",
  "./assets/images/moguria-final/backgrounds/game-live.webp",
  "./assets/images/moguria-final/backgrounds/modal-live.webp",
  "./assets/images/moguria-final/ui/title_plate.webp",
  "./assets/images/moguria-final/ui/currency_coin.webp",
  "./assets/images/moguria-final/ui/currency_gem.webp",
  "./assets/images/moguria-final/ui/profile_panel.webp",
  "./assets/images/moguria-final/ui/bonus_panel.webp",
  "./assets/images/moguria-final/ui/bottom_dock.webp",
  "./assets/images/moguria-final/ui/button_receive.webp",
  "./assets/images/moguria-final/ui/button_dungeon.webp",
  "./assets/images/moguria-final/ui/hud_small.webp",
  "./assets/images/moguria-final/ui/hud_wave.webp",
  "./assets/images/moguria-final/ui/toast_banner.webp",
  "./assets/images/moguria-final/ui/joystick.webp",
  "./assets/images/moguria-final/ui/modal_frame.webp",
  "./assets/images/moguria-final/ui/skill_card_gold.webp",
  "./assets/images/moguria-final/ui/skill_card_blue.webp",
  "./assets/images/moguria-final/ui/skill_card_pink.webp",
  "./assets/images/moguria-final/ui/button_reroll.webp",
  "./assets/images/moguria-final/ui/result_panel.webp",
  "./assets/images/moguria-final/icons/coin.png",
  "./assets/images/moguria-final/icons/gem.png",
  "./assets/images/moguria-final/icons/snack_jar.png",
  "./assets/images/moguria-final/icons/chest.png",
  "./assets/images/moguria-final/icons/orb.png",
  "./assets/images/moguria-final/icons/star_wand.png",
  "./assets/images/moguria-final/icons/lantern_charm.png",
  "./assets/images/moguria-final/icons/crystal_big.png",
  "./assets/images/moguria-final/icons/scarf.png",
  "./assets/images/moguria-final/icons/gacha_machine.png",
  "./assets/images/moguria-final/sprites/mogu_home.png",
  "./assets/images/moguria-final/sprites/mogu_player.png",
  "./assets/images/moguria-final/sprites/enemy_slime.png",
  "./assets/images/moguria-final/sprites/enemy_bat.png",
  "./assets/images/moguria-final/sprites/drop_star.png",
  "./assets/images/moguria-final/sprites/drop_star_clean.png",
  "./assets/images/moguria-final/sprites/mine_star.png",
  "./assets/images/moguria-final/sprites/bullet_player.png",
  "./assets/images/moguria-final/sprites/bullet_enemy.png",
  "./assets/images/moguria-final/sprites/drop_heal.png",
  "./assets/images/moguria-final/skills/cookie.png",
  "./assets/images/moguria-final/skills/croissant.png",
  "./assets/images/moguria-final/skills/tulip.png",
  "./assets/images/home-icons/dex.png",
  "./assets/images/home-icons/dungeon.png",
  "./assets/images/home-icons/equip.png",
  "./assets/images/home-icons/gacha.png",
  "./assets/images/home-icons/logs.png",
  "./assets/images/home-icons/outing.png",
  "./assets/images/home-icons/snack.png"
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
