'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function loadDebug({ hostname, hash, localAllowed }) {
  const appended = [];
  const context = {
    console: { log() {}, warn() {} },
    location: { hostname, hash },
    document: {
      body: { appendChild(node) { appended.push(node); } },
      createElement: () => ({ id: '', className: '', textContent: '', innerHTML: '' })
    },
    MoguriaConfig: {
      debug: false,
      security: { allowDevToolsOnHosts: ['localhost', '127.0.0.1', ''] }
    },
    MoguriaSecurity: { isLocalDevHost: () => localAllowed }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read('js/debug.js'), context, { filename: 'js/debug.js' });
  context.MoguriaDebug.init();
  return { context, appended };
}

test('the debug hash is ignored on the public host and remains available locally', () => {
  const publicPage = loadDebug({ hostname: 'moguria-dev.github.io', hash: '#debug', localAllowed: false });
  assert.equal(publicPage.context.MoguriaDebug.enabled, false);
  assert.equal(publicPage.appended.length, 0);

  const localPage = loadDebug({ hostname: 'localhost', hash: '#debug', localAllowed: true });
  assert.equal(localPage.context.MoguriaDebug.enabled, true);
  assert.equal(localPage.appended.length, 1);
  assert.equal(localPage.appended[0].id, 'debugPanel');
});

test('Home no longer advertises placeholder currencies or a nonfunctional exploration reward', () => {
  const html = read('index.html');
  const home = html.match(/<section id="home"[\s\S]*?<section id="game"/)?.[0] || '';
  assert.ok(home);
  assert.doesNotMatch(home, /12,850|1,210|02:45:18|探索ボーナス/);
  assert.match(home, /id="coinCurrency"/);
  assert.match(home, /home-v2__currencies--single/);
  assert.match(home, /id="homeNotice"/);
  assert.doesNotMatch(read('js/home.js'), /setText\('homeLine',\s*'おやつ/);
});

test('choice and persistence recovery surfaces state their consequences and actions', () => {
  const html = read('index.html');
  const game = read('js/game.js');
  const ui = read('js/ui.js');
  const consistencyCss = read('css/moguria-ui-consistency.css');
  assert.match(html, /id="levelModal"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="levelTitle"/);
  assert.match(html, /id="skillSealHelp"[^>]*>[^<]*封印した力は、この冒険中は候補に出ません/);
  assert.match(game, /document\.createElement\('article'\)/);
  assert.match(game, /document\.createElement\('button'\)/);
  assert.match(game, /class="skill-card__pick"[^>]*>選ぶ</);
  assert.match(game, /aria-describedby','skillSealHelp'/);
  assert.match(html, /id="adventureLoadingActions"/);
  assert.match(html, /id="settlementError"[^>]*role="alertdialog"/);
  assert.match(html, /id="settlementRetryBtn"[^>]*>保存を再試行</);
  assert.match(html, /id="checkpointWarning"[^>]*role="alert"/);
  assert.match(game, /updateCheckpointWarning\(true\)/);
  assert.match(game, /getStartError/);
  assert.match(game, /function trapGameDialogFocus/);
  assert.match(game, /focusGameControl\('resumeBtn'\)/);
  assert.match(ui, /trapSystemDialogFocus\(event, metaOverlay\)/);
  assert.doesNotMatch(game, /homeLine[^\n]*textContent\s*=\s*message/);
  assert.match(consistencyCss, /#result \.result-detail > summary[\s\S]*?min-height:\s*44px !important/);
  assert.match(consistencyCss, /\.meta-tabs\s*\{[^}]*grid-template-columns:\s*1\.5fr 1fr \.9fr \.8fr/s);
  assert.match(consistencyCss, /\.meta-tabs button\s*\{[^}]*font-size:\s*10px\s*!important/s);
});

test('artifact choice, owned rail and pause journal share dedicated production art', () => {
  const html = read('index.html');
  const game = read('js/game.js');
  assert.match(html, /assets\/images\/ui-refresh\/artifacts\/artifact-core\.webp/);
  assert.match(game, /function artifactArtMarkup/);
  assert.match(game, /artifact-choice__image/);
  assert.match(game, /owned-power__artifact-image/);
  assert.match(game, /pause-power__artifact-image/);
  assert.match(game, />Lv\.\$\{level\}</);
  assert.doesNotMatch(game, /skill-icon__glyph[^\n]*a\.icon/);
});
