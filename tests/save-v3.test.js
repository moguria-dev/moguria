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

function advanceStoryToInvestigation(save) {
  const steps = [
    ['c1_seat', { worldFlags:{ c1InvitationSeen:true } }],
    ['c1_return_lamp', { knowledgeFlags:['return-light-seen'], replayUnlockIds:['c1-return-lamp'] }],
    ['c1_shard', {}],
    ['c1_investigation_ready', {
      knowledgeFlags:['return-light-seen','shared-lamp-seen','damaged-fragment-seen'],
      replayUnlockIds:['c1-return-lamp','c1-shard'],
      worldFlags:{ c1InvitationSeen:true, c1SharedLampRestored:true }
    }]
  ];
  for (const [node, patch] of steps) {
    const advanced = save.transitionStory(node, patch);
    assert.equal(advanced.ok, true, `story should advance to ${node}`);
  }
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

  assert.equal(migrated.saveVersion, 4);
  assert.equal(migrated.belly, 2);
  assert.equal(migrated.runs[0].floor, 4);
  assert.equal(migrated.dex.skills.mini_mogu, 3);
  assert.equal(migrated.best.damage, 91);
  assert.equal(migrated.meta.coins, 140);
  assert.equal(migrated.meta.inventory[0].uid, 'eq_old');
  assert.equal(migrated.activeRun, null);
  assert.deepEqual(Array.from(migrated.settledRunIds), []);
  assert.equal(migrated.story.entryMode, 'existing');
  assert.equal(migrated.story.currentNodeId, 'c1_available');
});

test('legacy storage key remains readable and is copied to the current key', () => {
  const storage = createStorage({
    'moguria.prototype.save.v1': JSON.stringify(v2Save({ saveVersion: 1, belly: 1 }))
  });
  const { save } = loadSave(storage);
  const migrated = save.load();

  assert.equal(migrated.saveVersion, 4);
  assert.equal(migrated.belly, 1);
  assert.equal(storage.json().saveVersion, 4);
});

test('a first save is new while malformed or future story data repairs only the story area', () => {
  const freshPage = loadSave(createStorage()).save.load();
  assert.equal(freshPage.saveVersion, 4);
  assert.equal(freshPage.story.entryMode, 'new');

  const storage = createStorage({
    'moguria.save.v2': JSON.stringify(v2Save({
      saveVersion: 4,
      belly: 1,
      runs: [{ runId:'kept-run', floor:3 }],
      meta: { ...v2Save().meta, coins: 77 },
      story: { contentVersion:'future-c9', entryMode:'existing', currentNodeId:'unsafe', completedChapterIds:['c1','bad'] }
    }))
  });
  const repaired = loadSave(storage).save.load();
  assert.equal(repaired.belly, 1);
  assert.equal(repaired.meta.coins, 77);
  assert.equal(repaired.runs[0].runId, 'kept-run');
  assert.equal(repaired.story.currentNodeId, 'c1_complete');
  assert.deepEqual(Array.from(repaired.story.completedChapterIds), ['c1']);
  assert.equal(repaired.story.knowledgeFlags.includes('old-record-responded'), true);
  assert.equal(repaired.story.keyItems.purpleScarf, 'story-present-unexplained');

  const corrupt = loadSave(createStorage({ 'moguria.save.v2':'{' })).save.load();
  assert.equal(corrupt.story.entryMode, 'existing', 'a quarantined current-key record must remain an existing-user entry');
  const empty = loadSave(createStorage({ 'moguria.save.v2':'' })).save.load();
  assert.equal(empty.story.entryMode, 'existing', 'an empty corrupt current-key record is still an existing-user entry');
});

test('story transitions are a canonical one-way prefix with idempotent duplicate delivery', () => {
  const storage = createStorage({ 'moguria.save.v2': JSON.stringify(v2Save({
    saveVersion:4,
    story:{
      schemaVersion:1, contentVersion:'c1-v1', entryMode:'existing', currentChapterId:'c1',
      currentNodeId:'c1_seat', completedChapterIds:[], seenEventIds:[],
      transitionIds:['c1-enter-seat','c1-investigation-settled','c1-shard-complete'],
      replayUnlockIds:[], knowledgeFlags:[], worldFlags:{}, keyItems:{}, boundRun:null
    }
  })) });
  const { save } = loadSave(storage);
  const normalized = save.load();
  assert.equal(normalized.story.currentNodeId, 'c1_seat');
  assert.deepEqual(Array.from(normalized.story.transitionIds), ['c1-enter-seat']);

  storage.resetSetCalls();
  const duplicate = save.transitionStory('c1_seat');
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.alreadyApplied, true);
  assert.equal(storage.setCalls, 0);

  const skipped = save.transitionStory('c1_shard');
  assert.equal(skipped.ok, false);
  assert.equal(skipped.reason, 'story-transition-not-allowed');
  assert.equal(storage.setCalls, 0);

  const advanced = save.transitionStory('c1_return_lamp');
  assert.equal(advanced.ok, true);
  assert.equal(storage.setCalls, 1);
  assert.deepEqual(Array.from(advanced.story.transitionIds), ['c1-enter-seat','c1-seat-complete']);

  const reversedStorage = createStorage({ 'moguria.save.v2': JSON.stringify(v2Save({
    saveVersion:4,
    story:{
      schemaVersion:1, contentVersion:'c1-v1', entryMode:'existing', currentChapterId:'c1',
      currentNodeId:'c1_return_lamp', completedChapterIds:[], seenEventIds:[],
      transitionIds:['c1-seat-complete','c1-enter-seat'], replayUnlockIds:[],
      knowledgeFlags:[], worldFlags:{}, keyItems:{}, boundRun:null
    }
  })) });
  const reversed = loadSave(reversedStorage).save.load();
  assert.equal(reversed.story.currentNodeId, 'c1_available');
  assert.deepEqual(Array.from(reversed.story.transitionIds), []);
});

test('generic story updates cannot rewrite structural progression fields', () => {
  const storage = createStorage({ 'moguria.save.v2': JSON.stringify(v2Save({ saveVersion:3 })) });
  const { save } = loadSave(storage);
  const protectedPatches = {
    schemaVersion:99, contentVersion:'future', entryMode:'new', currentChapterId:'c9',
    currentNodeId:'c1_complete', transitionIds:['c1-chapter-complete'],
    completedChapterIds:['c1'], boundRun:{ runId:'forged', profileId:save.STORY_PROFILE_ID }
  };
  for (const [field, value] of Object.entries(protectedPatches)) {
    storage.resetSetCalls();
    const result = save.updateStory({ [field]:value });
    assert.equal(result.ok, false, `${field} must be protected`);
    assert.equal(result.reason, 'protected-story-field');
    assert.equal(result.field, field);
    assert.equal(storage.setCalls, 0);
  }
  const transitionPatch = save.transitionStory('c1_seat', { entryMode:'new' });
  assert.equal(transitionPatch.ok, false);
  assert.equal(transitionPatch.reason, 'protected-story-field');
  assert.equal(storage.setCalls, 0);
});

test('a failed story transition remains retryable and records its ledger entry once', () => {
  const storage = createStorage({ 'moguria.save.v2': JSON.stringify(v2Save({ saveVersion:3 })) });
  const { save } = loadSave(storage);
  storage.setFailure(true);
  const failed = save.transitionStory('c1_seat', { worldFlags:{ c1InvitationSeen:true } });
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'save-failed');
  assert.equal(storage.json().story, undefined);

  storage.setFailure(false);
  storage.resetSetCalls();
  const retried = save.transitionStory('c1_seat', { worldFlags:{ c1InvitationSeen:true } });
  assert.equal(retried.ok, true);
  assert.equal(storage.setCalls, 1);
  assert.deepEqual(Array.from(retried.story.transitionIds), ['c1-enter-seat']);

  storage.resetSetCalls();
  const duplicate = save.transitionStory('c1_seat');
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.alreadyApplied, true);
  assert.equal(storage.setCalls, 0);
});

test('Chapter 1 story run starts atomically for zero belly and binds its story state', () => {
  const storage = createStorage({ 'moguria.save.v2': JSON.stringify(v2Save({ saveVersion:3, belly:0 })) });
  const { save } = loadSave(storage);
  const tooEarly = save.startRun({ profileId:save.STORY_PROFILE_ID, engine:'battle-v3' });
  assert.equal(tooEarly.ok, false);
  assert.equal(tooEarly.reason, 'story-not-ready');
  advanceStoryToInvestigation(save);
  storage.resetSetCalls();
  const started = save.startRun({ profileId:save.STORY_PROFILE_ID, engine:'battle-v3' });
  const persisted = storage.json();

  assert.equal(started.ok, true);
  assert.equal(storage.setCalls, 1);
  assert.equal(persisted.belly, 0);
  assert.equal(persisted.activeRun.profileId, 'story-c1-investigation-v1');
  assert.equal(persisted.story.currentNodeId, 'c1_investigation_active');
  assert.equal(persisted.story.boundRun.runId, started.runId);
});

test('story settlement is one atomic, zero-reward handoff and duplicate delivery is a no-op success', () => {
  const storage = createStorage({ 'moguria.save.v2': JSON.stringify(v2Save({ saveVersion:3, belly:2, meta:{...v2Save().meta,coins:15} })) });
  const { save } = loadSave(storage);
  advanceStoryToInvestigation(save);
  const started = save.startRun({ profileId:save.STORY_PROFILE_ID, engine:'battle-v3' });
  const run = { runId:started.runId, profileId:save.STORY_PROFILE_ID, cleared:true, wave:4, skills:[], artifacts:[], synergies:[], titles:[] };
  storage.resetSetCalls();
  const settled = save.settleRun(run,{coins:999});
  const persisted = storage.json();

  assert.equal(settled.ok, true);
  assert.equal(settled.amount, 0);
  assert.equal(storage.setCalls, 1);
  assert.equal(persisted.meta.coins, 15);
  assert.equal(persisted.activeRun, null);
  assert.equal(persisted.story.boundRun, null);
  assert.equal(persisted.story.currentNodeId, 'c1_return_pending');
  assert.equal(persisted.story.transitionIds.includes('c1-investigation-settled'), true);
  assert.equal(persisted.runs.length, 1);

  storage.resetSetCalls();
  const duplicate = save.settleRun(run,{coins:999});
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.alreadySettled, true);
  assert.equal(storage.setCalls, 0);
  assert.equal(storage.json().runs.length, 1);
  assert.equal(storage.json().meta.coins, 15);

  const normal = save.startRun({ engine:'battle-v3' });
  assert.equal(normal.ok, true);
  storage.resetSetCalls();
  const delayedDuplicate = save.settleRun(run,{coins:999});
  assert.equal(delayedDuplicate.ok, true);
  assert.equal(delayedDuplicate.alreadySettled, true);
  assert.equal(storage.setCalls, 0);
  assert.equal(storage.json().activeRun.runId, normal.runId);
});

test('an incomplete story run cannot settle or advance the chapter', () => {
  const storage = createStorage({ 'moguria.save.v2': JSON.stringify(v2Save({ saveVersion:3, belly:1 })) });
  const { save } = loadSave(storage);
  advanceStoryToInvestigation(save);
  const started = save.startRun({ profileId:save.STORY_PROFILE_ID });
  storage.resetSetCalls();
  const result = save.settleRun({ runId:started.runId, profileId:save.STORY_PROFILE_ID, cleared:false, skills:[], artifacts:[], synergies:[], titles:[] },{coins:30});
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'story-objective-incomplete');
  assert.equal(storage.setCalls, 0);
  assert.equal(storage.json().activeRun.runId, started.runId);
  assert.equal(storage.json().story.currentNodeId, 'c1_investigation_active');
});

test('story settlement rejects a mismatched bound run without changing durable state', () => {
  const storage = createStorage({ 'moguria.save.v2': JSON.stringify(v2Save({ saveVersion:3 })) });
  const { save } = loadSave(storage);
  advanceStoryToInvestigation(save);
  const started = save.startRun({ profileId:save.STORY_PROFILE_ID });
  const corrupted = storage.json();
  corrupted.story.boundRun = { ...corrupted.story.boundRun, runId:'foreign-story-run' };
  storage.setItem('moguria.save.v2', JSON.stringify(corrupted));
  storage.resetSetCalls();
  const result = save.settleRun({
    runId:started.runId, profileId:save.STORY_PROFILE_ID, cleared:true,
    wave:4, skills:[], artifacts:[], synergies:[], titles:[]
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'story-run-mismatch');
  assert.equal(storage.setCalls, 0);
  assert.equal(storage.json().activeRun.runId, started.runId);
});

test('Chapter 1 completion requires both investigation settlement and the old-record response', () => {
  const storage = createStorage({ 'moguria.save.v2': JSON.stringify(v2Save({ saveVersion:3 })) });
  const { save } = loadSave(storage);
  advanceStoryToInvestigation(save);
  const started = save.startRun({ profileId:save.STORY_PROFILE_ID });
  assert.equal(save.settleRun({
    runId:started.runId, profileId:save.STORY_PROFILE_ID, cleared:true,
    wave:4, skills:[], artifacts:[], synergies:[], titles:[]
  }).ok, true);
  assert.equal(save.transitionStory('c1_record_signal').ok, true);

  storage.resetSetCalls();
  const missingKnowledge = save.completeStoryChapter();
  assert.equal(missingKnowledge.ok, false);
  assert.equal(missingKnowledge.reason, 'story-prerequisite-missing');
  assert.equal(storage.setCalls, 0);

  assert.equal(save.updateStory({ knowledgeFlags:['old-record-responded'], worldFlags:{ c1OldRecordResponded:true } }).ok, true);
  storage.resetSetCalls();
  const missingInvestigation = save.completeStoryChapter();
  assert.equal(missingInvestigation.ok, false);
  assert.equal(missingInvestigation.reason, 'story-prerequisite-missing');
  assert.equal(storage.setCalls, 0);
});

test('Chapter 1 completion requires the record boundary and is idempotent', () => {
  const storage = createStorage({ 'moguria.save.v2': JSON.stringify(v2Save({ saveVersion:3 })) });
  const { save } = loadSave(storage);
  advanceStoryToInvestigation(save);
  const started = save.startRun({ profileId:save.STORY_PROFILE_ID });
  assert.equal(save.settleRun({
    runId:started.runId, profileId:save.STORY_PROFILE_ID, cleared:true,
    wave:4, skills:[], artifacts:[], synergies:[], titles:[]
  }).ok, true);
  storage.resetSetCalls();

  const tooEarly = save.completeStoryChapter();
  assert.equal(tooEarly.ok, false);
  assert.equal(tooEarly.reason, 'story-node-mismatch');
  assert.equal(storage.setCalls, 0);

  const protectedUpdate = save.updateStory({ currentNodeId:'c1_record_signal' });
  assert.equal(protectedUpdate.ok, false);
  assert.equal(protectedUpdate.reason, 'protected-story-field');
  const record = save.transitionStory('c1_record_signal', {
    knowledgeFlags:['old-record-responded'],
    worldFlags:{ c1InvestigationComplete:true, c1OldRecordResponded:true }
  });
  assert.equal(record.ok, true);
  storage.resetSetCalls();
  const completed = save.completeStoryChapter();
  assert.equal(completed.ok, true);
  assert.equal(storage.setCalls, 1);
  assert.equal(completed.story.currentNodeId, 'c1_complete');
  assert.deepEqual(Array.from(completed.story.completedChapterIds), ['c1']);
  assert.deepEqual(Array.from(completed.story.replayUnlockIds).sort(), ['c1-seat','c1-return-lamp','c1-shard','c1-record-signal'].sort());
  assert.deepEqual(Array.from(completed.story.knowledgeFlags).sort(), ['return-light-seen','shared-lamp-seen','damaged-fragment-seen','old-record-responded'].sort());
  assert.equal(completed.story.keyItems.purpleScarf, 'story-present-unexplained');
  assert.equal(completed.story.transitionIds.at(-1), 'c1-chapter-complete');

  storage.resetSetCalls();
  const duplicate = save.completeStoryChapter();
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.alreadyCompleted, true);
  assert.equal(storage.setCalls, 0);
});

test('a forged c1_complete node without the completion ledger repairs to a safe boundary', () => {
  const storage = createStorage({
    'moguria.save.v2': JSON.stringify(v2Save({
      saveVersion: 4,
      story: { contentVersion:'c1-v1', entryMode:'existing', currentNodeId:'c1_complete', completedChapterIds:[] }
    }))
  });
  const repaired = loadSave(storage).save.load();
  assert.equal(repaired.story.currentNodeId, 'c1_available');
  assert.deepEqual(Array.from(repaired.story.completedChapterIds), []);
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
    'adventureLoadingHint', 'adventureLoadingProgress', 'adventureLoadingProgressFill',
    'adventureLoadingProgressPercent', 'adventureLoadingActions', 'adventureRetryBtn', 'adventureHomeBtn'
  ].map(id => [id, createElement(id)]));
  elements.adventureLoadingActions.hidden = true;
  const events = [];
  const initialRun = options.activeRun ? clone(options.activeRun) : null;
  let durableSave = v2Save({ belly: options.belly ?? 2, activeRun: initialRun });
  let directSaveCalls = 0;
  const loading = { visible: false, showCalls: 0, hideCalls: 0, messages: [], progress: [], restoreFocus: null, focusTarget: '' };

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
    async prepare(loaderOptions = {}) {
      events.push('prepare');
      loaderOptions.onProgress?.({ percent:0, phase:'scripts' });
      loaderOptions.onProgress?.({ percent:50, phase:'assets' });
      if (options.prepareGate) {
        const result = await options.prepareGate;
        loaderOptions.onProgress?.({ percent:100, phase:'ready' });
        return result;
      }
      loaderOptions.onProgress?.({ percent:100, phase:'ready' });
      return options.prepareFailure ? { ok: false, reason: 'battle-load-failed' } : { ok: true };
    }
  };
  context.MoguriaUI = {
    show(id) { events.push(`show:${id}`); },
    showAdventureLoading(settings = {}) {
      loading.visible = true;
      loading.showCalls += 1;
      if (settings.percent != null) loading.progress.push(Number(settings.percent));
    },
    updateAdventureLoading(messageOrOptions, percent) {
      const settings = messageOrOptions && typeof messageOrOptions === 'object'
        ? messageOrOptions
        : { message:messageOrOptions, percent };
      if (settings.message != null) loading.messages.push(String(settings.message));
      if (settings.percent != null) loading.progress.push(Number(settings.percent));
    },
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
    assert.equal(harness.elements.adventureLoadingProgress.attributes['aria-busy'], 'false');
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
  assert.deepEqual(harness.loading.progress, [2, 2, 2, 44, 86, 86, 86, 90, 95, 100]);
  assert.equal(harness.loading.progress.every((value, index, values) => index === 0 || value >= values[index - 1]), true);
  assert.equal(harness.events.filter(event => event === 'prepare').length, 1);
  assert.equal(harness.events.filter(event => event === 'startRun').length, 1);
  assert.equal(harness.events.filter(event => event === 'game.start').length, 1);
});
