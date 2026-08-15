'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const json = (relativePath) => JSON.parse(read(relativePath));

test('browser QA dependency and lockfile pin Playwright exactly', () => {
  const pkg = json('package.json');
  const lock = json('package-lock.json');
  assert.equal(pkg.devDependencies.playwright, '1.62.0');
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(lock.packages[''].devDependencies.playwright, '1.62.0');
  assert.equal(lock.packages['node_modules/playwright'].version, '1.62.0');
  assert.equal(lock.packages['node_modules/playwright'].dependencies['playwright-core'], '1.62.0');
  assert.equal(lock.packages['node_modules/playwright-core'].version, '1.62.0');
  assert.equal(lock.packages['node_modules/playwright'].resolved, 'https://registry.npmjs.org/playwright/-/playwright-1.62.0.tgz');
  assert.equal(lock.packages['node_modules/playwright-core'].resolved, 'https://registry.npmjs.org/playwright-core/-/playwright-core-1.62.0.tgz');
  assert.equal(pkg.scripts['qa:browser'], 'node scripts/run-browser-qa.mjs');
});

test('browser QA workflow is isolated, least-privilege, pinned, bounded and uploads evidence', () => {
  const workflow = read('.github/workflows/browser-qa.yml');
  assert.match(workflow, /^name: Browser visual QA$/m);
  assert.match(workflow, /^on:\n  pull_request:\n    branches:\n      - main\n  push:\n    branches:\n      - main\n  workflow_dispatch:$/m);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.equal((workflow.match(/^    timeout-minutes: 20$/gm) || []).length, 1);
  assert.match(workflow, /browser:\n          - chromium\n          - webkit/);
  assert.match(workflow, /run: npm ci --ignore-scripts/);
  assert.match(workflow, /npx playwright install --with-deps "\$\{\{ matrix\.browser \}\}"/);
  assert.match(workflow, /if: matrix\.browser == 'chromium'\n        run: npm run qa:browser -- --browser="chromium"/);
  assert.match(workflow, /if: matrix\.browser == 'webkit'\n        run: xvfb-run -a npm run qa:browser -- --browser="webkit" --headed/);
  assert.match(workflow, /PLAYWRIGHT_BROWSERS_PATH: \$\{\{ github\.workspace \}\}\/\.playwright-browsers/);
  assert.doesNotMatch(workflow, /jobs:[\s\S]*?env:[\s\S]*?runner\.temp/);
  assert.match(workflow, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4\.6\.2/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /if-no-files-found: error/);
  const usesLines = workflow.split('\n').filter((line) => /^\s*uses:/.test(line));
  assert.ok(usesLines.length >= 3);
  for (const line of usesLines) assert.match(line, /@[a-f0-9]{40}(?:\s+#\s+v\d[^\s]*)?\s*$/);
  assert.doesNotMatch(workflow, /pages: write|id-token: write|deploy-pages/);
});

test('runner contract covers both mobile viewports and every approved screen', async () => {
  const runner = await import('../scripts/run-browser-qa.mjs');
  assert.equal(runner.PLAYWRIGHT_VERSION, '1.62.0');
  assert.equal(runner.FIXED_SEED, 20260814);
  assert.deepStrictEqual(
    runner.VIEWPORTS.map(({ width, height, deviceScaleFactor }) => [width, height, deviceScaleFactor]),
    [[390, 844, 3], [375, 667, 2]]
  );
  assert.deepStrictEqual(runner.SCREEN_IDS, [
    'startup-loading', 'home', 'dex', 'logs', 'equipment', 'gacha', 'outing', 'adventure-loading',
    'battle-hud', 'battle-vfx-lv1', 'battle-vfx-lv3', 'battle-vfx-lv5', 'battle-vfx-lv5-reduced', 'battle-vfx-lv5-low',
    'skill-choice', 'artifact-choice', 'pause', 'result'
  ]);
  assert.deepStrictEqual(runner.VISUAL_SCROLL_ROOTS, {
    'startup-loading': [],
    home: [],
    dex: ['#overlayBody'],
    logs: ['#overlayBody'],
    equipment: ['#overlayBody'],
    gacha: ['#overlayBody'],
    outing: ['#overlayBody'],
    'adventure-loading': [],
    'battle-hud': [],
    'battle-vfx-lv1': [],
    'battle-vfx-lv3': [],
    'battle-vfx-lv5': [],
    'battle-vfx-lv5-reduced': [],
    'battle-vfx-lv5-low': [],
    'skill-choice': ['#levelOwnedSkills', '#skillChoices'],
    'artifact-choice': ['#artifactOwnedSkills', '#artifactChoices'],
    pause: ['#pauseModal .pause-power-panels'],
    result: ['#result']
  });
  assert.deepStrictEqual(runner.GLOBAL_VISUAL_SCROLL_ROOTS, ['html', 'body', '#app', '#overlay']);
  assert.deepStrictEqual(runner.VIEWPORT_SURFACE_SCREENS, [
    'startup-loading', 'home', 'dex', 'logs', 'equipment', 'gacha', 'outing', 'adventure-loading',
    'battle-hud', 'battle-vfx-lv1', 'battle-vfx-lv3', 'battle-vfx-lv5', 'battle-vfx-lv5-reduced', 'battle-vfx-lv5-low', 'result'
  ]);
  assert.deepStrictEqual(runner.TRANSIENT_ABSENCE, {
    'battle-hud': ['#game.active > .big-cue', '#game.active > .wave-toast'],
    'battle-vfx-lv1': ['#game.active > .big-cue', '#game.active > .wave-toast'],
    'battle-vfx-lv3': ['#game.active > .big-cue', '#game.active > .wave-toast'],
    'battle-vfx-lv5': ['#game.active > .big-cue', '#game.active > .wave-toast'],
    'battle-vfx-lv5-reduced': ['#game.active > .big-cue', '#game.active > .wave-toast'],
    'battle-vfx-lv5-low': ['#game.active > .big-cue', '#game.active > .wave-toast']
  });
  assert.deepStrictEqual(runner.BATTLE_CANVAS_PROBE, {
    xRatio: 0.1,
    yRatio: 0.2,
    widthRatio: 0.8,
    heightRatio: 0.55,
    requiredPasses: 2,
    intervalMs: 250,
    minStandardDeviation: 8,
    minColorBuckets: 80
  });
  assert.deepStrictEqual(runner.LOADING_QA_CONTRACT, {
    assetPath: '/assets/images/loading/child-mogu-flight.webp',
    frontierTolerancePx: 2,
    silhouetteWidthMinPx: 45,
    silhouetteWidthMaxPx: 52,
    silhouetteViewportRatioMax: 0.14,
    tipPoolMinimum: 30,
    sessionTipCount: 5,
    revealMs: 1200,
    autoMs: 6000,
    tipTransitionMs: 120,
    manualDebounceMs: 300,
    progressQuietMs: 700
  });
  const runtime = json('assets/manifest.json');
  const battlePackUrls = runtime.packs.find((pack) => pack.id === 'battle-v3').assets.map((asset) => asset.src);
  assert.deepStrictEqual(runner.SPECULATIVE_BATTLE_PACK_URLS, battlePackUrls);
  const baseUrl = 'http://127.0.0.1:4173/';
  for (const url of battlePackUrls) {
    assert.equal(runner.isExpectedSpeculativeWarmAbort({
      method: 'GET',
      resourceType: 'fetch',
      isNavigationRequest: false,
      headers: { 'x-moguria-purpose': 'warm-pack:battle-v3' },
      url: new URL(url, baseUrl).href,
      errorText: 'net::ERR_ABORTED'
    }, baseUrl), true, `expected warm abort must be ignored for ${url}`);
  }
  const exactWarmAbort = {
    method: 'GET',
    resourceType: 'fetch',
    isNavigationRequest: false,
    headers: { 'x-moguria-purpose': 'warm-pack:battle-v3' },
    url: new URL(battlePackUrls[0], baseUrl).href,
    errorText: 'net::ERR_ABORTED'
  };
  for (const [label, failure] of [
    ['real network failure', { ...exactWarmAbort, errorText: 'net::ERR_CONNECTION_RESET' }],
    ['foreground image request', { ...exactWarmAbort, resourceType: 'image' }],
    ['unmarked fetch', { ...exactWarmAbort, headers: {} }],
    ['different warm purpose', { ...exactWarmAbort, headers: { 'x-moguria-purpose': 'warm-pack:other' } }],
    ['non-GET request', { ...exactWarmAbort, method: 'POST' }],
    ['navigation', { ...exactWarmAbort, isNavigationRequest: true }],
    ['wrong cache token', { ...exactWarmAbort, url: exactWarmAbort.url.replace(/v=[^&]+/, 'v=stale') }],
    ['non-pack URL', { ...exactWarmAbort, url: new URL('assets/images/home-v2/expedition_mogu.png', baseUrl).href }],
    ['different origin', { ...exactWarmAbort, url: new URL(battlePackUrls[0], 'https://example.invalid/').href }],
    ['invalid URL', { ...exactWarmAbort, url: 'not a URL' }]
  ]) {
    assert.equal(runner.isExpectedSpeculativeWarmAbort(failure, baseUrl), false, `${label} must remain a QA failure`);
  }
  const source = read('scripts/run-browser-qa.mjs');
  for (const contract of [
    'ja-JP', 'Asia/Tokyo', 'hasTouch: true', 'isMobile: true',
    'consoleErrors', 'pageErrors', 'requestFailures', 'responseErrors',
    'ignoredDiagnostics', 'speculativeWarmAborts', 'isExpectedSpeculativeWarmAbort(failure, baseUrl)',
    "failure.resourceType !== 'fetch'", "failure.errorText !== 'net::ERR_ABORTED'",
    "failure.headers?.['x-moguria-purpose'] !== 'warm-pack:battle-v3'",
    'naturalWidth', 'rootOverflow', '43.5', 'nearBlank', 'qa-summary.json', 'qa-summary.md',
    'visual scroll roots did not return to origin', 'full-viewport surface is displaced',
    'required content overflows its control', 'webglcontextlost',
    'two consecutive unassisted captures', 'MoguriaBattleV3?.sync?.(state)',
    "window.dispatchEvent(new Event('resize'))", "scale = 'device'",
    "'css-diagnostic'", 'headless: !options.headed',
    "Mode: ${summary.headed ? 'headed' : 'headless'}",
    'preProbeRenderer: await battleRendererDiagnostics(page)',
    'result.passed = result.backingStoreReady',
    'battle renderer canvas backing store is',
    "prepareLoadingFixture(page, 'startup', 50)",
    "prepareLoadingFixture(page, 'adventure', 47)",
    '/assets/images/loading/child-mogu-flight.webp',
    'data-loading-surface',
    'data-loading-child-image',
    'data-loading-carried-light',
    'data-loading-frontier',
    'data-loading-gate',
    'inspectLoadingAsset',
    'displaySilhouette',
    'child Mogu production sprite did not decode',
    'child Mogu silhouette is not small',
    'child Mogu sprite visibility/semantics differ',
    'loading progress semantics differ',
    'loading live-region semantics differ',
    'fill tip does not align with',
    'progress and child did not advance together',
    'loadingChildFlight',
    'child Mogu plateau motion differs',
    'data-loading-tip-text',
    'data-tip-id',
    'loading tip session is not five unique entries from a large pool',
    'loading tip presentation differs',
    'loading tip timing/manual/pause contract differs',
    'tipsBeforeBoundary',
    'autoChangedTip',
    'pausedTipStayed',
    'manualTipsUnique',
    'keyboardReachability',
    "page.keyboard.press('Tab')",
    'wrapsToFirst',
    'arrival-contact-complete/gate contract differs',
    "attributeFilter: ['data-state']",
    'centerIsGate',
    'loading reduced-motion contract differs',
    'reducedBeforeManual',
    'loading error/retry contract differs',
    'loading surface does not fit the mobile viewport',
    'cardFitsViewport',
    "await page.emulateMedia({ reducedMotion:'no-preference' })",
    "await page.emulateMedia({ reducedMotion:'reduce' })",
    "style[data-moguria-qa-freeze]",
    'style.sheet.disabled = !enabled',
    'animation.currentTime = 0',
    'animation.currentTime = duration / 4',
    'snapshot?.reducedMotion',
    'insideBusyProgress',
    'insideBusyRegion'
  ]) assert.ok(source.includes(contract), `runner must preserve ${contract}`);
  assert.doesNotMatch(source, /assets\/images\/home-v2\/expedition_mogu\.png/,
    'loading QA must not regress to the protagonist-sized expedition Mogu');
  for (const fixture of [
    "['poison_seed', 'spark_pop', 'thunder_gum', 'mogu_field']",
    "prepareSkillVfx(page, 1)", "prepareSkillVfx(page, 3)", "prepareSkillVfx(page, 5)",
    "{ reducedMotion:true }", "{ quality:'low' }", "page.emulateMedia",
    "sampleFrameTimings", "averageDeltaMs", "state.mode = 'pause'"
  ]) assert.ok(source.includes(fixture), `runner must preserve skill VFX evidence fixture ${fixture}`);
  assert.match(source, /fit: \['\[data-dex-tab\]'\]/);
  assert.match(source, /'cache-control': 'no-store'/);
  const probeSource = source.slice(
    source.indexOf('async function verifyBattleCanvas'),
    source.indexOf('async function auditDom')
  );
  assert.equal((probeSource.match(/result\.passed\s*=/g) || []).length, 1,
    'diagnostic recovery must never overwrite the unassisted probe verdict');
  assert.match(probeSource, /result\.unassisted\.every\(\(item\) => item\.passed\)/);
  assert.ok(probeSource.indexOf("'css-diagnostic'") < probeSource.indexOf('recoverBattleCanvas(page)'),
    'CSS-scale diagnosis must run before any renderer intervention');
});

test('browser QA evidence and fixtures cannot enter the production Pages artifact', () => {
  const state = json('config/project-state.json');
  assert.equal(state.validation.commands.browser, 'npm run qa:browser');
  assert.ok(state.validation.requiredFiles.includes('.github/workflows/browser-qa.yml'));
  assert.ok(state.validation.requiredFiles.includes('scripts/run-browser-qa.mjs'));
  assert.ok(state.validation.existingTestFiles.includes('tests/browser-qa-contract.test.js'));
  assert.equal(state.deployment.artifactPaths.includes('browser-qa-output'), false);
  assert.match(read('.gitignore'), /^browser-qa-output\/$/m);
  assert.doesNotMatch(read('index.html'), /browser-qa-output|browser-qa-fixture|qa-screen/);
  assert.doesNotMatch(read('js/config.js'), /browser-qa-output|browser-qa-fixture|qa-screen/);
});
