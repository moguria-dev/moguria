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
  const source = read('scripts/run-browser-qa.mjs');
  for (const contract of [
    'ja-JP', 'Asia/Tokyo', 'hasTouch: true', 'isMobile: true',
    'consoleErrors', 'pageErrors', 'requestFailures', 'responseErrors',
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
    '/assets/images/home-v2/expedition_mogu.png',
    'loading Mogu is not decoded',
    'loading Mogu is not visible',
    'loading Mogu decorative semantics differ',
    'loading bubble copy is missing',
    'loading phase status is empty',
    'loading progress semantics differ',
    'loading live-region semantics differ',
    'loading normal-motion contract differs',
    'loading motion keyframes do not change transform',
    'loading reduced-motion contract differs',
    "await page.emulateMedia({ reducedMotion:'no-preference' })",
    "await page.emulateMedia({ reducedMotion:'reduce' })",
    "item.animationName === 'loadingMoguWait'",
    "image.style.setProperty('animation-duration', '2.2s', 'important')",
    'animation.currentTime = 0',
    'animation.currentTime = 1100',
    "animationIterationCount !== 'infinite'",
    'Math.abs(origin[0] - 50) > 1',
    'Math.abs(origin[1] - 82) > 1',
    "matchMedia('(prefers-reduced-motion: reduce)').matches",
    'insideBusyProgress: statusParentProgress',
    'insideBusyRegion: statusBusyAncestor'
  ]) assert.ok(source.includes(contract), `runner must preserve ${contract}`);
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
