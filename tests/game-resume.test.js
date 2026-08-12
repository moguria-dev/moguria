'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const readScript = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

function createClassList(hidden = false) {
  const values = new Set(hidden ? ['hidden'] : []);
  return {
    add(...names) { names.forEach(name => values.add(name)); },
    remove(...names) { names.forEach(name => values.delete(name)); },
    contains(name) { return values.has(name); }
  };
}

function createElement(tag = 'div', id = '') {
  let html = '';
  const listeners = new Map();
  const element = {
    id,
    tagName: String(tag).toUpperCase(),
    textContent: '',
    disabled: false,
    dataset: {},
    attributes: {},
    children: [],
    style: { setProperty(name, value) { this[name] = value; } },
    classList: createClassList(id.endsWith('Modal')),
    clientWidth: id === 'stick' ? 132 : 0,
    clientHeight: id === 'stick' ? 132 : 0,
    offsetWidth: id === 'knob' ? 50 : 0,
    offsetHeight: id === 'knob' ? 50 : 0,
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); },
    addEventListener(type, handler) { listeners.set(type, handler); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    querySelector(selector) {
      if (selector !== '.ban-skill') return null;
      if (!this.banButton) this.banButton = createElement('button');
      return this.banButton;
    },
    closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth || 132, height: this.clientHeight || 132 }; },
    setPointerCapture() {},
    click() {
      const event = { preventDefault() {}, stopPropagation() {}, target: this };
      if (typeof this.onclick === 'function') this.onclick(event);
      listeners.get('click')?.(event);
    },
    getContext() { return {}; }
  };
  Object.defineProperty(element, 'innerHTML', {
    get() { return html; },
    set(value) { html = String(value); if (html === '') element.children = []; }
  });
  return element;
}

function createGameHarness(checkpoint = null, options = {}) {
  const ids = [
    'gameCanvas', 'game', 'stick', 'knob', 'giveupBtn', 'pauseBtn', 'resumeBtn', 'pauseGiveupBtn',
    'pauseModal', 'pauseSkills', 'pauseSummary', 'artifactModal', 'artifactChoices', 'artifactTitle',
    'levelModal', 'skillChoices', 'rerollBtn', 'rerollCount', 'lv', 'hp', 'exp', 'nextExp',
    'timer', 'wave', 'miniStats'
  ];
  const elements = Object.fromEntries(ids.map(id => [id, createElement(id === 'gameCanvas' ? 'canvas' : 'div', id)]));
  elements.game.classList.add('active');
  let savedCheckpoint = null;
  const lifecycle = {};
  let clock = 1000;
  const testMath = Object.create(Math);
  testMath.random = typeof options.random === 'function' ? options.random : Math.random;
  const context = {
    console: { log() {}, warn() {}, error() {} },
    Date,
    Math: testMath,
    JSON,
    innerWidth: 390,
    innerHeight: 844,
    performance: { now: () => ++clock },
    setTimeout: () => 1,
    clearTimeout() {},
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    addEventListener(type, handler) { lifecycle[type] = handler; },
    document: {
      visibilityState: 'visible',
      getElementById: id => elements[id] || null,
      createElement: tag => createElement(tag),
      addEventListener(type, handler) { lifecycle[`document:${type}`] = handler; }
    }
  };
  context.window = context;
  context.MoguriaAudio = { play() {} };
  context.MoguriaPerformance = {
    start() {}, stop() {}, recordFrame() {}, getQuality: () => 'high', shouldReduceEffects: () => false
  };
  context.MoguriaBattleV3 = { stop() {}, start: () => Promise.resolve(), sync() {} };
  context.MoguriaDungeon = { create: seed => ({ seed, rooms: [] }), colorForTime: () => ({ ground: '#000' }) };
  context.MoguriaEnemies = {
    spawn: (_wave, _width, _height, _player, options = {}) => ({
      id: 1,
      x: 400,
      y: 400,
      r: options.boss ? 38 : options.midBoss ? 31 : 10,
      hp: options.boss ? 900 : options.midBoss ? 420 : 10,
      maxHp: options.boss ? 900 : options.midBoss ? 420 : 10,
      kind: options.boss ? 'boss' : options.midBoss ? 'midBoss' : options.rare ? 'rare' : 'normal',
      speed: 40,
      dmg: 12,
      attackCd: 0,
      bossCooldown: 1.2,
      exp: 10,
      behavior: 'chase'
    })
  };
  context.MoguriaKVVisualRefresh = { decorateAll() {} };
  context.MoguriaUI = { show() {}, showResult() {} };
  context.MoguriaSave = {
    updateCheckpoint(runId, payload) {
      assert.equal(runId, 'run-resume-test');
      savedCheckpoint = clone(payload.checkpoint);
      return { ok: true };
    }
  };

  vm.createContext(context);
  for (const script of ['js/config.js', 'js/skills.js', 'js/player.js', 'js/game.js']) {
    vm.runInContext(readScript(script), context, { filename: script });
  }
  context.MoguriaGame.init();
  context.MoguriaGame.start({
    runId: 'run-resume-test',
    activeRun: checkpoint ? { runId: 'run-resume-test', startedAt: 100, checkpoint: clone(checkpoint) } : null,
    resume: Boolean(checkpoint)
  });

  return {
    context,
    elements,
    lifecycle,
    game: context.MoguriaGame,
    get state() { return context.MoguriaGame.getState(); },
    get savedCheckpoint() { return savedCheckpoint; }
  };
}

function openLevelChoice(harness) {
  beginLevelUp(harness);
  for (let i = 0; i < 30 && harness.state.mode === 'levelup'; i++) harness.game.devStep(.033);
  assert.equal(harness.state.mode, 'choice');
}

function beginLevelUp(harness) {
  const state = harness.state;
  state.introTimer = 0;
  state.wave = 2;
  state.floor = 2;
  state.waveState = 'spawning';
  state.waveTarget = 999;
  state.waveSpawned = 0;
  state.spawnCd = 999;
  state.p.exp = state.p.nextExp;
  harness.game.devStep(.016);
  assert.equal(state.mode, 'levelup');
}

function prepareDropCombat(harness) {
  const state = harness.state;
  state.introTimer = 0;
  state.wave = 2;
  state.floor = 2;
  state.waveState = 'spawning';
  state.waveTarget = 999;
  state.waveSpawned = 0;
  state.spawnCd = 999;
  state.hitStop = 0;
  state.p.attackCd = 999;
  state.p.x = 0;
  state.p.y = 0;
  return state;
}

function defeatEnemy(harness, kind = 'normal', id = 100) {
  const state = prepareDropCombat(harness);
  const enemy = {
    id,
    name: kind === 'rare' ? '金のぷに' : kind === 'boss' ? 'もりの大ボス' : kind === 'midBoss' ? 'ねむり番長' : 'ぷに虫',
    x: 220,
    y: 0,
    r: kind === 'boss' ? 36 : kind === 'midBoss' ? 28 : 13,
    hp: 1,
    maxHp: 1,
    speed: 0,
    dmg: 0,
    exp: 4,
    behavior: 'chase',
    kind,
    attackCd: 999,
    poison: 0,
    poisonTick: 0,
    slow: 0,
    hitFlash: 0
  };
  state.enemies.push(enemy);
  state.bullets.push({
    x: enemy.x,
    y: enemy.y,
    vx: 0,
    vy: 0,
    r: 6,
    dmg: 999,
    life: 1,
    summon: false,
    pierce: 0,
    split: false,
    splitDepth: 0,
    hitIds: []
  });
  harness.game.devStep(.016);
  assert.ok(enemy.hp <= 0);
  return state;
}

function openArtifactChoice(harness) {
  const state = harness.state;
  state.introTimer = 0;
  state.wave = 3;
  state.floor = 3;
  state.waveState = 'spawning';
  state.waveTarget = 1;
  state.waveSpawned = 1;
  state.waveClearTimer = .8;
  state.spawnCd = 999;
  state.enemies = [];
  harness.game.devStep(.016);
  assert.equal(state.mode, 'artifact');
}

test('level-up pauses combat for its cue and then opens the preselected cards', () => {
  const harness = createGameHarness();
  beginLevelUp(harness);
  const state = harness.state;
  const frozenTime = state.time;
  const frozenSpawnCd = state.spawnCd;
  const choiceIds = Array.from(state.pendingChoice.choiceIds);

  assert.equal(state.levelUpCue.duration, .75);
  assert.equal(state.levelUpCue.remaining, .75);
  assert.equal(choiceIds.length, 3);
  assert.equal(harness.elements.levelModal.classList.contains('hidden'), true);
  assert.deepEqual(Array.from(harness.savedCheckpoint.pendingChoice.choiceIds), choiceIds);
  assert.equal(harness.savedCheckpoint.choiceType, 'skill');
  assert.equal(harness.savedCheckpoint.player.numbers.lv, state.p.lv);
  assert.equal(harness.savedCheckpoint.levelUpCue, undefined);

  for (let i = 0; i < 22; i++) harness.game.devStep(.033);
  assert.equal(state.mode, 'levelup');
  assert.equal(state.time, frozenTime);
  assert.equal(state.spawnCd, frozenSpawnCd);
  assert.equal(harness.elements.levelModal.classList.contains('hidden'), true);

  harness.game.devStep(.033);
  assert.equal(state.mode, 'choice');
  assert.equal(state.levelUpCue, null);
  assert.equal(state.time, frozenTime);
  assert.deepEqual(harness.elements.skillChoices.children.map(card => card.dataset.skillId), choiceIds);
  assert.equal(harness.elements.levelModal.classList.contains('hidden'), false);
});

test('reload during the level-up cue skips replay without incrementing twice or changing cards', () => {
  const firstPage = createGameHarness();
  beginLevelUp(firstPage);
  const level = firstPage.state.p.lv;
  const exp = firstPage.state.p.exp;
  const nextExp = firstPage.state.p.nextExp;
  const choiceIds = Array.from(firstPage.state.pendingChoice.choiceIds);
  const checkpoint = clone(firstPage.savedCheckpoint);

  const secondPage = createGameHarness(checkpoint);
  assert.equal(secondPage.state.mode, 'choice');
  assert.equal(secondPage.state.levelUpCue, null);
  assert.equal(secondPage.state.p.lv, level);
  assert.equal(secondPage.state.p.exp, exp);
  assert.equal(secondPage.state.p.nextExp, nextExp);
  assert.deepEqual(Array.from(secondPage.state.pendingChoice.choiceIds), choiceIds);
  assert.deepEqual(secondPage.elements.skillChoices.children.map(card => card.dataset.skillId), choiceIds);

  secondPage.elements.skillChoices.children[0].click();
  assert.equal(secondPage.state.mode, 'run');
  assert.equal(secondPage.state.p.lv, level);
  assert.equal(Object.values(secondPage.state.p.skillLevels).reduce((sum, value) => sum + value, 0), 1);
});

test('stacked EXP is retained and starts the next level only after the first choice', () => {
  const harness = createGameHarness();
  const state = prepareDropCombat(harness);
  const firstCost = state.p.nextExp;
  state.p.exp = firstCost + 100;

  harness.game.devStep(.016);
  assert.equal(state.mode, 'levelup');
  assert.equal(state.p.lv, 2);
  assert.equal(state.p.exp, 100);
  const secondCost = state.p.nextExp;
  assert.ok(secondCost < 100);

  for (let i = 0; i < 30 && state.mode === 'levelup'; i++) harness.game.devStep(.033);
  harness.elements.skillChoices.children[0].click();
  assert.equal(state.mode, 'run');
  assert.equal(state.p.lv, 2);

  harness.game.devStep(.016);
  assert.equal(state.mode, 'levelup');
  assert.equal(state.p.lv, 3);
  assert.equal(state.p.exp, 100 - secondCost);
});

test('collect-all pickup force-magnets every current EXP and heal drop without corrupting EXP', () => {
  const harness = createGameHarness();
  const state = prepareDropCombat(harness);
  state.p.hp = 50;
  state.p.maxHp = 100;
  state.p.exp = 0;
  state.p.nextExp = 10000;
  state.p.xpBonus = .25;
  state.drops = [
    { x: 0, y: 0, kind: 'collectAll', rare: true },
    { x: 500, y: 0, kind: 'exp', exp: 10 },
    { x: -450, y: 0, kind: 'heal', heal: 20 },
    { x: 0, y: 0, kind: 'unknown' }
  ];

  harness.game.devStep(.016);
  const expDrop = state.drops.find(drop => drop.kind === 'exp');
  const healDrop = state.drops.find(drop => drop.kind === 'heal');
  assert.equal(state.drops.some(drop => drop.kind === 'collectAll'), false);
  assert.equal(state.drops.some(drop => drop.kind === 'unknown'), false);
  assert.equal(expDrop.forceMagnet, true);
  assert.equal(healDrop.forceMagnet, true);
  assert.ok(expDrop.x < 500);
  assert.ok(healDrop.x > -450);
  assert.equal(Number.isFinite(state.p.exp), true);

  for (let i = 0; i < 20 && state.drops.length; i++) harness.game.devStep(.033);
  assert.equal(state.drops.length, 0);
  assert.equal(state.p.exp, 12.5);
  assert.equal(state.p.hp, 70);
  assert.equal(Number.isFinite(state.p.exp), true);
});

test('collect-all uses the specified per-kind rare chances', () => {
  const cases = [
    { kind: 'normal', random: .001, expected: true },
    { kind: 'normal', random: .002, expected: false },
    { kind: 'rare', random: .002, expected: true },
    { kind: 'rare', random: .015, expected: false },
    { kind: 'midBoss', random: .015, expected: true },
    { kind: 'boss', random: .015, expected: true },
    { kind: 'boss', random: .031, expected: false }
  ];

  for (const entry of cases) {
    const harness = createGameHarness(null, { random: () => entry.random });
    const state = defeatEnemy(harness, entry.kind);
    assert.equal(
      state.drops.some(drop => drop.kind === 'collectAll'),
      entry.expected,
      `${entry.kind} at random=${entry.random}`
    );
  }
});

test('only one uncollected collect-all item can exist at a time', () => {
  const harness = createGameHarness(null, { random: () => 0 });
  const state = defeatEnemy(harness, 'normal', 101);
  assert.equal(state.drops.filter(drop => drop.kind === 'collectAll').length, 1);

  defeatEnemy(harness, 'normal', 102);
  assert.equal(state.drops.filter(drop => drop.kind === 'collectAll' && !drop.dead).length, 1);
});

test('a real player shot exposes a short transient attack animation timer', () => {
  const harness = createGameHarness();
  const state = prepareDropCombat(harness);
  state.p.attackCd = 0;
  state.enemies.push({
    id: 77, name: 'ぷに虫', x: 180, y: 0, r: 13, hp: 100, maxHp: 100,
    speed: 0, dmg: 0, exp: 4, behavior: 'chase', kind: 'normal', attackCd: 999,
    poison: 0, poisonTick: 0, slow: 0, hitFlash: 0
  });

  harness.game.devStep(.016);
  assert.equal(state.bullets.length, 1);
  assert.equal(state.p.attackAnimTimer, .38);

  harness.game.devStep(.033);
  assert.ok(state.p.attackAnimTimer < .38);
  assert.ok(state.p.attackAnimTimer > 0);
});

test('defeat animation plays before result settlement', () => {
  const harness = createGameHarness();
  const state = prepareDropCombat(harness);
  let resultCalls = 0;
  let stopCalls = 0;
  harness.context.MoguriaMeta = { awardFromRun: () => ({ ok: true, amount: 0 }) };
  harness.context.MoguriaResult = { buildName: () => 'test run', comment: () => 'test', titles: () => [] };
  harness.context.MoguriaUI.showResult = () => { resultCalls++; };
  harness.context.MoguriaBattleV3.stop = () => { stopCalls++; };
  state.p.hp = 0;

  harness.game.devStep(.016);
  assert.equal(state.mode, 'defeat');
  assert.ok(state.defeatCue.remaining > .5);
  assert.equal(resultCalls, 0);

  for (let i = 0; i < 20 && state.mode === 'defeat'; i++) harness.game.devStep(.033);
  assert.equal(state.mode, 'ended');
  assert.equal(resultCalls, 1);
  assert.equal(stopCalls, 1);
});

test('reload during defeat cue restores death instead of undoing it', () => {
  const firstPage = createGameHarness();
  const firstState = prepareDropCombat(firstPage);
  firstState.p.hp = 0;
  firstPage.game.devStep(.016);
  assert.equal(firstState.mode, 'defeat');
  assert.equal(firstPage.game.persistCheckpoint('pagehide').ok, true);
  assert.equal(firstPage.savedCheckpoint.defeated, true);

  const secondPage = createGameHarness(firstPage.savedCheckpoint);
  assert.equal(secondPage.state.mode, 'defeat');
  assert.equal(secondPage.state.p.hp, 0);
  assert.ok(secondPage.state.defeatCue.remaining > .5);
});

test('a real contact hit exposes an enemy attack animation timer', () => {
  const harness = createGameHarness(null, { random: () => .9 });
  const state = prepareDropCombat(harness);
  state.p.hp = state.p.maxHp;
  state.enemies.push({
    id: 88, name: 'ぷに虫', x: 0, y: 0, r: 13, hp: 100, maxHp: 100,
    speed: 0, dmg: 1, exp: 4, behavior: 'chase', kind: 'normal', attackCd: 999,
    poison: 0, poisonTick: 0, slow: 0, hitFlash: 0
  });

  harness.game.devStep(.016);
  assert.equal(state.enemies[0].attackVisualTimer, .3);
  assert.ok(state.p.hp < state.p.maxHp);
});

test('pending skill choice preserves its cards and Lv/EXP state across reload', () => {
  const firstPage = createGameHarness();
  openLevelChoice(firstPage);
  const before = firstPage.state;
  const beforeCards = Array.from(before.pendingChoice.choiceIds);
  const beforeLevel = before.p.lv;
  const beforeExp = before.p.exp;
  const beforeNextExp = before.p.nextExp;
  before.rerolls = 0;

  assert.equal(firstPage.game.persistCheckpoint('pagehide').ok, true);
  assert.equal(firstPage.savedCheckpoint.choiceType, 'skill');
  assert.equal(firstPage.savedCheckpoint.pendingChoice.wave, 2);

  const secondPage = createGameHarness(firstPage.savedCheckpoint);
  assert.equal(secondPage.state.mode, 'choice');
  assert.equal(secondPage.state.p.lv, beforeLevel);
  assert.equal(secondPage.state.p.exp, beforeExp);
  assert.equal(secondPage.state.p.nextExp, beforeNextExp);
  assert.equal(secondPage.state.rerolls, 0);
  assert.deepEqual(Array.from(secondPage.state.pendingChoice.choiceIds), beforeCards);
  assert.deepEqual(secondPage.elements.skillChoices.children.map(card => card.dataset.skillId), beforeCards);
  assert.equal(secondPage.elements.levelModal.classList.contains('hidden'), false);

  secondPage.elements.skillChoices.children[0].click();
  assert.equal(secondPage.state.mode, 'run');
  assert.equal(secondPage.state.pendingChoice, null);
  assert.equal(secondPage.savedCheckpoint.choiceType, null);
  assert.equal(secondPage.savedCheckpoint.wave, 2);
});

test('pending artifact choice is restored before its wave is marked complete', () => {
  const firstPage = createGameHarness();
  openArtifactChoice(firstPage);
  const beforeCards = Array.from(firstPage.state.pendingChoice.choiceIds);

  assert.equal(firstPage.state.artifactWaves[3], undefined);
  assert.equal(firstPage.game.persistCheckpoint('visibility').ok, true);
  assert.equal(firstPage.savedCheckpoint.choiceType, 'artifact');
  assert.equal(firstPage.savedCheckpoint.artifactWaves[3], undefined);

  const secondPage = createGameHarness(firstPage.savedCheckpoint);
  assert.equal(secondPage.state.mode, 'artifact');
  assert.equal(secondPage.state.wave, 3);
  assert.equal(secondPage.state.artifactWaves[3], undefined);
  assert.deepEqual(Array.from(secondPage.state.pendingChoice.choiceIds), beforeCards);
  assert.deepEqual(secondPage.elements.artifactChoices.children.map(card => card.dataset.artifactId), beforeCards);
  assert.equal(secondPage.elements.artifactModal.classList.contains('hidden'), false);

  secondPage.elements.artifactChoices.children[0].click();
  assert.equal(secondPage.state.mode, 'run');
  assert.equal(secondPage.state.wave, 4);
  assert.equal(secondPage.state.artifactWaves[3], true);
  assert.equal(secondPage.state.pendingChoice, null);
});

test('repeated pagehide during the restored wave entrance cannot move progress backwards', () => {
  const firstPage = createGameHarness();
  firstPage.state.introTimer = 0;
  firstPage.state.wave = 5;
  firstPage.state.floor = 5;
  assert.equal(firstPage.game.persistCheckpoint('pagehide').ok, true);
  assert.equal(firstPage.savedCheckpoint.wave, 5);

  const secondPage = createGameHarness(firstPage.savedCheckpoint);
  assert.equal(secondPage.state.wave, 4);
  assert.ok(secondPage.state.introTimer > 0);
  assert.equal(secondPage.game.persistCheckpoint('pagehide').ok, true);
  assert.equal(secondPage.savedCheckpoint.wave, 5);

  const thirdPage = createGameHarness(secondPage.savedCheckpoint);
  assert.equal(thirdPage.state.wave, 4);
  assert.equal(thirdPage.state.floor, 5);
});

test('dash telegraph follows its live target and becomes stronger toward execution', () => {
  const harness = createGameHarness();
  const state = harness.state;
  state.introTimer = 0;
  harness.game.devGoWave(12);
  state.bossAlertTimer = 0.001;
  harness.game.devStep(.016);
  const boss = state.enemies.find(enemy => enemy.kind === 'boss');
  assert.ok(boss);
  state.bossAlertTimer = 0;
  boss.bossAction = null;
  boss.bossCooldown = 0.001;
  boss.patternCursor = 2;

  harness.game.devStep(.016);
  const action = boss.bossAction;
  const telegraph = state.fx.find(fx => fx.id === action.telegraphFxId);
  assert.equal(action.id, 'dash');
  assert.equal(telegraph.pattern, 'dash');
  assert.ok(telegraph.maxLife > 0);

  state.p.x += 86;
  state.p.y -= 42;
  harness.game.devStep(.016);
  assert.equal(telegraph.tx, state.p.x);
  assert.equal(telegraph.ty, state.p.y);
});

test('pre-pendingChoice checkpoints infer interrupted skill and artifact selections', () => {
  const interruptedSkill = createGameHarness();
  openLevelChoice(interruptedSkill);
  interruptedSkill.game.persistCheckpoint('pagehide');
  const legacySkill = clone(interruptedSkill.savedCheckpoint);
  delete legacySkill.choiceType;
  delete legacySkill.pendingChoice;
  const skillResume = createGameHarness(legacySkill);
  assert.equal(skillResume.state.mode, 'choice');
  assert.equal(skillResume.state.pendingChoice.type, 'skill');

  const interruptedArtifact = createGameHarness();
  openArtifactChoice(interruptedArtifact);
  interruptedArtifact.game.persistCheckpoint('pagehide');
  const legacyArtifact = clone(interruptedArtifact.savedCheckpoint);
  delete legacyArtifact.choiceType;
  delete legacyArtifact.pendingChoice;
  legacyArtifact.artifactWaves[3] = true;
  const artifactResume = createGameHarness(legacyArtifact);
  assert.equal(artifactResume.state.mode, 'artifact');
  assert.equal(artifactResume.state.pendingChoice.type, 'artifact');
  assert.equal(artifactResume.state.artifactWaves[3], undefined);
});
