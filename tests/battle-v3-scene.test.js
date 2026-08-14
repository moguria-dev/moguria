'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'js/battle-v3-scene.js'), 'utf8');

function pngDimensions(bytes) {
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes[25]
  };
}

function chainableLayer(key) {
  return {
    key,
    alpha: 1,
    visible: true,
    displayWidth: 0,
    displayHeight: 0,
    setOrigin() { return this; },
    setScrollFactor(value) { this.scrollFactor = value; return this; },
    setDepth(value) { this.depth = value; return this; },
    setAlpha(value) { this.alpha = value; return this; },
    setVisible(value) { this.visible = value; return this; },
    setDisplaySize(width, height) { this.displayWidth = width; this.displayHeight = height; return this; },
    setPosition(x, y) { this.x = x; this.y = y; return this; }
  };
}

function chainableActor() {
  return {
    x: 0,
    y: 0,
    alpha: 1,
    scaleX: 1,
    scaleY: 1,
    flipX: false,
    destroyed: false,
    moguriaFallback: false,
    moguriaState: '',
    anims: { stop() {}, pause() {}, resume() {} },
    setPosition(x, y) { this.x = x; this.y = y; return this; },
    setDisplaySize(width, height) { this.displayWidth = width; this.displayHeight = height; return this; },
    setDepth(value) { this.depth = value; return this; },
    setAlpha(value) { this.alpha = value; return this; },
    setFlipX(value) { this.flipX = value; return this; },
    setFrame(value) { this.frame = value; return this; },
    setRotation(value) { this.rotation = value; return this; },
    setScale(x, y) { this.scaleX = x; this.scaleY = y; return this; },
    setTint(value) { this.tint = value; return this; },
    clearTint() { this.tint = null; return this; },
    destroy() { this.destroyed = true; }
  };
}

function recordingGraphics() {
  const calls = [];
  const graphics = { calls };
  for (const method of [
    'clear', 'fillStyle', 'fillCircle', 'fillRect', 'fillRoundedRect', 'lineStyle',
    'strokeCircle', 'strokeRect', 'strokeRoundedRect', 'beginPath', 'moveTo',
    'lineTo', 'closePath', 'fillPath'
  ]) {
    graphics[method] = (...args) => { calls.push([method, ...args]); return graphics; };
  }
  return graphics;
}

function createHarness(options = {}) {
  let gameConfig = null;
  let gameInstance = null;
  const imageCalls = [];
  const bodyClasses = new Set();
  const lifecycleCalls = [];
  const animationFrames = [];
  const windowListeners = new Map();
  const viewportWidth = options.viewportWidth ?? 1440;
  const viewportHeight = options.viewportHeight ?? 900;
  const appWidth = options.appWidth ?? 430;
  const appHeight = options.appHeight ?? 844;
  let parentWidth = options.parentWidth ?? 0;
  let parentHeight = options.parentHeight ?? 0;
  const mediaQuery = {
    matches: Boolean(options.reducedMotion),
    addEventListener() {},
    removeEventListener() {}
  };
  const app = {
    clientWidth: appWidth,
    clientHeight: appHeight,
    getBoundingClientRect: () => ({ width: appWidth, height: appHeight })
  };
  const parent = {
    firstChild: null,
    clientWidth: parentWidth,
    clientHeight: parentHeight,
    querySelector: () => null,
    closest: selector => selector === '#app' ? app : null,
    getBoundingClientRect: () => ({ width: parentWidth, height: parentHeight }),
    insertBefore(child) {
      child.parentElement = this;
      child.parentNode = this;
      this.firstChild = child;
      return child;
    }
  };
  const context = {
    console: { log() {}, warn() {}, error() {} },
    Promise,
    Map,
    Set,
    WeakMap,
    Math,
    Number,
    Object,
    String,
    Array,
    Error,
    TypeError,
    performance: { now: () => 1000 },
    innerWidth: viewportWidth,
    innerHeight: viewportHeight,
    devicePixelRatio: 2,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback) {
      animationFrames.push(callback);
      return animationFrames.length;
    },
    addEventListener(type, listener) {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      windowListeners.get(type)?.delete(listener);
    },
    dispatchEvent(event) {
      for (const listener of windowListeners.get(event?.type) || []) listener(event);
    },
    MoguriaPerformance: { getQuality: () => options.quality || 'high' },
    matchMedia(query) {
      assert.equal(query, '(prefers-reduced-motion: reduce)');
      return mediaQuery;
    },
    document: {
      body: {
        classList: {
          add(name) { bodyClasses.add(name); },
          remove(name) { bodyClasses.delete(name); }
        }
      },
      getElementById(id) {
        if (id === 'app') return app;
        if (id === 'game') return parent;
        return null;
      },
      querySelector: () => null,
      createElement(tag) {
        assert.equal(tag, 'div');
        return {
          id: '',
          style: {},
          dataset: {},
          isConnected: true,
          setAttribute() {},
          getBoundingClientRect() {
            if (this.style.display === 'none') return { width: 0, height: 0 };
            return this.parentElement?.getBoundingClientRect?.() || { width: 0, height: 0 };
          },
          querySelector() { return null; },
          remove() { this.isConnected = false; }
        };
      }
    }
  };
  if (options.rig) context.MoguriaMoguRig = options.rig;

  class Scene {
    constructor(config) { this.sceneConfig = config; }
  }
  class Game {
    constructor(config) {
      gameConfig = config;
      gameInstance = this;
      this.config = config;
      this.canvas = {
        width: config.width,
        height: config.height,
        clientWidth: config.width,
        clientHeight: config.height,
        dataset: {},
        style: {},
        setAttribute() { lifecycleCalls.push('canvas.configure'); }
      };
      this.scale = {
        width: config.width,
        height: config.height,
        parent: config.parent,
        parentSize: { width: 0, height: 0 },
        resize: (width, height) => {
          lifecycleCalls.push(`scale.resize:${width}x${height}`);
          // Phaser 4 RESIZE mode immediately refreshes from its cached
          // parentSize. A hidden preload leaves that cache at 0x0.
          width = this.scale.parentSize.width;
          height = this.scale.parentSize.height;
          this.scale.width = width;
          this.scale.height = height;
          this.canvas.width = width;
          this.canvas.height = height;
        },
        getParentBounds: () => {
          const rect = this.scale.parent?.getBoundingClientRect?.() || { width: 0, height: 0 };
          const width = Math.round(Number(rect.width) || 0);
          const height = Math.round(Number(rect.height) || 0);
          lifecycleCalls.push(`scale.getParentBounds:${width}x${height}`);
          this.scale.parentSize.width = width;
          this.scale.parentSize.height = height;
          return true;
        },
        refresh: () => {
          lifecycleCalls.push('scale.refresh');
          const width = this.scale.parentSize.width;
          const height = this.scale.parentSize.height;
          this.scale.width = width;
          this.scale.height = height;
          this.canvas.width = width;
          this.canvas.height = height;
          return this.scale;
        },
        setParentSize: (width, height) => {
          lifecycleCalls.push(`scale.setParentSize:${width}x${height}`);
          this.scale.parentSize.width = width;
          this.scale.parentSize.height = height;
          return this.scale.refresh();
        }
      };
      this.loop = {
        sleep() { lifecycleCalls.push('loop.sleep'); },
        wake() { lifecycleCalls.push('loop.wake'); }
      };
      this.destroyed = false;
    }
    destroy() { this.destroyed = true; }
  }
  context.Phaser = {
    AUTO: 'AUTO',
    Scene,
    Game,
    Scale: { RESIZE: 'RESIZE', CENTER_BOTH: 'CENTER_BOTH' },
    BlendModes: { ADD: 1 }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(SOURCE, context, { filename: 'js/battle-v3-scene.js' });

  return {
    context,
    parent,
    app,
    imageCalls,
    bodyClasses,
    lifecycleCalls,
    get gameConfig() { return gameConfig; },
    get game() { return gameInstance; },
    setParentSize(width, height) {
      parentWidth = width;
      parentHeight = height;
      parent.clientWidth = width;
      parent.clientHeight = height;
    },
    flushAnimationFrame({ collapseBackingStore = false } = {}) {
      const callback = animationFrames.shift();
      assert.ok(callback, 'expected a pending animation frame');
      if (collapseBackingStore) {
        gameInstance.scale.width = 0;
        gameInstance.scale.height = 0;
        gameInstance.canvas.width = 0;
        gameInstance.canvas.height = 0;
      }
      callback(1016);
    },
    pendingAnimationFrames() {
      return animationFrames.length;
    },
    async flushMicrotasks(count = 8) {
      for (let index = 0; index < count; index++) await Promise.resolve();
    },
    makeScene() {
      const SceneClass = gameConfig.scene[0];
      const scene = new SceneClass();
      scene.scale = { width: 430, height: 844 };
      scene.add = {
        image(x, y, key) {
          const layer = chainableLayer(key);
          layer.x = x;
          layer.y = y;
          imageCalls.push(layer);
          return layer;
        }
      };
      return scene;
    },
    completeBoot() {
      const scene = this.makeScene();
      scene.scale = gameInstance.scale;
      scene.cache = { json: { get: () => ({}) } };
      scene.cameras = {
        main: {
          setBackgroundColor() {},
          setRoundPixels() {},
          setBounds() {}
        }
      };
      scene.events = { once() {} };
      scene.scene = {
        setVisible(value) { lifecycleCalls.push(`scene.visible:${value}`); },
        resume() { lifecycleCalls.push('scene.resume'); },
        pause() { lifecycleCalls.push('scene.pause'); }
      };
      scene.createFallbackTextures = () => {};
      scene.registerAnimations = () => {};
      scene.createBackgrounds = () => {};
      scene.createDrawLayers = () => {};
      scene.createActorSprite = () => ({ setDepth() { return this; } });
      scene.createPlayerRig = () => {};
      scene.applyQuality = () => {};
      scene.applyMotionPreference = () => {};
      scene.flushCameraFx = () => {};
      scene.create();
      return scene;
    }
  };
}

async function flushFrame(harness, options) {
  harness.flushAnimationFrame(options);
  await harness.flushMicrotasks();
}

test('hidden preload falls back to the constrained app size', () => {
  const harness = createHarness();
  const pending = harness.context.MoguriaBattleV3.boot({ parent: harness.parent });

  assert.ok(pending && typeof pending.then === 'function');
  assert.equal(harness.gameConfig.width, 430);
  assert.equal(harness.gameConfig.height, 844);
  assert.equal(harness.gameConfig.scale.width, 430);
  assert.equal(harness.gameConfig.scale.height, 844);

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('visible battle uses the same PC and mobile dimensions as its DOM HUD', () => {
  for (const dimensions of [
    { parentWidth: 1363, parentHeight: 936, appWidth: 820, appHeight: 936 },
    { parentWidth: 390, parentHeight: 844, appWidth: 390, appHeight: 844, viewportWidth: 390, viewportHeight: 844 },
    { parentWidth: 375, parentHeight: 667, appWidth: 375, appHeight: 667, viewportWidth: 375, viewportHeight: 667 }
  ]) {
    const harness = createHarness(dimensions);
    harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
    assert.equal(harness.gameConfig.width, dimensions.parentWidth);
    assert.equal(harness.gameConfig.height, dimensions.parentHeight);
    assert.equal(harness.gameConfig.scale.width, dimensions.parentWidth);
    assert.equal(harness.gameConfig.scale.height, dimensions.parentHeight);
    harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
  }
});

test('visible start repairs stale RESIZE parent state and verifies the backing store before resolving', async () => {
  const harness = createHarness({
    parentWidth: 0,
    parentHeight: 0,
    appWidth: 390,
    appHeight: 844,
    viewportWidth: 390,
    viewportHeight: 844
  });
  const booted = harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.completeBoot();
  await booted;

  // Phaser.Scale.RESIZE can observe the display:none preload surface and
  // collapse only the Canvas backing store while its CSS box stays full-size.
  harness.game.scale.width = 0;
  harness.game.scale.height = 0;
  harness.game.canvas.width = 0;
  harness.game.canvas.height = 0;
  harness.setParentSize(390, 844);

  // This models Phaser 4.2.1 ScaleManager.resize(): its refresh reads the
  // stale hidden-preload parentSize and immediately restores 0x0.
  harness.game.scale.resize(390, 844);
  assert.equal(harness.game.canvas.width, 0);
  assert.equal(harness.game.canvas.height, 0);

  const originalHandleResize = scene.handleResize.bind(scene);
  scene.handleResize = (width, height) => {
    harness.lifecycleCalls.push(`scene.handleResize:${width}x${height}`);
    return originalHandleResize(width, height);
  };
  scene.syncState = state => {
    harness.lifecycleCalls.push(`scene.sync:${state.id}`);
    return true;
  };
  harness.lifecycleCalls.length = 0;

  const started = harness.context.MoguriaBattleV3.start({ id: 'visible-state', p: {} });

  assert.equal(harness.game.canvas.width, 0, 'start waits for one visible layout frame');
  assert.equal(harness.game.canvas.height, 0, 'start waits for one visible layout frame');
  assert.deepEqual(harness.lifecycleCalls, []);

  let resolved = false;
  started.then(() => { resolved = true; });
  await flushFrame(harness);
  assert.equal(resolved, false, 'start must verify rendered stability before resolving');
  assert.equal(harness.game.canvas.width, 390);
  assert.equal(harness.game.canvas.height, 844);
  assert.deepEqual(harness.lifecycleCalls, [
    'scale.getParentBounds:390x844',
    'scale.refresh',
    'scene.handleResize:390x844',
    'loop.wake',
    'scene.visible:true',
    'scene.resume',
    'scene.sync:visible-state',
    'canvas.configure'
  ]);

  await flushFrame(harness, { collapseBackingStore: true });
  assert.equal(resolved, false);
  assert.equal(harness.game.canvas.width, 390, 'a first-frame reset must trigger a bounded retry');
  assert.equal(harness.game.canvas.height, 844, 'a first-frame reset must trigger a bounded retry');
  assert.deepEqual(harness.lifecycleCalls.slice(-4), [
    'scale.getParentBounds:390x844',
    'scale.refresh',
    'scene.handleResize:390x844',
    'canvas.configure'
  ]);

  await flushFrame(harness);
  assert.equal(resolved, false, 'one stable frame is not enough to resolve start');
  await flushFrame(harness);
  assert.equal(await started, harness.context.MoguriaBattleV3);
  assert.equal(resolved, true);

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('visible start rejects after the bounded backing-store stabilization window', async () => {
  const harness = createHarness({
    parentWidth: 0,
    parentHeight: 0,
    appWidth: 390,
    appHeight: 844,
    viewportWidth: 390,
    viewportHeight: 844
  });
  const booted = harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.completeBoot();
  await booted;
  scene.syncState = () => true;
  harness.game.scale.width = 0;
  harness.game.scale.height = 0;
  harness.game.canvas.width = 0;
  harness.game.canvas.height = 0;
  harness.setParentSize(390, 844);

  const started = harness.context.MoguriaBattleV3.start({ id: 'unstable-state', p: {} });
  const rejected = assert.rejects(started, /canvas did not stabilize \(host 390x844; canvas 0x0; scale 0x0\)/);
  await flushFrame(harness);
  for (let frame = 0; frame < 4; frame++) {
    await flushFrame(harness, { collapseBackingStore: true });
  }
  await rejected;

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('stop cancels a start waiting for visible layout before Phaser is resumed', async () => {
  const harness = createHarness({ parentWidth: 0, parentHeight: 0, appWidth: 390, appHeight: 844 });
  const booted = harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.completeBoot();
  await booted;
  scene.syncState = state => {
    harness.lifecycleCalls.push(`scene.sync:${state.id}`);
    return true;
  };
  harness.setParentSize(390, 844);
  harness.lifecycleCalls.length = 0;

  const started = harness.context.MoguriaBattleV3.start({ id: 'cancelled-state', p: {} });
  const rejected = assert.rejects(started, error => error?.code === 'MOGURIA_BATTLE_START_CANCELLED');
  harness.context.MoguriaBattleV3.stop({ restoreLegacy: true });
  await flushFrame(harness);
  await rejected;

  assert.equal(harness.parent.firstChild.style.display, 'none');
  assert.equal(harness.bodyClasses.has('battle-v3-active'), false);
  assert.equal(harness.lifecycleCalls.includes('loop.wake'), false);
  assert.equal(harness.lifecycleCalls.some(call => call.startsWith('scene.sync:')), false);
  assert.equal(harness.lifecycleCalls.some(call => call.startsWith('scale.getParentBounds:')), false);

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('a cancelled start cannot hide or reset a newer start', async () => {
  const harness = createHarness({ parentWidth: 0, parentHeight: 0, appWidth: 390, appHeight: 844 });
  const booted = harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.completeBoot();
  await booted;
  scene.syncState = state => {
    harness.lifecycleCalls.push(`scene.sync:${state.id}`);
    return true;
  };
  harness.setParentSize(390, 844);
  harness.game.scale.width = 0;
  harness.game.scale.height = 0;
  harness.game.canvas.width = 0;
  harness.game.canvas.height = 0;

  const staleStart = harness.context.MoguriaBattleV3.start({ id: 'stale-state', p: {} });
  const staleRejected = assert.rejects(staleStart, error => error?.code === 'MOGURIA_BATTLE_START_CANCELLED');
  harness.context.MoguriaBattleV3.stop({ restoreLegacy: true });
  harness.lifecycleCalls.length = 0;
  const currentStart = harness.context.MoguriaBattleV3.start({ id: 'current-state', p: {} });

  await flushFrame(harness);
  await staleRejected;
  assert.equal(harness.parent.firstChild.style.display, 'block', 'stale catch must not hide the new start');
  assert.equal(harness.bodyClasses.has('battle-v3-active'), true, 'stale catch must not restore old layers');
  assert.deepEqual(harness.lifecycleCalls, []);

  await flushFrame(harness);
  await flushFrame(harness);
  await flushFrame(harness);
  assert.equal(await currentStart, harness.context.MoguriaBattleV3);
  assert.equal(harness.lifecycleCalls.includes('scene.sync:stale-state'), false);
  assert.equal(harness.lifecycleCalls.includes('scene.sync:current-state'), true);
  assert.equal(harness.parent.firstChild.style.display, 'block');

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('running battle refreshes its RESIZE parent cache for ordinary and orientation-size changes', async () => {
  const harness = createHarness({
    parentWidth: 390,
    parentHeight: 844,
    appWidth: 390,
    appHeight: 844,
    viewportWidth: 390,
    viewportHeight: 844
  });
  const booted = harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.completeBoot();
  await booted;
  scene.syncState = () => true;
  const originalHandleResize = scene.handleResize.bind(scene);
  scene.handleResize = (width, height) => {
    harness.lifecycleCalls.push(`scene.handleResize:${width}x${height}`);
    return originalHandleResize(width, height);
  };

  const started = harness.context.MoguriaBattleV3.start({ id: 'resize-state', p: {} });
  await flushFrame(harness);
  await flushFrame(harness);
  await flushFrame(harness);
  await started;

  for (const [width, height] of [[375, 667], [844, 390]]) {
    harness.lifecycleCalls.length = 0;
    harness.setParentSize(width, height);
    harness.context.dispatchEvent({ type: 'resize' });
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(harness.game.canvas.width, width);
    assert.equal(harness.game.canvas.height, height);
    assert.equal(harness.game.scale.width, width);
    assert.equal(harness.game.scale.height, height);
    assert.deepEqual(harness.lifecycleCalls, [
      `scale.getParentBounds:${width}x${height}`,
      'scale.refresh',
      `scene.handleResize:${width}x${height}`,
      'canvas.configure'
    ]);
  }

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('backgrounds show ordered parallax during an ordinary 120px move', () => {
  const harness = createHarness();
  harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.makeScene();

  scene.createBackgrounds();

  assert.equal(harness.imageCalls.length, 4);
  assert.deepEqual(harness.imageCalls.map(layer => layer.alpha), [1, 0.34, 0.48, 0.54]);
  assert.ok(harness.imageCalls.every(layer => layer.displayWidth === 638));
  assert.ok(harness.imageCalls.every(layer => layer.displayHeight === layer.displayWidth * 2));
  scene.stateTime = 1.5;
  scene.syncBackgrounds({ x: 0, y: 0 });
  const centered = harness.imageCalls.map(layer => ({ x: layer.x, y: layer.y }));
  scene.syncBackgrounds({ x: 120, y: 0 });
  const moved = harness.imageCalls.map(layer => ({ x: layer.x, y: layer.y }));
  const travel = moved.map((position, index) => Math.abs(position.x - centered[index].x));
  assert.ok(moved.every((position, index) => position.x !== centered[index].x || position.y !== centered[index].y));
  assert.ok(travel[0] > 5, `far layer only moved ${travel[0]}px`);
  assert.ok(travel[1] > 9, `mid layer only moved ${travel[1]}px`);
  assert.ok(travel[2] > 17, `ground layer only moved ${travel[2]}px`);
  assert.ok(travel[3] > 28, `foreground layer only moved ${travel[3]}px`);
  assert.ok(travel.every((value, index) => index === 0 || value > travel[index - 1]));
  assert.deepEqual(Array.from(scene.layouts.mogu.idle.frames), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(Array.from(scene.layouts.mogu.move.frames), [6, 7, 8, 9, 10, 11]);
  assert.deepEqual(Array.from(scene.layouts.mogu.attack.frames), [12, 13, 14, 15, 16, 17, 18, 19]);
  assert.match(scene.assets.manifest.src, /atlas\.json\?v=20260814-motion-rig2-1$/);
  assert.match(scene.assets.sheets.mogu.src, /mogu-atlas-hd-v2\.png\?v=20260812-battle-motion-2$/);
  assert.equal(scene.assets.sheets.mogu.frameWidth, 256);

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('Motion Rig 2 atlas projection keeps the RGBA source sheets and complete regular cells', () => {
  const atlasPath = path.join(ROOT, 'assets/images/battle-v3/mogu-atlas-hd-v2.png');
  const bytes = fs.readFileSync(atlasPath);
  assert.deepEqual(pngDimensions(bytes), { width:1536, height:1024, colorType:6 });

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/images/battle-v3/atlas.json'), 'utf8'));
  assert.equal(manifest.version, 2);
  assert.equal(manifest.atlases.mogu.image, 'mogu-atlas-hd-v2.png');
  assert.deepEqual(manifest.atlases.mogu.cell, { width: 256, height: 256 });
  assert.deepEqual(manifest.atlases.mogu.states.attack, [12, 13, 14, 15, 16, 17, 18, 19]);
  assert.equal(manifest.atlases.enemy.columns * manifest.atlases.enemy.rows, 24);
  assert.equal(manifest.atlases.boss.columns * manifest.atlases.boss.rows, 16);
  assert.deepEqual(
    pngDimensions(fs.readFileSync(path.join(ROOT, 'assets/images/battle-v3/enemy-atlas-v2.png'))),
    { width:1152, height:768, colorType:6 }
  );
  assert.deepEqual(
    pngDimensions(fs.readFileSync(path.join(ROOT, 'assets/images/battle-v3/boss-atlas-v2.png'))),
    { width:2048, height:512, colorType:6 }
  );
});

test('regular enemies and companions hold front-neutral art while bosses retain semantic sequences', () => {
  const harness = createHarness();
  harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.makeScene();

  const expectedEnemyRows = { soft:0, bat:6, stone:12, ghost:18 };
  for (const [variant, neutral] of Object.entries(expectedEnemyRows)) {
    const layout = scene.variantLayouts.enemy[variant];
    assert.deepEqual(Array.from(layout.move.frames), [neutral]);
    assert.deepEqual(Array.from(layout.attack.frames), [neutral]);
    assert.deepEqual(Array.from(layout.hurt.frames), [neutral + 5]);
    assert.ok(!layout.move.frames.some(frame => [neutral + 2, neutral + 3, neutral + 4].includes(frame)));
    assert.ok(!layout.attack.frames.some(frame => [neutral + 2, neutral + 3, neutral + 4].includes(frame)));
  }
  assert.deepEqual(Array.from(scene.layouts.companion.idle.frames), [0]);
  assert.deepEqual(Array.from(scene.layouts.companion.move.frames), [0]);
  assert.deepEqual(Array.from(scene.layouts.companion.attack.frames), [2]);
  assert.equal(scene.layouts.companion.attack.frames.includes(3), false);
  assert.deepEqual(Array.from(scene.variantLayouts.boss.midBoss.telegraph.frames), [0, 1, 2, 3]);
  assert.deepEqual(Array.from(scene.variantLayouts.boss.midBoss.attack.frames), [2, 3, 4, 5, 6, 7]);
  assert.deepEqual(Array.from(scene.variantLayouts.boss.boss.attack.frames), [10, 11, 12, 13, 14, 15]);
  assert.equal(scene.actorVariant('boss', { kind: 'midBoss', phase2: true }), 'midBoss');
  assert.equal(scene.actorVariant('boss', { kind: 'boss', phase2: false }), 'boss');

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('reduced motion keeps semantic animation and player-linked parallax', () => {
  const harness = createHarness({ reducedMotion: true });
  harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.makeScene();
  scene.createBackgrounds();
  scene.cameras = { main: { resetFX() {} } };

  scene.stateTime = 0;
  scene.syncBackgrounds({ x: 0, y: 0 });
  const atRest = harness.imageCalls.map(layer => ({ x: layer.x, y: layer.y }));
  scene.stateTime = 30;
  scene.syncBackgrounds({ x: 0, y: 0 });
  assert.deepEqual(harness.imageCalls.map(layer => ({ x: layer.x, y: layer.y })), atRest, 'ambient drift must be suppressed');

  scene.syncBackgrounds({ x: 120, y: 0 });
  assert.ok(Math.abs(harness.imageCalls[3].x - atRest[3].x) > 28, 'movement-linked foreground parallax must remain');

  const animation = {
    timeScale: 0,
    pauses: 0,
    resumes: 0,
    pause() { this.pauses += 1; },
    resume() { this.resumes += 1; }
  };
  scene.playerSprite = { anims: animation };
  scene.lastState = { mode: 'run' };
  scene.animationPauseSignature = '';
  scene.applyMotionPreference();
  assert.equal(animation.pauses, 0);
  assert.equal(animation.resumes, 1);
  assert.equal(animation.timeScale, 1);

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('continuous Mogu rig owns frame zero, release timing, pause, and destruction', () => {
  const updates = [];
  const creations = [];
  const pauses = [];
  let stops = 0;
  let destroys = 0;
  const harness = createHarness({
    rig: {
      createController(options) {
        creations.push({ ...options });
        return {
          update(options) {
            updates.push({ ...options });
            return { x:3, y:4, rotation:0.2, scaleX:1.1, scaleY:0.9, state:'attack', stage:'release', elapsed:0.224 };
          },
          setPaused(value) { pauses.push(value); },
          destroy() { destroys += 1; }
        };
      }
    }
  });
  harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.makeScene();
  const sprite = {
    moguriaFallback: false,
    anims: { stop() { stops += 1; } },
    setFrame(value) { this.frame = value; return this; },
    setPosition(x, y) { this.x = x; this.y = y; return this; },
    setRotation(value) { this.rotation = value; return this; },
    setScale(x, y) { this.scaleX = x; this.scaleY = y; return this; }
  };
  scene.playerSprite = sprite;

  assert.equal(scene.createPlayerRig(), true);
  assert.ok(scene.playerRig);
  assert.deepEqual(creations, [{ role:'mogu', phaseOffset:0 }]);
  scene.visualFrameDelta = 1 / 60;
  assert.equal(scene.applyPlayerRig(
    sprite,
    'attack',
    { facing:-1, attackSerial:4 },
    { mode:'run' },
    { x:10, y:20, attackSerial:4, attackStartElapsed:0.224 }
  ), true);

  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], {
    state:'attack', eventSerial:4, startElapsed:0.224, durationScale:1,
    delta:1 / 60, advance:true, reducedMotion:false, quality:'high'
  });
  assert.equal(sprite.frame, 0);
  assert.equal(sprite.x, 7);
  assert.equal(sprite.y, 24);
  assert.equal(sprite.rotation, -0.2);
  assert.ok(Math.abs(sprite.scaleX - (82 / 256 * 1.1)) < 1e-12);
  assert.ok(Math.abs(sprite.scaleY - (82 / 256 * 0.9)) < 1e-12);
  assert.equal(sprite.moguriaState, 'rig:mogu:attack:release');
  assert.ok(stops >= 2, 'atlas playback must remain stopped while the rig owns Mogu');

  scene.visualFrameDelta = 0;
  scene.applyPlayerRig(sprite, 'idle', { facing:1, attackSerial:4 }, { mode:'artifact' }, { x:10, y:20 });
  assert.equal(updates[1].advance, false);
  assert.equal(updates[1].delta, 0);
  assert.deepEqual(pauses, [false, true]);
  scene.releaseSceneObjects();
  assert.equal(destroys, 1);
  assert.equal(scene.playerRig, null);

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('enemy and companion rigs keep approved frames, front-facing enemies, and per-actor lifecycle', () => {
  const stages = { enemy:'release', companion:'anticipate' };
  const creations = [];
  const updates = { enemy:[], companion:[] };
  const pauses = { enemy:[], companion:[] };
  const destroys = { enemy:0, companion:0 };
  const harness = createHarness({
    rig: {
      profiles: { enemy:{ ambientPhase:.42 }, companion:{ ambientPhase:.2 } },
      createController(options) {
        const role = options.role;
        creations.push({ ...options });
        return {
          update(updateOptions) {
            updates[role].push({ ...updateOptions });
            return {
              x:3, y:4, rotation:.3, scaleX:1.1, scaleY:.9,
              state:updateOptions.state, stage:stages[role]
            };
          },
          setPaused(value) { pauses[role].push(value); },
          destroy() { destroys[role] += 1; }
        };
      }
    }
  });
  harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.makeScene();
  scene.cameras = { main:{ worldView:{ x:-500, y:-500, width:1000, height:1000 } } };
  scene.visualFrameDelta = 1 / 60;

  const enemy = chainableActor();
  assert.equal(scene.applyActorRig(
    'enemy:ghost-1', enemy, 'enemy', 'attack',
    { facing:-1, attackSerial:3 }, { mode:'run' },
    { attackSerial:3 }, { x:100, y:200, size:54, variant:'ghost' }
  ), true);
  assert.equal(enemy.frame, 18, 'ghost move/attack must hold its front-neutral row frame');
  assert.equal(enemy.x, 103, 'front-facing enemy attack displacement must not mirror');
  assert.equal(enemy.rotation, 0);
  assert.equal(enemy.flipX, false);

  stages.enemy = 'hurt';
  assert.equal(scene.applyActorRig(
    'enemy:ghost-1', enemy, 'enemy', 'hurt',
    { facing:-1, hurtSerial:2 }, { mode:'run' },
    { hurtSerial:2, hurtDirection:-1 }, { x:100, y:200, size:54, variant:'ghost' }
  ), true);
  assert.equal(enemy.frame, 23, 'only the row +5 painting is used for a regular-enemy hit');
  assert.equal(enemy.x, 97, 'hurt knockback may mirror while the painting remains front-facing');
  assert.equal(enemy.rotation, 0);
  assert.equal(enemy.flipX, false);

  const companion = chainableActor();
  assert.equal(scene.applyActorRig(
    'companion:one', companion, 'companion', 'attack',
    { facing:-1, attackSerial:5 }, { mode:'run' },
    { attackSerial:5 }, { x:40, y:60, size:50, variant:'default' }
  ), true);
  assert.equal(companion.frame, 0, 'anticipation uses the neutral companion painting');
  assert.equal(companion.flipX, true);
  assert.equal(companion.rotation, -.3);
  stages.companion = 'release';
  scene.applyActorRig(
    'companion:one', companion, 'companion', 'attack',
    { facing:-1, attackSerial:5 }, { mode:'run' },
    { attackSerial:5 }, { x:40, y:60, size:50, variant:'default' }
  );
  assert.equal(companion.frame, 2, 'release uses the single approved companion painting');
  assert.notEqual(companion.frame, 3, 'projectile art must never become the actor frame');

  scene.cameras.main.worldView = { x:0, y:0, width:100, height:100 };
  stages.enemy = 'idle';
  scene.applyActorRig(
    'enemy:ghost-1', enemy, 'enemy', 'idle',
    { facing:1 }, { mode:'run' }, {}, { x:1000, y:1000, size:54, variant:'ghost' }
  );
  assert.equal(updates.enemy.at(-1).advance, false, 'offscreen ambient rig work is suspended');
  assert.equal(pauses.enemy.at(-1), true);

  assert.deepEqual(creations.map(item => item.role), ['enemy', 'companion']);
  assert.equal(scene.actorRigs.size, 2);
  scene.applyAnimationPause(true);
  assert.equal(pauses.enemy.at(-1), true);
  assert.equal(pauses.companion.at(-1), true);
  scene.disableActorRig('enemy:ghost-1', enemy);
  assert.equal(destroys.enemy, 1);
  assert.equal(scene.actorRigs.has('enemy:ghost-1'), false);
  scene.releaseSceneObjects();
  assert.equal(destroys.enemy, 1, 'individually removed controllers must not be destroyed twice');
  assert.equal(destroys.companion, 1);
  assert.equal(scene.actorRigs.size, 0);

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('a failed continuous rig falls back to the existing Mogu atlas in the same sync', () => {
  const harness = createHarness({
    rig: {
      createController() {
        return {
          update() { throw new Error('rig failed'); },
          destroy() {}
        };
      }
    }
  });
  harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.makeScene();
  const sprite = {
    moguriaFallback: false,
    moguriaState: '',
    anims: { stop() {} },
    setFrame() { return this; },
    setPosition() { return this; },
    setRotation() { return this; },
    setScale() { return this; },
    setFlipX() { return this; },
    setDisplaySize(width, height) { this.displayWidth = width; this.displayHeight = height; return this; },
    setDepth() { return this; },
    setAlpha() { return this; }
  };
  scene.playerSprite = sprite;
  assert.ok(scene.createPlayerRig());
  scene.animationPauseSignature = 'true:high:1';
  scene.sampleMotion = () => ({ facing:1, attackSerial:2 });
  scene.inferredState = () => 'attack';
  let atlasCalls = 0;
  let proceduralCalls = 0;
  scene.setActorAnimation = () => { atlasCalls += 1; };
  scene.applyProceduralActorMotion = () => { proceduralCalls += 1; };

  scene.syncPlayer({ mode:'run', levelUpCue:null }, { x:0, y:0, hp:10, invuln:0 });

  assert.equal(scene.playerRig, null);
  assert.equal(sprite.moguriaRigControlled, false);
  assert.equal(sprite.displayWidth, 82);
  assert.equal(sprite.displayHeight, 82);
  assert.equal(scene.animationPauseSignature, '', 'fallback pause/resume must be reapplied after a rig failure');
  assert.equal(atlasCalls, 1);
  assert.equal(proceduralCalls, 1);

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('atlas fallback preserves boss poses but uses Motion Rig 2-safe regular actor frames', () => {
  const harness = createHarness();
  harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.makeScene();
  const frameCounts = {
    'moguria-v3-mogu': 24,
    'moguria-v3-enemy': 24,
    'moguria-v3-companion': 8,
    'moguria-v3-boss': 16
  };
  const created = [];
  scene.textures = {
    exists: key => key in frameCounts,
    get: key => ({ getFrameNames: () => Array.from({ length: frameCounts[key] }, (_, index) => index) })
  };
  scene.anims = {
    exists: () => false,
    create(definition) { created.push(definition); }
  };
  scene.registerAnimations();

  const heroAttack = created.find(item => item.key === 'moguria-v3-mogu-default-attack');
  assert.ok(heroAttack);
  assert.equal(heroAttack.frames.length, 8);
  assert.equal(heroAttack.frameRate, 14);
  assert.equal(heroAttack.skipMissedFrames, false);
  assert.equal(created.find(item => item.key === 'moguria-v3-mogu-default-idle').skipMissedFrames, true);

  const enemyAttack = created.find(item => item.key === 'moguria-v3-enemy-ghost-attack');
  const enemyMove = created.find(item => item.key === 'moguria-v3-enemy-ghost-move');
  const enemyHurt = created.find(item => item.key === 'moguria-v3-enemy-ghost-hurt');
  assert.deepEqual(Array.from(enemyMove.frames, item => item.frame), [18]);
  assert.deepEqual(Array.from(enemyAttack.frames, item => item.frame), [18]);
  assert.deepEqual(Array.from(enemyHurt.frames, item => item.frame), [23]);
  const companionAttack = created.find(item => item.key === 'moguria-v3-companion-default-attack');
  assert.deepEqual(Array.from(companionAttack.frames, item => item.frame), [2]);
  assert.equal(companionAttack.frames.some(item => item.frame === 3), false);

  scene.anims = { exists: key => key === 'moguria-v3-mogu-default-attack' };
  const sprite = {
    moguriaState: '',
    playCalls: [],
    play(...args) { this.playCalls.push(args); }
  };
  scene.setActorAnimation(sprite, 'mogu', 'attack');
  sprite.moguriaState = '';
  scene.setActorAnimation(sprite, 'mogu', 'attack');
  assert.deepEqual(sprite.playCalls.map(call => call[1]), [false, false]);

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('low quality keeps the foreground and full animation speed', () => {
  const harness = createHarness({ quality: 'low' });
  harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.makeScene();
  scene.createBackgrounds();
  const animation = { timeScale: 0, pause() {}, resume() {} };
  scene.playerSprite = { anims: animation };
  scene.lastState = { mode: 'run' };

  scene.applyQuality(true);

  assert.equal(harness.imageCalls[3].visible, true);
  assert.equal(harness.imageCalls[3].alpha, harness.imageCalls[3].baseAlpha * 0.5);
  assert.equal(animation.timeScale, 1);

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('hero attack state requires the explicit emitted-shot timer', () => {
  const harness = createHarness();
  harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.makeScene();
  scene.stateTime = 2;
  const track = { vx: 0, vy: 0, attackUntil: 10 };

  assert.equal(scene.inferredState('mogu', { hp: 100, attackCd: 0.62, attackRate: 0.65, attackAnimTimer: 0 }, track), 'idle');
  assert.equal(scene.inferredState('mogu', { hp: 100, attackAnimTimer: 0.2 }, track), 'attack');
  assert.equal(scene.inferredState('enemy', { hp: 10, visualState: 'move', behavior: 'charge', chargeCd: 0.2 }, track), 'attack');
  assert.equal(scene.inferredState('enemy', { hp: 10, visualState: 'move', behavior: 'chase', attackVisualTimer: 0.2 }, track), 'attack');
  scene.stateTime = 5;
  track.attackUntil = 6;
  assert.equal(scene.inferredState('enemy', { hp: 10, visualState: 'move', behavior: 'ranged' }, track), 'attack');

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('a short boss execute state remains latched long enough to finish its release', () => {
  const harness = createHarness();
  harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.makeScene();
  scene.stateTime = 3;

  const entity = { id:'boss-1', x:0, y:0, hp:100, visualState:'telegraph', attackVisualTimer:0 };
  let track = scene.sampleMotion('enemy:boss-1', entity);
  assert.equal(scene.inferredState('boss', entity, track), 'telegraph');

  scene.stateTime = 3.02;
  entity.visualState = 'attack';
  track = scene.sampleMotion('enemy:boss-1', entity);
  assert.equal(scene.inferredState('boss', entity, track), 'attack');
  const latchedUntil = track.semanticAttackUntil;
  assert.ok(latchedUntil >= 3.63);

  scene.stateTime = 3.28;
  entity.visualState = 'recover';
  track = scene.sampleMotion('enemy:boss-1', entity);
  assert.equal(scene.inferredState('boss', entity, track), 'attack');

  scene.stateTime = latchedUntil + 0.01;
  track = scene.sampleMotion('enemy:boss-1', entity);
  assert.equal(scene.inferredState('boss', entity, track), 'recover');

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('a short core hit flash remains visible for the full enemy hurt sequence', () => {
  const harness = createHarness();
  harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.makeScene();
  const entity = { x:0, y:0, hp:10, hitFlash:0, visualState:'move' };
  scene.stateTime = 1;
  let track = scene.sampleMotion('enemy:hit', entity);
  assert.equal(scene.inferredState('enemy', entity, track), 'move');

  scene.stateTime = 1.02;
  entity.hitFlash = .08;
  track = scene.sampleMotion('enemy:hit', entity);
  assert.equal(scene.inferredState('enemy', entity, track), 'hurt');

  scene.stateTime = 1.12;
  entity.hitFlash = 0;
  entity.visualState = 'move';
  track = scene.sampleMotion('enemy:hit', entity);
  assert.equal(scene.inferredState('enemy', entity, track), 'hurt');

  scene.stateTime = 1.53;
  track = scene.sampleMotion('enemy:hit', entity);
  assert.equal(scene.inferredState('enemy', entity, track), 'hurt');

  scene.stateTime = 1.55;
  track = scene.sampleMotion('enemy:hit', entity);
  assert.equal(scene.inferredState('enemy', entity, track), 'move');

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('a short enemy attack timer remains latched through its full release sequence', () => {
  const harness = createHarness();
  harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.makeScene();
  const entity = { x:0, y:0, hp:10, attackVisualTimer:0, visualState:'move' };
  scene.stateTime = 1;
  let track = scene.sampleMotion('enemy:attack', entity);
  assert.equal(scene.inferredState('enemy', entity, track), 'move');

  scene.stateTime = 1.02;
  entity.attackVisualTimer = .3;
  track = scene.sampleMotion('enemy:attack', entity);
  assert.equal(scene.inferredState('enemy', entity, track), 'attack');
  const latchedUntil = track.semanticAttackUntil;
  assert.ok(latchedUntil >= 1.43);

  scene.stateTime = 1.34;
  entity.attackVisualTimer = 0;
  track = scene.sampleMotion('enemy:attack', entity);
  assert.equal(scene.inferredState('enemy', entity, track), 'attack');

  scene.stateTime = latchedUntil + .01;
  track = scene.sampleMotion('enemy:attack', entity);
  assert.equal(scene.inferredState('enemy', entity, track), 'move');

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('battle actors use the compact presentation scale without changing boss hierarchy', () => {
  const harness = createHarness();
  harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.makeScene();

  assert.equal(scene.enemyDisplaySize({ kind:'normal', r:10 }), 54);
  assert.equal(scene.enemyDisplaySize({ kind:'normal', r:16 }), 56);
  assert.equal(scene.enemyDisplaySize({ kind:'normal', r:21 }), 73.5);
  assert.equal(scene.enemyDisplaySize({ kind:'midBoss', r:28 }), 184);
  assert.equal(scene.enemyDisplaySize({ kind:'boss', r:36 }), 185.4);

  const sprite = {
    moguriaState: '',
    setPosition() { return this; },
    setFlipX() { return this; },
    setDisplaySize(width, height) { this.displayWidth = width; this.displayHeight = height; return this; },
    setDepth() { return this; },
    setAlpha() { return this; }
  };
  scene.playerSprite = sprite;
  scene.sampleMotion = () => ({ facing:1, attackSerial:0 });
  scene.inferredState = () => 'idle';
  scene.applyPlayerRig = () => false;
  scene.setActorAnimation = () => {};
  scene.applyProceduralActorMotion = () => {};
  scene.syncPlayer({ mode:'run', levelUpCue:null }, { x:0, y:0, hp:100, invuln:0 });
  assert.equal(sprite.displayWidth, 82);
  assert.equal(sprite.displayHeight, 82);

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('companions use delayed rear formation and presentation-only muzzle offsets', () => {
  const harness = createHarness();
  harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.makeScene();
  scene.stateTime = 1;
  scene.actorTracks.set('player', { facing:1, vx:0, vy:0 });
  const expectedSlots = [
    { x:58, y:224 },
    { x:42, y:184 },
    { x:38, y:252 },
    { x:20, y:212 },
    { x:14, y:160 },
    { x:2, y:248 }
  ];
  for (let index = 0; index < expectedSlots.length; index += 1) {
    const target = scene.companionFormationTarget({ x:100, y:200 }, index, {});
    assert.deepEqual({ x:target.x, y:target.y }, expectedSlots[index]);
  }

  const springTrack = {};
  scene.advanceCompanionSpring(springTrack, { x:0, y:0 });
  scene.visualFrameDelta = 1 / 60;
  scene.advanceCompanionSpring(springTrack, { x:120, y:0 });
  assert.ok(springTrack.renderX > 0 && springTrack.renderX < 120, 'formation must converge without snapping or orbiting');
  assert.equal(springTrack.renderY, 0);

  scene.playerSprite = chainableActor();
  scene.sampleMotion = () => ({ facing:-1, attackSerial:0 });
  scene.inferredState = () => 'idle';
  scene.applyPlayerRig = () => false;
  scene.setActorAnimation = () => {};
  scene.applyProceduralActorMotion = () => {};
  scene.syncPlayer({ mode:'run', levelUpCue:null }, { x:100, y:200, hp:100, invuln:0 });
  const playerOrigin = scene.displayOrigins.get('player');
  assert.deepEqual(
    { attackX:playerOrigin.attackX, attackY:playerOrigin.attackY, facing:playerOrigin.facing },
    { attackX:75, attackY:187, facing:-1 }
  );

  scene.createActorSprite = () => chainableActor();
  scene.sampleMotion = () => ({ facing:-1, attackSerial:0 });
  scene.inferredState = () => 'move';
  scene.applyActorRig = () => false;
  scene.syncEnemies({ enemies:[{ id:'ghost-1', x:140, y:230, hp:10, r:16, behavior:'ranged' }], defeatedEnemies:[] }, { x:100, y:200 });
  const enemyOrigin = scene.displayOrigins.get('enemy:ghost-1');
  assert.deepEqual(
    { attackX:enemyOrigin.attackX, attackY:enemyOrigin.attackY, facing:enemyOrigin.facing },
    { attackX:122, attackY:225, facing:1 }
  );
  assert.equal(scene.enemySprites.get('ghost-1').sprite.flipX, false, 'regular enemy paintings are always front-facing');

  const companionTrack = { facing:1, semanticAttackUntil:0 };
  scene.actorTracks.set('player', { facing:-1, vx:0, vy:0 });
  scene.sampleMotion = () => companionTrack;
  scene.companionFormationTarget = () => ({ x:70, y:80 });
  scene.advanceCompanionSpring = (track, target) => {
    track.renderX = target.x;
    track.renderY = target.y;
  };
  scene.syncCompanions(
    { mode:'run', companions:[{ id:'one', x:0, y:0, attackSerial:1, attackAnimTimer:.2 }] },
    { x:100, y:200, summons:1 }
  );
  const companionOrigin = scene.displayOrigins.get('companion:one');
  assert.deepEqual(
    { attackX:companionOrigin.attackX, attackY:companionOrigin.attackY, facing:companionOrigin.facing },
    { attackX:52, attackY:69, facing:-1 }
  );
  assert.equal(scene.companionSprites.get('one').displayWidth, 50);
  const publicOrigin = harness.context.MoguriaBattleV3.getCompanionOrigins()[0];
  assert.deepEqual(
    { attackX:publicOrigin.attackX, attackY:publicOrigin.attackY, facing:publicOrigin.facing },
    { attackX:52, attackY:69, facing:-1 }
  );

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('enemy art receives distinct deterministic motion by state', () => {
  const harness = createHarness();
  harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.makeScene();
  scene.stateTime = 1.25;
  const sprite = {
    x: 0,
    y: 0,
    scaleX: 0.5,
    scaleY: 0.5,
    setRotation(value) { this.rotation = value; },
    setScale(x, y) { this.scaleX = x; this.scaleY = y; }
  };

  scene.applyProceduralActorMotion(sprite, 'enemy', { y: 18 }, 'move', 'enemy-7');

  assert.notEqual(sprite.y, 18);
  assert.notEqual(sprite.x, 0);
  assert.notEqual(sprite.scaleX, 0.5);
  assert.equal(sprite.rotation, 0, 'normal enemy atlas must not receive an extra procedural tilt');

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('map boundary draws an in-world barrier and outer fog only near an edge', () => {
  const harness = createHarness();
  harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.makeScene();
  scene.boundaryGraphics = recordingGraphics();
  scene.cameras = { main: { width: 430, height: 844 } };
  const state = { mapBounds: { minX: -760, maxX: 760, minY: -760, maxY: 760 } };

  assert.equal(scene.drawMapBoundary(state, { x: 0, y: 0 }), false);
  assert.equal(scene.drawMapBoundary(state, { x: 730, y: 0 }), true);
  assert.ok(scene.boundaryGraphics.calls.some(call => call[0] === 'fillRect'));
  assert.ok(scene.boundaryGraphics.calls.some(call => call[0] === 'strokeRect' && call[1] === -760 && call[2] === -760));

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('collect-all drop and level-up cue receive distinct visual treatment', () => {
  const harness = createHarness();
  harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.makeScene();
  scene.stateTime = 1.4;
  scene.dropGraphics = recordingGraphics();
  scene.effectGraphics = recordingGraphics();
  const label = {
    setText(value) { this.text = value; return this; },
    setPosition(x, y) { this.x = x; this.y = y; return this; },
    setAlpha(value) { this.alpha = value; return this; },
    setScale(value) { this.scale = value; return this; },
    setVisible(value) { this.visible = value; return this; }
  };
  scene.levelUpText = label;
  scene.cameraFx = (type, options) => { scene.lastCueCamera = { type, options }; return true; };

  assert.equal(scene.drawDrop({ kind: 'collectAll', x: 12, y: 30 }), 'collectAll');
  assert.ok(scene.dropGraphics.calls.filter(call => call[0] === 'strokeCircle').length >= 2);
  assert.equal(scene.syncLevelUpCue({ levelUpCue: { remaining: 0.55, duration: 0.75, level: 6 } }, { x: 10, y: 20, lv: 6 }), true);
  assert.equal(label.text, 'LEVEL UP!\nLv.6');
  assert.equal(label.visible, true);
  assert.ok(Math.abs(label.y - (20 - 72 - (1 - .55 / .75) * 10)) < 1e-12);
  assert.equal(scene.lastCueCamera.type, 'zoom');
  assert.ok(scene.effectGraphics.calls.some(call => call[0] === 'strokeCircle'));

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('player status bar follows the compact Mogu presentation', () => {
  const harness = createHarness();
  harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.makeScene();
  scene.statusGraphics = recordingGraphics();

  scene.drawPlayerStatus(
    { dangerPulse:0, awakenTimer:0, returnGlow:0 },
    { x:10, y:20, hp:50, maxHp:100 }
  );

  const background = scene.statusGraphics.calls.find(call => call[0] === 'fillRoundedRect');
  assert.deepEqual(background, ['fillRoundedRect', -22, -28, 64, 7, 3]);

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});
