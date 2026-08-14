'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const LOADER_SOURCE = fs.readFileSync(path.join(ROOT, 'js/battle-v3-loader.js'), 'utf8');
const HTML_SOURCE = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const ENGINE_SRC = 'vendor/phaser/phaser-arcade-physics-4.2.1.min.js';
const MOTION_VERSION = '20260814-motion-rig2-1';
const VFX_VERSION = '20260814-skill-vfx-1';
const LOADING_VERSION = '20260814-loading-experience-1';
const RIG_SRC = `js/mogu-rig.js?v=${MOTION_VERSION}`;
const SCENE_SRC = `js/battle-v3-scene.js?v=${LOADING_VERSION}`;
const LOADER_SRC = `js/battle-v3-loader.js?v=${LOADING_VERSION}`;

function createHarness(overrides = {}) {
  let nextTimerId = 0;
  const timers = new Map();
  const warnings = [];
  const scripts = [];
  const documentListeners = new Map();

  const head = {
    appendChild(script) {
      script.parentNode = this;
      if (!scripts.includes(script)) scripts.push(script);
      return script;
    },
    removeChild(script) {
      const index = scripts.indexOf(script);
      if (index >= 0) scripts.splice(index, 1);
      script.parentNode = null;
      return script;
    }
  };

  function createScript() {
    const listeners = new Map();
    return {
      dataset: {},
      parentNode: null,
      src: '',
      async: false,
      addEventListener(type, handler) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(handler);
      },
      removeEventListener(type, handler) {
        listeners.get(type)?.delete(handler);
      },
      dispatch(type) {
        for (const handler of [...(listeners.get(type) || [])]) handler({ type, target: this });
      },
      remove() {
        this.parentNode?.removeChild(this);
      }
    };
  }

  const context = {
    console: { log() {}, warn() {}, error() {} },
    Promise,
    Error,
    AbortController,
    setTimeout(handler, delay) {
      const id = ++nextTimerId;
      timers.set(id, { handler, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    document: {
      visibilityState: 'visible',
      hidden: false,
      head,
      createElement(tag) {
        assert.equal(tag, 'script');
        return createScript();
      },
      querySelector(selector) {
        const match = selector.match(/^script\[data-moguria-src="(.+)"\]$/);
        return match ? scripts.find(script => script.dataset.moguriaSrc === match[1]) || null : null;
      },
      addEventListener(type, listener) {
        if (!documentListeners.has(type)) documentListeners.set(type, new Set());
        documentListeners.get(type).add(listener);
      },
      removeEventListener(type, listener) {
        documentListeners.get(type)?.delete(listener);
      }
    },
    navigator: { onLine:true, connection:{ saveData:false, effectiveType:'4g' } },
    MoguriaDebug: {
      warn(...args) { warnings.push(args); }
    },
    ...overrides
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(LOADER_SOURCE, context, { filename: 'js/battle-v3-loader.js' });

  return {
    context,
    loader: context.MoguriaBattleV3Loader,
    warnings,
    scripts,
    script(src) { return scripts.find(item => item.dataset.moguriaSrc === src) || null; },
    addExistingScript(src, state, readyState = '') {
      const script = createScript();
      script.src = src;
      script.dataset.moguriaSrc = src;
      if (state) script.dataset.moguriaLoadState = state;
      if (readyState) script.readyState = readyState;
      head.appendChild(script);
      return script;
    },
    runTimer(delay) {
      const entry = [...timers.entries()].find(([, timer]) => timer.delay === delay);
      assert.ok(entry, `expected a pending ${delay}ms timer`);
      const [id, timer] = entry;
      timers.delete(id);
      timer.handler();
    },
    pendingTimerDelays() {
      return [...timers.values()].map(timer => timer.delay).sort((a, b) => a - b);
    },
    setVisibility(value) {
      context.document.visibilityState = value;
      context.document.hidden = value === 'hidden';
      for (const listener of documentListeners.get('visibilitychange') || []) listener();
    }
  };
}

function createRenderer(options = {}) {
  let ready = Boolean(options.ready);
  let bootCalls = 0;
  let stopCalls = 0;
  let loadErrors = options.loadErrors || [];
  let fallbackAssets = options.fallbackAssets || [];
  let bootImpl = options.boot || (() => {
    ready = true;
    return Promise.resolve(true);
  });

  return {
    isReady: () => ready,
    boot(options) {
      bootCalls += 1;
      return bootImpl(options);
    },
    stop() {
      stopCalls += 1;
      ready = false;
    },
    getLoadErrors: () => loadErrors,
    getFallbackAssets: () => fallbackAssets,
    setBoot(value) { bootImpl = value; },
    setReady(value) { ready = Boolean(value); },
    setLoadErrors(value) { loadErrors = value; },
    setFallbackAssets(value) { fallbackAssets = value; },
    get bootCalls() { return bootCalls; },
    get stopCalls() { return stopCalls; }
  };
}

async function flushMicrotasks() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

test('entrypoint keeps the Motion Rig 2 atlas token and uses the loading bridge cache version', () => {
  assert.ok(HTML_SOURCE.includes(`src="${LOADER_SRC}"`));
  assert.ok(HTML_SOURCE.includes(`src="js/game.js?v=${VFX_VERSION}"`));
  assert.ok(LOADER_SOURCE.includes(`const RIG_SRC = '${RIG_SRC}'`));
  assert.ok(LOADER_SOURCE.includes(`const SCENE_SRC = '${SCENE_SRC}'`));
});

test('prepare shares one attempt while all scripts load in parallel, then boots once', async () => {
  const harness = createHarness();
  const renderer = createRenderer();
  const pending = harness.loader.prepare();
  const duplicatePending = harness.loader.prepare();
  assert.equal(duplicatePending, pending);

  const engineScript = harness.script(ENGINE_SRC);
  const rigScript = harness.script(RIG_SRC);
  const sceneScript = harness.script(SCENE_SRC);
  assert.ok(engineScript);
  assert.ok(rigScript);
  assert.ok(sceneScript);
  assert.equal(harness.scripts.length, 3);
  harness.context.Phaser = {};
  harness.context.MoguriaMoguRig = {};
  harness.context.MoguriaBattleV3 = renderer;
  sceneScript.dispatch('load');
  engineScript.dispatch('load');
  rigScript.dispatch('load');

  const [result, duplicateResult] = await Promise.all([pending, duplicatePending]);
  assert.equal(result.ok, true);
  assert.equal(duplicateResult.ok, true);
  assert.equal(renderer.bootCalls, 1);
  assert.deepEqual(harness.pendingTimerDelays(), []);
});

test('a rig script without its API falls back to the atlas and still boots the scene', async () => {
  const harness = createHarness({ Phaser: {} });
  const renderer = createRenderer();
  const pending = harness.loader.prepare();
  await flushMicrotasks();

  const rigScript = harness.script(RIG_SRC);
  assert.ok(rigScript);
  rigScript.dispatch('load');
  await flushMicrotasks();

  const sceneScript = harness.script(SCENE_SRC);
  assert.ok(sceneScript);
  harness.context.MoguriaBattleV3 = renderer;
  sceneScript.dispatch('load');
  const result = await pending;

  assert.equal(result.ok, true);
  assert.equal(renderer.bootCalls, 1);
  assert.equal(harness.script(RIG_SRC), null);
  assert.ok(harness.warnings.some(args => String(args.join(' ')).includes('atlas fallback')));
  assert.deepEqual(harness.pendingTimerDelays(), []);
});

test('a script error fails promptly and removes the failed element', async () => {
  const harness = createHarness();
  const pending = harness.loader.prepare();
  const failedScript = harness.script(ENGINE_SRC);

  failedScript.dispatch('error');
  const result = await pending;

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'battle-load-failed');
  assert.match(result.error.message, /script failed/);
  assert.equal(harness.script(ENGINE_SRC), null);
  assert.deepEqual(harness.pendingTimerDelays(), []);
});

test('a script load timeout fails instead of waiting indefinitely', async () => {
  const harness = createHarness();
  const pending = harness.loader.prepare();

  assert.ok(harness.script(ENGINE_SRC));
  harness.runTimer(15000);
  const result = await pending;

  assert.equal(result.ok, false);
  assert.match(result.error.message, /script timed out after 15000ms/);
  assert.equal(harness.script(ENGINE_SRC), null);
});

test('completed stale script elements are replaced and a failed load can be retried', async () => {
  const harness = createHarness();
  const stale = harness.addExistingScript(ENGINE_SRC, null, 'complete');
  const firstAttempt = harness.loader.prepare();
  const replacement = harness.script(ENGINE_SRC);

  assert.notEqual(replacement, stale);
  replacement.dispatch('error');
  assert.equal((await firstAttempt).ok, false);

  const secondAttempt = harness.loader.prepare();
  const retryEngine = harness.script(ENGINE_SRC);
  assert.ok(retryEngine);
  assert.notEqual(retryEngine, replacement);
  harness.context.Phaser = {};
  retryEngine.dispatch('load');
  await flushMicrotasks();

  harness.context.MoguriaMoguRig = {};
  harness.script(RIG_SRC).dispatch('load');
  await flushMicrotasks();

  const renderer = createRenderer();
  harness.context.MoguriaBattleV3 = renderer;
  harness.script(SCENE_SRC).dispatch('load');
  assert.equal((await secondAttempt).ok, true);
  assert.equal(renderer.bootCalls, 1);
});

test('prewarm starts all scripts in parallel and foreground prepare reuses each per-src promise', async () => {
  let warmPackCalls = 0;
  const harness = createHarness({
    MoguriaAssets:{
      warmPack(packId, options) {
        warmPackCalls += 1;
        assert.equal(packId, 'battle-v3');
        assert.equal(options.concurrency, 2);
        return Promise.resolve({ ok:true });
      }
    }
  });
  const renderer = createRenderer();
  const warming = harness.loader.prewarm();
  const initialScripts = [
    harness.script(ENGINE_SRC),
    harness.script(RIG_SRC),
    harness.script(SCENE_SRC)
  ];
  assert.ok(initialScripts.every(Boolean));
  assert.ok(initialScripts.every(script => script.fetchPriority === 'low'));

  const foreground = harness.loader.prepare();
  assert.deepEqual([
    harness.script(ENGINE_SRC),
    harness.script(RIG_SRC),
    harness.script(SCENE_SRC)
  ], initialScripts, 'foreground must share the exact speculative script jobs');
  assert.equal(harness.scripts.length, 3);

  harness.context.Phaser = {};
  harness.context.MoguriaMoguRig = {};
  harness.context.MoguriaBattleV3 = renderer;
  initialScripts[0].dispatch('load');
  initialScripts[1].dispatch('load');
  initialScripts[2].dispatch('load');

  const [warmResult, foregroundResult] = await Promise.all([warming, foreground]);
  assert.equal(warmResult.ok, true);
  assert.equal(foregroundResult.ok, true);
  assert.equal(warmPackCalls, 1);
  assert.equal(renderer.bootCalls, 1);
});

test('prepare reports monotonic real script and renderer progress to every joined listener', async () => {
  const renderer = createRenderer({
    boot:options => {
      options.onProgress({ phase:'assets', progress:.2, assetKey:'first' });
      options.onProgress({ phase:'assets', progress:.8, assetKey:'second' });
      options.onProgress({ phase:'assets', progress:.4, assetKey:'late-regression' });
      options.onProgress({ phase:'renderer', status:'ready' });
      return Promise.resolve(true);
    }
  });
  const harness = createHarness({ Phaser:{}, MoguriaMoguRig:{}, MoguriaBattleV3:renderer });
  const firstProgress = [];
  const secondProgress = [];
  const first = harness.loader.prepare({ onProgress:value => firstProgress.push({ ...value }) });
  const second = harness.loader.prepare({ onProgress:value => secondProgress.push({ ...value }) });
  assert.equal(second, first);

  const result = await first;
  assert.equal(result.ok, true);
  for(const values of [firstProgress, secondProgress]){
    assert.ok(values.length >= 6);
    assert.equal(values[0].percent, 0);
    assert.equal(values.at(-1).percent, 100);
    assert.equal(values.at(-1).phase, 'ready');
    assert.ok(values.every((value, index) => index === 0 || value.percent >= values[index - 1].percent));
    assert.ok(values.some(value => value.assetKey === 'first'));
    assert.ok(values.some(value => value.assetKey === 'second'));
  }
});

test('a retry resets its progress attempt instead of replaying a stale high percentage', async () => {
  const renderer = createRenderer({
    boot:options => {
      options.onProgress({ progress:.9 });
      return Promise.reject(new Error('first boot failed'));
    }
  });
  const harness = createHarness({ Phaser:{}, MoguriaMoguRig:{}, MoguriaBattleV3:renderer });
  const firstProgress = [];
  assert.equal((await harness.loader.prepare({ onProgress:value => firstProgress.push(value.percent) })).ok, false);
  assert.ok(Math.max(...firstProgress) >= 80);

  renderer.setBoot(options => {
    options.onProgress({ progress:.1 });
    return Promise.resolve(true);
  });
  const retryProgress = [];
  assert.equal((await harness.loader.prepare({ onProgress:value => retryProgress.push(value.percent) })).ok, true);
  assert.equal(retryProgress[0], 0);
  assert.ok(retryProgress.every((value, index) => index === 0 || value >= retryProgress[index - 1]));
  assert.equal(retryProgress.at(-1), 100);
});

test('the optional rig never blocks a foreground renderer boot', async () => {
  const renderer = createRenderer();
  const harness = createHarness({ Phaser:{}, MoguriaBattleV3:renderer });
  const result = await harness.loader.prepare();

  assert.equal(result.ok, true);
  assert.equal(renderer.bootCalls, 1);
  assert.ok(harness.script(RIG_SRC), 'the optional request may still be in flight');
  assert.deepEqual(harness.pendingTimerDelays(), [15000]);
  harness.script(RIG_SRC).dispatch('error');
  await flushMicrotasks();
  assert.deepEqual(harness.pendingTimerDelays(), []);
});

test('Safari fallback waits six seconds and foreground prepare cancels it before pack fetch starts', async () => {
  let warmPackCalls = 0;
  const renderer = createRenderer();
  const harness = createHarness({
    MoguriaAssets:{ warmPack(){ warmPackCalls += 1; return Promise.resolve({ ok:true }); } }
  });
  const scheduled = harness.loader.scheduleWarmup();
  assert.deepEqual(harness.pendingTimerDelays(), [6000]);

  const foreground = harness.loader.prepare();
  assert.equal((await scheduled.promise).reason, 'foreground');
  assert.equal(warmPackCalls, 0);
  assert.equal(harness.pendingTimerDelays().includes(6000), false);

  harness.context.Phaser = {};
  harness.context.MoguriaMoguRig = {};
  harness.context.MoguriaBattleV3 = renderer;
  harness.script(ENGINE_SRC).dispatch('load');
  harness.script(RIG_SRC).dispatch('load');
  harness.script(SCENE_SRC).dispatch('load');
  assert.equal((await foreground).ok, true);
});

test('foreground prepare aborts an in-flight speculative pack but preserves shared script downloads', async () => {
  let packSignal = null;
  const renderer = createRenderer();
  const harness = createHarness({
    MoguriaAssets:{
      warmPack(_packId, options) {
        packSignal = options.signal;
        return new Promise(resolve => {
          options.signal.addEventListener('abort', () => resolve({ ok:false, reason:'aborted' }), { once:true });
        });
      }
    }
  });
  const scheduled = harness.loader.scheduleWarmup();
  harness.runTimer(6000);
  await flushMicrotasks();
  const speculativeScripts = harness.scripts.slice();
  assert.equal(speculativeScripts.length, 3);
  assert.equal(packSignal.aborted, false);

  const foreground = harness.loader.prepare();
  assert.equal(packSignal.aborted, true);
  assert.equal((await scheduled.promise).reason, 'foreground');
  assert.deepEqual(harness.scripts, speculativeScripts, 'foreground keeps and reuses script downloads');

  harness.context.Phaser = {};
  harness.context.MoguriaMoguRig = {};
  harness.context.MoguriaBattleV3 = renderer;
  harness.script(ENGINE_SRC).dispatch('load');
  harness.script(RIG_SRC).dispatch('load');
  harness.script(SCENE_SRC).dispatch('load');
  assert.equal((await foreground).ok, true);
});

test('becoming hidden aborts both the speculative pack and script jobs', async () => {
  let packSignal = null;
  const harness = createHarness({
    MoguriaAssets:{
      warmPack(_packId, options) {
        packSignal = options.signal;
        return new Promise(resolve => {
          options.signal.addEventListener('abort', () => resolve({ ok:false, reason:'aborted' }), { once:true });
        });
      }
    }
  });
  const scheduled = harness.loader.scheduleWarmup();
  harness.runTimer(6000);
  await flushMicrotasks();
  assert.equal(harness.scripts.length, 3);

  harness.setVisibility('hidden');
  const result = await scheduled.promise;
  assert.equal(result.reason, 'hidden');
  assert.equal(packSignal.aborted, true);
  assert.equal(harness.scripts.length, 0);
  assert.deepEqual(harness.pendingTimerDelays(), []);
});

test('warmup is gated while offline, saving data, on 2G, or already hidden', async () => {
  const cases = [
    { navigator:{ onLine:false, connection:{ saveData:false, effectiveType:'4g' } }, gate:'offline' },
    { navigator:{ onLine:true, connection:{ saveData:true, effectiveType:'4g' } }, gate:'save-data' },
    { navigator:{ onLine:true, connection:{ saveData:false, effectiveType:'slow-2g' } }, gate:'slow-connection' }
  ];
  for(const item of cases){
    const harness = createHarness({ navigator:item.navigator });
    const result = await harness.loader.scheduleWarmup().promise;
    assert.equal(result.reason, 'gated');
    assert.equal(result.gate, item.gate);
    assert.deepEqual(harness.pendingTimerDelays(), []);
    assert.equal(harness.scripts.length, 0);
  }

  const hiddenHarness = createHarness();
  hiddenHarness.setVisibility('hidden');
  const hidden = await hiddenHarness.loader.scheduleWarmup().promise;
  assert.equal(hidden.gate, 'hidden');
  assert.deepEqual(hiddenHarness.pendingTimerDelays(), []);
});

test('Phaser boot timeout resets the renderer and permits a later retry', async () => {
  const renderer = createRenderer({ boot: () => new Promise(() => {}) });
  const harness = createHarness({ Phaser: {}, MoguriaMoguRig: {}, MoguriaBattleV3: renderer });
  const firstAttempt = harness.loader.prepare();
  await flushMicrotasks();

  harness.runTimer(30000);
  const timedOut = await firstAttempt;
  assert.equal(timedOut.ok, false);
  assert.match(timedOut.error.message, /boot timed out after 30000ms/);
  assert.ok(renderer.stopCalls >= 1);

  renderer.setBoot(() => {
    renderer.setReady(true);
    return Promise.resolve(true);
  });
  const retried = await harness.loader.prepare();
  assert.equal(retried.ok, true);
  assert.equal(renderer.bootCalls, 2);
});

test('isReady does not bypass prior asset errors or fallback assets', async () => {
  const renderer = createRenderer({
    ready: true,
    loadErrors: ['assets/images/battle-v3/mogu-atlas.png'],
    fallbackAssets: ['moguria-v3-mogu']
  });
  const harness = createHarness({ Phaser: {}, MoguriaMoguRig: {}, MoguriaBattleV3: renderer });

  const result = await harness.loader.prepare();

  assert.equal(result.ok, false);
  assert.match(result.error.message, /battle assets unavailable \(2\)/);
  assert.equal(renderer.bootCalls, 1);
  assert.ok(renderer.stopCalls >= 2);
});
