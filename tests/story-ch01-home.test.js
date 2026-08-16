'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'js/home.js'), 'utf8');

class Target {
  constructor(){ this.listeners = new Map(); }
  addEventListener(type, listener){
    const list = this.listeners.get(type) || [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  removeEventListener(type, listener){
    this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== listener));
  }
  dispatch(type, event = {}){ for (const listener of this.listeners.get(type) || []) listener({ type, target:this, ...event }); }
}

function element(id){
  const target = new Target();
  return Object.assign(target, {
    id, textContent:'', hidden:false, disabled:false, dataset:{}, style:{}, attributes:{},
    label:{ textContent:'' }, sub:{ textContent:'' },
    classList:{ add(){}, remove(){}, contains(){ return false; } },
    setAttribute(name, value){ this.attributes[name] = String(value); },
    focus(){}, remove(){ this.parentNode?.removeChild?.(this); },
    querySelector(selector){ return selector === 'b' ? this.label : selector === 'small' ? this.sub : null; }
  });
}

function clone(value){ return JSON.parse(JSON.stringify(value)); }

function createHarness(options = {}){
  const ids = [
    'startBtn','storyBtn','snackBtn','dexBtn','logsBtn','equipBtn','gachaBtn','outingBtn','homeMogu',
    'bellyText','bellyBar','coinText','homeNotice','adventureLoading','adventureLoadingActions',
    'adventureLoadingProgress','adventureLoadingHint','adventureLoadingCost','adventureRetryBtn','adventureHomeBtn'
  ];
  const elements = Object.fromEntries(ids.map(id => [id, element(id)]));
  const documentTarget = new Target();
  let dynamicScript = null;
  let dynamicStyle = null;
  let scriptAttempts = 0;
  let styleAttempts = 0;
  const storyOpens = [];
  const storyResumes = [];
  const starts = [];
  const gameStarts = [];
  const shows = [];
  let data = {
    belly:options.belly ?? 3, maxBelly:3, snackAt:0, runs:[], activeRun:options.activeRun || null,
    story:{ entryMode:options.entryMode || 'existing', currentNodeId:options.currentNodeId || 'c1_available', completedChapterIds:[] }
  };
  const context = {
    console:{ log(){}, warn(){}, error(){} },
    Date, Math, JSON, Promise,
    setInterval(){ return 1; }, clearTimeout(){}, setTimeout(callback, delay){ if (delay !== 20000) callback(); return 1; },
    requestAnimationFrame(callback){ callback(); return 1; }
  };
  context.window = context;
  const windowTarget = new Target();
  context.addEventListener = windowTarget.addEventListener.bind(windowTarget);
  context.removeEventListener = windowTarget.removeEventListener.bind(windowTarget);
  context.dispatchWindow = windowTarget.dispatch.bind(windowTarget);
  const document = Object.assign(documentTarget, {
    activeElement:null,
    getElementById:id => elements[id] || null,
    querySelector(selector){
      if (selector === 'script[data-moguria-story-ch01]') return dynamicScript;
      if (selector === 'link[data-moguria-story-ch01-style]') return dynamicStyle;
      if (selector === 'link[data-moguria-story-ch01-style="loaded"]') {
        return dynamicStyle?.dataset?.moguriaStoryCh01Style === 'loaded' ? dynamicStyle : null;
      }
      return null;
    },
    createElement(tag){ const created = element(`dynamic-${tag}`); created.tagName = tag.toUpperCase(); return created; },
    head:{
      appendChild(node){
        node.parentNode = this;
        if (node.tagName === 'LINK') {
          dynamicStyle = node;
          styleAttempts += 1;
          queueMicrotask(() => node.dispatch(options.failFirstStyle && styleAttempts === 1 ? 'error' : 'load'));
          return node;
        }
        dynamicScript = node;
        scriptAttempts += 1;
        queueMicrotask(() => {
          if (options.failFirstScript && scriptAttempts === 1) {
            node.dispatch('error');
            return;
          }
          context.MoguriaStoryChapter01 = {
            async open(args){ storyOpens.push(args); return { ok:true }; },
            async resumeAfterRun(args){ storyResumes.push(args); return { ok:true }; }
          };
          node.dispatch('load');
        });
        return node;
      },
      removeChild(node){
        if (node === dynamicScript) dynamicScript = null;
        if (node === dynamicStyle) dynamicStyle = null;
        node.parentNode = null;
      }
    }
  });
  context.document = document;
  context.MoguriaConfig = { run:{ maxWave:12 } };
  context.MoguriaSave = {
    load(){ return clone(data); },
    applyTimeRecovery(value){ return value; },
    save(value){ data = clone(value); return { ok:true, data:clone(data) }; },
    startRun(args){
      starts.push(clone(args));
      const activeRun = data.activeRun || { runId:'story-or-normal-run', engine:'battle-v3', profileId:args.profileId || 'normal-v1' };
      data.activeRun = activeRun;
      return { ok:true, reused:Boolean(options.activeRun), runId:activeRun.runId, activeRun:clone(activeRun), data:clone(data) };
    }
  };
  context.MoguriaMeta = { load:() => ({ meta:{ coins:0 } }) };
  context.MoguriaBattleV3Loader = { cancelWarmup(){}, async prepare(){ return { ok:true }; } };
  context.MoguriaGame = { start(args){ gameStarts.push(clone(args)); return true; }, getState(){ return { mode:'running' }; } };
  context.MoguriaUI = {
    show(id){ shows.push(id); },
    showAdventureLoading(){}, updateAdventureLoading(){}, hideAdventureLoading(){},
    waitForAdventureLoadingExperience(){ return Promise.resolve(); }
  };
  vm.createContext(context);
  vm.runInContext(SOURCE, context, { filename:'js/home.js' });
  context.MoguriaHome.init();

  async function flush(){ for (let index = 0; index < 12; index += 1) await Promise.resolve(); }
  return {
    context, elements, storyOpens, storyResumes, starts, gameStarts, shows, flush,
    get scriptAttempts(){ return scriptAttempts; },
    get styleAttempts(){ return styleAttempts; },
    get data(){ return clone(data); }
  };
}

test('fresh users get the Chapter 01 primary CTA and open the lazy story player without belly', async () => {
  const harness = createHarness({ entryMode:'new', currentNodeId:'c1_available', belly:0 });
  assert.equal(harness.elements.startBtn.label.textContent, '物語をはじめる');
  assert.equal(harness.elements.startBtn.sub.textContent, '帰り灯の夜');
  assert.equal(harness.elements.startBtn.attributes['aria-label'], '物語をはじめる 帰り灯の夜');

  harness.elements.startBtn.onclick();
  await harness.flush();
  assert.equal(harness.storyOpens.length, 1);
  assert.equal(harness.storyOpens[0].currentNodeId, 'c1_available');
  assert.equal(harness.starts.length, 0, 'opening narrative does not start or charge a battle run');
  assert.match(harness.context.document.querySelector('script[data-moguria-story-ch01]').src, /story-ch01-player\.js\?v=20260816-story-ch01-1$/);
  assert.match(harness.context.document.querySelector('link[data-moguria-story-ch01-style]').href, /moguria-story-ch01\.css\?v=20260816-story-ch01-1$/);
});

test('existing users retain the normal dungeon primary action and activeRun always resumes first', async () => {
  const existing = createHarness({ entryMode:'existing', belly:2 });
  assert.equal(existing.elements.startBtn.label.textContent, 'ダンジョンへ');
  existing.elements.startBtn.onclick();
  await existing.flush();
  assert.equal(existing.starts[0].engine, 'battle-v3');
  assert.equal(existing.gameStarts[0].resume, false);

  const activeRun = { runId:'resume-me', profileId:'normal-v1', checkpoint:{ wave:4 } };
  const resumed = createHarness({ entryMode:'new', belly:0, activeRun });
  assert.equal(resumed.elements.startBtn.label.textContent, '冒険を続ける');
  resumed.elements.startBtn.onclick();
  await resumed.flush();
  assert.deepEqual(resumed.starts[0], { runId:'resume-me' });
  assert.equal(resumed.gameStarts[0].resume, true);
  assert.equal(resumed.storyOpens.length, 0);
});

test('story investigation uses the fixed profile and always restores the loading cost copy', async () => {
  const harness = createHarness({ entryMode:'new', currentNodeId:'c1_investigation_ready', belly:0 });
  const result = await harness.context.MoguriaHome.beginStoryInvestigation(harness.elements.storyBtn);
  assert.equal(result.ok, true);
  assert.equal(harness.starts[0].profileId, 'story-c1-investigation-v1');
  assert.equal(harness.gameStarts[0].profileId, 'story-c1-investigation-v1');
  assert.equal(harness.elements.adventureLoadingCost.textContent, '物語の探索・おなか消費なし');

  const normal = createHarness({ entryMode:'existing', belly:2 });
  normal.elements.startBtn.onclick();
  await normal.flush();
  assert.equal(normal.elements.adventureLoadingCost.textContent, '新しい冒険・おなか 1消費');
});

test('the story side rail continues an investigation-ready node and replays a completed chapter from the beginning', async () => {
  const ready = createHarness({ entryMode:'new', currentNodeId:'c1_investigation_ready', belly:0 });
  ready.elements.storyBtn.onclick();
  await ready.flush();
  assert.equal(ready.starts[0].profileId, 'story-c1-investigation-v1');
  assert.equal(ready.storyOpens.length, 0);

  const replay = createHarness({ entryMode:'existing', currentNodeId:'c1_complete', belly:3 });
  replay.elements.storyBtn.onclick();
  await replay.flush();
  assert.equal(replay.storyOpens[0].currentNodeId, 'c1_available');
  assert.equal(replay.storyOpens[0].replay, true);
  assert.equal(replay.starts.length, 0);
});

test('the always-loaded Home bridge cannot miss a settlement emitted before the story script exists', async () => {
  const harness = createHarness({ entryMode:'new', currentNodeId:'c1_return_pending' });
  const payload = { run:{ profileId:'story-c1-investigation-v1' }, settlement:{ data:{ story:{ currentNodeId:'c1_return_pending' } } } };
  assert.equal(harness.context.MoguriaStoryChapter01, undefined);
  harness.context.dispatchWindow('moguria:story-run-settled', { detail:payload });
  await harness.flush();
  assert.equal(harness.storyResumes.length, 1);
  assert.equal(harness.storyResumes[0].settlement.data.story.currentNodeId, 'c1_return_pending');
});

test('a failed lazy stylesheet tag is removed and a later Home action retries cleanly', async () => {
  const harness = createHarness({ entryMode:'new', currentNodeId:'c1_available', failFirstStyle:true });
  const first = await harness.elements.startBtn.onclick();
  await harness.flush();
  assert.equal(first.ok, false);
  assert.equal(harness.context.document.querySelector('link[data-moguria-story-ch01-style]'), null);
  const second = await harness.elements.startBtn.onclick();
  await harness.flush();
  assert.equal(second.ok, true);
  assert.equal(harness.styleAttempts, 2);
  assert.equal(harness.storyOpens.length, 1);
});

test('a failed lazy player script is removed and retried without keeping a rejected promise', async () => {
  const harness = createHarness({ entryMode:'new', currentNodeId:'c1_available', failFirstScript:true });
  const first = await harness.elements.startBtn.onclick();
  await harness.flush();
  assert.equal(first.ok, false);
  assert.equal(harness.context.document.querySelector('script[data-moguria-story-ch01]'), null);

  const second = await harness.elements.startBtn.onclick();
  await harness.flush();
  assert.equal(second.ok, true);
  assert.equal(harness.scriptAttempts, 2);
  assert.equal(harness.storyOpens.length, 1);
});
