(function () {
  'use strict';

  const ENGINE_SRC = 'vendor/phaser/phaser-arcade-physics-4.2.1.min.js';
  const RIG_SRC = 'js/mogu-rig.js?v=20260814-motion-rig2-1';
  const SCENE_SRC = 'js/battle-v3-scene.js?v=20260814-loading-experience-1';
  const SCRIPT_TIMEOUT_MS = 15000;
  const BOOT_TIMEOUT_MS = 30000;
  const WARMUP_IDLE_TIMEOUT_MS = 6000;
  const WARMUP_PACK_TIMEOUT_MS = 20000;
  const scriptLoads = new Map();
  let preparation = null;
  let preparationPercent = 0;
  let preparationPayload = null;
  let preparationListeners = new Set();
  let scheduledWarmup = null;

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

  function loadScript(src, ready, options = {}) {
    if (ready()) return Promise.resolve({ src, reused: true });
    const shared = scriptLoads.get(src);
    if (shared) return shared.promise;

    const timeoutMs = Math.max(1, Number(options.timeoutMs) || SCRIPT_TIMEOUT_MS);
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
    if (options.priority === 'low') script.fetchPriority = 'low';

    let cancelJob = null;
    const pending = new Promise((resolve, reject) => {
      let settled = false;
      let timeoutId = null;
      const cleanup = () => {
        if (timeoutId != null) window.clearTimeout(timeoutId);
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
        resolve({ src, reused: false });
      };
      const onError = () => fail(new Error(`script failed: ${src}`), 'error');
      cancelJob = reason => fail(new Error(`script cancelled (${reason || 'cancelled'}): ${src}`), 'cancelled');
      timeoutId = window.setTimeout(
        () => fail(new Error(`script timed out after ${timeoutMs}ms: ${src}`), 'timeout'),
        timeoutMs
      );

      script.addEventListener('load', onLoad, { once: true });
      script.addEventListener('error', onError, { once: true });
      if (!script.parentNode) document.head.appendChild(script);
    });

    let tracked;
    const job = { promise: null, cancel: reason => cancelJob?.(reason) };
    tracked = pending.finally(() => {
      if (scriptLoads.get(src) === job) scriptLoads.delete(src);
    });
    job.promise = tracked;
    scriptLoads.set(src, job);
    return tracked;
  }

  function cancelPendingScriptLoads(reason) {
    for (const job of [...scriptLoads.values()]) job.cancel?.(reason);
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

  function bootWithTimeout(renderer, options = {}) {
    const timeoutMs = Math.max(1, Number(options.timeoutMs) || BOOT_TIMEOUT_MS);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        callback(value);
      };
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        resetRenderer(renderer);
        finish(reject, new Error(`battle renderer boot timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      Promise.resolve()
        .then(() => renderer.boot({ onProgress: options.onProgress }))
        .then(value => finish(resolve, value), error => finish(reject, error));
    });
  }

  function notifyProgress(listener, payload) {
    if (typeof listener !== 'function') return;
    try { listener(payload); }
    catch (error) { window.MoguriaDebug?.warn?.('battle loading progress listener failed', error.message); }
  }

  function emitPreparationProgress(percent, phase, detail = {}) {
    const numeric = Number(percent);
    if (Number.isFinite(numeric)) {
      preparationPercent = Math.max(preparationPercent, Math.min(100, Math.max(0, numeric)));
    }
    preparationPayload = { ...detail, percent: preparationPercent, phase };
    for (const listener of preparationListeners) notifyProgress(listener, preparationPayload);
  }

  function addPreparationListener(listener) {
    if (typeof listener !== 'function') return;
    preparationListeners.add(listener);
    if (preparationPayload) notifyProgress(listener, preparationPayload);
  }

  function rendererProgress(payload = {}) {
    let value = Number(payload.progress);
    if (!Number.isFinite(value) && Number.isFinite(Number(payload.percent))) {
      value = Number(payload.percent) / 100;
    }
    if (Number.isFinite(value)) {
      value = Math.max(0, Math.min(1, value));
      emitPreparationProgress(30 + value * 60, 'assets', payload);
      return;
    }
    emitPreparationProgress(preparationPercent, payload.phase || 'assets', payload);
  }

  function beginOptionalRigLoad(priority) {
    const pending = loadScript(RIG_SRC, () => !!window.MoguriaMoguRig, { priority });
    pending.catch(error => {
      window.MoguriaDebug?.warn?.('Mogu continuous rig unavailable; using atlas fallback', error.message);
    });
    return pending;
  }

  function prepare(options = {}) {
    cancelWarmup('foreground');
    if (preparation) {
      addPreparationListener(options.onProgress);
      return preparation;
    }

    const existingRenderer = window.MoguriaBattleV3;
    if (existingRenderer?.isReady?.()) {
      const health = rendererHealth(existingRenderer);
      if (health.ok) {
        notifyProgress(options.onProgress, { percent: 100, phase: 'ready', status: 'ready', reused: true });
        return Promise.resolve({ ok: true, reused: true });
      }
      resetRenderer(existingRenderer);
    }

    preparationPercent = 0;
    preparationPayload = null;
    preparationListeners = new Set();
    addPreparationListener(options.onProgress);
    emitPreparationProgress(0, 'scripts', { status: 'loading', completed: 0, total: 2 });

    preparation = (async () => {
      let completedScripts = 0;
      const requiredScript = (src, ready) => loadScript(src, ready).then(value => {
        completedScripts += 1;
        emitPreparationProgress(completedScripts / 2 * 30, 'scripts', {
          status: 'loaded',
          completed: completedScripts,
          total: 2,
          assetKey: src
        });
        return value;
      });

      // All runtime scripts begin together. The rig is optional and therefore
      // never holds the foreground transition while its atlas fallback exists.
      const engine = requiredScript(ENGINE_SRC, () => !!window.Phaser);
      const scene = requiredScript(SCENE_SRC, () => !!window.MoguriaBattleV3);
      beginOptionalRigLoad();
      await Promise.all([engine, scene]);
      emitPreparationProgress(30, 'assets', { status: 'loading', progress: 0 });

      const renderer = window.MoguriaBattleV3;
      const booted = await bootWithTimeout(renderer, { onProgress: rendererProgress });
      if (booted === false) throw new Error('battle renderer failed to boot');
      emitPreparationProgress(95, 'renderer', { status: 'checking' });
      const health = rendererHealth(renderer);
      if (!health.ok) {
        throw new Error(`battle assets unavailable (${health.loadErrors.length + health.fallbacks.length})`);
      }
      emitPreparationProgress(100, 'ready', { status: 'ready' });
      return { ok: true };
    })().catch(error => {
      cancelPendingScriptLoads('prepare-failed');
      resetRenderer();
      emitPreparationProgress(preparationPercent, 'renderer', { status: 'failed', error });
      window.MoguriaDebug?.warn?.('battle-v3 prepare failed', error.message);
      return { ok: false, reason: 'battle-load-failed', error };
    });

    const current = preparation;
    current.finally(() => {
      if (preparation === current) preparation = null;
      preparationListeners = new Set();
    });
    return current;
  }

  function warmupGate() {
    if (document.visibilityState === 'hidden' || document.hidden === true) return 'hidden';
    if (window.navigator?.onLine === false) return 'offline';
    const connection = window.navigator?.connection || window.navigator?.mozConnection || window.navigator?.webkitConnection;
    if (connection?.saveData) return 'save-data';
    const effectiveType = String(connection?.effectiveType || '').toLowerCase();
    if (effectiveType === 'slow-2g' || effectiveType === '2g') return 'slow-connection';
    return '';
  }

  function prewarm(options = {}) {
    const gate = options.ignoreGate ? '' : warmupGate();
    if (gate) return Promise.resolve({ ok: false, reason: 'gated', gate });
    if (options.signal?.aborted) return Promise.resolve({ ok: false, reason: 'aborted', aborted: true });

    // These calls intentionally happen before any await: the browser can fetch
    // all three independent scripts in parallel during Home idle time.
    const scriptTasks = [
      loadScript(ENGINE_SRC, () => !!window.Phaser, { priority: 'low' }),
      loadScript(RIG_SRC, () => !!window.MoguriaMoguRig, { priority: 'low' }),
      loadScript(SCENE_SRC, () => !!window.MoguriaBattleV3, { priority: 'low' })
    ].map(task => task.then(() => true, error => {
      window.MoguriaDebug?.warn?.('battle-v3 script prewarm failed', error.message);
      return false;
    }));

    const packTask = typeof window.MoguriaAssets?.warmPack === 'function'
      ? window.MoguriaAssets.warmPack('battle-v3', {
          signal: options.signal,
          timeoutMs: Math.max(1, Number(options.timeoutMs) || WARMUP_PACK_TIMEOUT_MS),
          concurrency: 2
        })
      : Promise.resolve({ ok: false, reason: 'asset-manager-unavailable' });

    return Promise.all([Promise.all(scriptTasks), Promise.resolve(packTask)]).then(([scripts, pack]) => ({
      ok: scripts.every(Boolean) && pack?.ok !== false,
      scripts,
      pack
    }), error => ({ ok: false, reason: 'prewarm-failed', error }));
  }

  function scheduleWarmup(options = {}) {
    if (scheduledWarmup) return scheduledWarmup.handle;
    const initialGate = warmupGate();
    if (initialGate) {
      const promise = Promise.resolve({ ok: false, reason: 'gated', gate: initialGate });
      return { promise, cancel() { return false; } };
    }

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let idleId = null;
    let timerId = null;
    let settled = false;
    let resolveScheduled;
    const promise = new Promise(resolve => { resolveScheduled = resolve; });
    const record = { handle: null };

    const cleanup = () => {
      if (idleId != null) window.cancelIdleCallback?.(idleId);
      if (timerId != null) window.clearTimeout(timerId);
      idleId = null;
      timerId = null;
      document.removeEventListener?.('visibilitychange', onVisibilityChange);
    };
    const finish = result => {
      if (settled) return;
      settled = true;
      cleanup();
      if (scheduledWarmup === record) scheduledWarmup = null;
      resolveScheduled(result);
    };
    const cancel = (reason = 'cancelled') => {
      if (settled) return false;
      controller?.abort?.();
      if (reason !== 'foreground') cancelPendingScriptLoads(reason);
      finish({ ok: false, reason, aborted: true });
      return true;
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden' || document.hidden === true) cancel('hidden');
    };
    const run = () => {
      idleId = null;
      timerId = null;
      const gate = warmupGate();
      if (gate) {
        finish({ ok: false, reason: 'gated', gate });
        return;
      }
      prewarm({
        ...options,
        ignoreGate: true,
        ...(controller ? { signal: controller.signal } : {})
      }).then(finish, error => finish({ ok: false, reason: 'prewarm-failed', error }));
    };

    document.addEventListener?.('visibilitychange', onVisibilityChange);
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(run, { timeout: WARMUP_IDLE_TIMEOUT_MS });
    } else {
      // Safari has no requestIdleCallback. Wait for a real quiet window instead
      // of competing with Home paint, and keep the fallback cancellable.
      timerId = window.setTimeout(run, WARMUP_IDLE_TIMEOUT_MS);
    }

    record.handle = { promise, cancel };
    scheduledWarmup = record;
    return record.handle;
  }

  function cancelWarmup(reason = 'cancelled') {
    return scheduledWarmup?.handle?.cancel?.(reason) || false;
  }

  window.MoguriaBattleV3Loader = { prepare, prewarm, scheduleWarmup, cancelWarmup };
})();
