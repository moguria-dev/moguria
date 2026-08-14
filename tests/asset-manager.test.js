'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'js/assetManager.js'), 'utf8');

async function flushMicrotasks(rounds = 20) {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

function createHarness(manifest, behaviorDefinitions = {}, options = {}) {
  const attempts = new Map();
  const images = [];
  let manifestRequests = 0;

  function behaviorFor(src) {
    const definitions = Array.isArray(behaviorDefinitions[src])
      ? behaviorDefinitions[src]
      : [behaviorDefinitions[src] || {}];
    const attempt = attempts.get(src) || 0;
    attempts.set(src, attempt + 1);
    return definitions[Math.min(attempt, definitions.length - 1)] || {};
  }

  class FakeImage {
    constructor() {
      this.decoding = '';
      this.naturalWidth = 128;
      this.naturalHeight = 128;
      this.onload = null;
      this.onerror = null;
      this.decodeCalls = 0;
      this.releaseDecode = null;
      this._src = '';
      this.behavior = null;
    }

    set src(value) {
      this._src = value;
      this.behavior = behaviorFor(value);
      this.naturalWidth = this.behavior.width ?? 128;
      this.naturalHeight = this.behavior.height ?? 128;
      images.push(this);
      if (this.behavior.load === 'pending') return;
      queueMicrotask(() => {
        if (this.behavior.load === 'error') this.onerror?.(new Error('simulated load error'));
        else this.onload?.();
      });
    }

    get src() { return this._src; }

    decode() {
      this.decodeCalls += 1;
      if (this.behavior.decode === 'reject') return Promise.reject(new Error('simulated decode error'));
      if (this.behavior.decode === 'pending') {
        return new Promise(resolve => { this.releaseDecode = resolve; });
      }
      return Promise.resolve();
    }
  }

  class FakeAudio {
    constructor() { this.preload = ''; this.src = ''; }
  }

  const context = {
    console: { log() {}, warn() {}, error() {} },
    Map,
    Promise,
    Image: FakeImage,
    Audio: FakeAudio,
    setTimeout,
    clearTimeout,
    async fetch(url) {
      if(url !== 'assets/manifest.json'){
        const jsonBehavior = options.json?.[url] || {};
        if(jsonBehavior.pendingBody) return { ok:true, json:() => new Promise(() => {}) };
        return { ok:jsonBehavior.ok !== false, status:jsonBehavior.status || 200, json:async () => jsonBehavior.value || {} };
      }
      manifestRequests += 1;
      if (options.manifestPending) return new Promise(() => {});
      if (options.manifestBodyPending) return { ok:true, json:() => new Promise(() => {}) };
      return { ok: true, json: () => Promise.resolve(manifest) };
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(SOURCE, context, { filename: 'js/assetManager.js' });

  return {
    assets: context.MoguriaAssets,
    images,
    get manifestRequests() { return manifestRequests; }
  };
}

test('critical progress advances only after each image has loaded and decoded', async () => {
  const manifest = {
    critical: [
      { id: 'first', type: 'image', src: 'assets/first.png' },
      { id: 'second', type: 'image', src: 'assets/second.png' }
    ],
    lazy: [],
    packs: []
  };
  const harness = createHarness(manifest, {
    'assets/first.png': { decode: 'pending' },
    'assets/second.png': { decode: 'pending' }
  });
  const progress = [];
  const pending = harness.assets.preloadCritical({ onProgress: value => progress.push({ ...value }) });

  await flushMicrotasks();
  assert.equal(harness.images.length, 2);
  assert.deepEqual(progress.map(item => item.completed), [0]);
  assert.equal(harness.assets.stats().ready, false);

  harness.images[0].releaseDecode();
  await flushMicrotasks();
  assert.deepEqual(progress.map(item => item.completed), [0, 1]);
  assert.equal(harness.assets.stats().ready, false);

  harness.images[1].releaseDecode();
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.total, 2);
  assert.equal(result.loaded, 2);
  assert.deepEqual(progress.map(item => item.completed), [0, 1, 2]);
  assert.ok(harness.images.every(image => image.decodeCalls === 1));
  assert.equal(harness.assets.stats().ready, true);
});

test('a failed required image keeps startup unready and retry reloads only the failure', async () => {
  const manifest = {
    critical: [
      { id: 'good', type: 'image', src: 'assets/good.png' },
      { id: 'retry', type: 'image', src: 'assets/retry.png' }
    ],
    lazy: [],
    packs: []
  };
  const harness = createHarness(manifest, {
    'assets/good.png': { load: 'success' },
    'assets/retry.png': [{ load: 'error' }, { load: 'success' }]
  });

  const first = await harness.assets.preloadCritical();
  assert.equal(first.ok, false);
  assert.deepEqual(Array.from(first.failed), ['retry']);
  assert.equal(harness.assets.stats().ready, false);

  const second = await harness.assets.preloadCritical();
  assert.equal(second.ok, true);
  assert.equal(harness.assets.stats().ready, true);
  assert.equal(harness.images.filter(image => image.src === 'assets/good.png').length, 1);
  assert.equal(harness.images.filter(image => image.src === 'assets/retry.png').length, 2);
  assert.equal(harness.manifestRequests, 1);
});

test('a required image timeout fails instead of leaving startup pending forever', async () => {
  const manifest = {
    critical: [{ id: 'stalled', type: 'image', src: 'assets/stalled.png' }],
    lazy: [],
    packs: []
  };
  const harness = createHarness(manifest, { 'assets/stalled.png': { load: 'pending' } });
  const result = await harness.assets.preloadCritical({ timeoutMs: 8 });

  assert.equal(result.ok, false);
  assert.deepEqual(Array.from(result.failed), ['stalled']);
  assert.match(harness.assets.stats().errors.join('\n'), /timed out after 8ms/);
});

test('a stalled manifest also times out and leaves startup retryable', async () => {
  const harness = createHarness(null, {}, { manifestPending:true });
  const result = await harness.assets.preloadCritical({ timeoutMs:8 });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'manifest-load-failed');
  assert.equal(result.total, 0);
  assert.equal(harness.assets.stats().ready, false);
  assert.match(harness.assets.stats().errors.join('\n'), /manifest timed out after 8ms/);
});

test('a manifest with response headers but a stalled body also times out', async () => {
  const harness = createHarness(null, {}, { manifestBodyPending:true });
  const result = await harness.assets.preloadCritical({ timeoutMs:8 });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'manifest-load-failed');
  assert.match(harness.assets.stats().errors.join('\n'), /manifest timed out after 8ms/);
});

test('a pack JSON body stall times out instead of blocking preparation forever', async () => {
  const manifest = {
    critical:[],
    lazy:[],
    packs:[{ id:'test-pack', assets:[{ id:'atlas', type:'json', src:'assets/atlas.json' }] }]
  };
  const harness = createHarness(manifest, {}, { json:{ 'assets/atlas.json':{ pendingBody:true } } });

  const result = await harness.assets.loadPack('test-pack', { timeoutMs:8 });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'asset-load-failed');
  assert.match(harness.assets.stats().errors.join('\n'), /json atlas timed out after 8ms/);
});

test('asset URLs cannot escape the first-party relative asset tree', async () => {
  const manifest = {
    critical:[
      { id:'protocol-relative', type:'image', src:'//cdn.example/bad.png' },
      { id:'data-scheme', type:'image', src:'data:image/png;base64,AAAA' },
      { id:'parent-path', type:'image', src:'../outside.png' },
      { id:'encoded-parent', type:'image', src:'assets/%2e%2e/%2e%2e/outside.png' },
      { id:'partial-encoded-parent', type:'image', src:'assets/.%2e/outside.png' },
      { id:'controlled-scheme', type:'image', src:'http\n://evil.example/bad.png' },
      { id:'malformed-encoding', type:'image', src:'assets/%zz/bad.png' }
    ],
    lazy:[],
    packs:[]
  };
  const harness = createHarness(manifest);

  const result = await harness.assets.preloadCritical();

  assert.equal(result.ok, false);
  assert.deepEqual(Array.from(result.failed), [
    'protocol-relative', 'data-scheme', 'parent-path', 'encoded-parent',
    'partial-encoded-parent', 'controlled-scheme', 'malformed-encoding'
  ]);
  assert.equal(harness.images.length, 0);
  assert.match(harness.assets.stats().errors.join('\n'), /no safe URL/);
});

test('the startup manifest contains exactly the 15 visible Home assets and no battle pack asset', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));
  const expected = new Set([
    'home_v2_background', 'home_v2_mogu', 'home_v2_star_companion', 'home_v2_logo',
    'home_v2_frame', 'home_v2_button', 'home_v2_button_gold', 'home_v2_icon_snack',
    'home_v2_icon_dex', 'home_v2_icon_logs', 'home_v2_icon_gacha', 'home_v2_icon_equip',
    'home_v2_icon_dungeon', 'home_v2_icon_outing', 'home_v2_currency_coin'
  ]);
  const actual = new Set(manifest.critical.map(asset => asset.id));

  assert.equal(manifest.critical.length, 15);
  assert.deepEqual(actual, expected);
  assert.ok(manifest.critical.every(asset => asset.type === 'image'));
  assert.ok(manifest.critical.every(asset => !asset.src.includes('battle-v3')));
  assert.ok(manifest.packs.find(pack => pack.id === 'battle-v3').assets.length > 0);
  const startupBytes = manifest.critical.reduce((sum, asset) => sum + fs.statSync(path.join(ROOT, asset.src)).size, 0);
  assert.ok(startupBytes <= manifest.policy.criticalBudgetMB * 1024 * 1024);

  const battlePack = manifest.packs.find(pack => pack.id === 'battle-v3');
  assert.ok(battlePack.assets.every(asset => asset.src.endsWith('?v=20260812-battle-motion-2')));
  assert.match(battlePack.assets.find(asset => asset.id === 'battle_v3_mogu').src, /mogu-atlas-hd-v2\.png\?v=20260812-battle-motion-2$/);
  assert.match(battlePack.assets.find(asset => asset.id === 'battle_v3_enemies').src, /enemy-atlas-v2\.png\?v=20260812-battle-motion-2$/);
  assert.match(battlePack.assets.find(asset => asset.id === 'battle_v3_bosses').src, /boss-atlas-v2\.png\?v=20260812-battle-motion-2$/);
});
