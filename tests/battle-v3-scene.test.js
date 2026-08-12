'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'js/battle-v3-scene.js'), 'utf8');

function chainableLayer(key) {
  return {
    key,
    alpha: 1,
    displayWidth: 0,
    displayHeight: 0,
    setOrigin() { return this; },
    setScrollFactor(value) { this.scrollFactor = value; return this; },
    setDepth(value) { this.depth = value; return this; },
    setAlpha(value) { this.alpha = value; return this; },
    setDisplaySize(width, height) { this.displayWidth = width; this.displayHeight = height; return this; },
    setPosition(x, y) { this.x = x; this.y = y; return this; }
  };
}

function createHarness(options = {}) {
  let gameConfig = null;
  const imageCalls = [];
  const bodyClasses = new Set();
  const viewportWidth = options.viewportWidth ?? 1440;
  const viewportHeight = options.viewportHeight ?? 900;
  const appWidth = options.appWidth ?? 430;
  const appHeight = options.appHeight ?? 844;
  const parentWidth = options.parentWidth ?? 0;
  const parentHeight = options.parentHeight ?? 0;
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
    addEventListener() {},
    removeEventListener() {},
    MoguriaPerformance: { getQuality: () => 'high' },
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
          remove() { this.isConnected = false; }
        };
      }
    }
  };

  class Scene {
    constructor(config) { this.sceneConfig = config; }
  }
  class Game {
    constructor(config) {
      gameConfig = config;
      this.config = config;
      this.scale = { resize() {} };
      this.loop = { sleep() {}, wake() {} };
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
    get gameConfig() { return gameConfig; },
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
    }
  };
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

test('backgrounds use one oversized non-repeating image per visible depth layer', () => {
  const harness = createHarness();
  harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.makeScene();

  scene.createBackgrounds();

  assert.equal(harness.imageCalls.length, 4);
  assert.deepEqual(harness.imageCalls.map(layer => layer.alpha), [1, 0.34, 0.48, 0.54]);
  assert.ok(harness.imageCalls.every(layer => layer.displayWidth === 510));
  assert.ok(harness.imageCalls.every(layer => layer.displayHeight === layer.displayWidth * 2));
  scene.syncBackgrounds({ x: 0, y: 0 });
  assert.deepEqual(harness.imageCalls.map(layer => layer.x), [215, 215, 215, 215]);
  assert.deepEqual(Array.from(scene.layouts.mogu.idle.frames), [1, 2]);
  assert.deepEqual(Array.from(scene.layouts.mogu.move.frames), [5, 6]);

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('single-frame enemy art still receives deterministic state motion', () => {
  const harness = createHarness();
  harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.makeScene();
  scene.stateTime = 1.25;
  const sprite = {
    y: 0,
    scaleX: 0.5,
    scaleY: 0.5,
    setRotation(value) { this.rotation = value; },
    setScale(x, y) { this.scaleX = x; this.scaleY = y; }
  };

  scene.applyProceduralActorMotion(sprite, 'enemy', { y: 18 }, 'move', 'enemy-7');

  assert.notEqual(sprite.y, 18);
  assert.notEqual(sprite.scaleX, 0.5);
  assert.ok(Number.isFinite(sprite.rotation));

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});
