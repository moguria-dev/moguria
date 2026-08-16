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
    inert: false,
    classList: createClassList(id.endsWith('Modal') || id === 'settlementError'),
    clientWidth: id === 'stick' ? 132 : 0,
    clientHeight: id === 'stick' ? 132 : 0,
    offsetWidth: id === 'knob' ? 50 : 0,
    offsetHeight: id === 'knob' ? 50 : 0,
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); },
    addEventListener(type, handler) { listeners.set(type, handler); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; },
    querySelector(selector) {
      if (selector !== '.ban-skill') return null;
      if (!this.banButton) this.banButton = createElement('button');
      return this.banButton;
    },
    closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth || 132, height: this.clientHeight || 132 }; },
    setPointerCapture() {},
    focus() {},
    click() {
      const event = { preventDefault() {}, stopPropagation() {}, target: this };
      const result = typeof this.onclick === 'function' ? this.onclick(event) : undefined;
      const listenerResult = listeners.get('click')?.(event);
      return result ?? listenerResult;
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
    'pauseModal', 'pauseSkills', 'pauseSummary', 'pauseWaveValue', 'pauseLevelValue', 'pauseHpValue',
    'pauseSkillGrid', 'pauseArtifactGrid', 'pausePowerDetail', 'pauseSkillTab', 'pauseArtifactTab',
    'app', 'startBtn', 'homeNotice', 'settlementError', 'settlementErrorTitle', 'settlementErrorMessage',
    'settlementWaveValue', 'settlementLevelValue', 'settlementHpValue', 'settlementRetryBtn', 'settlementHomeBtn',
    'artifactModal', 'artifactChoices', 'artifactTitle', 'artifactOwnedSkills', 'artifactOwnedDetail', 'artifactRerollBtn', 'artifactRerollCount',
    'levelModal', 'skillChoices', 'levelOwnedSkills', 'levelOwnedDetail', 'rerollBtn', 'rerollCount', 'lv', 'hp', 'exp', 'nextExp',
    'timer', 'wave', 'miniStats'
  ];
  const elements = Object.fromEntries(ids.map(id => [id, createElement(id === 'gameCanvas' ? 'canvas' : 'div', id)]));
  elements.game.classList.add('active');
  let savedCheckpoint = null;
  const confirmRequests = [];
  const confirmResolvers = [];
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
    start() {}, stop() {}, recordFrame() {}, getQuality: () => options.quality || 'high', shouldReduceEffects: () => Boolean(options.reduceEffects)
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
  context.MoguriaUI = {
    show(id) { context.lastScreen = id; },
    showResult(run) { context.lastResultRaw = run; context.lastResult = clone(run); },
    confirmAction(settings) {
      confirmRequests.push(clone(settings));
      return new Promise(resolve => confirmResolvers.push(resolve));
    }
  };
  context.MoguriaSave = {
    updateCheckpoint(runId, payload) {
      assert.equal(runId, 'run-resume-test');
      savedCheckpoint = clone(payload.checkpoint);
      return { ok: true, activeRun:{ runId, profileId:options.profileId, startedAt:100, checkpoint:clone(payload.checkpoint) } };
    }
  };

  vm.createContext(context);
  for (const script of ['js/config.js', 'js/skills.js', 'js/player.js', 'js/game.js']) {
    vm.runInContext(readScript(script), context, { filename: script });
  }
  context.MoguriaGame.init();
  context.MoguriaGame.start({
    runId: 'run-resume-test',
    profileId: options.profileId,
    activeRun: checkpoint ? { runId: 'run-resume-test', profileId:options.profileId, startedAt: 100, checkpoint: clone(checkpoint) } : null,
    resume: Boolean(checkpoint)
  });

  return {
    context,
    elements,
    lifecycle,
    confirmRequests,
    resolveConfirm(value) { confirmResolvers.shift()?.(value); },
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

test('normal skill choices expose separate accessible choose and seal buttons', () => {
  const harness = createGameHarness();
  openLevelChoice(harness);
  const entry = harness.elements.skillChoices.children[0];
  const choose = entry.children[0];
  const seal = entry.children[1];

  assert.equal(entry.tagName, 'ARTICLE');
  assert.equal(choose.tagName, 'BUTTON');
  assert.equal(seal.tagName, 'BUTTON');
  assert.match(choose.innerHTML, /skill-card__pick[^>]*>選ぶ/);
  assert.match(choose.attributes['aria-label'], /を選ぶ/);
  assert.match(seal.attributes['aria-label'], /この冒険中は候補に出なくなります/);
  assert.equal(seal.attributes['aria-describedby'], 'skillSealHelp');
});

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

function defeatEnemy(harness, kind = 'normal', id = 100, options = {}) {
  const state = prepareDropCombat(harness);
  if (Number.isFinite(options.wave)) state.wave = options.wave;
  if (Number.isFinite(options.waveTarget)) state.waveTarget = options.waveTarget;
  if (options.schedule) state.collectAllSchedule = clone(options.schedule);
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

function stationaryEnemy(id, x, hp = 1000) {
  return {
    id, name: 'ぷに虫', x, y: 0, r: 13, hp, maxHp: hp,
    speed: 0, dmg: 0, exp: 4, behavior: 'chase', kind: 'normal', attackCd: 999,
    poison: 0, poisonTick: 0, slow: 0, hitFlash: 0
  };
}

test('approved skill VFX metadata follows real poison, spark, thunder, and field activations', () => {
  {
    const harness = createGameHarness(null, { random: () => 0 });
    const state = prepareDropCombat(harness);
    for (let level = 0; level < 3; level++) harness.game.devAddSkill('poison_seed');
    assert.ok(Math.abs(state.p.poisonChance - .42) < 1e-12);
    const enemy = stationaryEnemy(301, 90);
    state.enemies.push(enemy);
    state.bullets.push({ x:enemy.x, y:enemy.y, vx:0, vy:0, r:6, dmg:1, life:1, summon:false, pierce:0, split:false, splitDepth:0, hitIds:[] });
    harness.game.devStep(.016);
    const effect = state.fx.find(fx => fx.type === 'poisonProc');
    assert.equal(enemy.poison > 0, true);
    assert.equal(effect.skillId, 'poison_seed');
    assert.equal(effect.skillLevel, 3);
    assert.equal(effect.targetId, 301);
    assert.equal(effect.maxLife, .64);
    assert.equal(effect.essential, true);
  }

  {
    const harness = createGameHarness(null, { random: () => 0, quality:'low', reduceEffects:true });
    for (let level = 0; level < 5; level++) harness.game.devAddSkill('spark_pop');
    const state = defeatEnemy(harness, 'normal', 302);
    assert.ok(Math.abs(state.p.killExplodeChance - .9) < 1e-12);
    const effect = state.fx.find(fx => fx.type === 'boom');
    assert.equal(effect.skillId, 'spark_pop');
    assert.equal(effect.skillLevel, 5);
    assert.equal(effect.r, 54);
    assert.equal(effect.maxLife, .38);
    assert.equal(effect.essential, true, 'semantic spark must survive reduce-effects random dropping');
  }

  {
    const harness = createGameHarness(null, { random: () => .5 });
    const state = prepareDropCombat(harness);
    for (let level = 0; level < 5; level++) harness.game.devAddSkill('thunder_gum');
    assert.equal(state.p.lightningJumps, 7);
    assert.equal(state.p.lightningRate, 2.6);
    state.p.lightningCd = 0;
    state.enemies.push(...Array.from({ length:7 }, (_, index) => stationaryEnemy(310 + index, 70 + index * 42)));
    harness.game.devStep(.016);
    const effects = state.fx.filter(fx => fx.type === 'lightning');
    assert.equal(effects.length, 7);
    assert.deepEqual(Array.from(effects, fx => fx.chainIndex), [0,1,2,3,4,5,6]);
    assert.ok(effects.every(fx => fx.skillId === 'thunder_gum' && fx.skillLevel === 5 && fx.essential));
  }

  {
    const harness = createGameHarness(null, { random: () => .5 });
    const state = prepareDropCombat(harness);
    for (let level = 0; level < 3; level++) harness.game.devAddSkill('mogu_field');
    assert.equal(state.p.auraDamage, 15);
    assert.equal(state.p.auraRadius, 68);
    state.p.auraTick = 0;
    const enemy = stationaryEnemy(320, 50);
    state.enemies.push(enemy);
    harness.game.devStep(.016);
    const effect = state.fx.find(fx => fx.type === 'auraPulse');
    assert.equal(enemy.hp, 985);
    assert.equal(effect.r, 68);
    assert.equal(effect.skillId, 'mogu_field');
    assert.equal(effect.skillLevel, 3);
    assert.equal(effect.maxLife, .26);
    assert.equal(effect.essential, true);
  }
});

test('skill VFX levels clamp at five and generic effects remain untagged', () => {
  const harness = createGameHarness(null, { random: () => 0 });
  const state = prepareDropCombat(harness);
  state.p.skillLevels.poison_seed = 99;
  state.p.poisonChance = 1;
  const enemy = stationaryEnemy(330, 80);
  state.enemies.push(enemy);
  state.bullets.push({ x:enemy.x, y:enemy.y, vx:0, vy:0, r:6, dmg:1, life:1, summon:false, pierce:0, split:false, splitDepth:0, hitIds:[] });
  harness.game.devStep(.016);
  assert.equal(state.fx.find(fx => fx.type === 'poisonProc').skillLevel, 5);
  assert.equal(state.fx.filter(fx => fx.type !== 'poisonProc').some(fx => fx.skillId), false);
});

test('skill VFX tags appear only after their real proc and never decorate unrelated explosions', () => {
  {
    const harness = createGameHarness(null, { random: () => .99 });
    const state = prepareDropCombat(harness);
    harness.game.devAddSkill('poison_seed');
    const enemy = stationaryEnemy(340, 80);
    state.enemies.push(enemy);
    state.bullets.push({ x:enemy.x, y:enemy.y, vx:0, vy:0, r:6, dmg:1, life:1, summon:false, pierce:0, split:false, splitDepth:0, hitIds:[] });
    harness.game.devStep(.016);
    assert.equal(state.fx.some(fx => fx.type === 'poisonProc'), false);
  }

  {
    const harness = createGameHarness(null, { random: () => 0 });
    const state = prepareDropCombat(harness);
    state.p.dodge = 1;
    state.p.dodgeBomb = true;
    state.enemies.push(stationaryEnemy(341, 0));
    harness.game.devStep(.016);
    const effect = state.fx.find(fx => fx.type === 'boom');
    assert.ok(effect);
    assert.equal(effect.skillId, undefined);
    assert.equal(effect.essential, undefined);
  }
});

test('FX capacity keeps boss danger and essential skill events ahead of disposable decoration', () => {
  const harness = createGameHarness(null, { random: () => 0 });
  const state = prepareDropCombat(harness);
  harness.game.devAddSkill('poison_seed');
  const limit = harness.context.MoguriaConfig.performance.maxFx;
  state.fx = [
    { id:'danger', type:'bossTelegraph', life:1, maxLife:1 },
    ...Array.from({ length:limit - 1 }, (_, index) => ({ id:`decorative-${index}`, type:'waveClear', life:1, maxLife:1 }))
  ];
  const enemy = stationaryEnemy(350, 80);
  state.enemies.push(enemy);
  state.bullets.push({ x:enemy.x, y:enemy.y, vx:0, vy:0, r:6, dmg:1, life:1, summon:false, pierce:0, split:false, splitDepth:0, hitIds:[] });
  harness.game.devStep(.016);
  assert.equal(state.fx.length, limit);
  assert.equal(state.fx.some(fx => fx.id === 'danger'), true);
  assert.equal(state.fx.some(fx => fx.type === 'poisonProc' && fx.essential), true);
  assert.equal(state.fx.some(fx => fx.id === 'decorative-0'), false);

  state.fx = [
    { id:'danger', type:'bossTelegraph', life:1, maxLife:1 },
    ...Array.from({ length:limit - 1 }, (_, index) => ({ id:`essential-${index}`, type:'boom', life:1, maxLife:1, essential:true }))
  ];
  const secondEnemy = stationaryEnemy(351, 100);
  state.enemies.push(secondEnemy);
  state.bullets.push({ x:secondEnemy.x, y:secondEnemy.y, vx:0, vy:0, r:6, dmg:1, life:1, summon:false, pierce:0, split:false, splitDepth:0, hitIds:[] });
  harness.game.devStep(.016);
  assert.equal(state.fx.length, limit);
  assert.equal(state.fx.some(fx => fx.id === 'danger'), true, 'boss danger is the last FX allowed to be evicted');
  assert.equal(state.fx.some(fx => fx.id === 'essential-0'), false);
});

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

test('collect-all schedules use uniform two-to-four-wave gaps and a bounded trigger point', () => {
  const cases = [
    { random: 0, gap: 2, ratio: .35 },
    { random: .5, gap: 3, ratio: .525 },
    { random: .999999, gap: 4, ratio: .70 }
  ];
  const gaps = [];

  for (const entry of cases) {
    const harness = createGameHarness(null, { random: () => entry.random });
    const schedule = harness.state.collectAllSchedule;
    const gap = schedule.nextWave - schedule.wave;
    gaps.push(gap);
    assert.equal(gap, entry.gap);
    assert.ok(Math.abs(schedule.triggerRatio - entry.ratio) < .000001);
    assert.ok(schedule.triggerRatio >= .35 && schedule.triggerRatio <= .70);
  }
  assert.equal(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length, 3);
});

test('collect-all appears exactly at its planned kill and advances one bounded schedule', () => {
  const harness = createGameHarness(null, { random: () => .9 });
  const state = harness.state;
  state.collectAllSchedule = {
    version: 1,
    nextWave: 2,
    triggerRatio: .5,
    wave: 2,
    waveKills: 0,
    lastSpawnWave: 0
  };

  for (let kill = 1; kill < 5; kill += 1) {
    defeatEnemy(harness, 'normal', 100 + kill, { wave: 2, waveTarget: 10 });
    assert.equal(state.drops.filter(drop => drop.kind === 'collectAll' && !drop.dead).length, 0);
    assert.equal(state.collectAllSchedule.waveKills, kill);
  }

  defeatEnemy(harness, 'normal', 105, { wave: 2, waveTarget: 10 });
  assert.equal(state.drops.filter(drop => drop.kind === 'collectAll' && !drop.dead).length, 1);
  assert.equal(state.collectAllSchedule.lastSpawnWave, 2);
  assert.equal(state.collectAllSchedule.nextWave, 6);
  assert.ok(state.collectAllSchedule.triggerRatio >= .35 && state.collectAllSchedule.triggerRatio <= .70);

  defeatEnemy(harness, 'normal', 106, { wave: 2, waveTarget: 10 });
  assert.equal(state.drops.filter(drop => drop.kind === 'collectAll' && !drop.dead).length, 1);
});

test('a due schedule is consumed without duplicating an already-live collect-all', () => {
  const harness = createGameHarness(null, { random: () => .5 });
  const state = prepareDropCombat(harness);
  state.waveTarget = 10;
  state.collectAllSchedule = {
    version: 1,
    nextWave: 2,
    triggerRatio: .35,
    wave: 2,
    waveKills: 3,
    lastSpawnWave: 1
  };
  state.drops.push({ x: 500, y: 0, kind: 'collectAll', rare: true, spawnedWave: 1 });

  defeatEnemy(harness, 'normal', 201, { wave: 2, waveTarget: 10 });

  assert.equal(state.drops.filter(drop => drop.kind === 'collectAll' && !drop.dead).length, 1);
  assert.equal(state.collectAllSchedule.nextWave, 5);
  assert.equal(state.collectAllSchedule.lastSpawnWave, 1);
});

test('checkpoint preserves collect-all plan, counter, and live item; pickup cannot resurrect it', () => {
  const firstPage = createGameHarness(null, { random: () => .5 });
  const firstState = prepareDropCombat(firstPage);
  firstState.collectAllSchedule = {
    version: 1,
    nextWave: 5,
    triggerRatio: .52,
    wave: 2,
    waveKills: 5,
    lastSpawnWave: 2
  };
  firstState.drops = [{ x: 300, y: 0, kind: 'collectAll', rare: true, spawnedWave: 2 }];
  assert.equal(firstPage.game.persistCheckpoint('pagehide').ok, true);

  const secondPage = createGameHarness(firstPage.savedCheckpoint, { random: () => .5 });
  assert.deepEqual(clone(secondPage.state.collectAllSchedule), clone(firstState.collectAllSchedule));
  assert.equal(secondPage.state.drops.filter(drop => drop.kind === 'collectAll').length, 1);
  assert.equal(secondPage.state.drops[0].spawnedWave, 2);

  secondPage.state.introTimer = 0;
  secondPage.state.wave = 2;
  secondPage.state.floor = 2;
  secondPage.state.waveState = 'spawning';
  secondPage.state.waveTarget = 999;
  secondPage.state.waveSpawned = 0;
  secondPage.state.spawnCd = 999;
  secondPage.state.p.x = 300;
  secondPage.state.p.y = 0;
  secondPage.game.devStep(.016);
  assert.equal(secondPage.state.drops.some(drop => drop.kind === 'collectAll'), false);
  assert.equal(secondPage.savedCheckpoint.collectAllDrop, null);
  assert.equal(secondPage.savedCheckpoint.collectAllSchedule.nextWave, 5);

  const thirdPage = createGameHarness(secondPage.savedCheckpoint, { random: () => .5 });
  assert.equal(thirdPage.state.drops.some(drop => drop.kind === 'collectAll'), false);
  assert.equal(thirdPage.state.collectAllSchedule.nextWave, 5);
  assert.equal(thirdPage.state.collectAllSchedule.waveKills, 5);
});

test('legacy checkpoints without a collect-all schedule receive a future compatible plan', () => {
  const firstPage = createGameHarness(null, { random: () => .5 });
  const state = prepareDropCombat(firstPage);
  assert.equal(firstPage.game.persistCheckpoint('pagehide').ok, true);
  const legacyCheckpoint = clone(firstPage.savedCheckpoint);
  delete legacyCheckpoint.collectAllSchedule;
  delete legacyCheckpoint.collectAllDrop;

  const restored = createGameHarness(legacyCheckpoint, { random: () => .5 });
  assert.equal(restored.state.collectAllSchedule.wave, 2);
  assert.equal(restored.state.collectAllSchedule.nextWave, 5);
  assert.ok(restored.state.collectAllSchedule.triggerRatio >= .35);
  assert.ok(restored.state.collectAllSchedule.triggerRatio <= .70);
  assert.equal(restored.state.drops.some(drop => drop.kind === 'collectAll'), false);
});

test('collect-all survives the normal runtime drop cap as a reserved special slot', () => {
  const harness = createGameHarness();
  const state = prepareDropCombat(harness);
  state.p.nextExp = 1000000;
  state.drops = [
    ...Array.from({ length: 160 }, (_, index) => ({ x: 500 + index, y: 500, kind: 'exp', exp: 1 })),
    { x: 700, y: 700, kind: 'collectAll', rare: true, spawnedWave: 2 }
  ];

  harness.game.devStep(.016);

  assert.equal(state.drops.filter(drop => drop.kind === 'exp').length, 130);
  assert.equal(state.drops.filter(drop => drop.kind === 'collectAll').length, 1);
  assert.equal(state.drops.length, 131);
});

test('a final-boss collect-all is consumed before the return cue can strand it', () => {
  const harness = createGameHarness(null, { random: () => .5 });
  const state = defeatEnemy(harness, 'boss', 912, {
    wave: 12,
    waveTarget: 1,
    schedule: {
      version:1,
      nextWave:12,
      triggerRatio:.5,
      wave:12,
      waveKills:0,
      lastSpawnWave:9
    }
  });
  assert.equal(state.drops.filter(drop => drop.kind === 'collectAll' && !drop.dead).length, 1);
  state.p.nextExp = 10000;
  state.p.exp = 0;
  state.p.hp = 50;

  for(let frame = 0; frame < 35 && !state.cleared; frame += 1) harness.game.devStep(.033);

  assert.equal(state.cleared, true);
  assert.equal(state.drops.some(drop => drop.kind === 'collectAll'), false);
  assert.equal(state.drops.some(drop => drop.kind === 'exp' || drop.kind === 'heal'), false);
  assert.equal(state.p.exp, 4);
  assert.equal(state.p.hp, 84);
  assert.equal(harness.savedCheckpoint.collectAllDrop, null);
  assert.equal(harness.savedCheckpoint.player.numbers.exp, 4);
  assert.equal(harness.savedCheckpoint.player.numbers.hp, 84);
});

test('defeat, real magnet travel, and EXP collection expose the growth presentation chain only', () => {
  const harness = createGameHarness(null, { random: () => .5 });
  const state = defeatEnemy(harness, 'normal', 913);
  assert.equal(state.defeatedEnemies.length, 1);
  assert.equal(state.defeatedEnemies[0].id, '913');
  assert.equal(state.defeatedEnemies[0].duration, .52);
  assert.equal(state.fx.some(effect => effect.type === 'absorb'), false);

  const drop = state.drops.find(item => item.kind === 'exp');
  state.hitStop = 0;
  drop.forceMagnet = true;
  harness.game.devStep(.016);
  assert.equal(drop.magnetActive, true);
  assert.equal(state.p.munchSerial, 0);

  drop.x = state.p.x + 5;
  drop.y = state.p.y;
  harness.game.devStep(.016);
  assert.equal(drop.dead, true);
  assert.equal(state.p.munchSerial, 1);
  assert.ok(state.p.munchTimer > .3);

  assert.equal(harness.game.persistCheckpoint('motion-fields-omitted').ok, true);
  const savedNumbers = harness.savedCheckpoint.player.numbers;
  for (const key of ['attackSerial', 'attackStartElapsed', 'attackReleasedSerial', 'hurtSerial', 'munchSerial', 'munchTimer', 'celebrateSerial']) {
    assert.equal(Object.prototype.hasOwnProperty.call(savedNumbers, key), false, `${key} must remain presentation-only`);
  }
});

test('a real player shot enters the approved release marker without delaying the projectile', () => {
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
  assert.equal(state.p.attackSerial, 1);
  assert.equal(state.p.attackReleasedSerial, 1);
  assert.equal(state.p.attackStartElapsed, .224);
  assert.equal(state.p.attackAnimTimer, .616);

  harness.game.devStep(.033);
  assert.ok(state.p.attackAnimTimer < .616);
  assert.ok(state.p.attackAnimTimer > 0);
});

test('a target-confirmed windup and its real player shot share one action serial', () => {
  const harness = createGameHarness();
  const state = prepareDropCombat(harness);
  state.p.attackCd = .2;
  state.enemies.push({
    id: 78, name: 'ぷに虫', x: 180, y: 0, r: 13, hp: 100, maxHp: 100,
    speed: 0, dmg: 0, exp: 4, behavior: 'chase', kind: 'normal', attackCd: 999,
    poison: 0, poisonTick: 0, slow: 0, hitFlash: 0
  });

  harness.game.devStep(.016);
  assert.equal(state.bullets.length, 0);
  assert.equal(state.p.attackCueArmed, true);
  assert.equal(state.p.attackSerial, 1);
  assert.ok(Math.abs(state.p.attackStartElapsed - .04) < 1e-9);

  for (let frame = 0; frame < 20 && state.bullets.length === 0; frame++) harness.game.devStep(.016);
  assert.equal(state.bullets.length, 1);
  assert.equal(state.p.attackSerial, 1);
  assert.equal(state.p.attackReleasedSerial, 1);
  assert.equal(state.p.attackCueArmed, false);
});

test('cooldown alone never creates an empty attack event', () => {
  const harness = createGameHarness();
  const state = prepareDropCombat(harness);
  state.p.attackCd = .1;

  for (let frame = 0; frame < 10; frame++) harness.game.devStep(.016);
  assert.equal(state.bullets.length, 0);
  assert.equal(state.p.attackSerial, 0);
  assert.equal(state.p.attackAnimTimer, 0);
  assert.equal(state.p.attackCueArmed, false);
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

test('settlement failure stays on a dedicated truthful surface and retries the same pending run', () => {
  const harness = createGameHarness();
  const state = prepareDropCombat(harness);
  let attempts = 0;
  harness.context.MoguriaMeta = { awardFromRun: () => (++attempts === 1
    ? { ok: false, reason: 'save-failed' }
    : { ok: true, amount: 18 }) };
  harness.context.MoguriaResult = { buildName: () => 'test run', comment: () => 'test', titles: () => [] };
  state.wave = 6;
  state.floor = 6;
  state.p.lv = 4;
  state.p.maxHp = 120;
  state.p.hp = 0;

  harness.game.devStep(.016);
  for (let i = 0; i < 20 && state.mode === 'defeat'; i++) harness.game.devStep(.033);

  assert.equal(state.mode, 'settlementError');
  assert.equal(harness.elements.pauseModal.classList.contains('hidden'), true);
  assert.equal(harness.elements.settlementError.classList.contains('hidden'), false);
  assert.match(harness.elements.settlementErrorTitle.textContent, /保存できませんでした/);
  assert.equal(harness.elements.settlementWaveValue.textContent, '6 / 12');
  assert.equal(harness.elements.settlementLevelValue.textContent, 'Lv.4');
  assert.equal(harness.elements.settlementHpValue.textContent, '0 / 120');
  assert.equal(harness.elements.app.inert, true);

  harness.elements.settlementRetryBtn.click();
  assert.equal(attempts, 2);
  assert.equal(state.mode, 'ended');
  assert.equal(harness.elements.settlementError.classList.contains('hidden'), true);
  assert.equal(harness.elements.app.inert, false);
});

test('direct give-up confirmation freezes combat, cancellation resumes it, and acceptance settles the run', async () => {
  const harness = createGameHarness();
  const state = harness.state;
  state.introTimer = 0;
  state.mode = 'run';

  let decision = harness.elements.giveupBtn.click();
  assert.equal(state.mode, 'pause', 'combat freezes while the confirmation is open');
  assert.equal(harness.confirmRequests.length, 1);
  assert.match(harness.confirmRequests[0].message, /途中から再開できなくなります/);
  assert.match(harness.confirmRequests[0].message, /記録と報酬を確定/);

  harness.resolveConfirm(false);
  await decision;
  assert.equal(state.mode, 'run', 'cancelling a direct exit resumes the same run');

  harness.context.MoguriaMeta = { awardFromRun: () => ({ ok: true, amount: 12 }) };
  harness.context.MoguriaResult = { buildName: () => 'test run', comment: () => 'test', titles: () => [] };
  decision = harness.elements.giveupBtn.click();
  assert.equal(state.mode, 'pause');
  harness.resolveConfirm(true);
  await decision;
  assert.equal(state.mode, 'ended');
  assert.equal(harness.context.lastResult.giveup, true);
  assert.equal(harness.context.lastResult.coins, 12);
});

test('pause-sheet home confirmation keeps the sheet paused on cancel and exits only after acceptance', async () => {
  const harness = createGameHarness();
  harness.state.introTimer = 0;
  harness.state.mode = 'run';
  harness.game.pauseRun();
  assert.equal(harness.state.mode, 'pause');
  assert.equal(harness.elements.pauseModal.classList.contains('hidden'), false);

  let decision = harness.elements.pauseGiveupBtn.click();
  assert.equal(harness.confirmRequests.length, 1);
  harness.resolveConfirm(false);
  await decision;
  assert.equal(harness.state.mode, 'pause');
  assert.equal(harness.elements.pauseModal.classList.contains('hidden'), false);

  harness.context.MoguriaMeta = { awardFromRun: () => ({ ok: true, amount: 8 }) };
  harness.context.MoguriaResult = { buildName: () => 'test run', comment: () => 'test', titles: () => [] };
  decision = harness.elements.pauseGiveupBtn.click();
  harness.resolveConfirm(true);
  await decision;
  assert.equal(harness.state.mode, 'ended');
  assert.equal(harness.elements.pauseModal.classList.contains('hidden'), true);
  assert.equal(harness.context.lastResult.giveup, true);
});

test('settlement error stylesheet replaces the power grid so retry actions cannot be clipped', () => {
  const stylesheet = readScript('css/moguria-battle-refinement.css');
  assert.match(stylesheet, /\.pause-card__summary\.is-error\s*\+\s*\.pause-card__powers\s*\{[^}]*display:\s*none\s*!important/s);
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

test('a real contact hit seeks the regular-enemy release pose and exposes one serial', () => {
  const harness = createGameHarness(null, { random: () => .9 });
  const state = prepareDropCombat(harness);
  state.p.hp = state.p.maxHp;
  state.enemies.push({
    id: 88, name: 'ぷに虫', x: 0, y: 0, r: 13, hp: 100, maxHp: 100,
    speed: 0, dmg: 1, exp: 4, behavior: 'chase', kind: 'normal', attackCd: 999,
    poison: 0, poisonTick: 0, slow: 0, hitFlash: 0
  });

  harness.game.devStep(.016);
  assert.equal(state.enemies[0].attackSerial, 1);
  assert.equal(state.enemies[0].attackReleasedSerial, 1);
  assert.equal(state.enemies[0].attackStartElapsed, .2388);
  assert.equal(state.enemies[0].attackVisualTimer, .5412);
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

test('run profiles preserve normal 12-wave gates and isolate the Chapter 1 four-wave route', () => {
  const normal=createGameHarness();
  assert.equal(normal.state.profileId,'normal-v1');
  assert.equal(normal.state.maxWave,12);
  assert.deepEqual(Array.from(normal.state.runProfile.artifactWaves),[3,7]);
  assert.deepEqual(Array.from(normal.state.runProfile.midBossWaves),[7]);
  assert.deepEqual(Array.from(normal.state.runProfile.bossWaves),[12]);

  const story=createGameHarness(null,{profileId:'story-c1-investigation-v1'});
  assert.equal(story.state.maxWave,4);
  assert.equal(story.state.runProfile.kind,'story');
  assert.deepEqual(Array.from(story.state.runProfile.artifactWaves),[]);
  story.state.introTimer=0;
  story.state.wave=3;
  story.state.floor=3;
  story.state.waveState='spawning';
  story.state.waveTarget=1;
  story.state.waveSpawned=1;
  story.state.waveClearTimer=.8;
  story.state.enemies=[];
  story.game.devStep(.016);
  assert.equal(story.state.mode,'run');
  assert.equal(story.state.wave,4,'Wave 3 advances without opening an Artifact gate');
  assert.equal(story.state.waveState,'spawning','Wave 4 is not a boss gate');
});

test('a cleared story run bypasses numeric result and hands off once to the return story', () => {
  const harness=createGameHarness(null,{profileId:'story-c1-investigation-v1'});
  const state=harness.state;
  let resultCalls=0,handOffs=0,eventCalls=0;
  harness.context.MoguriaMeta={awardFromRun:run=>({ok:true,amount:0,data:{story:{currentNodeId:'c1_return_pending'}},run})};
  harness.context.MoguriaResult={buildName:()=> '外縁調査',comment:()=>'',titles:()=>[]};
  harness.context.MoguriaUI.showResult=()=>{resultCalls++;};
  harness.context.dispatchEvent=()=>{eventCalls++;};
  harness.context.MoguriaStoryChapter01={resumeAfterRun(payload){handOffs++; harness.context.storyPayload=payload;}};
  state.introTimer=0; state.wave=4; state.floor=4; state.waveState='spawning';
  state.waveTarget=1; state.waveSpawned=1; state.waveClearTimer=.8; state.enemies=[];
  harness.game.devStep(.016);
  for(let i=0;i<70&&state.mode==='run';i++) harness.game.devStep(.033);
  assert.equal(state.mode,'ended');
  assert.equal(handOffs,1);
  assert.equal(eventCalls,0);
  assert.equal(resultCalls,0);
  assert.equal(harness.context.storyPayload.run.profileId,'story-c1-investigation-v1');
  assert.equal(harness.context.storyPayload.run.cleared,true);
});

test('a synchronous story handoff failure is contained without dispatching a second resume path', () => {
  const harness=createGameHarness(null,{profileId:'story-c1-investigation-v1'});
  const state=harness.state;
  let resultCalls=0,eventCalls=0;
  harness.context.MoguriaMeta={awardFromRun:()=>({ok:true,amount:0})};
  harness.context.MoguriaResult={buildName:()=> '外縁調査',comment:()=>'',titles:()=>[]};
  harness.context.MoguriaUI.showResult=()=>{resultCalls++;};
  harness.context.dispatchEvent=()=>{eventCalls++;};
  harness.context.MoguriaStoryChapter01={resumeAfterRun(){throw new Error('simulated player failure');}};
  state.introTimer=0; state.wave=4; state.floor=4; state.waveState='spawning';
  state.waveTarget=1; state.waveSpawned=1; state.waveClearTimer=.8; state.enemies=[];
  harness.game.devStep(.016);
  for(let i=0;i<70&&state.mode==='run';i++) harness.game.devStep(.033);
  assert.equal(state.mode,'ended');
  assert.equal(resultCalls,0);
  assert.equal(eventCalls,0);
  assert.equal(harness.context.lastScreen,'home');
  assert.equal(harness.elements.homeNotice.hidden,false);
  assert.equal(harness.elements.homeNotice.attributes.role,'alert');
  assert.match(harness.elements.homeNotice.textContent,/物語の続き/);
});

test('story settlement dispatches the decoupled fallback only when the direct player API is absent', () => {
  const harness=createGameHarness(null,{profileId:'story-c1-investigation-v1'});
  const state=harness.state;
  const events=[];
  harness.context.MoguriaMeta={awardFromRun:()=>({ok:true,amount:0})};
  harness.context.MoguriaResult={buildName:()=> '外縁調査',comment:()=>'',titles:()=>[]};
  harness.context.CustomEvent=function(type,options){this.type=type;this.detail=options?.detail;};
  harness.context.dispatchEvent=event=>{events.push(event); return true;};
  state.introTimer=0; state.wave=4; state.floor=4; state.waveState='spawning';
  state.waveTarget=1; state.waveSpawned=1; state.waveClearTimer=.8; state.enemies=[];
  harness.game.devStep(.016);
  for(let i=0;i<70&&state.mode==='run';i++) harness.game.devStep(.033);
  assert.equal(events.length,1);
  assert.equal(events[0].type,'moguria:story-run-settled');
  assert.equal(events[0].detail.run.profileId,'story-c1-investigation-v1');
  assert.equal(harness.context.lastScreen,'home');
});

test('story defeat remains bound and retries the same run for free instead of settling', async () => {
  const harness=createGameHarness(null,{profileId:'story-c1-investigation-v1'});
  const state=prepareDropCombat(harness);
  harness.context.MoguriaMeta={applyEquipmentToPlayer(){},awardFromRun(){throw new Error('story defeat must not settle');}};
  harness.context.MoguriaResult={buildName:()=> '外縁調査',comment:()=>'',titles:()=>[]};
  state.p.hp=0;
  harness.game.devStep(.016);
  for(let i=0;i<20&&state.mode==='defeat';i++) harness.game.devStep(.033);
  assert.equal(state.mode,'storyRetry');
  assert.equal(harness.context.lastResult.storyRetry,true);
  assert.equal(harness.context.lastResult.profileId,'story-c1-investigation-v1');
  assert.equal(await harness.context.lastResultRaw.retry(),true);
  assert.equal(harness.savedCheckpoint.defeated,false);
  assert.equal(harness.savedCheckpoint.wave,1);
  assert.equal(harness.state.runId,'run-resume-test');
  assert.equal(harness.state.maxWave,4);
});

test('leaving a story investigation preserves its active checkpoint for later', async () => {
  const harness=createGameHarness(null,{profileId:'story-c1-investigation-v1'});
  harness.state.introTimer=0;
  harness.state.mode='run';
  harness.context.MoguriaMeta={awardFromRun(){throw new Error('story interruption must not settle');}};
  const decision=harness.elements.giveupBtn.click();
  assert.match(harness.confirmRequests[0].message,/同じ続きから再開/);
  assert.match(harness.confirmRequests[0].message,/おなかは消費しません/);
  harness.resolveConfirm(true);
  await decision;
  assert.equal(harness.state.mode,'pause');
  assert.equal(harness.context.lastScreen,'home');
  assert.equal(harness.savedCheckpoint.wave,0);
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

test('dependent skill enhancements stay hidden until a skill or artifact provides their capability', () => {
  const harness = createGameHarness(null, { random: () => 0 });
  const { MoguriaSkills } = harness.context;
  const player = harness.state.p;
  const poisonStack = MoguriaSkills.skills.find(skill => skill.id === 'poison_stack');
  const friendJam = MoguriaSkills.skills.find(skill => skill.id === 'friend_jam');
  const chainPop = MoguriaSkills.skills.find(skill => skill.id === 'chain_pop');

  assert.equal(MoguriaSkills.isSkillEligible(poisonStack, player), false);
  assert.equal(MoguriaSkills.isSkillEligible(friendJam, player), false);
  assert.equal(MoguriaSkills.isSkillEligible(chainPop, player), false);

  harness.game.devAddSkill('poison_seed');
  harness.game.devAddArtifact('little_parade');
  harness.game.devAddArtifact('pop_crown');

  assert.equal(MoguriaSkills.isSkillEligible(poisonStack, player), true);
  assert.equal(MoguriaSkills.isSkillEligible(friendJam, player), true);
  assert.equal(MoguriaSkills.isSkillEligible(chainPop, player), true);
  assert.equal(MoguriaSkills.choiceMetadataForSkill(poisonStack, player).relationship, 'むらさきキノコを強くする');
});

test('weighted skill choices are unique, eligibility-aware, and terminate with fewer than three candidates', () => {
  const harness = createGameHarness(null, { random: () => 0 });
  const { MoguriaSkills } = harness.context;
  const allowed = new Set(['guard_nut', 'quick_berry']);
  const banned = MoguriaSkills.skills.filter(skill => !allowed.has(skill.id)).map(skill => skill.id);
  const choices = MoguriaSkills.weightedChoices(3, harness.state.p, banned);

  assert.deepEqual(Array.from(choices, skill => skill.id), ['quick_berry', 'guard_nut']);
  assert.equal(new Set(choices.map(skill => skill.id)).size, choices.length);
  assert.equal(choices.some(skill => skill.requirement), false);
});

test('an ineligible saved skill card is discarded instead of returning after reload', () => {
  const firstPage = createGameHarness();
  const state = firstPage.state;
  state.pendingChoice = {
    type: 'skill', wave: 2, choiceIds: ['poison_stack', 'guard_nut', 'quick_berry'],
    level: state.p.lv, exp: state.p.exp, nextExp: state.p.nextExp
  };
  firstPage.game.persistCheckpoint('test-ineligible-card');

  const secondPage = createGameHarness(firstPage.savedCheckpoint);
  const restoredIds = Array.from(secondPage.state.pendingChoice.choiceIds);
  assert.equal(secondPage.state.mode, 'choice');
  assert.equal(restoredIds.includes('poison_stack'), false);
  assert.equal(secondPage.elements.skillChoices.children.some(card => card.dataset.skillId === 'poison_stack'), false);
});

test('skill reroll and ban persist their exact post-action state immediately', () => {
  const firstPage = createGameHarness();
  openLevelChoice(firstPage);

  firstPage.elements.rerollBtn.click();
  assert.equal(firstPage.state.rerolls, 2);
  assert.equal(firstPage.savedCheckpoint.rerolls, 2);
  assert.deepEqual(Array.from(firstPage.savedCheckpoint.pendingChoice.choiceIds), Array.from(firstPage.state.pendingChoice.choiceIds));

  firstPage.elements.skillChoices.children[0].banButton.click();
  assert.equal(firstPage.state.bans, 1);
  assert.equal(firstPage.savedCheckpoint.bans, 1);
  assert.deepEqual(Array.from(firstPage.savedCheckpoint.bannedSkills), Array.from(firstPage.state.bannedSkills));
});

test('artifact rerolls persist across reload and stop cleanly at zero', () => {
  const firstPage = createGameHarness();
  openArtifactChoice(firstPage);
  firstPage.elements.artifactRerollBtn.click();

  assert.equal(firstPage.state.artifactRerolls, 2);
  assert.equal(firstPage.savedCheckpoint.artifactRerolls, 2);
  assert.deepEqual(Array.from(firstPage.savedCheckpoint.pendingChoice.choiceIds), Array.from(firstPage.state.pendingChoice.choiceIds));

  const secondPage = createGameHarness(firstPage.savedCheckpoint);
  assert.equal(secondPage.state.artifactRerolls, 2);
  secondPage.elements.artifactRerollBtn.click();
  secondPage.elements.artifactRerollBtn.click();
  secondPage.elements.artifactRerollBtn.click();
  assert.equal(secondPage.state.artifactRerolls, 0);
  assert.equal(secondPage.savedCheckpoint.artifactRerolls, 0);
  assert.equal(secondPage.elements.artifactRerollBtn.disabled, true);
});

test('old checkpoints default artifact rerolls and owned-power surfaces expose atlas metadata and details', () => {
  const firstPage = createGameHarness();
  firstPage.game.devAddSkill('poison_seed');
  firstPage.game.devAddArtifact('little_parade');
  firstPage.game.persistCheckpoint('legacy-artifact-rerolls');
  const legacyCheckpoint = clone(firstPage.savedCheckpoint);
  delete legacyCheckpoint.artifactRerolls;

  const secondPage = createGameHarness(legacyCheckpoint);
  assert.equal(secondPage.state.artifactRerolls, 3);
  openLevelChoice(secondPage);
  const ownedSkill = secondPage.elements.levelOwnedSkills.children[0];
  assert.equal(ownedSkill.dataset.skillId, 'poison_seed');
  assert.match(ownedSkill.innerHTML, /data-skill-atlas="poison"/);
  ownedSkill.click();
  assert.equal(secondPage.elements.levelOwnedDetail.hidden, false);
  assert.match(secondPage.elements.levelOwnedDetail.innerHTML, /むらさきキノコ/);

  secondPage.elements.levelModal.classList.add('hidden');
  secondPage.state.mode = 'run';
  secondPage.game.pauseRun();
  assert.equal(secondPage.elements.pauseSkillGrid.children[0].dataset.skillId, 'poison_seed');
  assert.equal(secondPage.elements.pauseArtifactGrid.children[0].dataset.artifactId, 'little_parade');
  assert.match(secondPage.elements.pauseSkillGrid.children[0].innerHTML, /data-cell="0"/);
});

test('skill icon atlas cells follow their visual families and provide broad recognition variety', () => {
  const harness = createGameHarness();
  const { MoguriaSkills } = harness.context;
  const visual = id => {
    const icon = MoguriaSkills.iconVisualForSkill(id);
    return `${icon.family}:${icon.cell}`;
  };

  assert.equal(visual('poison_seed'), 'poison:0');
  assert.equal(visual('toxic_burst'), 'poison:3');
  assert.equal(visual('fan_cookie'), 'blast:3');
  assert.equal(visual('ice_syrup'), 'support:0');
  assert.equal(visual('mogu_vamp'), 'support:1');
  assert.equal(visual('pierce_skewer'), 'star:0');
  assert.equal(visual('star_meteor'), 'star:2');
  assert.equal(visual('meteor_party'), 'upgrade:0');
  assert.equal(visual('moon_orbit'), 'combat:1');
  assert.equal(visual('orbit_storm'), 'upgrade:1');
  assert.equal(visual('thunder_gum'), 'combat:2');
  assert.equal(visual('storm_soda'), 'upgrade:2');
  assert.equal(visual('sleepy_mine'), 'combat:3');
  assert.equal(visual('mine_garden'), 'upgrade:3');

  assert.equal(visual('fusion_toxic_star_firework'), 'fusion:0');
  assert.equal(visual('fusion_storm_orbit'), 'fusion:1');
  assert.equal(visual('fusion_safe_flower_bomb'), 'fusion:2');
  assert.equal(visual('fusion_little_meteor_parade'), 'fusion:3');
  assert.equal(new Set(MoguriaSkills.fusions.map(fusion => visual(fusion.id))).size, 4);

  const allDefinitions = [...MoguriaSkills.skills, ...MoguriaSkills.fusions];
  const motifs = new Set(allDefinitions.map(skill => visual(skill.id)));
  assert.equal(MoguriaSkills.skills.length, 36);
  assert.equal(MoguriaSkills.fusions.length, 4);
  assert.equal(motifs.size, 40);
  for(const skill of allDefinitions){
    const icon = MoguriaSkills.iconVisualForSkill(skill.id);
    assert.equal(icon.atlas, `assets/images/skill-icons/skill-atlas-${icon.family}.webp`);
    assert.ok(icon.cell >= 0 && icon.cell <= 3);
  }

  const stylesheet = readScript('css/moguria-battle-refinement.css');
  for(const family of ['poison','blast','combat','guard','move','star','summon','support','upgrade','fusion']){
    assert.match(stylesheet, new RegExp(`data-skill-atlas="${family}"`));
    assert.match(stylesheet, new RegExp(`skill-atlas-${family}\\.webp`));
  }
});
