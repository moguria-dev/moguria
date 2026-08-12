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

function recordingGraphics() {
  const calls = [];
  const graphics = { calls };
  for (const method of [
    'clear', 'fillStyle', 'fillCircle', 'fillRect', 'lineStyle', 'strokeCircle',
    'strokeRect', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'fillPath'
  ]) {
    graphics[method] = (...args) => { calls.push([method, ...args]); return graphics; };
  }
  return graphics;
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
  assert.ok(harness.imageCalls.every(layer => layer.displayWidth === 542));
  assert.ok(harness.imageCalls.every(layer => layer.displayHeight === layer.displayWidth * 2));
  scene.stateTime = 0;
  scene.syncBackgrounds({ x: 0, y: 0 });
  const centered = harness.imageCalls.map(layer => ({ x: layer.x, y: layer.y }));
  scene.stateTime = 1.5;
  scene.syncBackgrounds({ x: 740, y: -740 });
  const moved = harness.imageCalls.map(layer => ({ x: layer.x, y: layer.y }));
  assert.ok(moved.every((position, index) => position.x !== centered[index].x || position.y !== centered[index].y));
  assert.ok(Math.abs(moved[3].x - centered[3].x) > Math.abs(moved[0].x - centered[0].x));
  assert.ok(moved.every(position => Math.abs(position.x - 215) <= 52.01));
  assert.ok(moved.every(position => Math.abs(position.y - 422) <= 116.01));
  assert.deepEqual(Array.from(scene.layouts.mogu.idle.frames), [0, 1, 2, 3]);
  assert.deepEqual(Array.from(scene.layouts.mogu.move.frames), [4, 5, 6, 7]);
  assert.deepEqual(Array.from(scene.layouts.mogu.attack.frames), [8, 9, 10, 11]);
  assert.equal(scene.assets.sheets.mogu.src, 'assets/images/battle-v3/mogu-atlas-hd.png');
  assert.equal(scene.assets.sheets.mogu.frameWidth, 320);

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});

test('hero atlas is an RGBA sheet with aligned 320px cells', () => {
  const atlasPath = path.join(ROOT, 'assets/images/battle-v3/mogu-atlas-hd.png');
  const bytes = fs.readFileSync(atlasPath);
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
  assert.equal(bytes.readUInt32BE(16), 1280);
  assert.equal(bytes.readUInt32BE(20), 1280);
  assert.equal(bytes[25], 6, 'PNG color type must be truecolor with alpha');

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/images/battle-v3/atlas.json'), 'utf8'));
  assert.equal(manifest.atlases.mogu.image, 'mogu-atlas-hd.png');
  assert.deepEqual(manifest.atlases.mogu.cell, { width: 320, height: 320 });
  assert.deepEqual(manifest.atlases.mogu.states.attack, [8, 9, 10, 11]);
});

test('enemy and boss actions compose semantic multi-frame animation', () => {
  const harness = createHarness();
  harness.context.MoguriaBattleV3.boot({ parent: harness.parent });
  const scene = harness.makeScene();

  assert.deepEqual(Array.from(scene.variantLayouts.enemy.soft.attack.frames), [1, 2, 0]);
  assert.deepEqual(Array.from(scene.variantLayouts.enemy.ghost.hurt.frames), [15, 12]);
  assert.deepEqual(Array.from(scene.variantLayouts.boss.midBoss.telegraph.frames), [0, 1]);
  assert.deepEqual(Array.from(scene.variantLayouts.boss.midBoss.attack.frames), [1, 2, 3]);
  assert.deepEqual(Array.from(scene.variantLayouts.boss.boss.attack.frames), [5, 6, 7]);
  assert.equal(scene.actorVariant('boss', { kind: 'midBoss', phase2: true }), 'midBoss');
  assert.equal(scene.actorVariant('boss', { kind: 'boss', phase2: false }), 'boss');

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
  assert.ok(Number.isFinite(sprite.rotation));

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
  assert.equal(scene.lastCueCamera.type, 'zoom');
  assert.ok(scene.effectGraphics.calls.some(call => call[0] === 'strokeCircle'));

  harness.context.MoguriaBattleV3.stop({ destroy: true, restoreLegacy: true });
});
