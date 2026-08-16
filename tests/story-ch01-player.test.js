'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'js/story-ch01-player.js'), 'utf8');
const CONTRACT = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/animations/story-ch01.json'), 'utf8'));

class FakeTarget {
  constructor(){ this.listeners = new Map(); }
  addEventListener(type, listener){
    const list = this.listeners.get(type) || [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  removeEventListener(type, listener){
    this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== listener));
  }
  dispatch(type, detail = {}){
    const event = { type, currentTarget:this, target:this, preventDefault(){}, ...detail };
    for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
  }
}

class FakeClassList {
  constructor(values = []){ this.values = new Set(values); }
  add(...values){ values.forEach(value => this.values.add(value)); }
  remove(...values){ values.forEach(value => this.values.delete(value)); }
  contains(value){ return this.values.has(value); }
  toggle(value, force){
    const active = force == null ? !this.values.has(value) : Boolean(force);
    if (active) this.values.add(value); else this.values.delete(value);
    return active;
  }
}

class FakeElement extends FakeTarget {
  constructor(id, document){
    super();
    this.id = id;
    this.ownerDocument = document;
    this.classList = new FakeClassList();
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.children = [];
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
    this.width = 0;
    this.height = 0;
    this.small = { textContent:'' };
  }
  setAttribute(name, value){ this.attributes[name] = String(value); }
  removeAttribute(name){ delete this.attributes[name]; }
  focus(){ this.ownerDocument.activeElement = this; }
  querySelector(selector){ return selector === 'small' ? this.small : null; }
  querySelectorAll(selector){ return selector === 'i' ? this.children : []; }
  getBoundingClientRect(){ return { width:390, height:844 }; }
  setPointerCapture(){}
}

function canvasContext(){
  return {
    globalAlpha:1,
    globalCompositeOperation:'source-over',
    fillStyle:'', strokeStyle:'', lineWidth:1, shadowColor:'', shadowBlur:0,
    setTransform(){}, fillRect(){}, drawImage(){}, save(){}, restore(){}, translate(){}, scale(){}, rotate(){},
    beginPath(){}, arc(){}, fill(){}, stroke(){}, moveTo(){}, lineTo(){}, bezierCurveTo(){},
    createRadialGradient(){ return { addColorStop(){} }; }
  };
}

function clone(value){ return JSON.parse(JSON.stringify(value)); }

function createHarness(options = {}){
  const document = new FakeTarget();
  document.hidden = false;
  document.visibilityState = 'visible';
  document.activeElement = null;
  const ids = [
    'storyChapter01','storyChapter01Canvas','storyChapter01Close','storyChapter01Loading','storyChapter01LoadingText',
    'storyChapter01Count','storyChapter01Eyebrow','storyChapter01SceneTitle','storyChapter01SceneText','storyChapter01Steps',
    'storyChapter01Pause','storyChapter01Hold','storyChapter01HoldTrack','storyChapter01HoldProgress',
    'storyChapter01HoldAlternative','storyChapter01Next','storyChapter01Status',
    'storyBtn','startBtn','homeNotice','home','game'
  ];
  const elements = Object.fromEntries(ids.map(id => [id, new FakeElement(id, document)]));
  elements.storyChapter01.classList.add('screen');
  elements.home.classList.add('screen', 'active');
  elements.game.classList.add('screen');
  elements.storyChapter01Steps.children = Array.from({ length:4 }, (_, index) => new FakeElement(`step-${index}`, document));
  const context2d = canvasContext();
  elements.storyChapter01Canvas.getContext = () => context2d;
  document.getElementById = id => elements[id] || null;
  document.querySelectorAll = selector => selector === '.screen'
    ? [elements.home, elements.storyChapter01, elements.game]
    : [];

  let clock = 0;
  let rafId = 0;
  const rafs = new Map();
  const windowTarget = new FakeTarget();
  const loadedPacks = [];
  const loadedPackOptions = [];
  const releasedPacks = [];
  const deferredPacks = new Map();
  let saveData = {
    belly:3, runs:[{ runId:'historic-normal-run' }], meta:{ coins:17 },
    story:{
      entryMode:'new', currentNodeId:options.currentNodeId || 'c1_available', completedChapterIds:options.completed ? ['c1'] : [],
      transitionIds:[], replayUnlockIds:[], knowledgeFlags:[], worldFlags:{}
    }
  };
  const completionNodes = [];
  const transitionCalls = [];
  let investigationCalls = 0;
  let saveWrites = 0;
  let recordTransitionFailures = Number(options.failRecordTransitionCount) || 0;
  const imageObject = { naturalWidth:512, naturalHeight:512, width:512, height:512 };

  const context = {
    console:{ log(){}, warn(){}, error(){} },
    AbortController, Date, Math, JSON, Map, Set, Promise,
    document,
    performance:{ now:() => clock },
    location:{ hostname:options.hostname || 'example.test' },
    devicePixelRatio:3,
    innerWidth:390,
    innerHeight:844,
    requestAnimationFrame(callback){ const id = ++rafId; rafs.set(id, callback); return id; },
    cancelAnimationFrame(id){ rafs.delete(id); },
    matchMedia(){ return { matches:Boolean(options.reducedMotion) }; },
    ResizeObserver:class { observe(){} disconnect(){} }
  };
  context.window = context;
  context.addEventListener = windowTarget.addEventListener.bind(windowTarget);
  context.removeEventListener = windowTarget.removeEventListener.bind(windowTarget);
  context.dispatchWindow = windowTarget.dispatch.bind(windowTarget);
  context.MoguriaUI = {
    show(id){
      document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
      elements[id]?.classList.add('active');
    }
  };
  context.MoguriaAssets = {
    async loadPack(packId, loadOptions = {}){
      loadedPacks.push(packId);
      loadedPackOptions.push({ packId, options:loadOptions });
      if (options.deferPack === packId) {
        return new Promise(resolve => deferredPacks.set(packId, resolve));
      }
      return options.failPack === packId ? { ok:false, packId } : { ok:true, packId };
    },
    releasePack(packId){ releasedPacks.push(packId); return { ok:true, packId }; },
    getJson(id){ return id === 'story_ch01_animation_manifest' ? CONTRACT : null; },
    getImage(){ return imageObject; }
  };
  context.MoguriaSave = {
    load(){ return clone(saveData); },
    save(data){ saveWrites += 1; saveData = clone(data); return { ok:true, data:clone(saveData) }; },
    updateStory(patch){
      saveWrites += 1;
      saveData.story = { ...saveData.story, ...clone(patch) };
      return { ok:true, story:clone(saveData.story), data:clone(saveData) };
    },
    transitionStory(nextNodeId, patch){
      transitionCalls.push({ from:saveData.story.currentNodeId, to:nextNodeId });
      if (nextNodeId === 'c1_record_signal' && recordTransitionFailures > 0) {
        recordTransitionFailures -= 1;
        return { ok:false, reason:'storage-write-failed' };
      }
      saveWrites += 1;
      saveData.story = { ...saveData.story, ...clone(patch), currentNodeId:nextNodeId };
      return { ok:true, story:clone(saveData.story), data:clone(saveData) };
    },
    completeStoryChapter(){
      completionNodes.push(saveData.story.currentNodeId);
      if (saveData.story.currentNodeId === 'c1_complete') return { ok:true, alreadyCompleted:true, data:clone(saveData) };
      if (saveData.story.currentNodeId !== 'c1_record_signal') return { ok:false, reason:'story-node-mismatch' };
      saveData.story.currentNodeId = 'c1_complete';
      saveData.story.completedChapterIds = ['c1'];
      saveWrites += 1;
      return { ok:true, data:clone(saveData) };
    }
  };
  context.MoguriaHome = {
    async beginStoryInvestigation(){
      investigationCalls += 1;
      return options.investigationFailure ? { ok:false, reason:'test' } : { ok:true, profileId:'story-c1-investigation-v1' };
    }
  };

  vm.createContext(context);
  vm.runInContext(SOURCE, context, { filename:'js/story-ch01-player.js' });

  function step(milliseconds = 100){
    clock += milliseconds;
    const pending = [...rafs.values()];
    rafs.clear();
    pending.forEach(callback => callback(clock));
  }
  function advance(milliseconds){
    const count = Math.ceil(milliseconds / 100);
    for (let index = 0; index < count; index += 1) step(Math.min(100, milliseconds - index * 100));
  }
  async function flush(){
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  }

  return {
    context, document, elements, loadedPacks, loadedPackOptions, releasedPacks, completionNodes, transitionCalls, step, advance, flush,
    resolvePack(packId, result = { ok:true, packId }){ deferredPacks.get(packId)?.(result); deferredPacks.delete(packId); },
    get saveWrites(){ return saveWrites; },
    get investigationCalls(){ return investigationCalls; },
    get saveData(){ return clone(saveData); }
  };
}

test('player lazy-loads each scene, enforces the deliberate hold, and cleans up for the story run', async () => {
  const harness = createHarness();
  const player = harness.context.MoguriaStoryChapter01;

  await player.open({ trigger:harness.elements.startBtn, currentNodeId:'c1_available' });
  assert.deepEqual(harness.loadedPacks, ['story-ch01-core', 'story-ch01-return-hall']);
  assert.equal(player.getHealth().sceneId, 'return-light');
  assert.equal(player.getHealth().dpr, 2, 'Canvas backing resolution is capped at 2x DPR');
  assert.equal(harness.elements.storyChapter01.classList.contains('active'), true);

  harness.advance(5400);
  assert.equal(harness.elements.storyChapter01Next.hidden, false);
  harness.elements.storyChapter01Next.dispatch('click');
  await harness.flush();
  assert.equal(player.getHealth().sceneId, 'reverse-rescue');
  assert.equal(harness.elements.storyChapter01Close.disabled, true, 'rescue cannot be cut mid-sequence');
  assert.equal((await player.close()).reason, 'scene-noninterruptible');
  assert.equal(player.getHealth().open, true);

  harness.advance(6400);
  assert.equal(harness.elements.storyChapter01Close.disabled, false);
  harness.elements.storyChapter01Next.dispatch('click');
  await harness.flush();
  assert.equal(player.getHealth().sceneId, 'fragment-chamber');
  assert.ok(harness.loadedPacks.includes('story-ch01-fragment-chamber'));
  assert.ok(harness.releasedPacks.includes('story-ch01-return-hall'));

  harness.advance(700);
  assert.equal(harness.elements.storyChapter01Hold.hidden, false);
  harness.elements.storyChapter01Hold.dispatch('pointerdown', { pointerId:7 });
  harness.advance(400);
  harness.elements.storyChapter01Hold.dispatch('pointerup', { pointerId:7 });
  assert.equal(player.getHealth().holdCommitted, false, 'releasing early resets without failure');
  assert.equal(harness.elements.storyChapter01HoldTrack.attributes['aria-valuenow'], '0');

  harness.elements.storyChapter01Hold.dispatch('keydown', { key:' ', repeat:false });
  harness.advance(900);
  assert.equal(player.getHealth().holdCommitted, true);
  assert.equal(harness.elements.storyChapter01Close.disabled, true, 'post-commit sequence is noninterruptible');
  harness.elements.storyChapter01Hold.dispatch('keyup', { key:' ' });
  harness.advance(5300);
  assert.equal(player.getHealth().completed, true);
  assert.equal(harness.saveData.story.currentNodeId, 'c1_investigation_ready');
  assert.deepEqual(harness.transitionCalls, [
    { from:'c1_available', to:'c1_seat' },
    { from:'c1_seat', to:'c1_return_lamp' },
    { from:'c1_return_lamp', to:'c1_shard' },
    { from:'c1_shard', to:'c1_investigation_ready' }
  ]);

  harness.elements.storyChapter01Next.dispatch('click');
  await harness.flush();
  assert.equal(player.getHealth().open, false);
  assert.ok(harness.releasedPacks.includes('story-ch01-fragment-chamber'));
  assert.ok(harness.releasedPacks.includes('story-ch01-core'));
});

test('resumeAfterRun opens the ledger at record_signal and completes only after silence', async () => {
  const harness = createHarness({ currentNodeId:'c1_return_pending' });
  const player = harness.context.MoguriaStoryChapter01;

  await player.resumeAfterRun({
    run:{ profileId:'story-c1-investigation-v1' },
    settlement:{ data:{ story:{ currentNodeId:'c1_return_pending' } } }
  });
  assert.equal(player.getHealth().sceneId, 'archive-ledger');
  assert.equal(harness.saveData.story.currentNodeId, 'c1_record_signal');
  assert.deepEqual(harness.transitionCalls, [{ from:'c1_return_pending', to:'c1_record_signal' }]);
  assert.equal(harness.elements.storyChapter01Close.disabled, true);
  assert.deepEqual(harness.completionNodes, []);

  harness.advance(5300);
  assert.equal(harness.saveData.story.currentNodeId, 'c1_record_signal');
  harness.advance(100);
  assert.deepEqual(harness.completionNodes, ['c1_record_signal']);
  assert.equal(harness.saveData.story.currentNodeId, 'c1_complete');
  assert.equal(player.getHealth().completed, true);
  assert.equal(harness.elements.storyChapter01Close.disabled, false);
});

test('a failed pending-to-record write is retried before ledger completion', async () => {
  const harness = createHarness({ currentNodeId:'c1_return_pending', failRecordTransitionCount:2 });
  const player = harness.context.MoguriaStoryChapter01;
  await player.resumeAfterRun({ run:{ profileId:'story-c1-investigation-v1' } });
  assert.equal(harness.saveData.story.currentNodeId, 'c1_return_pending', 'entry failure cannot pretend the record boundary was saved');

  harness.advance(5400);
  assert.equal(player.getHealth().completionBlocked, true);
  assert.equal(harness.saveData.story.currentNodeId, 'c1_return_pending');
  harness.elements.storyChapter01Next.dispatch('click');
  await harness.flush();
  assert.equal(harness.saveData.story.currentNodeId, 'c1_complete');
  assert.equal(player.getHealth().open, false);
  assert.equal(harness.transitionCalls.filter(call => call.to === 'c1_record_signal').length, 3);
});

test('a duplicate post-run handoff after chapter completion becomes a no-write replay', async () => {
  const harness = createHarness({ currentNodeId:'c1_complete', completed:true });
  const player = harness.context.MoguriaStoryChapter01;
  const before = JSON.stringify(harness.saveData);
  await player.resumeAfterRun({
    run:{ profileId:'story-c1-investigation-v1' },
    settlement:{ data:{ story:{ currentNodeId:'c1_return_pending' } } }
  });
  assert.equal(player.getHealth().sceneId, 'archive-ledger');
  assert.equal(player.getHealth().replay, true);
  harness.advance(5400);
  harness.elements.storyChapter01Next.dispatch('click');
  await harness.flush();
  assert.equal(harness.saveWrites, 0);
  assert.equal(JSON.stringify(harness.saveData), before);
});

test('saved scene nodes resume at their next safe scene boundary', async () => {
  const rescue = createHarness({ currentNodeId:'c1_return_lamp' });
  await rescue.context.MoguriaStoryChapter01.open({ currentNodeId:'c1_return_lamp' });
  assert.equal(rescue.context.MoguriaStoryChapter01.getHealth().sceneId, 'reverse-rescue');
  await rescue.context.MoguriaStoryChapter01.close();

  const fragment = createHarness({ currentNodeId:'c1_shard' });
  await fragment.context.MoguriaStoryChapter01.open({ currentNodeId:'c1_shard' });
  assert.equal(fragment.context.MoguriaStoryChapter01.getHealth().sceneId, 'fragment-chamber');

  const ready = createHarness({ currentNodeId:'c1_investigation_ready' });
  await ready.context.MoguriaStoryChapter01.open({ currentNodeId:'c1_investigation_ready' });
  assert.equal(ready.context.MoguriaStoryChapter01.getHealth().sceneId, 'fragment-chamber');
  assert.equal(ready.context.MoguriaStoryChapter01.getHealth().completed, true);
  assert.equal(ready.context.MoguriaStoryChapter01.getHealth().holdCommitted, true);
  assert.equal(ready.elements.storyChapter01Next.hidden, false);
  assert.equal(ready.saveData.story.currentNodeId, 'c1_investigation_ready', 'boundary reopen cannot regress to the hold');
});

test('pause, document-hidden, reduced-motion, and duplicate-open preserve logical time', async () => {
  const harness = createHarness({ reducedMotion:true });
  const player = harness.context.MoguriaStoryChapter01;
  const first = await player.open({ currentNodeId:'c1_available' });
  const duplicate = await player.open({ currentNodeId:'c1_available' });
  assert.equal(first.ok, true);
  assert.equal(duplicate.reused, true);
  assert.equal(player.getHealth().reducedMotion, true);

  harness.advance(500);
  const beforePause = player.getHealth().sceneTimeMs;
  player.pause();
  assert.equal(harness.elements.storyChapter01Pause.attributes['aria-pressed'], 'true');
  assert.equal(harness.elements.storyChapter01Pause.small.textContent, '再開');
  harness.advance(1000);
  assert.equal(player.getHealth().sceneTimeMs, beforePause);
  player.resume();
  assert.equal(harness.elements.storyChapter01Pause.attributes['aria-pressed'], 'false');
  harness.advance(100);
  assert.equal(player.getHealth().sceneTimeMs, beforePause + 100);

  harness.document.hidden = true;
  harness.document.visibilityState = 'hidden';
  harness.document.dispatch('visibilitychange');
  const beforeHidden = player.getHealth().sceneTimeMs;
  harness.advance(1000);
  assert.equal(player.getHealth().sceneTimeMs, beforeHidden);
  harness.document.hidden = false;
  harness.document.visibilityState = 'visible';
  harness.document.dispatch('visibilitychange');
  harness.advance(100);
  assert.equal(player.getHealth().sceneTimeMs, beforeHidden + 100);
});

test('rescue poses never precede their normal or reduced-motion causal markers', async () => {
  for (const reducedMotion of [false, true]) {
    const harness = createHarness({ hostname:'127.0.0.1', reducedMotion, currentNodeId:'c1_return_lamp' });
    const player = harness.context.MoguriaStoryChapter01;
    await player.open({ currentNodeId:'c1_return_lamp' });
    const poseAt = async sceneTimeMs => {
      await player.seekForVerification({ sceneIndex:1, sceneTimeMs });
      return player.getVerification().semanticPoses;
    };
    assert.notEqual((await poseAt(2549)).youngMogu, 'caught');
    assert.equal((await poseAt(2550)).youngMogu, 'caught');
    assert.equal((await poseAt(3099)).starGuardianCandidate, 'watch');
    assert.equal((await poseAt(3100)).starGuardianCandidate, 'commit');
    assert.notEqual((await poseAt(3649)).starGuardianCandidate, 'contact');
    assert.equal((await poseAt(3650)).starGuardianCandidate, 'contact');
  }
});

test('fragment poses preserve lamp, stumble, companion, and masking-smile order in normal and reduced motion', async () => {
  const normal = createHarness({ hostname:'127.0.0.1', currentNodeId:'c1_shard' });
  const normalPlayer = normal.context.MoguriaStoryChapter01;
  await normalPlayer.open({ currentNodeId:'c1_shard' });
  const normalPoseAt = async postTimeMs => {
    await normalPlayer.seekForVerification({ sceneIndex:2, sceneTimeMs:700, postTimeMs, holdCommitted:true });
    return normalPlayer.getVerification().semanticPoses;
  };
  assert.equal((await normalPoseAt(1499)).currentMogu, 'consumed');
  assert.equal((await normalPoseAt(1500)).currentMogu, 'bodyInterference');
  assert.equal((await normalPoseAt(2149)).currentMogu, 'bodyInterference');
  assert.equal((await normalPoseAt(2150)).currentMogu, 'stumble');
  assert.equal((await normalPoseAt(2449)).starCompanion, 'worry');
  assert.equal((await normalPoseAt(2450)).starCompanion, 'approach');
  assert.equal((await normalPoseAt(2999)).starCompanion, 'approach');
  assert.equal((await normalPoseAt(3000)).starCompanion, 'concern');
  assert.equal((await normalPoseAt(3749)).currentMogu, 'stumble');
  assert.equal((await normalPoseAt(3750)).currentMogu, 'maskingSmile');

  const reduced = createHarness({ hostname:'127.0.0.1', reducedMotion:true, currentNodeId:'c1_shard' });
  const reducedPlayer = reduced.context.MoguriaStoryChapter01;
  await reducedPlayer.open({ currentNodeId:'c1_shard' });
  const reducedPoseAt = async postTimeMs => {
    await reducedPlayer.seekForVerification({ sceneIndex:2, sceneTimeMs:700, postTimeMs, holdCommitted:true });
    return reducedPlayer.getVerification().semanticPoses;
  };
  assert.equal((await reducedPoseAt(1049)).currentMogu, 'reach');
  assert.equal((await reducedPoseAt(1050)).currentMogu, 'consumed');
  assert.equal((await reducedPoseAt(2449)).starCompanion, 'worry');
  assert.equal((await reducedPoseAt(2450)).currentMogu, 'stumble');
  assert.equal((await reducedPoseAt(2450)).starCompanion, 'concern');
  assert.equal((await reducedPoseAt(3749)).currentMogu, 'stumble');
  assert.equal((await reducedPoseAt(3750)).currentMogu, 'maskingSmile');
  assert.equal((await reducedPoseAt(3750)).starCompanion, 'stayNear');
});

test('the completed return light holds its one-time unstable recovery instead of looping', async () => {
  const harness = createHarness();
  const player = harness.context.MoguriaStoryChapter01;
  await player.open({ currentNodeId:'c1_available' });
  harness.advance(5400);
  const terminal = player.getHealth().sceneTimeMs;
  assert.equal(player.getHealth().completed, true);
  harness.advance(2000);
  assert.equal(player.getHealth().sceneTimeMs, terminal);
});

test('visibility loss and window blur cancel an in-progress hold without committing it', async () => {
  const harness = createHarness({ currentNodeId:'c1_shard' });
  const player = harness.context.MoguriaStoryChapter01;
  await player.open({ currentNodeId:'c1_shard' });
  harness.advance(700);

  harness.elements.storyChapter01Hold.dispatch('pointerdown', { pointerId:4 });
  harness.advance(400);
  assert.equal(player.getHealth().holding, true);
  harness.context.dispatchWindow('blur');
  assert.equal(player.getHealth().holding, false);
  assert.equal(harness.elements.storyChapter01HoldTrack.attributes['aria-valuenow'], '0');

  harness.elements.storyChapter01Hold.dispatch('keydown', { key:'Enter', repeat:false });
  harness.advance(400);
  harness.document.hidden = true;
  harness.document.visibilityState = 'hidden';
  harness.document.dispatch('visibilitychange');
  assert.equal(player.getHealth().holding, false);
  assert.equal(player.getHealth().holdCommitted, false);
});

test('explicit pause freezes an active hold while release, blur, and hiding still cancel safely', async () => {
  const harness = createHarness({ currentNodeId:'c1_shard' });
  const player = harness.context.MoguriaStoryChapter01;
  await player.open({ currentNodeId:'c1_shard' });
  harness.advance(700);
  harness.elements.storyChapter01Hold.dispatch('pointerdown', { pointerId:9 });
  harness.advance(300);
  const progressBeforePause = harness.elements.storyChapter01HoldTrack.attributes['aria-valuenow'];
  player.pause();
  harness.advance(1000);
  assert.equal(player.getHealth().holding, true);
  assert.equal(harness.elements.storyChapter01HoldTrack.attributes['aria-valuenow'], progressBeforePause);
  harness.elements.storyChapter01Hold.dispatch('pointerup', { pointerId:9 });
  assert.equal(player.getHealth().holding, false);
  assert.equal(harness.elements.storyChapter01HoldTrack.attributes['aria-valuenow'], '0');
});

test('closing while paused resets playback and pause controls before the next open', async () => {
  const harness = createHarness();
  const player = harness.context.MoguriaStoryChapter01;
  await player.open({ currentNodeId:'c1_available' });
  player.pause();
  await player.close();
  assert.equal(harness.elements.storyChapter01Pause.attributes['aria-pressed'], 'false');
  assert.equal(harness.elements.storyChapter01Pause.small.textContent, '止める');

  await player.open({ currentNodeId:'c1_available' });
  const before = player.getHealth().sceneTimeMs;
  harness.advance(100);
  assert.equal(player.getHealth().sceneTimeMs, before + 100);
});

test('the modal traps keyboard focus and moves noninterruptible scenes off hidden Home controls', async () => {
  const harness = createHarness({ currentNodeId:'c1_return_lamp' });
  const player = harness.context.MoguriaStoryChapter01;
  harness.document.activeElement = harness.elements.storyBtn;
  await player.open({ trigger:harness.elements.storyBtn, currentNodeId:'c1_return_lamp' });
  assert.equal(harness.document.activeElement, harness.elements.storyChapter01);
  assert.match(harness.elements.storyChapter01Status.textContent, /逆流と救助/);

  harness.document.dispatch('keydown', { key:'Tab', shiftKey:false });
  assert.equal(harness.document.activeElement, harness.elements.storyChapter01Pause);
  harness.document.dispatch('keydown', { key:'Escape' });
  await harness.flush();
  assert.equal(player.getHealth().open, true, 'Escape cannot cut a noninterruptible rescue');
});

test('verification seek is localhost-only and never writes narrative progress', async () => {
  const publicHarness = createHarness({ hostname:'moguria-dev.github.io' });
  assert.equal(publicHarness.context.MoguriaStoryChapter01.seekForVerification, undefined);
  assert.equal(publicHarness.context.MoguriaStoryChapter01.getVerification, undefined);

  const local = createHarness({ hostname:'127.0.0.1' });
  const player = local.context.MoguriaStoryChapter01;
  await player.open({ currentNodeId:'c1_available' });
  const nodeBefore = local.saveData.story.currentNodeId;
  const result = await player.seekForVerification({ sceneIndex:3, sceneTimeMs:2670, completed:false });
  assert.equal(result.ok, true);
  assert.equal(result.sceneId, 'archive-ledger');
  assert.equal(result.sceneTimeMs, 2670);
  assert.equal(local.saveData.story.currentNodeId, nodeBefore, 'verification seek cannot persist story progress');
  assert.equal(player.getVerification().logicalViewport.width, 390);
  assert.equal(player.getVerification().logicalViewport.height, 844);
});

test('a lazy scene load failure releases story assets and returns to Home', async () => {
  const harness = createHarness({ failPack:'story-ch01-return-hall' });
  await assert.rejects(
    harness.context.MoguriaStoryChapter01.open({ trigger:harness.elements.storyBtn, currentNodeId:'c1_available' }),
    /scene pack failed/
  );
  assert.equal(harness.context.MoguriaStoryChapter01.getHealth().open, false);
  assert.equal(harness.elements.home.classList.contains('active'), true);
  assert.ok(harness.releasedPacks.includes('story-ch01-core'));
});

test('a later scene load failure and a double Next press recover without stranding the fullscreen player', async () => {
  const failing = createHarness({ failPack:'story-ch01-fragment-chamber' });
  const failedPlayer = failing.context.MoguriaStoryChapter01;
  await failedPlayer.open({ currentNodeId:'c1_return_lamp' });
  failing.advance(6400);
  failing.elements.storyChapter01Next.dispatch('click');
  await failing.flush();
  assert.equal(failedPlayer.getHealth().open, false);
  assert.equal(failing.elements.home.classList.contains('active'), true);
  assert.equal(failing.elements.homeNotice.hidden, false);

  const duplicate = createHarness({ currentNodeId:'c1_return_lamp' });
  const duplicatePlayer = duplicate.context.MoguriaStoryChapter01;
  await duplicatePlayer.open({ currentNodeId:'c1_return_lamp' });
  duplicate.advance(6400);
  duplicate.elements.storyChapter01Next.dispatch('click');
  duplicate.elements.storyChapter01Next.dispatch('click');
  await duplicate.flush();
  assert.equal(duplicate.loadedPacks.filter(id => id === 'story-ch01-fragment-chamber').length, 1);
  assert.equal(duplicatePlayer.getHealth().sceneId, 'fragment-chamber');
});

test('failed investigation handoff tears down stale state and a later settlement reroutes an already-open player', async () => {
  const failed = createHarness({ currentNodeId:'c1_investigation_ready', investigationFailure:true });
  const failedPlayer = failed.context.MoguriaStoryChapter01;
  await failedPlayer.open({ currentNodeId:'c1_investigation_ready' });
  failed.elements.storyChapter01Next.dispatch('click');
  await failed.flush();
  assert.equal(failedPlayer.getHealth().open, false);
  assert.ok(failed.releasedPacks.includes('story-ch01-core'));

  const stale = createHarness({ currentNodeId:'c1_investigation_ready' });
  const stalePlayer = stale.context.MoguriaStoryChapter01;
  await stalePlayer.open({ currentNodeId:'c1_investigation_ready' });
  stale.context.MoguriaUI.show('home');
  const resumed = await stalePlayer.resumeAfterRun({
    run:{ profileId:'story-c1-investigation-v1' },
    settlement:{ data:{ story:{ currentNodeId:'c1_return_pending' } } }
  });
  assert.equal(resumed.rerouted, true);
  assert.equal(stalePlayer.getHealth().sceneId, 'archive-ledger');
  assert.equal(stale.elements.storyChapter01.classList.contains('active'), true);
});

test('teardown aborts a pending scene pack and releases a pack that resolves after cancellation', async () => {
  const harness = createHarness({ deferPack:'story-ch01-return-hall' });
  const player = harness.context.MoguriaStoryChapter01;
  const opening = player.open({ currentNodeId:'c1_available' });
  await harness.flush();
  const pending = harness.loadedPackOptions.find(entry => entry.packId === 'story-ch01-return-hall');
  assert.ok(pending?.options?.signal);

  await player.close({ force:true });
  assert.equal(pending.options.signal.aborted, true);
  harness.resolvePack('story-ch01-return-hall');
  const result = await opening;
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'cancelled');
  assert.ok(harness.releasedPacks.includes('story-ch01-return-hall'));
  assert.ok(harness.releasedPacks.includes('story-ch01-core'));
});

test('pagehide tears down resources and a normal close restores its trigger focus', async () => {
  const pagehide = createHarness();
  await pagehide.context.MoguriaStoryChapter01.open({ currentNodeId:'c1_available' });
  pagehide.context.dispatchWindow('pagehide', { persisted:false });
  await pagehide.flush();
  assert.equal(pagehide.context.MoguriaStoryChapter01.getHealth().open, false);
  assert.ok(pagehide.releasedPacks.includes('story-ch01-core'));

  const close = createHarness();
  await close.context.MoguriaStoryChapter01.open({ trigger:close.elements.storyBtn, currentNodeId:'c1_available' });
  await close.context.MoguriaStoryChapter01.close();
  close.step(16);
  assert.equal(close.document.activeElement, close.elements.storyBtn);
});

test('bfcache replay restoration keeps replay mode and never turns into a completed-save write', async () => {
  const harness = createHarness({ currentNodeId:'c1_complete', completed:true });
  const player = harness.context.MoguriaStoryChapter01;
  await player.open({ sceneIndex:1, replay:true });
  harness.context.dispatchWindow('pagehide', { persisted:true });
  await harness.flush();
  harness.context.dispatchWindow('pageshow', { persisted:true });
  await harness.flush();
  assert.equal(player.getHealth().open, true);
  assert.equal(player.getHealth().sceneIndex, 1);
  assert.equal(player.getHealth().replay, true);
  assert.equal(harness.saveWrites, 0);
});

test('explicit replay traverses all four scenes without save, run, reward, or chapter mutation', async () => {
  const harness = createHarness({ currentNodeId:'c1_complete', completed:true });
  const player = harness.context.MoguriaStoryChapter01;
  const before = JSON.stringify(harness.saveData);
  await player.open({ currentNodeId:'c1_available', replay:true });
  assert.equal(player.getHealth().replay, true);

  harness.advance(5400);
  harness.elements.storyChapter01Next.dispatch('click');
  await harness.flush();
  harness.advance(6400);
  harness.elements.storyChapter01Next.dispatch('click');
  await harness.flush();
  harness.advance(700);
  harness.elements.storyChapter01HoldAlternative.dispatch('click');
  assert.match(harness.elements.storyChapter01HoldAlternative.textContent, /もう一度/);
  harness.elements.storyChapter01HoldAlternative.dispatch('click');
  harness.advance(5300);
  harness.elements.storyChapter01Next.dispatch('click');
  await harness.flush();
  assert.equal(player.getHealth().sceneId, 'archive-ledger');
  harness.advance(5400);
  harness.elements.storyChapter01Next.dispatch('click');
  await harness.flush();

  assert.equal(player.getHealth().open, false);
  assert.equal(harness.saveWrites, 0);
  assert.equal(harness.investigationCalls, 0);
  assert.deepEqual(harness.completionNodes, []);
  assert.equal(JSON.stringify(harness.saveData), before);
});
