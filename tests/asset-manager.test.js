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
  const fetchRequests = [];
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
    AbortController,
    setTimeout,
    clearTimeout,
    async fetch(url, init = {}) {
      fetchRequests.push({ url, init });
      if(url !== 'assets/manifest.json'){
        if(typeof options.fetchAsset === 'function') return options.fetchAsset(url, init);
        const jsonBehavior = options.json?.[url] || {};
        if(jsonBehavior.pendingBody) return { ok:true, json:() => new Promise(() => {}) };
        return {
          ok:jsonBehavior.ok !== false,
          status:jsonBehavior.status || 200,
          json:async () => jsonBehavior.value || {},
          arrayBuffer:async () => new ArrayBuffer(0)
        };
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
    fetchRequests,
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

test('story pack JSON is cached and releasePack frees unshared decoded bytes', async () => {
  const sharedImage = { id:'shared-scene', type:'image', src:'assets/shared-scene.png' };
  const manifest = {
    critical:[],
    lazy:[],
    packs:[
      { id:'story-a', assets:[sharedImage, { id:'story-contract', type:'json', src:'assets/story.json' }] },
      { id:'story-b', assets:[sharedImage] }
    ]
  };
  const harness = createHarness(manifest, { 'assets/shared-scene.png':{ width:512, height:512 } }, {
    json:{ 'assets/story.json':{ value:{ version:1 } } }
  });

  assert.equal((await harness.assets.loadPack('story-a')).ok, true);
  assert.equal((await harness.assets.loadPack('story-b')).ok, true);
  assert.equal(harness.assets.getJson('story-contract').version, 1);
  assert.equal(harness.assets.stats().images, 1);
  assert.equal(harness.assets.stats().json, 1);
  assert.equal(harness.assets.stats().approxMB, 1);

  const firstRelease = harness.assets.releasePack('story-a');
  assert.deepEqual(Array.from(firstRelease.released), ['story-contract']);
  assert.equal(harness.assets.stats().images, 1, 'an asset shared by another loaded pack must remain decoded');
  assert.equal(harness.assets.stats().json, 0);
  assert.equal(harness.assets.stats().approxMB, 1);

  const finalRelease = harness.assets.releasePack('story-b');
  assert.deepEqual(Array.from(finalRelease.released), ['shared-scene']);
  assert.equal(harness.assets.stats().images, 0);
  assert.equal(harness.assets.stats().approxMB, 0, 'decoded-byte accounting must decrease on release');
});

test('an aborted story image pack settles promptly without caching partial decoded state', async () => {
  const manifest = {
    critical:[], lazy:[],
    packs:[{ id:'story-pending', assets:[{ id:'pending-scene', type:'image', src:'assets/pending-scene.png' }] }]
  };
  const harness = createHarness(manifest, { 'assets/pending-scene.png':{ load:'pending', width:512, height:512 } });
  const controller = new AbortController();
  const loading = harness.assets.loadPack('story-pending', { signal:controller.signal });
  await flushMicrotasks();
  controller.abort();
  const result = await loading;

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'asset-load-failed');
  assert.deepEqual(Array.from(result.failed), ['pending-scene']);
  assert.equal(harness.assets.getImage('pending-scene'), null);
  assert.equal(harness.assets.stats().images, 0);
  assert.doesNotMatch(harness.assets.stats().errors.join('\n'), /aborted/);
});

test('warmPack fills only the HTTP cache with exact URLs, drains bodies, dedupes, and limits concurrency to two', async () => {
  const manifest = {
    critical:[],
    lazy:[],
    packs:[{
      id:'battle-v3',
      assets:Array.from({ length:4 }, (_, index) => ({
        id:`asset-${index}`,
        type:'image',
        src:`assets/battle-${index}.png?v=exact-${index}`
      }))
    }]
  };
  const releases = [];
  let activeBodies = 0;
  let maxActiveBodies = 0;
  let drainedBodies = 0;
  const harness = createHarness(manifest, {}, {
    fetchAsset:async () => ({
      ok:true,
      body:{
        getReader(){
          let delivered = false;
          return {
            read(){
              if(delivered){
                activeBodies -= 1;
                drainedBodies += 1;
                return Promise.resolve({ done:true });
              }
              delivered = true;
              activeBodies += 1;
              maxActiveBodies = Math.max(maxActiveBodies, activeBodies);
              return new Promise(resolve => releases.push(() => resolve({ done:false, value:new Uint8Array([1]) })));
            }
          };
        }
      }
    })
  });
  await harness.assets.loadManifest();

  const first = harness.assets.warmPack('battle-v3');
  const duplicate = harness.assets.warmPack('battle-v3');
  assert.equal(duplicate, first, 'concurrent warm calls must share one job');
  await flushMicrotasks();
  assert.equal(releases.length, 2, 'only two response bodies may be active');

  for(let index = 0; index < 4; index += 1){
    const release = releases.shift();
    assert.ok(release, `expected body ${index + 1} to be pending`);
    release();
    await flushMicrotasks();
  }
  const result = await first;
  assert.equal(result.ok, true);
  assert.equal(result.warmed, 4);
  assert.equal(drainedBodies, 4);
  assert.equal(maxActiveBodies, 2);
  assert.equal(harness.images.length, 0, 'warmPack must never allocate Image objects');
  assert.equal(harness.assets.stats().images, 0);
  assert.equal(harness.assets.stats().approxMB, 0);

  const assetRequests = harness.fetchRequests.filter(request => request.url !== 'assets/manifest.json');
  assert.deepEqual(assetRequests.map(request => request.url), manifest.packs[0].assets.map(asset => asset.src));
  assert.ok(assetRequests.every(request => request.init.cache === 'force-cache'));
  assert.ok(assetRequests.every(request => request.init.mode === 'same-origin'));
  assert.ok(assetRequests.every(request => request.init.priority === 'low'));
  assert.ok(assetRequests.every(request => request.init.headers?.['X-Moguria-Purpose'] === 'warm-pack:battle-v3'));

  const reused = await harness.assets.warmPack('battle-v3');
  assert.equal(reused.ok, true);
  assert.equal(reused.reused, true);
  assert.equal(harness.fetchRequests.filter(request => request.url !== 'assets/manifest.json').length, 4);
});

test('warmPack aborts promptly and reports speculative failures without rejecting', async () => {
  const manifest = {
    critical:[],
    lazy:[],
    packs:[{
      id:'battle-v3',
      assets:Array.from({ length:3 }, (_, index) => ({ id:`asset-${index}`, type:'image', src:`assets/pending-${index}.png` }))
    }]
  };
  const harness = createHarness(manifest, {}, {
    fetchAsset:(_url, init) => new Promise((resolve, reject) => {
      init.signal?.addEventListener?.('abort', () => reject(new Error('aborted by test')), { once:true });
    })
  });
  await harness.assets.loadManifest();
  const controller = new AbortController();
  const pending = harness.assets.warmPack('battle-v3', { signal:controller.signal, timeoutMs:1000 });
  await flushMicrotasks();
  assert.equal(harness.fetchRequests.filter(request => request.url !== 'assets/manifest.json').length, 2);
  controller.abort();

  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'aborted');
  assert.equal(result.aborted, true);
  assert.equal(harness.images.length, 0);
});

test('warmPack AbortSignal also cancels a manifest body that has not completed', async () => {
  const harness = createHarness(null, {}, { manifestPending:true });
  const controller = new AbortController();
  const pending = harness.assets.warmPack('battle-v3', { signal:controller.signal, timeoutMs:1000 });
  await flushMicrotasks();
  controller.abort();

  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'aborted');
  assert.equal(result.aborted, true);
  assert.equal(harness.assets.stats().ready, false);
  assert.deepEqual(Array.from(harness.assets.stats().errors), []);
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

test('the startup manifest contains the 16 Home assets plus one dedicated loading child sheet and no battle pack asset', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));
  const expected = new Set([
    'home_v2_background', 'home_v2_mogu', 'home_v2_expedition_mogu', 'loading_child_mogu_flight', 'home_v2_star_companion', 'home_v2_logo',
    'home_v2_frame', 'home_v2_button', 'home_v2_button_gold', 'home_v2_icon_snack',
    'home_v2_icon_dex', 'home_v2_icon_logs', 'home_v2_icon_gacha', 'home_v2_icon_equip',
    'home_v2_icon_dungeon', 'home_v2_icon_outing', 'home_v2_currency_coin'
  ]);
  const actual = new Set(manifest.critical.map(asset => asset.id));

  assert.equal(manifest.critical.length, 17);
  assert.deepEqual(actual, expected);
  assert.ok(manifest.critical.every(asset => asset.type === 'image'));
  assert.ok(manifest.critical.every(asset => !asset.src.includes('battle-v3')));
  assert.ok(manifest.packs.find(pack => pack.id === 'battle-v3').assets.length > 0);
  const startupBytes = manifest.critical.reduce((sum, asset) => sum + fs.statSync(path.join(ROOT, asset.src)).size, 0);
  assert.ok(startupBytes <= manifest.policy.criticalBudgetMB * 1024 * 1024);

  const battlePack = manifest.packs.find(pack => pack.id === 'battle-v3');
  assert.ok(battlePack.assets.filter(asset => asset.id !== 'battle_v3_atlas_manifest').every(asset => asset.src.endsWith('?v=20260812-battle-motion-2')));
  assert.match(battlePack.assets.find(asset => asset.id === 'battle_v3_atlas_manifest').src, /atlas\.json\?v=20260814-motion-rig2-1$/);
  assert.match(battlePack.assets.find(asset => asset.id === 'battle_v3_mogu').src, /mogu-atlas-hd-v2\.png\?v=20260812-battle-motion-2$/);
  assert.match(battlePack.assets.find(asset => asset.id === 'battle_v3_enemies').src, /enemy-atlas-v2\.png\?v=20260812-battle-motion-2$/);
  assert.match(battlePack.assets.find(asset => asset.id === 'battle_v3_bosses').src, /boss-atlas-v2\.png\?v=20260812-battle-motion-2$/);
});
