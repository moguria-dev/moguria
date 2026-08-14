(function () {
  'use strict';

  const ENGINE_SRC = 'vendor/phaser/phaser-arcade-physics-4.2.1.min.js';
  const RIG_SRC = 'js/mogu-rig.js?v=20260814-motion-rig2-1';
  const SCENE_SRC = 'js/battle-v3-scene.js?v=20260814-motion-rig2-1';
  const SCRIPT_TIMEOUT_MS = 15000;
  const BOOT_TIMEOUT_MS = 30000;
  let preparation = null;

  function removeScript(script) {
    if (!script) return;
    if (typeof script.remove === 'function') script.remove();
    else script.parentNode?.removeChild?.(script);
  }

  function scriptState(script) {
    const state = script?.dataset?.moguriaLoadState;
    if (state) return state;
    const readyState = String(script?.readyState || '').toLowerCase();
    if (readyState === 'loaded' || readyState === 'complete') return 'loaded';
    return 'loading';
  }

  function loadScript(src, ready, timeoutMs = SCRIPT_TIMEOUT_MS) {
    if (ready()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let script = document.querySelector(`script[data-moguria-src="${src}"]`);
      const previousState = scriptState(script);
      if (script && previousState !== 'loading') {
        removeScript(script);
        script = null;
      }

      if (!script) {
        script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.dataset.moguriaSrc = src;
        script.dataset.moguriaLoadState = 'loading';
      }

      let settled = false;
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        script.removeEventListener?.('load', onLoad);
        script.removeEventListener?.('error', onError);
      };
      const fail = (error, state) => {
        if (settled) return;
        settled = true;
        script.dataset.moguriaLoadState = state;
        cleanup();
        removeScript(script);
        reject(error);
      };
      const onLoad = () => {
        if (settled) return;
        script.dataset.moguriaLoadState = 'loaded';
        if (!ready()) {
          fail(new Error(`loaded without API: ${src}`), 'invalid');
          return;
        }
        settled = true;
        cleanup();
        resolve();
      };
      const onError = () => fail(new Error(`script failed: ${src}`), 'error');
      const timeoutId = window.setTimeout(
        () => fail(new Error(`script timed out after ${timeoutMs}ms: ${src}`), 'timeout'),
        timeoutMs
      );

      script.addEventListener('load', onLoad, { once: true });
      script.addEventListener('error', onError, { once: true });
      if (!script.parentNode) document.head.appendChild(script);
    });
  }

  function rendererHealth(renderer = window.MoguriaBattleV3) {
    const errorsValue = renderer?.getLoadErrors?.();
    const fallbacksValue = renderer?.getFallbackAssets?.();
    const loadErrors = Array.isArray(errorsValue) ? errorsValue : (errorsValue ? [errorsValue] : []);
    const fallbacks = Array.isArray(fallbacksValue) ? fallbacksValue : (fallbacksValue ? [fallbacksValue] : []);
    return { loadErrors, fallbacks, ok: loadErrors.length === 0 && fallbacks.length === 0 };
  }

  function resetRenderer(renderer = window.MoguriaBattleV3) {
    try {
      renderer?.stop?.({ destroy: true, restoreLegacy: true });
    } catch (error) {
      window.MoguriaDebug?.warn?.('battle-v3 reset failed', error.message);
    }
  }

  function bootWithTimeout(renderer, timeoutMs = BOOT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        resetRenderer(renderer);
        reject(new Error(`battle renderer boot timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      Promise.resolve()
        .then(() => renderer.boot())
        .then(value => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          resolve(value);
        }, error => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  async function prepare() {
    if (preparation) return preparation;

    const existingRenderer = window.MoguriaBattleV3;
    if (existingRenderer?.isReady?.()) {
      const health = rendererHealth(existingRenderer);
      if (health.ok) return { ok: true, reused: true };
      resetRenderer(existingRenderer);
    }

    preparation = (async () => {
      // Phaser owns decoding and retains the textures. The pack is declared in
      // assets/manifest.json, but preloading it through a second Image registry
      // would hold duplicate decoded bitmaps on mobile.
      await loadScript(ENGINE_SRC, () => !!window.Phaser);
      // The continuous rig is a presentation enhancement. If this optional
      // module is unavailable, the scene must still boot and use its proven
      // atlas animation fallback instead of blocking the whole battle.
      try {
        await loadScript(RIG_SRC, () => !!window.MoguriaMoguRig);
      } catch (error) {
        window.MoguriaDebug?.warn?.('Mogu continuous rig unavailable; using atlas fallback', error.message);
      }
      await loadScript(SCENE_SRC, () => !!window.MoguriaBattleV3);
      const renderer = window.MoguriaBattleV3;
      const booted = await bootWithTimeout(renderer);
      if (booted === false) throw new Error('battle renderer failed to boot');
      const health = rendererHealth(renderer);
      if (!health.ok) {
        throw new Error(`battle assets unavailable (${health.loadErrors.length + health.fallbacks.length})`);
      }
      return { ok: true };
    })().catch(error => {
      resetRenderer();
      window.MoguriaDebug?.warn?.('battle-v3 prepare failed', error.message);
      return { ok: false, reason: 'battle-load-failed', error };
    }).then(result => {
      preparation = null;
      return result;
    });
    return preparation;
  }

  window.MoguriaBattleV3Loader = { prepare };
})();
