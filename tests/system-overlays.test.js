'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

function createClassList(...initial) {
  const values = new Set(initial);
  return {
    add(...names) { names.forEach(name => values.add(name)); },
    remove(...names) { names.forEach(name => values.delete(name)); },
    contains(name) { return values.has(name); }
  };
}

function createUiHarness() {
  const listeners = {};
  const elements = {};
  const document = {
    body: null,
    activeElement: null,
    getElementById: id => elements[id] || null,
    querySelectorAll: () => [],
    addEventListener(type, handler) { listeners[type] = handler; }
  };

  function element(id, hidden = false) {
    const attributes = new Map();
    const node = {
      id,
      textContent: '',
      dataset: {},
      inert: false,
      isConnected: true,
      classList: createClassList(...(hidden ? ['hidden'] : [])),
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
      hasAttribute(name) { return attributes.has(name); },
      removeAttribute(name) { attributes.delete(name); },
      addEventListener(type, handler) { this.listeners = this.listeners || {}; this.listeners[type] = handler; },
      querySelectorAll() { return this.focusables || []; },
      focus() { document.activeElement = this; },
      click() { return this.onclick?.({ target: this, preventDefault() {} }); }
    };
    elements[id] = node;
    return node;
  }

  const app = element('app');
  document.body = element('body');
  const source = element('source');
  const pauseButton = element('pauseBtn');
  const confirmDialog = element('confirmDialog', true);
  element('confirmDialogEyebrow');
  element('confirmDialogTitle');
  element('confirmDialogMessage');
  const cancel = element('confirmCancelBtn');
  const accept = element('confirmAcceptBtn');
  confirmDialog.focusables = [cancel, accept];
  const loading = element('adventureLoading', true);
  const loadingCard = element('adventureLoadingCard');
  element('adventureLoadingTitle');
  element('adventureLoadingCost');
  element('adventureLoadingStatus');
  element('overlayTitle');
  element('overlayEyebrow');
  element('overlaySubtitle');
  element('overlayIcon');
  const overlayBody = element('overlayBody');
  element('overlay', true);
  const metaNotice = element('metaNotice');
  metaNotice.hidden = true;
  element('closeOverlay');
  const upgradeTrigger = element('upgradeTrigger');
  upgradeTrigger.dataset.upgrade = 'target';
  overlayBody.querySelectorAll = selector => selector === '[data-upgrade]' ? [upgradeTrigger] : [];

  const context = {
    console: { log() {}, warn() {}, error() {} },
    document,
    requestAnimationFrame(callback) { callback(); return 1; },
    setTimeout() { return 1; },
    clearTimeout() {},
    Intl,
    Date,
    Promise
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read('js/ui.js'), context, { filename: 'js/ui.js' });
  context.MoguriaUI.init();

  return { context, document, elements, listeners, app, source, pauseButton, cancel, accept, loading, loadingCard, upgradeTrigger };
}

test('shared confirmation is modal, cancel-focused, keyboard-contained, and restores focus', async () => {
  const harness = createUiHarness();
  harness.source.focus();
  const pending = harness.context.MoguriaUI.confirmAction({
    title: '装備を強化する？',
    message: '素材を消費します。',
    confirmLabel: '強化する'
  });

  assert.equal(harness.elements.confirmDialog.classList.contains('hidden'), false);
  assert.equal(harness.app.inert, true);
  assert.equal(harness.app.getAttribute('aria-hidden'), 'true');
  assert.equal(harness.document.activeElement, harness.cancel, 'the safe cancel action receives default focus');

  let tabPrevented = false;
  harness.listeners.keydown({
    key: 'Tab',
    shiftKey: true,
    preventDefault() { tabPrevented = true; }
  });
  assert.equal(tabPrevented, true);
  assert.equal(harness.document.activeElement, harness.accept, 'focus wraps inside the alert dialog');

  harness.accept.click();
  assert.equal(await pending, true);
  assert.equal(harness.elements.confirmDialog.classList.contains('hidden'), true);
  assert.equal(harness.app.inert, false);
  assert.equal(harness.app.hasAttribute('aria-hidden'), false);
  assert.notEqual(harness.document.activeElement, harness.source, 'accepted actions choose their next stable focus after transition');

  const cancelled = harness.context.MoguriaUI.confirmAction();
  let escapePrevented = false;
  harness.listeners.keydown({ key: 'Escape', preventDefault() { escapePrevented = true; } });
  assert.equal(escapePrevented, true);
  assert.equal(await cancelled, false);
  assert.equal(harness.document.activeElement, harness.document.body, 'accepted actions release focus until the caller chooses a stable destination');

  harness.source.focus();
  const escapeCancelled = harness.context.MoguriaUI.confirmAction();
  harness.listeners.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(await escapeCancelled, false);
  assert.equal(harness.document.activeElement, harness.source, 'cancelling restores the invoking control');
});

test('adventure loading blocks the app, announces status, ignores Escape, and cleans up focus', () => {
  const harness = createUiHarness();
  harness.source.focus();
  harness.context.MoguriaUI.showAdventureLoading({ resume: true });

  assert.equal(harness.loading.classList.contains('hidden'), false);
  assert.equal(harness.loading.getAttribute('aria-busy'), 'true');
  assert.match(harness.elements.adventureLoadingTitle.textContent, /再開/);
  assert.match(harness.elements.adventureLoadingCost.textContent, /消費なし/);
  assert.match(harness.elements.adventureLoadingStatus.textContent, /読み込/);
  assert.equal(harness.app.inert, true);
  assert.equal(harness.document.activeElement, harness.loadingCard);

  let prevented = false;
  harness.listeners.keydown({ key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(harness.loading.classList.contains('hidden'), false);

  harness.context.MoguriaUI.updateAdventureLoading('ダンジョンの入口を開いています…');
  assert.match(harness.elements.adventureLoadingStatus.textContent, /入口/);
  harness.context.MoguriaUI.hideAdventureLoading({ restoreFocus: true });
  assert.equal(harness.loading.classList.contains('hidden'), true);
  assert.equal(harness.loading.getAttribute('aria-busy'), 'false');
  assert.equal(harness.app.inert, false);
  assert.equal(harness.document.activeElement, harness.source);

  harness.context.MoguriaUI.showAdventureLoading();
  assert.match(harness.elements.adventureLoadingCost.textContent, /おなか 1消費/);
  harness.context.MoguriaUI.hideAdventureLoading({ restoreFocus: false, focusTarget: 'pauseBtn' });
  assert.equal(harness.document.activeElement, harness.pauseButton, 'successful transition focuses a visible game control');
});

test('system overlay markup and styling expose accessible central blocking surfaces', () => {
  const html = read('index.html');
  const css = read('css/moguria-system-overlays.css');
  assert.match(html, /id="confirmDialog"[^>]*role="alertdialog"[^>]*aria-modal="true"[^>]*aria-labelledby="confirmDialogTitle"[^>]*aria-describedby="confirmDialogMessage"/);
  assert.match(html, /id="adventureLoading"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="adventureLoadingTitle"[^>]*aria-describedby="adventureLoadingStatus"[^>]*aria-busy="true"/);
  assert.match(html, /id="adventureLoadingStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(css, /\.system-overlay\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*display:\s*grid;[^}]*place-items:\s*center;/s);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('equipment UI cancels without mutation and commits only the material named by its shared confirmation', async () => {
  const harness = createUiHarness();
  const upgradeCalls = [];
  const item = { uid: 'target', name: '木の葉ぼうし', icon: '🍃', slot: 'hat', rarity: 'common', level: 2, desc: 'HPが増える' };
  const material = { uid: 'material-a', name: 'きのこベレー', icon: '🍄', slot: 'hat', rarity: 'rare', level: 3, desc: '素材' };
  harness.context.MoguriaMeta = {
    SLOT_LABELS: { hat: 'ぼうし' },
    RARITY_LABELS: { common: 'C', rare: 'R' },
    load: () => ({ meta: { coins: 50, inventory: [item, material] } }),
    equipmentSummary: () => [{ slot: 'hat', label: 'ぼうし', item: null }],
    upgradePreview: uid => ({ ok: true, item, material, materialEquipped: true, uid }),
    upgrade(targetUid, materialUid, expected) {
      upgradeCalls.push([targetUid, materialUid, expected]);
      return { ok: true, item: { ...item, level: 3 }, used: material };
    }
  };

  harness.context.MoguriaUI.showEquipment();
  let action = harness.upgradeTrigger.click();
  assert.match(harness.elements.confirmDialogMessage.textContent, /木の葉ぼうし/);
  assert.match(harness.elements.confirmDialogMessage.textContent, /きのこベレー/);
  assert.match(harness.elements.confirmDialogMessage.textContent, /装備中の素材は外れます/);
  harness.cancel.click();
  await action;
  assert.deepEqual(upgradeCalls, []);

  action = harness.upgradeTrigger.click();
  harness.accept.click();
  await action;
  assert.deepEqual(clone(upgradeCalls), [['target', 'material-a', {
    targetLevel: 2,
    materialLevel: 3,
    materialEquipped: true
  }]]);
});

function createMetaHarness() {
  let durable = {
    meta: {
      coins: 0,
      inventory: [
        { uid: 'target', id: 'hat_leaf', name: '木の葉ぼうし', slot: 'hat', level: 2 },
        { uid: 'material-a', id: 'hat_spore', name: 'きのこベレー', slot: 'hat', level: 3 },
        { uid: 'material-b', id: 'hat_star', name: '星くずフード', slot: 'hat', level: 1 }
      ],
      equipped: { hat: 'material-a', body: null, hand: null, foot: null, charm: null },
      upgrades: {},
      claimedChallenges: {},
      daily: { key: '', claimed: false }
    }
  };
  const context = { window: null, Date, Math, console };
  context.window = context;
  context.MoguriaSave = {
    load: () => clone(durable),
    save(data) { durable = clone(data); return { ok: true }; },
    fresh: () => ({ meta: {} })
  };
  vm.createContext(context);
  vm.runInContext(read('js/meta.js'), context, { filename: 'js/meta.js' });
  return { context, get durable() { return durable; } };
}

function createFailingMetaHarness() {
  const harness = createMetaHarness();
  harness.context.MoguriaSave.save = () => ({ ok: false, reason: 'quota' });
  return harness;
}

test('equipment upgrade previews and consumes the exact selected material, including equipped state', () => {
  const harness = createMetaHarness();
  const preview = harness.context.MoguriaMeta.upgradePreview('target');
  assert.equal(preview.ok, true);
  assert.equal(preview.item.name, '木の葉ぼうし');
  assert.equal(preview.material.uid, 'material-a');
  assert.equal(preview.material.name, 'きのこベレー');
  assert.equal(preview.materialEquipped, true);

  const stale = harness.context.MoguriaMeta.upgrade('target', 'missing-material');
  assert.equal(stale.ok, false);
  assert.match(stale.message, /確認した強化素材/);
  assert.equal(harness.durable.meta.inventory.length, 3, 'a stale confirmation must not fall back to another item');
  assert.equal(harness.durable.meta.inventory.find(item => item.uid === 'target').level, 2);

  const changedTerms = harness.context.MoguriaMeta.upgrade('target', preview.material.uid, {
    targetLevel: 1,
    materialLevel: 3,
    materialEquipped: true
  });
  assert.equal(changedTerms.ok, false);
  assert.match(changedTerms.message, /状態が変わりました/);
  assert.equal(harness.durable.meta.inventory.length, 3);

  const upgraded = harness.context.MoguriaMeta.upgrade('target', preview.material.uid, {
    targetLevel: 2,
    materialLevel: 3,
    materialEquipped: true
  });
  assert.equal(upgraded.ok, true);
  assert.equal(upgraded.item.level, 3);
  assert.equal(upgraded.used.uid, 'material-a');
  assert.equal(harness.durable.meta.inventory.some(item => item.uid === 'material-a'), false);
  assert.equal(harness.durable.meta.inventory.some(item => item.uid === 'material-b'), true);
  assert.equal(harness.durable.meta.equipped.hat, null);
});

test('equipment upgrade reports persistence failure instead of claiming material was consumed', () => {
  const harness = createFailingMetaHarness();
  const preview = harness.context.MoguriaMeta.upgradePreview('target');
  const result = harness.context.MoguriaMeta.upgrade('target', preview.material.uid, {
    targetLevel: 2,
    materialLevel: 3,
    materialEquipped: true
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'save-failed');
  assert.match(result.message, /保存できませんでした/);
  assert.equal(harness.durable.meta.inventory.length, 3);
  assert.equal(harness.durable.meta.inventory.find(item => item.uid === 'target').level, 2);
});
