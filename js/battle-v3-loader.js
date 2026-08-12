(function () {
  'use strict';

  const ENGINE_SRC = 'vendor/phaser/phaser-arcade-physics-4.2.1.min.js';
  const SCENE_SRC = 'js/battle-v3-scene.js?v=20260812-battle-v3-1';
  let preparation = null;

  function loadScript(src, ready) {
    if (ready()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-moguria-src="${src}"]`);
      if (existing) {
        existing.addEventListener('load', () => ready() ? resolve() : reject(new Error(`loaded without API: ${src}`)), { once: true });
        existing.addEventListener('error', () => reject(new Error(`script failed: ${src}`)), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.moguriaSrc = src;
      script.onload = () => ready() ? resolve() : reject(new Error(`loaded without API: ${src}`));
      script.onerror = () => reject(new Error(`script failed: ${src}`));
      document.head.appendChild(script);
    });
  }

  async function prepare() {
    if (window.MoguriaBattleV3?.isReady?.()) return { ok: true, reused: true };
    if (preparation) return preparation;

    preparation = (async () => {
      // Phaser owns decoding and retains the textures. The pack is declared in
      // assets/manifest.json, but preloading it through a second Image registry
      // would hold duplicate decoded bitmaps on mobile.
      await loadScript(ENGINE_SRC, () => !!window.Phaser);
      await loadScript(SCENE_SRC, () => !!window.MoguriaBattleV3);
      const booted = await window.MoguriaBattleV3.boot();
      if (booted === false) throw new Error('battle renderer failed to boot');
      const loadErrors = window.MoguriaBattleV3.getLoadErrors?.() || [];
      const fallbacks = window.MoguriaBattleV3.getFallbackAssets?.() || [];
      if (loadErrors.length || fallbacks.length) {
        throw new Error(`battle assets unavailable (${loadErrors.length + fallbacks.length})`);
      }
      return { ok: true };
    })().catch(error => {
      preparation = null;
      window.MoguriaDebug?.warn?.('battle-v3 prepare failed', error.message);
      return { ok: false, reason: 'battle-load-failed', error };
    });
    return preparation;
  }

  window.MoguriaBattleV3Loader = { prepare };
})();
