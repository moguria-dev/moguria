'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const LOADER_SOURCE = fs.readFileSync(path.join(ROOT, 'js/battle-v3-loader.js'), 'utf8');
const ENGINE_SRC = 'vendor/phaser/phaser-arcade-physics-4.2.1.min.js';
const SCENE_SRC = 'js/battle-v3-scene.js?v=20260812-battle-v3-2';

function createHarness(overrides = {}) {
  let nextTimerId = 0;
  const timers = new Map();
  const warnings = [];
  const scripts = [];

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
    setTimeout(handler, delay) {
      const id = ++nextTimerId;
      timers.set(id, { handler, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    document: {
      head,
      createElement(tag) {
        assert.equal(tag, 'script');
        return createScript();
      },
      querySelector(selector) {
        const match = selector.match(/^script\[data-moguria-src="(.+)"\]$/);
        return match ? scripts.find(script => script.dataset.moguriaSrc === match[1]) || null : null;
      }
    },
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
    boot() {
      bootCalls += 1;
      return bootImpl();
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

test('prepare loads Phaser and the scene, boots once, and clears all timeout timers', async () => {
  const harness = createHarness();
  const renderer = createRenderer();
  const pending = harness.loader.prepare();

  const engineScript = harness.script(ENGINE_SRC);
  assert.ok(engineScript);
  harness.context.Phaser = {};
  engineScript.dispatch('load');
  await flushMicrotasks();

  const sceneScript = harness.script(SCENE_SRC);
  assert.ok(sceneScript);
  harness.context.MoguriaBattleV3 = renderer;
  sceneScript.dispatch('load');

  assert.equal((await pending).ok, true);
  assert.equal(renderer.bootCalls, 1);
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

  const renderer = createRenderer();
  harness.context.MoguriaBattleV3 = renderer;
  harness.script(SCENE_SRC).dispatch('load');
  assert.equal((await secondAttempt).ok, true);
  assert.equal(renderer.bootCalls, 1);
});

test('Phaser boot timeout resets the renderer and permits a later retry', async () => {
  const renderer = createRenderer({ boot: () => new Promise(() => {}) });
  const harness = createHarness({ Phaser: {}, MoguriaBattleV3: renderer });
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
  const harness = createHarness({ Phaser: {}, MoguriaBattleV3: renderer });

  const result = await harness.loader.prepare();

  assert.equal(result.ok, false);
  assert.match(result.error.message, /battle assets unavailable \(2\)/);
  assert.equal(renderer.bootCalls, 1);
  assert.ok(renderer.stopCalls >= 2);
});
