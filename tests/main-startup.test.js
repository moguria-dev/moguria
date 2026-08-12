'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function flushMicrotasks(rounds = 12) {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

function classList(initial = []) {
  const values = new Set(initial);
  return {
    add(...names) { names.forEach(name => values.add(name)); },
    remove(...names) { names.forEach(name => values.delete(name)); },
    contains(name) { return values.has(name); }
  };
}

function element(id) {
  const listeners = new Map();
  return {
    id,
    hidden: false,
    disabled: false,
    inert: false,
    dataset: {},
    attributes: {},
    style: {},
    textContent: '',
    classList: classList(),
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    addEventListener(type, handler) { listeners.set(type, handler); },
    click() { listeners.get('click')?.({ target: this }); }
  };
}

function createHarness(attempts) {
  const elements = Object.fromEntries([
    'startupLoader', 'startupProgressBar', 'startupProgressFill', 'startupProgressText',
    'startupRetryBtn', 'app', 'home'
  ].map(id => [id, element(id)]));
  elements.app.inert = true;
  elements.app.attributes.inert = '';
  elements.app.attributes['aria-hidden'] = 'true';
  elements.startupLoader.attributes['aria-busy'] = 'true';
  const body = { classList: classList(['moguria-booting']) };
  const lifecycle = new Map();
  const events = [];
  const warnings = [];
  let preloadCalls = 0;

  const context = {
    console: { log() {}, warn() {}, error() {} },
    Promise,
    setTimeout,
    clearTimeout,
    navigator: {},
    location: { protocol: 'https:' },
    document: {
      body,
      getElementById: id => elements[id] || null
    },
    addEventListener(type, handler) { lifecycle.set(type, handler); },
    requestAnimationFrame(callback) { callback(1); return 1; },
    MoguriaConfig: { assets: { cleanupOldServiceWorker: false, registerServiceWorker: false } },
    MoguriaAssets: {
      preloadCritical(options) {
        const current = attempts[Math.min(preloadCalls, attempts.length - 1)];
        preloadCalls += 1;
        current.onProgress = options.onProgress;
        return current.promise;
      }
    },
    MoguriaErrorLog: { install() { events.push('error.install'); } },
    MoguriaPlatform: { init() { events.push('platform.init'); } },
    MoguriaSecurity: { init() { events.push('security.init'); } },
    MoguriaDebug: {
      init() { events.push('debug.init'); },
      warn(...args) { warnings.push(args); }
    },
    MoguriaValidator: { validate() { events.push('validate'); return { ok:true, errors:[] }; } },
    MoguriaUI: {
      init() { events.push('ui.init'); },
      show(id) { events.push(`ui.show:${id}`); }
    },
    MoguriaGame: { init() { events.push('game.init'); } },
    MoguriaHome: { init() { events.push('home.init'); } },
    MoguriaCheatMenu: { init() { events.push('cheat.init'); } }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(SOURCE, context, { filename: 'js/main.js' });

  return {
    context,
    elements,
    body,
    events,
    warnings,
    attempts,
    get preloadCalls() { return preloadCalls; },
    triggerReady() { lifecycle.get('DOMContentLoaded')?.(); }
  };
}

test('Home stays inert until every critical asset succeeds and decoded progress completes', async () => {
  const attempt = deferred();
  const harness = createHarness([attempt]);
  harness.triggerReady();

  assert.equal(harness.body.classList.contains('moguria-booting'), true);
  assert.equal(harness.elements.app.attributes['aria-hidden'], 'true');
  assert.equal(harness.events.includes('home.init'), false);
  assert.equal(harness.events.includes('ui.show:home'), false);

  attempt.onProgress({ total:18, completed:7, loaded:7, failed:0 });
  assert.equal(harness.elements.startupProgressBar.attributes['aria-valuenow'], '7');
  assert.equal(harness.elements.startupProgressBar.attributes['aria-valuetext'], '7 / 18 完了');
  assert.equal(harness.elements.startupProgressFill.style.width, `${7 / 18 * 100}%`);
  assert.equal(harness.elements.startupProgressText.textContent, 'ホームを準備しています 7 / 18');

  attempt.resolve({ ok:true, total:18, completed:18, loaded:18, failed:[] });
  await flushMicrotasks();

  assert.equal(harness.events.filter(event => event === 'ui.init').length, 1);
  assert.equal(harness.events.filter(event => event === 'game.init').length, 1);
  assert.equal(harness.events.filter(event => event === 'home.init').length, 1);
  assert.equal(harness.events.filter(event => event === 'ui.show:home').length, 1);
  assert.equal(harness.body.classList.contains('moguria-booting'), false);
  assert.equal(harness.elements.app.inert, false);
  assert.equal('aria-hidden' in harness.elements.app.attributes, false);
  assert.equal(harness.elements.startupLoader.hidden, true);
  assert.equal(harness.context.MoguriaStartup.isReady(), true);
});

test('failure leaves the accessible loader visible and retry cannot duplicate init or reveal', async () => {
  const failedAttempt = deferred();
  const retryAttempt = deferred();
  const harness = createHarness([failedAttempt, retryAttempt]);
  harness.triggerReady();

  failedAttempt.resolve({
    ok:false,
    reason:'critical-asset-load-failed',
    total:18,
    completed:18,
    loaded:17,
    failed:['home_v2_logo']
  });
  await flushMicrotasks();

  assert.equal(harness.elements.startupLoader.hidden, false);
  assert.equal(harness.elements.startupLoader.dataset.state, 'error');
  assert.equal(harness.elements.startupLoader.attributes['aria-busy'], 'false');
  assert.equal(harness.elements.startupRetryBtn.hidden, false);
  assert.equal(harness.elements.startupRetryBtn.disabled, false);
  assert.match(harness.elements.startupProgressText.textContent, /17 \/ 18/);
  assert.equal(harness.events.includes('home.init'), false);
  assert.equal(harness.context.MoguriaStartup.isReady(), false);

  harness.elements.startupRetryBtn.click();
  harness.elements.startupRetryBtn.click();
  assert.equal(harness.preloadCalls, 2);
  assert.equal(harness.elements.startupRetryBtn.disabled, true);

  retryAttempt.onProgress({ total:18, completed:18, loaded:18, failed:0 });
  retryAttempt.resolve({ ok:true, total:18, completed:18, loaded:18, failed:[] });
  await flushMicrotasks();

  assert.equal(harness.events.filter(event => event === 'ui.init').length, 1);
  assert.equal(harness.events.filter(event => event === 'home.init').length, 1);
  assert.equal(harness.events.filter(event => event === 'ui.show:home').length, 1);
  assert.equal(harness.elements.startupLoader.hidden, true);
  assert.equal(harness.context.MoguriaStartup.isReady(), true);

  const result = await harness.context.MoguriaStartup.start();
  assert.equal(result.reused, true);
  assert.equal(harness.preloadCalls, 2);
  assert.equal(harness.events.filter(event => event === 'home.init').length, 1);
});

test('startup markup is image-free, determinate, accessible, and Home is not initially active', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const loader = html.match(/<section id="startupLoader"[\s\S]*?<\/section>/)?.[0] || '';
  const homeOpening = html.match(/<section id="home"[^>]*>/)?.[0] || '';

  assert.ok(loader);
  assert.doesNotMatch(loader, /<img\b/i);
  assert.match(loader, /role="progressbar"/);
  assert.match(loader, /aria-valuemin="0"/);
  assert.match(loader, /aria-valuemax="18"/);
  assert.match(loader, /role="status"/);
  assert.match(loader, /aria-live="polite"/);
  assert.match(html, /<div id="app" inert aria-hidden="true">/);
  assert.doesNotMatch(homeOpening, /\bactive\b/);

  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
});
