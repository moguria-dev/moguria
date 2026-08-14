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
  assert.match(workflow, /npm run qa:browser -- --browser="\$\{\{ matrix\.browser \}\}"/);
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
    'home', 'dex', 'logs', 'equipment', 'gacha', 'outing',
    'battle-hud', 'skill-choice', 'artifact-choice', 'pause', 'result'
  ]);
  assert.deepStrictEqual(runner.VISUAL_SCROLL_ROOTS, {
    home: [],
    dex: ['#overlayBody'],
    logs: ['#overlayBody'],
    equipment: ['#overlayBody'],
    gacha: ['#overlayBody'],
    outing: ['#overlayBody'],
    'battle-hud': [],
    'skill-choice': ['#levelOwnedSkills', '#skillChoices'],
    'artifact-choice': ['#artifactOwnedSkills', '#artifactChoices'],
    pause: ['#pauseModal .pause-power-panels'],
    result: ['#result']
  });
  assert.deepStrictEqual(runner.GLOBAL_VISUAL_SCROLL_ROOTS, ['html', 'body', '#app']);
  assert.deepStrictEqual(runner.VIEWPORT_SURFACE_SCREENS, [
    'home', 'dex', 'logs', 'equipment', 'gacha', 'outing', 'battle-hud', 'result'
  ]);
  assert.deepStrictEqual(runner.TRANSIENT_ABSENCE, {
    'battle-hud': ['#game.active > .big-cue', '#game.active > .wave-toast']
  });
  const source = read('scripts/run-browser-qa.mjs');
  for (const contract of [
    'ja-JP', 'Asia/Tokyo', 'hasTouch: true', 'isMobile: true',
    'consoleErrors', 'pageErrors', 'requestFailures', 'responseErrors',
    'naturalWidth', 'rootOverflow', '43.5', 'nearBlank', 'qa-summary.json', 'qa-summary.md',
    'visual scroll roots did not return to origin', 'full-viewport surface is displaced'
  ]) assert.ok(source.includes(contract), `runner must preserve ${contract}`);
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
