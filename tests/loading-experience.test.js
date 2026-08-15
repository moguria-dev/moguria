'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'js/loading-experience.js'), 'utf8');

function createClock() {
  let current = 0;
  let nextId = 0;
  const timers = new Map();
  return {
    now: () => current,
    setTimeout(handler, delay = 0) {
      const id = ++nextId;
      timers.set(id, { handler, at: current + Math.max(0, Number(delay) || 0) });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    tick(duration) {
      const target = current + Math.max(0, Number(duration) || 0);
      while (true) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
        if (!next) break;
        const [id, timer] = next;
        timers.delete(id);
        current = timer.at;
        timer.handler();
      }
      current = target;
    },
    pendingDelays() {
      return [...timers.values()].map(timer => timer.at - current).sort((a, b) => a - b);
    },
    get size() {
      return timers.size;
    }
  };
}

function createClassList() {
  const values = new Set();
  return {
    add(...names) { names.forEach(name => values.add(name)); },
    remove(...names) { names.forEach(name => values.delete(name)); },
    contains(name) { return values.has(name); }
  };
}

function createElement(name, document, log = []) {
  const attributes = new Map();
  const listeners = new Map();
  let text = '';
  const styleProperties = new Map();
  const node = {
    name,
    disabled: false,
    inert: false,
    isConnected: true,
    classList: createClassList(),
    style: {
      width: '',
      setProperty(key, value) { styleProperties.set(key, String(value)); },
      getPropertyValue(key) { return styleProperties.get(key) || ''; }
    },
    setAttribute(key, value) {
      attributes.set(key, String(value));
      if (key === 'inert') this.inert = true;
      log.push(`${name}:attr:${key}:${String(value)}`);
    },
    getAttribute(key) {
      return attributes.has(key) ? attributes.get(key) : null;
    },
    hasAttribute(key) {
      return attributes.has(key);
    },
    removeAttribute(key) {
      attributes.delete(key);
      if (key === 'inert') this.inert = false;
      log.push(`${name}:remove:${key}`);
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    dispatch(type, event = {}) {
      if (type === 'focus') document.activeElement = this;
      if (type === 'blur' && document.activeElement === this) document.activeElement = null;
      for (const handler of [...(listeners.get(type) || [])]) {
        handler({ type, target: this, stopPropagation() {}, ...event });
      }
    },
    focus() { this.dispatch('focus'); },
    blur() { this.dispatch('blur'); },
    listenerCount(type) { return listeners.get(type)?.size || 0; }
  };
  Object.defineProperty(node, 'textContent', {
    get() { return text; },
    set(value) {
      text = String(value ?? '');
      log.push(`${name}:text:${text}`);
    }
  });
  return node;
}

function createMedia(initial = false) {
  const listeners = new Set();
  return {
    matches: initial,
    addEventListener(type, handler) { if (type === 'change') listeners.add(handler); },
    removeEventListener(type, handler) { if (type === 'change') listeners.delete(handler); },
    addListener(handler) { listeners.add(handler); },
    removeListener(handler) { listeners.delete(handler); },
    set(value) {
      this.matches = Boolean(value);
      for (const handler of [...listeners]) handler({ matches: this.matches });
    },
    get listenerCount() { return listeners.size; }
  };
}

function createHarness(overrides = {}) {
  const clock = createClock();
  const log = [];
  const documentListeners = new Map();
  const document = {
    hidden: false,
    activeElement: null,
    addEventListener(type, handler) {
      if (!documentListeners.has(type)) documentListeners.set(type, new Set());
      documentListeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      documentListeners.get(type)?.delete(handler);
    },
    dispatch(type) {
      for (const handler of [...(documentListeners.get(type) || [])]) handler({ type });
    },
    listenerCount(type) { return documentListeners.get(type)?.size || 0; }
  };
  const media = createMedia(Boolean(overrides.reducedMotion));
  const elements = {
    tipsPanel: createElement('tipsPanel', document, log),
    tipButton: createElement('tipButton', document, log),
    tipText: createElement('tipText', document, log),
    announcement: createElement('announcement', document, log),
    autoToggle: createElement('autoToggle', document, log),
    progressbar: createElement('progressbar', document, log),
    progressFill: createElement('progressFill', document, log),
    progressPercent: createElement('progressPercent', document, log),
    phase: createElement('phase', document, log),
    title: createElement('title', document, log)
  };
  const selectorMap = {
    '[data-loading-tips]': elements.tipsPanel,
    '[data-loading-tip-button]': elements.tipButton,
    '[data-loading-tip-text]': elements.tipText,
    '[data-loading-tip-announcement]': elements.announcement,
    '[data-loading-tip-auto-toggle]': elements.autoToggle,
    '[data-loading-progress]': elements.progressbar,
    '[data-loading-fill]': elements.progressFill,
    '[data-loading-percent]': elements.progressPercent,
    '[data-loading-phase]': elements.phase,
    '[data-loading-title]': elements.title
  };
  const root = createElement('root', document, log);
  root.ownerDocument = document;
  root.querySelector = selector => {
    for (const candidate of String(selector).split(',').map(value => value.trim())) {
      if (selectorMap[candidate]) return selectorMap[candidate];
    }
    return null;
  };

  const context = {
    console: { log() {}, warn() {}, error() {} },
    document,
    Promise,
    Date,
    Math,
    performance: { now: clock.now },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    matchMedia: () => media
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(SOURCE, context, { filename: 'js/loading-experience.js' });

  let randomCalls = 0;
  const random = overrides.random || (() => {
    randomCalls += 1;
    return ((randomCalls * 17) % 97) / 97;
  });
  const hookEvents = [];
  const controller = context.MoguriaLoadingExperience.create(root, {
    scheduler: clock,
    document,
    reduceMotionQuery: media,
    random,
    onArrival: snapshot => hookEvents.push(`arrival:${snapshot.progress}`),
    onContact: snapshot => hookEvents.push(`contact:${snapshot.progress}`),
    onComplete: snapshot => hookEvents.push(`complete:${snapshot.progress}`),
    onAnnounce: (message, meta) => hookEvents.push(`announce:${meta.kind}:${message}`),
    ...overrides.options
  });

  return {
    context,
    api: context.MoguriaLoadingExperience,
    controller,
    root,
    elements,
    document,
    media,
    clock,
    log,
    hookEvents
  };
}

function tipIds(snapshot) {
  return Array.from(snapshot.sessionTips, tip => tip.id);
}

test('the canonical safe pool has 38 unique entries and each controller owns one five-tip session', () => {
  const harness = createHarness();
  const pool = Array.from(harness.api.TIPS);
  assert.equal(pool.length, 38);
  assert.equal(new Set(pool.map(tip => tip.id)).size, 38);
  assert.equal(new Set(pool.map(tip => tip.text)).size, 38);
  assert.equal(pool[0].text, 'ホームは、冒険から帰ってひと休みする場所。');
  assert.equal(pool[37].text, 'ぼうしも服も、冒険を助ける大切な装備。');

  const initialIds = tipIds(harness.controller.getSnapshot());
  assert.equal(initialIds.length, 5);
  assert.equal(new Set(initialIds).size, 5);
  assert.equal(harness.root.moguriaLoadingExperience, harness.controller);
  assert.equal(harness.root.getAttribute('data-tip-pool-size'), '38');
  assert.equal(harness.root.getAttribute('data-tip-selection-size'), '5');

  harness.controller.start({ phase: '準備中' });
  assert.equal(harness.elements.tipText.getAttribute('data-tip-id'), initialIds[0]);
  harness.controller.error('再試行できます');
  harness.controller.start({ phase: 'もう一度準備中' });
  assert.deepEqual(tipIds(harness.controller.getSnapshot()), initialIds, 'retry keeps the same five-tip session');

  const resampledIds = tipIds(harness.controller.resample());
  assert.equal(new Set(resampledIds).size, 5);
  assert.notDeepEqual(resampledIds, initialIds, 'only explicit resample chooses a new five-tip set');
});

test('tips reveal after 1.2 seconds and then switch one at a time every 6 seconds', () => {
  const harness = createHarness();
  harness.controller.start({ phase: '準備中' });
  const first = harness.controller.getSnapshot().currentTip.text;

  assert.equal(harness.elements.tipsPanel.getAttribute('aria-hidden'), 'true');
  assert.equal(harness.elements.tipsPanel.hasAttribute('inert'), true);
  assert.equal(harness.elements.tipButton.disabled, true);
  harness.clock.tick(1199);
  assert.equal(harness.controller.getSnapshot().tipsVisible, false);
  harness.clock.tick(1);
  assert.equal(harness.controller.getSnapshot().tipsVisible, true);
  assert.equal(harness.elements.tipsPanel.getAttribute('aria-hidden'), 'false');
  assert.equal(harness.elements.tipsPanel.hasAttribute('inert'), false);
  assert.equal(harness.elements.tipButton.disabled, false);

  harness.clock.tick(5999);
  assert.equal(harness.controller.getSnapshot().currentTip.text, first);
  harness.clock.tick(1);
  assert.equal(harness.elements.tipButton.classList.contains('is-leaving'), true);
  harness.clock.tick(119);
  assert.equal(harness.controller.getSnapshot().currentTip.text, first);
  harness.clock.tick(1);
  assert.notEqual(harness.controller.getSnapshot().currentTip.text, first);
  assert.doesNotMatch(harness.elements.tipButton.getAttribute('aria-label'), /\d+\s*\/\s*\d+|[●•]{2,}/);
});

test('manual switching announces the tip, resets auto timing, and debounces taps for 300ms', () => {
  const harness = createHarness();
  harness.controller.start();
  harness.clock.tick(1200);
  const first = harness.controller.getSnapshot().currentTip.text;

  assert.equal(harness.controller.nextTip(), true);
  assert.equal(harness.controller.nextTip(), false);
  harness.clock.tick(120);
  const second = harness.controller.getSnapshot().currentTip.text;
  assert.notEqual(second, first);
  assert.equal(harness.elements.announcement.textContent, `次のヒント。${second}`);
  assert.ok(harness.hookEvents.includes(`announce:tip:次のヒント。${second}`));

  harness.clock.tick(179);
  assert.equal(harness.controller.nextTip(), false);
  harness.clock.tick(1);
  assert.equal(harness.controller.nextTip(), true);
  harness.clock.tick(120);
  const third = harness.controller.getSnapshot().currentTip.text;
  assert.notEqual(third, second);
  harness.clock.tick(5999);
  assert.equal(harness.controller.getSnapshot().currentTip.text, third);
});

test('progress advance cancels pending auto swaps but commits pending manual swaps before a 700ms quiet window', async () => {
  const harness = createHarness();
  harness.controller.start();
  harness.clock.tick(1200);
  const first = harness.controller.getSnapshot().currentTip.text;

  harness.clock.tick(6000);
  assert.equal(harness.elements.tipButton.classList.contains('is-leaving'), true, 'auto transition is pending');
  await harness.controller.advance(20, { phase: '入口を確認中' });
  assert.equal(harness.elements.tipsPanel.getAttribute('data-quiet'), 'true');
  harness.clock.tick(120);
  assert.equal(harness.controller.getSnapshot().currentTip.text, first, 'pending auto swap is cancelled');
  harness.clock.tick(580);
  assert.equal(harness.elements.tipsPanel.getAttribute('data-quiet'), 'false');

  assert.equal(harness.controller.nextTip(), true);
  const beforeManual = harness.controller.getSnapshot().currentTip.text;
  const progressPromise = harness.controller.advance(40, { phase: '星灯りを運んでいます' });
  assert.notEqual(harness.controller.getSnapshot().currentTip.text, beforeManual, 'pending manual choice is committed immediately');
  assert.match(harness.elements.announcement.textContent, /^次のヒント。/);
  assert.equal(harness.elements.tipsPanel.getAttribute('data-quiet'), 'true');
  harness.clock.tick(699);
  assert.equal(harness.elements.tipsPanel.getAttribute('data-quiet'), 'true');
  harness.clock.tick(1);
  assert.equal(harness.elements.tipsPanel.getAttribute('data-quiet'), 'false');
  await progressPromise;
});

test('reduced motion stops automatic changes while keeping instant manual tips', () => {
  const harness = createHarness({ reducedMotion: true });
  harness.controller.start();
  harness.clock.tick(1200);
  const first = harness.controller.getSnapshot().currentTip.text;
  harness.clock.tick(20000);
  assert.equal(harness.controller.getSnapshot().currentTip.text, first);
  assert.equal(harness.elements.autoToggle.disabled, true);
  assert.match(harness.elements.autoToggle.textContent, /端末設定/);

  assert.equal(harness.controller.nextTip(), true);
  assert.notEqual(harness.controller.getSnapshot().currentTip.text, first, 'manual change has no transition delay');
  const manual = harness.controller.getSnapshot().currentTip.text;
  harness.media.set(false);
  harness.clock.tick(6000);
  harness.clock.tick(120);
  assert.notEqual(harness.controller.getSnapshot().currentTip.text, manual);
});

test('visibility and keyboard focus pause automatic text changes and resume with a fresh interval', () => {
  const harness = createHarness();
  harness.controller.start();
  harness.clock.tick(1200);
  const first = harness.controller.getSnapshot().currentTip.text;

  harness.elements.tipButton.dispatch('focus');
  harness.clock.tick(8000);
  assert.equal(harness.controller.getSnapshot().currentTip.text, first);
  harness.elements.tipButton.dispatch('blur');
  harness.clock.tick(6000);
  harness.clock.tick(120);
  const second = harness.controller.getSnapshot().currentTip.text;
  assert.notEqual(second, first);

  harness.document.hidden = true;
  harness.document.dispatch('visibilitychange');
  harness.clock.tick(9000);
  assert.equal(harness.controller.getSnapshot().currentTip.text, second);
  harness.document.hidden = false;
  harness.document.dispatch('visibilitychange');
  harness.clock.tick(6000);
  harness.clock.tick(120);
  assert.notEqual(harness.controller.getSnapshot().currentTip.text, second);
});

test('one frontier synchronizes CSS, state, progress semantics, and awaitable arrival-contact-complete hooks', async () => {
  const harness = createHarness({ options: { arrivalMs: 100, contactMs: 150 } });
  harness.controller.start({ progress: 4, phase: '準備中' });
  await harness.controller.advance(47, { phase: '星灯りの道をつないでいます' });

  assert.equal(harness.root.style.getPropertyValue('--moguria-loading-progress'), '47%');
  assert.equal(harness.root.getAttribute('data-loading-progress'), '47');
  assert.equal(harness.root.getAttribute('data-state'), 'loading');
  assert.equal(harness.root.getAttribute('data-loading-state'), 'loading');
  assert.equal(harness.elements.progressFill.style.width, '47%');
  assert.equal(harness.elements.progressPercent.textContent, '47%');
  assert.equal(harness.elements.progressbar.getAttribute('aria-valuenow'), '47');

  let settled = false;
  const completed = harness.controller.advance(100, {
    contactPhase: '星灯りが扉へ届きました',
    completeTitle: '準備できました',
    completePhase: '冒険の扉がひらきます'
  }).then(snapshot => {
    settled = true;
    return snapshot;
  });
  assert.equal(harness.controller.getSnapshot().state, 'arriving');
  assert.equal(harness.root.getAttribute('data-state'), 'arriving');
  harness.clock.tick(99);
  assert.equal(harness.controller.getSnapshot().state, 'arriving');
  harness.clock.tick(1);
  assert.equal(harness.controller.getSnapshot().state, 'contact');
  assert.equal(harness.elements.phase.textContent, '星灯りが扉へ届きました');
  harness.clock.tick(149);
  assert.equal(harness.controller.getSnapshot().state, 'contact');
  harness.clock.tick(1);
  const final = await completed;
  assert.equal(settled, true);
  assert.equal(final.state, 'complete');
  assert.equal(harness.elements.title.textContent, '準備できました');
  assert.equal(harness.elements.phase.textContent, '冒険の扉がひらきます');
  assert.equal(harness.elements.progressbar.getAttribute('aria-busy'), 'false');
  assert.deepEqual(harness.hookEvents.filter(event => /^(arrival|contact|complete):/.test(event)), [
    'arrival:100',
    'contact:100',
    'complete:100'
  ]);
});

test('zero-duration overrides let fast loads complete without an artificial wait', async () => {
  const harness = createHarness();
  harness.controller.start({ arrivalMs: 0, contactMs: 0 });
  const completed = harness.controller.advance(100);
  harness.clock.tick(0);
  const snapshot = await completed;
  assert.equal(snapshot.state, 'complete');
  assert.equal(harness.clock.size, 0);
});

test('error is assertive before its text changes, retry restores polite status, and completion does not hang', async () => {
  const harness = createHarness();
  const originalTips = tipIds(harness.controller.getSnapshot());
  harness.controller.start({ phase: '読み込み中' });
  const waiting = harness.controller.whenComplete();
  const logStart = harness.log.length;
  harness.controller.error({ title: '読み込めませんでした', phase: '通信状態を確認してください' });
  const errorLog = harness.log.slice(logStart);
  const alertIndex = errorLog.indexOf('phase:attr:role:alert');
  const textIndex = errorLog.indexOf('phase:text:通信状態を確認してください');
  assert.ok(alertIndex >= 0 && textIndex > alertIndex);
  assert.equal(harness.root.getAttribute('data-state'), 'error');
  assert.equal(harness.elements.phase.getAttribute('aria-live'), 'assertive');
  assert.equal(harness.elements.progressbar.getAttribute('aria-busy'), 'false');
  assert.equal((await waiting).reason, 'error');

  const retryLogStart = harness.log.length;
  harness.controller.start({ phase: 'もう一度読み込み中' });
  const retryLog = harness.log.slice(retryLogStart);
  const statusIndex = retryLog.indexOf('phase:attr:role:status');
  const retryTextIndex = retryLog.indexOf('phase:text:もう一度読み込み中');
  assert.ok(statusIndex >= 0 && retryTextIndex > statusIndex);
  assert.equal(harness.elements.phase.getAttribute('aria-live'), 'polite');
  assert.deepEqual(tipIds(harness.controller.getSnapshot()), originalTips);
});

test('destroy and disconnected-root detection remove timers, listeners, and the browser QA handle', async () => {
  const explicit = createHarness();
  explicit.controller.start();
  const waiting = explicit.controller.whenComplete();
  explicit.controller.destroy();
  assert.equal(explicit.root.moguriaLoadingExperience, undefined);
  assert.equal(explicit.clock.size, 0);
  assert.equal(explicit.document.listenerCount('visibilitychange'), 0);
  assert.equal(explicit.media.listenerCount, 0);
  assert.equal(explicit.elements.tipButton.listenerCount('click'), 0);
  assert.equal((await waiting).reason, 'destroyed');

  const unmounted = createHarness();
  unmounted.controller.start();
  unmounted.root.isConnected = false;
  unmounted.clock.tick(1200);
  assert.equal(unmounted.root.moguriaLoadingExperience, undefined);
  assert.equal(unmounted.clock.size, 0);
  assert.equal(unmounted.controller.getSnapshot().state, 'destroyed');
});
