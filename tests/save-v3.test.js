'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function readScript(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  let failWrites = false;
  let setCalls = 0;

  return {
    get setCalls() { return setCalls; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      setCalls += 1;
      if (failWrites) throw new Error('simulated localStorage write failure');
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); },
    setFailure(value) { failWrites = Boolean(value); },
    resetSetCalls() { setCalls = 0; },
    json(key = 'moguria.save.v2') {
      const raw = values.get(key);
      return raw == null ? null : JSON.parse(raw);
    }
  };
}

function createBrowserContext(storage) {
  let uuid = 0;
  const context = {
    console: { log() {}, warn() {}, error() {} },
    localStorage: storage,
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}` },
    Date,
    Math,
    JSON
  };
  context.window = context;
  vm.createContext(context);
  return context;
}

function loadSave(storage) {
  const context = createBrowserContext(storage);
  vm.runInContext(readScript('js/config.js'), context, { filename: 'js/config.js' });
  vm.runInContext(readScript('js/save.js'), context, { filename: 'js/save.js' });
  return { context, save: context.MoguriaSave };
}

function v2Save(overrides = {}) {
  return {
    saveVersion: 2,
    belly: 3,
    maxBelly: 3,
    lastBellyAt: Date.now(),
    snackAt: 123,
    runs: [],
    dex: { skills: {}, artifacts: {}, synergies: {}, titles: {} },
    best: { floor: 0, damage: 0, kills: 0, dps: 0 },
    meta: {
      coins: 0,
      inventory: [],
      equipped: { hat: null, body: null, hand: null, foot: null, charm: null },
      upgrades: {},
      claimedChallenges: {},
      daily: { key: '', claimed: false }
    },
    ...overrides
  };
}

test('v2 payload migrates in place without losing existing progress', () => {
  const storage = createStorage({
    'moguria.save.v2': JSON.stringify(v2Save({
      belly: 2,
      runs: [{ date: 10, floor: 4, skills: [{ id: 'mini_mogu' }] }],
      dex: { skills: { mini_mogu: 3 }, artifacts: {}, synergies: {}, titles: {} },
      best: { floor: 4, damage: 91, kills: 22, dps: 17 },
      meta: { ...v2Save().meta, coins: 140, inventory: [{ uid: 'eq_old', id: 'hand_seed' }] }
    }))
  });
  const { save } = loadSave(storage);
  const migrated = save.load();

  assert.equal(migrated.saveVersion, 3);
  assert.equal(migrated.belly, 2);
  assert.equal(migrated.runs[0].floor, 4);
  assert.equal(migrated.dex.skills.mini_mogu, 3);
  assert.equal(migrated.best.damage, 91);
  assert.equal(migrated.meta.coins, 140);
  assert.equal(migrated.meta.inventory[0].uid, 'eq_old');
  assert.equal(migrated.activeRun, null);
  assert.deepEqual(Array.from(migrated.settledRunIds), []);
});

test('legacy storage key remains readable and is copied to the current key', () => {
  const storage = createStorage({
    'moguria.prototype.save.v1': JSON.stringify(v2Save({ saveVersion: 1, belly: 1 }))
  });
  const { save } = loadSave(storage);
  const migrated = save.load();

  assert.equal(migrated.saveVersion, 3);
  assert.equal(migrated.belly, 1);
  assert.equal(storage.json().saveVersion, 3);
});

test('startRun consumes exactly one belly and persists activeRun in one write', () => {
  const storage = createStorage({ 'moguria.save.v2': JSON.stringify(v2Save()) });
  const { save } = loadSave(storage);
  storage.resetSetCalls();

  const result = save.startRun({ engine: 'battle-v3', seed: 1234 });
  const persisted = storage.json();

  assert.equal(result.ok, true);
  assert.equal(result.reused, undefined);
  assert.equal(storage.setCalls, 1);
  assert.equal(persisted.belly, 2);
  assert.equal(persisted.activeRun.runId, result.runId);
  assert.equal(persisted.activeRun.engine, 'battle-v3');
  assert.equal(persisted.activeRun.seed, 1234);
});

test('an active run resumes without consuming belly or writing again', () => {
  const storage = createStorage({ 'moguria.save.v2': JSON.stringify(v2Save({ belly: 1 })) });
  const { save } = loadSave(storage);
  const started = save.startRun({ engine: 'battle-v3' });
  const bellyAfterStart = storage.json().belly;
  storage.resetSetCalls();

  const resumed = save.startRun({ runId: started.runId });

  assert.equal(resumed.ok, true);
  assert.equal(resumed.reused, true);
  assert.equal(resumed.runId, started.runId);
  assert.equal(storage.json().belly, bellyAfterStart);
  assert.equal(storage.setCalls, 0);
});

test('checkpoint survives reload and the reloaded session reuses its runId', () => {
  const storage = createStorage({ 'moguria.save.v2': JSON.stringify(v2Save()) });
  const firstPage = loadSave(storage).save;
  const started = firstPage.startRun({ engine: 'battle-v3' });
  const checkpoint = {
    checkpoint: {
      wave: 7,
      time: 98.5,
      playerSnapshot: { version: 1, numbers: { hp: 63 }, flags: {} },
      choiceType: 'skill',
      pendingChoice: {
        type: 'skill',
        wave: 7,
        choiceIds: ['mini_mogu', 'guard_nut', 'quick_berry'],
        level: 4,
        exp: 3,
        nextExp: 29
      },
      collectAllSchedule: {
        version: 1,
        nextWave: 9,
        triggerRatio: .58,
        wave: 7,
        waveKills: 1,
        lastSpawnWave: 5
      },
      collectAllDrop: { x: 184, y: -92, kind: 'collectAll', rare: true, spawnedWave: 5 }
    }
  };
  assert.equal(firstPage.updateCheckpoint(started.runId, checkpoint).ok, true);
  const bellyBeforeReload = storage.json().belly;

  const secondPage = loadSave(storage).save;
  const loaded = secondPage.load();
  storage.resetSetCalls();
  const resumed = secondPage.startRun({ runId: loaded.activeRun.runId });

  assert.equal(loaded.activeRun.checkpoint.wave, 7);
  assert.equal(loaded.activeRun.checkpoint.playerSnapshot.numbers.hp, 63);
  assert.equal(loaded.activeRun.checkpoint.choiceType, 'skill');
  assert.deepEqual(Array.from(loaded.activeRun.checkpoint.pendingChoice.choiceIds), ['mini_mogu', 'guard_nut', 'quick_berry']);
  assert.equal(loaded.activeRun.checkpoint.pendingChoice.exp, 3);
  assert.equal(loaded.activeRun.checkpoint.collectAllSchedule.nextWave, 9);
  assert.equal(loaded.activeRun.checkpoint.collectAllSchedule.waveKills, 1);
  assert.equal(loaded.activeRun.checkpoint.collectAllDrop.kind, 'collectAll');
  assert.equal(loaded.activeRun.checkpoint.collectAllDrop.spawnedWave, 5);
  assert.equal(resumed.ok, true);
  assert.equal(resumed.reused, true);
  assert.equal(resumed.runId, started.runId);
  assert.equal(storage.json().belly, bellyBeforeReload);
  assert.equal(storage.setCalls, 0);
});

test('settleRun commits MC, run log, dex and activeRun removal in one write', () => {
  const storage = createStorage({
    'moguria.save.v2': JSON.stringify(v2Save({ meta: { ...v2Save().meta, coins: 10 } }))
  });
  const { save } = loadSave(storage);
  const started = save.startRun({ engine: 'battle-v3' });
  storage.resetSetCalls();

  const settled = save.settleRun({
    runId: started.runId,
    date: Date.now(),
    floor: 5,
    wave: 5,
    kills: 24,
    maxDamage: 88,
    dps: 19,
    skills: [{ id: 'mini_mogu' }],
    artifacts: [{ id: 'little_parade' }],
    synergies: ['こもぐ爆弾隊'],
    titles: ['小さな冒険者']
  }, { coins: 25 });
  const persisted = storage.json();

  assert.equal(settled.ok, true);
  assert.equal(storage.setCalls, 1);
  assert.equal(persisted.meta.coins, 35);
  assert.equal(persisted.runs.length, 1);
  assert.equal(persisted.runs[0].runId, started.runId);
  assert.equal(persisted.dex.skills.mini_mogu, 1);
  assert.equal(persisted.activeRun, null);
  assert.equal(persisted.settledRunIds[0], started.runId);
});

test('settleRun rejects the same runId twice without a second write or reward', () => {
  const storage = createStorage({ 'moguria.save.v2': JSON.stringify(v2Save()) });
  const { save } = loadSave(storage);
  const started = save.startRun({ engine: 'battle-v3' });
  const run = { runId: started.runId, wave: 2, kills: 3, skills: [], artifacts: [], synergies: [], titles: [] };
  assert.equal(save.settleRun(run, { coins: 20 }).ok, true);
  storage.resetSetCalls();

  const duplicate = save.settleRun(run, { coins: 20 });
  const persisted = storage.json();

  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.alreadySettled, true);
  assert.equal(duplicate.reason, 'already-settled');
  assert.equal(storage.setCalls, 0);
  assert.equal(persisted.meta.coins, 20);
  assert.equal(persisted.runs.length, 1);
});

test('write failures are returned as failures and leave the last durable state intact', () => {
  const storage = createStorage({ 'moguria.save.v2': JSON.stringify(v2Save({ belly: 2 })) });
  const { save } = loadSave(storage);
  storage.setFailure(true);

  const failedStart = save.startRun({ engine: 'battle-v3' });
  assert.equal(failedStart.ok, false);
  assert.equal(failedStart.reason, 'save-failed');
  assert.equal(storage.json().belly, 2);
  assert.equal(storage.json().activeRun, undefined);

  storage.setFailure(false);
  const started = save.startRun({ engine: 'battle-v3' });
  storage.setFailure(true);
  const failedSettle = save.settleRun({
    runId: started.runId,
    wave: 3,
    skills: [], artifacts: [], synergies: [], titles: []
  }, { coins: 40 });

  assert.equal(failedSettle.ok, false);
  assert.equal(failedSettle.reason, 'save-failed');
  assert.equal(storage.json().meta.coins, 0);
  assert.equal(storage.json().runs.length, 0);
  assert.equal(storage.json().activeRun.runId, started.runId);
});

test('player snapshot survives JSON roundtrip and reconnects definitions by id', () => {
  const context = createBrowserContext(createStorage());
  vm.runInContext(readScript('js/skills.js'), context, { filename: 'js/skills.js' });
  vm.runInContext(readScript('js/player.js'), context, { filename: 'js/player.js' });
  const player = context.MoguriaPlayer.create();
  const normalSkill = context.MoguriaSkills.skills.find(skill => skill.id === 'mini_mogu');
  const fusionSkill = context.MoguriaSkills.fusions.find(skill => skill.id === 'fusion_little_meteor_parade');
  const artifact = context.MoguriaSkills.artifacts.find(item => item.id === 'little_parade');
  player.baseDamage = 27;
  player.hp = 61;
  player.poisonCloud = true;
  player.skillLevels.mini_mogu = 3;
  player.skills.push(normalSkill, { ...fusionSkill, rarity: 'fusion', fusion: true });
  player.fusedSkills.push(fusionSkill.id);
  player.artifacts.push(artifact);
  player.visual.summon = 4;
  player.equipmentVisual = {};
  player.equipmentVisual.hand = '🌰';

  const serialized = JSON.stringify(context.MoguriaPlayer.snapshot(player));
  const restored = context.MoguriaPlayer.restore(JSON.parse(serialized));

  assert.equal(restored.baseDamage, 27);
  assert.equal(restored.hp, 61);
  assert.equal(restored.poisonCloud, true);
  assert.equal(restored.skillLevels.mini_mogu, 3);
  assert.equal(typeof restored.skills.find(skill => skill.id === 'mini_mogu').apply, 'function');
  assert.equal(restored.skills.find(skill => skill.id === fusionSkill.id).fusion, true);
  assert.equal(typeof restored.artifacts.find(item => item.id === artifact.id).apply, 'function');
  assert.equal(restored.fusedSkills[0], fusionSkill.id);
  assert.equal(restored.visual.summon, 4);
  assert.equal(restored.equipmentVisual.hand, '🌰');
});

function createElement(id) {
  const element = {
    id,
    textContent: '',
    hidden: false,
    disabled: false,
    dataset: {},
    style: {},
    attributes: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    label: { textContent: '' },
    sub: { textContent: '' },
    setAttribute(name, value) { this.attributes[name] = value; },
    focus() {},
    querySelector(selector) { return selector === 'b' ? this.label : selector === 'small' ? this.sub : null; }
  };
  return element;
}

function createHomeHarness(options = {}) {
  const elements = Object.fromEntries([
    'startBtn', 'snackBtn', 'bellyText', 'bellyBar', 'coinText', 'homeLine', 'homeNotice', 'homeMogu',
    'adventureLoading', 'adventureLoadingTitle', 'adventureLoadingCost', 'adventureLoadingStatus',
    'adventureLoadingActions', 'adventureRetryBtn', 'adventureHomeBtn'
  ].map(id => [id, createElement(id)]));
  elements.adventureLoadingActions.hidden = true;
  const events = [];
  const initialRun = options.activeRun ? clone(options.activeRun) : null;
  let durableSave = v2Save({ belly: options.belly ?? 2, activeRun: initialRun });
  let directSaveCalls = 0;
  const loading = { visible: false, showCalls: 0, hideCalls: 0, messages: [], restoreFocus: null, focusTarget: '' };

  const context = {
    console: { log() {}, warn() {}, error() {} },
    Date,
    Math,
    JSON,
    setInterval: () => 1,
    setTimeout: callback => { callback(); return 1; },
    document: { getElementById: id => elements[id] || null }
  };
  context.window = context;
  context.MoguriaConfig = { run: { maxWave: 12 } };
  context.MoguriaSave = {
    load: () => clone(durableSave),
    applyTimeRecovery: data => data,
    save(data) {
      directSaveCalls += 1;
      if (options.directSaveFailure) return { ok: false, reason: 'save-failed' };
      durableSave = clone(data);
      return { ok: true, data: clone(durableSave) };
    },
    startRun(initial) {
      events.push('startRun');
      if (options.startFailure) return { ok: false, reason: options.startFailure };
      if (durableSave.activeRun) {
        assert.equal(initial.runId, durableSave.activeRun.runId);
        return {
          ok: true,
          reused: true,
          runId: durableSave.activeRun.runId,
          activeRun: clone(durableSave.activeRun),
          data: clone(durableSave)
        };
      }
      assert.equal(initial.engine, 'battle-v3');
      durableSave = { ...durableSave, belly: durableSave.belly - 1, activeRun: { runId: 'run-home-new', engine: 'battle-v3' } };
      return { ok: true, runId: 'run-home-new', activeRun: clone(durableSave.activeRun), data: clone(durableSave) };
    }
  };
  context.MoguriaBattleV3Loader = {
    async prepare() {
      events.push('prepare');
      if (options.prepareGate) return options.prepareGate;
      return options.prepareFailure ? { ok: false, reason: 'battle-load-failed' } : { ok: true };
    }
  };
  context.MoguriaUI = {
    show(id) { events.push(`show:${id}`); },
    showAdventureLoading() { loading.visible = true; loading.showCalls += 1; },
    updateAdventureLoading(message) { loading.messages.push(message); },
    hideAdventureLoading(settings = {}) {
      loading.visible = false;
      loading.hideCalls += 1;
      loading.restoreFocus = settings.restoreFocus;
      loading.focusTarget = settings.focusTarget || '';
    }
  };
  context.MoguriaGame = {
    start(args) {
      events.push('game.start');
      context.gameStartArgs = args;
      if (options.gameStartGate) return options.gameStartGate;
      if (options.gameStartThrow) throw new Error('renderer start failed synchronously');
      if (options.gameStartFailure) return false;
      return undefined;
    }
  };
  context.MoguriaMeta = { load: () => clone(durableSave) };
  vm.createContext(context);
  vm.runInContext(readScript('js/home.js'), context, { filename: 'js/home.js' });
  context.MoguriaHome.init();

  return {
    context,
    elements,
    events,
    loading,
    get durableSave() { return durableSave; },
    get directSaveCalls() { return directSaveCalls; },
    clickStart: () => elements.startBtn.onclick()
  };
}

test('home prepares battle assets before opening a new saved run', async () => {
  const harness = createHomeHarness({ belly: 2 });
  await harness.clickStart();

  assert.deepEqual(harness.events, ['prepare', 'startRun', 'show:game', 'game.start']);
  assert.equal(harness.durableSave.belly, 1);
  assert.equal(harness.directSaveCalls, 0);
  assert.equal(harness.context.gameStartArgs.runId, 'run-home-new');
  assert.equal(harness.context.gameStartArgs.resume, false);
});

test('home resumes activeRun with the same id even when belly is empty', async () => {
  const activeRun = { runId: 'run-home-resume', checkpoint: { wave: 6 } };
  const harness = createHomeHarness({ belly: 0, activeRun });
  await harness.clickStart();

  assert.deepEqual(harness.events, ['prepare', 'startRun', 'show:game', 'game.start']);
  assert.equal(harness.durableSave.belly, 0);
  assert.equal(harness.directSaveCalls, 0);
  assert.equal(harness.context.gameStartArgs.runId, activeRun.runId);
  assert.equal(harness.context.gameStartArgs.activeRun.checkpoint.wave, 6);
  assert.equal(harness.context.gameStartArgs.resume, true);
});

test('home reports snack success only after the recovered belly is persisted', () => {
  const failed = createHomeHarness({ belly: 2, directSaveFailure: true });
  failed.elements.snackBtn.onclick();
  assert.equal(failed.durableSave.belly, 2);
  assert.match(failed.elements.homeNotice.textContent, /保存できませんでした/);
  assert.equal(failed.elements.homeLine.textContent, '');

  const saved = createHomeHarness({ belly: 2 });
  saved.elements.snackBtn.onclick();
  assert.equal(saved.durableSave.belly, 3);
  assert.match(saved.elements.homeNotice.textContent, /もぐもぐ/);
});

test('home does not consume belly or enter game when preparation or save fails', async t => {
  await t.test('battle preparation failure', async () => {
    const harness = createHomeHarness({ belly: 2, prepareFailure: true });
    await harness.clickStart();
    assert.deepEqual(harness.events, ['prepare']);
    assert.equal(harness.durableSave.belly, 2);
    assert.equal(harness.elements.homeLine.textContent, '');
    assert.equal(harness.loading.visible, true);
    assert.equal(harness.loading.hideCalls, 0);
    assert.equal(harness.elements.adventureLoading.dataset.state, 'error');
    assert.equal(harness.elements.adventureLoading.attributes['aria-busy'], 'false');
    assert.equal(harness.elements.adventureLoadingActions.hidden, false);
    assert.match(harness.elements.adventureLoadingStatus.textContent, /準備に失敗/);
    assert.equal(harness.elements.startBtn.disabled, false);
  });

  await t.test('startRun persistence failure', async () => {
    const harness = createHomeHarness({ belly: 2, startFailure: 'save-failed' });
    await harness.clickStart();
    assert.deepEqual(harness.events, ['prepare', 'startRun']);
    assert.equal(harness.durableSave.belly, 2);
    assert.equal(harness.elements.homeLine.textContent, '');
    assert.equal(harness.loading.visible, true);
    assert.equal(harness.loading.hideCalls, 0);
    assert.equal(harness.elements.adventureLoadingActions.hidden, false);
    assert.match(harness.elements.adventureLoadingStatus.textContent, /保存できませんでした/);
  });
});

test('home keeps renderer start failure visible until the user chooses recovery', async () => {
  const harness = createHomeHarness({ belly: 2, gameStartThrow: true });
  await harness.clickStart();

  assert.deepEqual(harness.events, ['prepare', 'startRun', 'show:game', 'game.start', 'show:home']);
  assert.equal(harness.loading.visible, true);
  assert.equal(harness.loading.hideCalls, 0);
  assert.equal(harness.elements.adventureLoadingActions.hidden, false);
  assert.equal(harness.elements.homeLine.textContent, '');
  assert.match(harness.elements.adventureLoadingStatus.textContent, /準備に失敗/);
});

test('home keeps a blocking loading surface through prepare and renderer start and ignores double taps', async () => {
  let releasePrepare;
  let releaseGameStart;
  const prepareGate = new Promise(resolve => { releasePrepare = resolve; });
  const gameStartGate = new Promise(resolve => { releaseGameStart = resolve; });
  const harness = createHomeHarness({ belly: 2, prepareGate, gameStartGate });

  const pending = harness.clickStart();
  const duplicate = harness.clickStart();
  await Promise.resolve();

  assert.equal(harness.loading.visible, true);
  assert.equal(harness.loading.showCalls, 1);
  assert.equal(harness.elements.startBtn.disabled, true);
  assert.deepEqual(harness.events, ['prepare']);

  releasePrepare({ ok: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(harness.events, ['prepare', 'startRun', 'show:game', 'game.start']);
  assert.equal(harness.loading.visible, true, 'loading remains until the asynchronous renderer is ready');
  assert.match(harness.loading.messages.at(-1), /入口/);

  releaseGameStart(true);
  await Promise.all([pending, duplicate]);
  assert.equal(harness.loading.visible, false);
  assert.equal(harness.loading.hideCalls, 1);
  assert.equal(harness.loading.restoreFocus, false);
  assert.equal(harness.elements.startBtn.disabled, false);
  assert.equal(harness.events.filter(event => event === 'prepare').length, 1);
  assert.equal(harness.events.filter(event => event === 'startRun').length, 1);
  assert.equal(harness.events.filter(event => event === 'game.start').length, 1);
});
