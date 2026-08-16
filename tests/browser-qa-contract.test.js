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
  assert.deepStrictEqual(runner.STORY_SCENE_FIXTURES, {
    'story-return-light': {
      sceneIndex: 0, sceneId: 'return-light', sceneTimeMs: 2860, postTimeMs: 0,
      holdCommitted: false, reducedMotion: false, holdVisible: false, closeDisabled: false
    },
    'story-rescue': {
      sceneIndex: 1, sceneId: 'reverse-rescue', sceneTimeMs: 4050, postTimeMs: 0,
      holdCommitted: false, reducedMotion: false, holdVisible: false, closeDisabled: true
    },
    'story-fragment-hold': {
      sceneIndex: 2, sceneId: 'fragment-chamber', sceneTimeMs: 700, postTimeMs: 0,
      holdCommitted: false, reducedMotion: false, holdVisible: true, closeDisabled: false
    },
    'story-fragment-postcommit': {
      sceneIndex: 2, sceneId: 'fragment-chamber', sceneTimeMs: 700, postTimeMs: 2600,
      holdCommitted: true, reducedMotion: false, holdVisible: false, closeDisabled: true
    },
    'story-ledger': {
      sceneIndex: 3, sceneId: 'archive-ledger', sceneTimeMs: 2940, postTimeMs: 0,
      holdCommitted: false, reducedMotion: false, holdVisible: false, closeDisabled: true
    },
    'story-fragment-reduced': {
      sceneIndex: 2, sceneId: 'fragment-chamber', sceneTimeMs: 700, postTimeMs: 2600,
      holdCommitted: true, reducedMotion: true, holdVisible: false, closeDisabled: true
    }
  });
  assert.deepStrictEqual(runner.STORY_CANVAS_PROBE, {
    minStandardDeviation: 8,
    minColorBuckets: 80
  });
  assert.equal(runner.STORY_LIFECYCLE_SCREEN_ID, 'story-ledger');
  assert.deepStrictEqual(
    Object.fromEntries(Object.entries(runner.STORY_MOTION_EVIDENCE).map(([screenId, contract]) => [screenId, {
      motionId: contract.motionId,
      frames: contract.frames.map(({ label, sceneTimeMs, postTimeMs }) => [label, sceneTimeMs, postTimeMs])
    }])),
    {
      'story-return-light': {
        motionId:'returnLightFlicker',
        frames:[['before-weakening',2240,0],['minimum-not-off',2880,0],['unstable-recovery',4400,0]]
      },
      'story-rescue': {
        motionId:'reverseCrackRescue',
        frames:[['reverse-before-crack',1200,0],['crack-after-reverse',1600,0],['guardian-contact',3700,0]]
      },
      'story-fragment-postcommit': {
        motionId:'fragmentConsumeStumble',
        frames:[['lamp-before-interference',700,1100],['body-interference',700,1550],['stumble',700,2200],['companion-approach',700,2500]]
      },
      'story-ledger': {
        motionId:'ledgerBrokenPulse',
        frames:[['pulse-before-gap',2300,0],['inside-320ms-gap',2500,0],['pulse-after-gap',2700,0],['silence',4250,0]]
      }
    }
  );
  const storyAnimations = json('assets/animations/story-ch01.json').storyAnimations;
  const marker = (animation, id) => animation.eventMarkers.find((item) => item.id === id).atMs;
  const returnFrames = runner.STORY_MOTION_EVIDENCE['story-return-light'].frames.map((frame) => frame.sceneTimeMs);
  assert.ok(returnFrames[0] < storyAnimations.returnLightFlicker.phases.find((phase) => phase.id === 'weaken-once').startMs);
  assert.ok(returnFrames[1] >= storyAnimations.returnLightFlicker.phases.find((phase) => phase.id === 'minimum-not-off').startMs);
  assert.ok(returnFrames[2] >= storyAnimations.returnLightFlicker.phases.find((phase) => phase.id === 'unstable-recovery').startMs);
  const rescueFrames = runner.STORY_MOTION_EVIDENCE['story-rescue'].frames.map((frame) => frame.sceneTimeMs);
  assert.ok(rescueFrames[0] >= marker(storyAnimations.reverseCrackRescue, 'reverse_begin')
    && rescueFrames[0] < marker(storyAnimations.reverseCrackRescue, 'crack_begin'));
  assert.ok(rescueFrames[1] >= marker(storyAnimations.reverseCrackRescue, 'crack_begin'));
  assert.ok(rescueFrames[2] >= marker(storyAnimations.reverseCrackRescue, 'guardian_contact'));
  const fragmentFrames = runner.STORY_MOTION_EVIDENCE['story-fragment-postcommit'].frames.map((frame) => frame.postTimeMs);
  assert.ok(fragmentFrames[0] >= marker(storyAnimations.fragmentConsumeStumble, 'community_light_restored')
    && fragmentFrames[0] < marker(storyAnimations.fragmentConsumeStumble, 'body_interference'));
  assert.ok(fragmentFrames[1] >= marker(storyAnimations.fragmentConsumeStumble, 'body_interference'));
  assert.ok(fragmentFrames[2] >= marker(storyAnimations.fragmentConsumeStumble, 'stumble'));
  assert.ok(fragmentFrames[3] >= marker(storyAnimations.fragmentConsumeStumble, 'companion_approach'));
  const ledgerFrames = runner.STORY_MOTION_EVIDENCE['story-ledger'].frames.map((frame) => frame.sceneTimeMs);
  const gapBegin = marker(storyAnimations.ledgerBrokenPulse, 'gap_begin');
  const gapEnd = marker(storyAnimations.ledgerBrokenPulse, 'gap_end');
  assert.equal(gapEnd - gapBegin, 320);
  assert.ok(ledgerFrames[0] < gapBegin);
  assert.ok(ledgerFrames[1] >= gapBegin && ledgerFrames[1] < gapEnd);
  assert.ok(ledgerFrames[2] >= gapEnd);
  assert.ok(ledgerFrames[3] >= marker(storyAnimations.ledgerBrokenPulse, 'silence'));
  assert.deepStrictEqual(runner.SCREEN_IDS, [
    'startup-loading', 'home',
    'story-return-light', 'story-rescue', 'story-fragment-hold', 'story-fragment-postcommit',
    'story-ledger', 'story-fragment-reduced',
    'dex', 'logs', 'equipment', 'gacha', 'outing', 'adventure-loading',
    'battle-hud', 'battle-vfx-lv1', 'battle-vfx-lv3', 'battle-vfx-lv5', 'battle-vfx-lv5-reduced', 'battle-vfx-lv5-low',
    'skill-choice', 'artifact-choice', 'pause', 'result'
  ]);
  assert.deepStrictEqual(runner.VISUAL_SCROLL_ROOTS, {
    'startup-loading': [],
    home: [],
    'story-return-light': [],
    'story-rescue': [],
    'story-fragment-hold': [],
    'story-fragment-postcommit': [],
    'story-ledger': [],
    'story-fragment-reduced': [],
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
    'startup-loading', 'home',
    'story-return-light', 'story-rescue', 'story-fragment-hold', 'story-fragment-postcommit',
    'story-ledger', 'story-fragment-reduced',
    'dex', 'logs', 'equipment', 'gacha', 'outing', 'adventure-loading',
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
    for (const errorText of ['net::ERR_ABORTED', 'Load request cancelled']) {
      assert.equal(runner.isExpectedSpeculativeWarmAbort({
        method: 'GET',
        resourceType: 'fetch',
        isNavigationRequest: false,
        headers: { 'x-moguria-purpose': 'warm-pack:battle-v3' },
        url: new URL(url, baseUrl).href,
        errorText
      }, baseUrl), true, `expected warm abort (${errorText}) must be ignored for ${url}`);
    }
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
    ['near-match cancellation wording', { ...exactWarmAbort, errorText: 'Load request canceled' }],
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
    "failure.resourceType !== 'fetch'", 'SPECULATIVE_WARM_ABORT_ERROR_TEXTS.has(failure.errorText)',
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
    'textVisible: visible(tipText)',
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
    'prepareStoryFixture',
    'openFreshStoryEntry',
    'exerciseStoryLifecycle',
    'fresh-save story entry is not the Home primary action',
    'Chapter 1 production lifecycle did not reach the ledger',
    'MoguriaMeta.awardFromRun(run)',
    'storyPlayer.resumeAfterRun({ run, settlement })',
    'seekForVerification(options)',
    'getVerification?.()',
    "canvas.toDataURL('image/png')",
    'captureStoryMotionEvidence',
    'Chapter 1 marker evidence did not settle',
    'Story motion marker evidence',
    "scale: 'css'",
    'Chapter 1 canvas is blank, undersized, or displaced',
    'Chapter 1 DOM copy is blank or inconsistent',
    'Chapter 1 deliberate-hold progress semantics differ',
    'Object.hasOwn(STORY_SCENE_FIXTURES, screenId)',
    "'story-fragment-postcommit'",
    "'story-fragment-reduced'",
    "style[data-moguria-qa-freeze]",
    'style.sheet.disabled = !enabled',
    'animation.currentTime = 0',
    'animation.currentTime = duration / 4',
    'snapshot?.reducedMotion',
    'insideBusyProgress',
    'insideBusyRegion'
  ]) assert.ok(source.includes(contract), `runner must preserve ${contract}`);
  const loadingTipWaitSource = source.slice(
    source.indexOf('async function waitForRenderedLoadingTip'),
    source.indexOf('async function inspectLoadingState')
  );
  for (const loadingTipWaitContract of [
    'page.waitForFunction',
    "tips.getAttribute('data-visible') !== 'true'",
    "tips.getAttribute('aria-hidden') !== 'false'",
    "tips.hasAttribute('inert')",
    'tipText.textContent?.trim()',
    "tipText.getAttribute('data-tip-id')",
    'tipText.getBoundingClientRect()',
    'panelOpacity < 0.95',
    'textOpacity < 0.99',
    "style.display === 'none'",
    "Number(style.opacity) === 0",
    'timeout:LOADING_QA_CONTRACT.tipTransitionMs + 1800',
    'diagnostic = await inspectLoadingState(page, kind)',
    'rendered loading tip did not become ready'
  ]) assert.ok(loadingTipWaitSource.includes(loadingTipWaitContract),
    `compact loading readiness must require ${loadingTipWaitContract}`);
  const loadingFixtureSource = source.slice(
    source.indexOf('async function prepareLoadingFixture'),
    source.indexOf('const alignmentFailures')
  );
  assert.match(loadingFixtureSource,
    /revealMs: 0,[\s\S]*await waitForRenderedLoadingTip\(page, kind\);\s+fixture\.tipsAfterReveal = await inspectLoadingState\(page, kind\);/,
    'compact loading QA must wait for actual rendered tip text before inspection');
  const lifecycleSource = source.slice(
    source.indexOf('async function openFreshStoryEntry'),
    source.indexOf('async function prepareStoryFixture')
  );
  for (const productionCall of [
    'window.MoguriaSave.clear()',
    "saveApi.transitionStory('c1_investigation_ready')",
    'saveApi.startRun({ runId, profileId })',
    'window.MoguriaMeta.awardFromRun(run)',
    'storyPlayer.resumeAfterRun({ run, settlement })'
  ]) assert.ok(lifecycleSource.includes(productionCall), `Story lifecycle must use ${productionCall}`);
  assert.doesNotMatch(lifecycleSource, /localStorage\.(?:setItem|removeItem)|MoguriaSave\.save\(|MoguriaGame\.dev\w+|window\.Moguria\w+\s*=/,
    'Story lifecycle must not install a QA route, mutate a production API, or forge storage directly');
  const motionEvidenceSource = source.slice(
    source.indexOf('async function captureStoryMotionEvidence'),
    source.indexOf('async function auditStoryDom')
  );
  assert.match(motionEvidenceSource, /STORY_MOTION_EVIDENCE\[screenId\]/);
  assert.match(motionEvidenceSource, /locator\('#storyChapter01Canvas'\)\.screenshot/);
  assert.match(motionEvidenceSource, /const stable = STORY_SCENE_FIXTURES\[screenId\]/,
    'marker evidence must restore the approved stable screenshot state');
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

test('Story runtime evidence records all four motions continuously and projects fixed-cell pivots', async () => {
  const runner = await import('../scripts/run-browser-qa.mjs');
  const projection = json('assets/animations/story-ch01.json');
  assert.deepStrictEqual(runner.BROWSER_QA_TIME_BUDGET, {
    workflowTimeoutMs:20 * 60 * 1000,
    maximumCaptureSetupMs:14 * 60 * 1000,
    maximumDeferredVideoAuditMs:210000,
    summaryUploadReserveMs:2 * 60 * 1000
  });
  assert.deepStrictEqual(runner.STORY_RUNTIME_VIDEO_CONTRACT, {
    logicalTiming:'runtime-1x-no-seek',
    holdTimeoutMs:3000,
    completionTimeoutMs:15000,
    minimumRuntimeWallMs:20000,
    minimumVideoBytes:65536,
    maximumVideoBytes:134217728,
    minimumVideoDurationSeconds:20,
    maximumDecodeAttempts:3,
    decodeAttemptTimeoutMs:30000,
    videoArtifactAuditTimeoutMs:85000,
    totalVideoAuditTimeoutMs:210000,
    browserCloseTimeoutMs:5000,
    lifecycleFreezeWallMs:600,
    lifecycleClockToleranceMs:34,
    lifecycleResumeAdvanceMs:120,
    delayedHoldWaitMs:1200,
    earlyHoldMaximumDelayMs:750,
    minimumHoldWallMs:700,
    videoSampleFractions:[0.08, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92],
    minimumDecodedStandardDeviation:3,
    minimumDecodedColorBuckets:8,
    minimumDecodedNonBlankSamples:7,
    minimumDecodedChangedPairs:3,
    minimumDecodedUniqueFrames:4,
    minimumDecodedMeanDifference:2,
    minimumDecodedChangedPixelRatio:0.02,
    motions:[
      { sceneIndex:0, sceneId:'return-light', motionId:'returnLightFlicker', durationMs:5400 },
      { sceneIndex:1, sceneId:'reverse-rescue', motionId:'reverseCrackRescue', durationMs:6400 },
      { sceneIndex:2, sceneId:'fragment-chamber', motionId:'fragmentConsumeStumble', preCommitMs:700, durationMs:5250 },
      { sceneIndex:3, sceneId:'archive-ledger', motionId:'ledgerBrokenPulse', durationMs:5400 }
    ]
  });
  assert.deepStrictEqual(runner.STORY_RUNTIME_EVIDENCE_MODES, [
    { id:'normal', reducedMotion:false, exerciseLifecycle:false, holdTiming:'early' },
    { id:'reduced-lifecycle-delayed', reducedMotion:true, exerciseLifecycle:true, holdTiming:'delayed' }
  ]);
  assert.deepStrictEqual(
    runner.STORY_RUNTIME_VIDEO_CONTRACT.motions.map((motion) => motion.motionId),
    Object.keys(projection.storyAnimations)
  );
  const workflow = read('.github/workflows/browser-qa.yml');
  const workflowTimeoutMinutes = Number(workflow.match(/^    timeout-minutes: (\d+)$/m)?.[1]);
  assert.equal(
    runner.BROWSER_QA_TIME_BUDGET.workflowTimeoutMs,
    workflowTimeoutMinutes * 60 * 1000,
    'the runner wall budget must match the browser-QA workflow timeout'
  );
  assert.ok(runner.BROWSER_QA_TIME_BUDGET.summaryUploadReserveMs > 0,
    'the workflow must reserve time to serialize and upload fail-closed evidence');
  assert.equal(
    runner.STORY_RUNTIME_VIDEO_CONTRACT.totalVideoAuditTimeoutMs,
    runner.BROWSER_QA_TIME_BUDGET.maximumDeferredVideoAuditMs,
    'the deferred audit ceiling must come from the workflow wall budget'
  );
  assert.ok(runner.STORY_RUNTIME_VIDEO_CONTRACT.totalVideoAuditTimeoutMs <= 240000,
    'deferred video audits must not consume more than four minutes of the workflow');
  assert.ok(
    runner.BROWSER_QA_TIME_BUDGET.workflowTimeoutMs
      - runner.BROWSER_QA_TIME_BUDGET.maximumCaptureSetupMs
      - runner.STORY_RUNTIME_VIDEO_CONTRACT.totalVideoAuditTimeoutMs
      >= runner.BROWSER_QA_TIME_BUDGET.summaryUploadReserveMs,
    'the maximum capture/setup and deferred-audit budgets must preserve the summary/upload reserve'
  );

  const manifest = json('assets/manifest.json');
  const atlasIds = ['currentMogu', 'youngMogu', 'starGuardianCandidate', 'starCompanion'];
  const expectedAtlases = atlasIds.map((id) => {
    const atlas = projection.poseAtlases[id];
    const pack = manifest.packs.find((candidate) => candidate.assets.some((asset) => asset.id === atlas.assetId));
    assert.equal(atlas.noAutoCrop, true);
    assert.equal(atlas.frameOrder, 'row-major');
    assert.equal(atlas.cellOrigin, 'top-left');
    assert.equal(atlas.pivot.space, 'cell-normalized');
    assert.equal(atlas.width, atlas.columns * atlas.cell.width);
    assert.equal(atlas.height, atlas.rows * atlas.cell.height);
    assert.ok(pack, `runtime pack is required for ${atlas.assetId}`);
    return {
      id,
      assetId:atlas.assetId,
      packId:pack.id,
      width:atlas.width,
      height:atlas.height,
      columns:atlas.columns,
      rows:atlas.rows,
      cell:{ width:atlas.cell.width, height:atlas.cell.height },
      pivot:{ x:atlas.pivot.x, y:atlas.pivot.y }
    };
  });
  assert.deepStrictEqual(runner.STORY_PIVOT_ATLASES, expectedAtlases);

  const source = read('scripts/run-browser-qa.mjs');
  const evidenceSource = source.slice(
    source.indexOf('async function openFreshStoryRuntimeEntry'),
    source.indexOf('function summaryMarkdown')
  );
  assert.ok(evidenceSource.length > 0, 'continuous runtime evidence implementation must be present');
  for (const productionContract of [
    'window.MoguriaSave.clear()',
    "locator('#startBtn')",
    'window.MoguriaStoryChapter01?.open',
    "player.open({ replay:true, currentNodeId:'c1_available' })",
    "locator('#storyChapter01Next').click()",
    "page.keyboard.down('Space')",
    "page.keyboard.up('Space')",
    'timeout:STORY_RUNTIME_VIDEO_CONTRACT.holdTimeoutMs',
    'waitForRuntimeMotionCompletion(page, motion, mode, motionStartedAt)',
    'record.runtimeWallDurationMs = Date.now() - replayStartedAt',
    'record.runtimeWallDurationMs < STORY_RUNTIME_VIDEO_CONTRACT.minimumRuntimeWallMs',
    'JSON.stringify(window.MoguriaSave.load()) === beforeReplay',
    "reducedMotion:mode.reducedMotion ? 'reduce' : 'no-preference'",
    'const videoSize = { width:viewport.width & ~1, height:viewport.height & ~1 }',
    'recordVideo:{ dir:captureDirectory, size:videoSize }',
    'video = page.video()',
    'await context.close()',
    'await video.saveAs(videoPath)',
    'await video.delete()',
    "status:'pending-capture'",
    "captureStatus:'pending'",
    "record.status = 'pending-audit'",
    "headerHex === '1a45dfa3'"
  ]) assert.ok(evidenceSource.includes(productionContract), `runtime evidence must preserve ${productionContract}`);
  assert.doesNotMatch(evidenceSource,
    /seekForVerification|getVerification|addInitScript|Math\.random\s*=|localStorage\.(?:setItem|removeItem)|MoguriaSave\.save\(|MoguriaGame\.dev\w+|(?:Date|performance)\.now\s*=|requestAnimationFrame\s*=|window\.Moguria\w+\s*=/,
    'continuous video must use the real replay clock and production APIs without installing a QA route');

  const lifecycleSource = source.slice(
    source.indexOf('async function exerciseStoryPauseResume'),
    source.indexOf('async function captureStoryPivotOverlay')
  );
  for (const lifecycleContract of [
    "locator('#storyChapter01Pause')",
    "dataset?.storyPaused === 'true'",
    'lifecycleFreezeWallMs',
    'lifecycleClockToleranceMs',
    'lifecycleResumeAdvanceMs',
    "dataset?.storyPaused === 'false'",
    'resumedAt - frozenAt'
  ]) assert.ok(lifecycleSource.includes(lifecycleContract), `runtime lifecycle evidence must use ${lifecycleContract}`);
  assert.doesNotMatch(lifecycleSource,
    /dispatchEvent|Object\.defineProperty|emulateMedia|newCDPSession|_channel|player\.(?:pause|resume)\(|bringToFront|document\.hasFocus|(?:add|remove)EventListener\(['"](?:blur|focus)|context\.newPage/,
    'runtime lifecycle evidence must use the real UI pause control without synthetic or unobservable focus assertions');

  const pivotSource = source.slice(
    source.indexOf('async function captureStoryPivotOverlay'),
    source.indexOf('function inspectStoryVideoArtifact')
  );
  for (const projectionContract of [
    "assets.getJson('story_ch01_animation_manifest')",
    'assets.getImage(definition?.assetId)',
    'definition.cell.width',
    'definition.cell.height',
    'definition.pivot.x',
    'definition.pivot.y',
    "canvas.toDataURL('image/png')",
    'story-pose-atlas-pivots${modeSuffix}.png'
  ]) assert.ok(pivotSource.includes(projectionContract), `pivot evidence must use ${projectionContract}`);

  const runtimeFunction = source.slice(
    source.indexOf('async function runStoryRuntimeEvidence'),
    source.indexOf('function summaryMarkdown')
  );
  const captureFunction = source.slice(
    source.indexOf('async function runStoryRuntimeEvidence'),
    source.indexOf('async function finalizeStoryRuntimeEvidence')
  );
  const finalizerSource = source.slice(
    source.indexOf('async function finalizeStoryRuntimeEvidence'),
    source.indexOf('function summaryMarkdown')
  );
  assert.equal((runtimeFunction.match(/browser\.newContext\(/g) || []).length, 1);
  assert.equal((runtimeFunction.match(/context\.newPage\(\)/g) || []).length, 1);
  assert.doesNotMatch(runtimeFunction, /focusLossReturn|exerciseStoryFocusLossReturn|waitForActualPageFocus/,
    'continuous runtime evidence must not depend on cross-tab focus state that CI cannot observe reliably');
  assert.match(runtimeFunction,
    /mode\.exerciseLifecycle[\s\S]*record\.lifecycle = \{ pauseResume:await exerciseStoryPauseResume\(page\) \}/,
    'reduced/lifecycle evidence must still exercise the production UI pause/resume control');
  assert.doesNotMatch(captureFunction, /inspectStoryVideoArtifact|record\.status = record\.failures/,
    'video capture must remain pending until the producer browser is closed and deferred audit completes');
  assert.match(captureFunction,
    /record\.captureStatus = record\.failures\.length \? 'failed' : 'passed';\s+record\.status = 'pending-audit';/,
    'capture finalization must expose a non-final pending-audit state');
  assert.match(finalizerSource,
    /record\.status !== 'pending-audit'[\s\S]*inspectStoryVideoArtifact\([\s\S]*record\.failures\.push\(`runtime Story video is missing or invalid[\s\S]*record\.status = record\.failures\.length \? 'failed' : 'passed'/,
    'deferred audit must append to capture failures before setting final status');
  for (const holdContract of [
    "mode.holdTiming === 'delayed'",
    'page.waitForTimeout(STORY_RUNTIME_VIDEO_CONTRACT.delayedHoldWaitMs)',
    'const holdReadyAt = Date.now()',
    'holdStartedAt - holdReadyAt',
    'holdStartDelayMs > STORY_RUNTIME_VIDEO_CONTRACT.earlyHoldMaximumDelayMs',
    'holdStartDelayMs < STORY_RUNTIME_VIDEO_CONTRACT.delayedHoldWaitMs',
    "activeHold.domHolding !== 'true'",
    'holdWallDurationMs < STORY_RUNTIME_VIDEO_CONTRACT.minimumHoldWallMs'
  ]) assert.ok(runtimeFunction.includes(holdContract), `fragment hold evidence must enforce ${holdContract}`);
  const mainSource = source.slice(source.indexOf('async function main'), source.indexOf("if (process.argv[1]"));
  assert.equal((mainSource.match(/runStoryRuntimeEvidence\(/g) || []).length, 1,
    'one runtime evidence context must be created inside each viewport iteration');
  assert.match(mainSource, /for \(const viewport of VIEWPORTS\)[\s\S]*for \(const mode of STORY_RUNTIME_EVIDENCE_MODES\)[\s\S]*runStoryRuntimeEvidence\([\s\S]*storyRuntimeEvidence\.push\(evidence\)/);
  assert.match(mainSource, /storyRuntimeEvidence\.every\(\(record\) => record\.status === 'passed'\)/,
    'missing video or pivot evidence must fail the summary');
  for (const orchestrationContract of [
    'const launchOptions = Object.freeze({ headless:!options.headed })',
    'browser = await browserType.launch(launchOptions)',
    'producerShutdown.contextsBeforeClose = browser.contexts().length',
    "withDeadline(browser.close(), producerCloseDeadline, 'producer browser close')",
    'producerShutdown.disconnected = !browser.isConnected()',
    'browser = null',
    'totalVideoAuditTimeoutMs',
    'BROWSER_QA_TIME_BUDGET.workflowTimeoutMs',
    'BROWSER_QA_TIME_BUDGET.summaryUploadReserveMs',
    'for (const evidence of storyRuntimeEvidence)',
    'await finalizeStoryRuntimeEvidence(',
    'evidence, browserType, options.output, launchOptions, totalAuditDeadline',
    'orchestrationFailures.length === 0'
  ]) assert.ok(mainSource.includes(orchestrationContract),
    `deferred audit orchestration must enforce ${orchestrationContract}`);
  assert.ok(
    mainSource.indexOf('storyRuntimeEvidence.push(evidence)')
      < mainSource.indexOf('producerShutdown.contextsBeforeClose = browser.contexts().length')
      && mainSource.indexOf('producerShutdown.disconnected = !browser.isConnected()')
        < mainSource.indexOf('await finalizeStoryRuntimeEvidence('),
    'all captures must finalize and the producer must disconnect before any artifact audit'
  );
  const deferredAuditLoop = mainSource.slice(
    mainSource.indexOf('const totalAuditDeadline'),
    mainSource.indexOf('const summary =')
  );
  assert.doesNotMatch(deferredAuditLoop, /Promise\.all/,
    'the four artifacts and their dedicated audits must remain fully sequential');
  assert.match(deferredAuditLoop,
    /const totalAuditDeadline = Math\.min\([\s\S]*Date\.now\(\) \+ STORY_RUNTIME_VIDEO_CONTRACT\.totalVideoAuditTimeoutMs[\s\S]*Date\.parse\(startedAt\) \+ BROWSER_QA_TIME_BUDGET\.workflowTimeoutMs[\s\S]*- BROWSER_QA_TIME_BUDGET\.summaryUploadReserveMs/,
    'the deferred audit must stop before the workflow-wide summary/upload reserve');
  assert.match(source, /Story continuous runtime evidence/);
  assert.match(source, /runtime Story video is missing or invalid/);
  assert.match(source, /runtime Story pivot overlay is missing or invalid/);

  const decodeSource = source.slice(
    source.indexOf('async function inspectStoryVideoArtifact'),
    source.indexOf('async function runStoryRuntimeEvidence')
  );
  for (const decodeContract of [
    'maximumVideoBytes',
    "new Blob([bytes], { type:'video/webm' })",
    "video.canPlayType('video/webm; codecs=\"vp8\"')",
    "waitFor('loadedmetadata', 10000)",
    'video.duration',
    'video.videoWidth',
    'video.videoHeight',
    "waitFor('seeked', 10000)",
    'context.drawImage(video',
    'context.getImageData(',
    'standardDeviation',
    'colorBuckets',
    'adjacentDifferences',
    'changedPixelRatio',
    'uniqueFrameHashes',
    'minimumDecodedNonBlankSamples',
    'minimumDecodedChangedPairs',
    'minimumDecodedUniqueFrames',
    'maximumDecodeAttempts',
    'decodeAttemptCount',
    'decodeAttempts',
    'decodeErrors',
    'for (let attempt = 1; attempt <= STORY_RUNTIME_VIDEO_CONTRACT.maximumDecodeAttempts; attempt += 1)',
    "launchOptions.headless ? 'headless' : 'headed'",
    "processIsolation = 'dedicated-browser-process-after-producer-close'",
    'auditBrowser = await browserType.launch({',
    '...launchOptions',
    'auditBrowser.contexts().length !== 0',
    'auditBrowser.contexts().length !== 1',
    'auditContext.pages().length !== 1',
    'auditPage.bringToFront()',
    'auditContext.close()',
    'auditBrowser.close()',
    'cleanupDeadline',
    'auditBrowser.isConnected()',
    'decodeAttemptTimeoutMs',
    'videoArtifactAuditTimeoutMs',
    'withDeadline(auditPage.evaluate',
    'browserType.name()',
    "browserName === 'webkit'",
    "'webkit-playback-quality-raf'",
    "'request-video-frame-callback'",
    'presentationStrategy',
    'sourceSha256Before',
    'sourceSha256After',
    'video artifact bytes changed during audit attempt',
    'startedAt',
    'completedAt',
    'auditCleanupFailed',
    'browserCloseTimeoutMs',
    "status:attemptResult.passed ? 'passed' : 'invalid-content'",
    "let decodePhase = 'metadata'",
    "decodePhase = 'first-frame'",
    "waitFor('loadeddata', 10000)",
    'HTMLMediaElement.HAVE_CURRENT_DATA',
    'if (video.error) onError()',
    'capturePresentedFrame',
    'captureWithPlaybackQuality',
    'readPlaybackQuality',
    'cancelAnimationFrame',
    'video.getVideoPlaybackQuality',
    'quality?.totalVideoFrames',
    'quality?.droppedVideoFrames',
    'Number.isFinite(totalVideoFrames)',
    'Number.isFinite(droppedVideoFrames)',
    'displayedVideoFrames:totalVideoFrames - droppedVideoFrames',
    'qualityBefore',
    'qualityAfter',
    'displayedFrameIncrease',
    'if (video.paused)',
    'video.requestVideoFrameCallback',
    'video.cancelVideoFrameCallback',
    "presentationMethod:'requestVideoFrameCallback'",
    "presentationMethod:'getVideoPlaybackQuality+rAF'",
    "fail(new Error('requestVideoFrameCallback timed out for the requested frame'))",
    'await capturePresentedFrame(',
    'targetSeconds, context, canvas, 10000',
    'targetSeconds',
    'currentTime:video.currentTime',
    'mediaTime',
    'frameReadiness',
    'strategyEvidenceComplete',
    'playbackQualityEvidenceComplete',
    'decodePhase = `seek@${fraction}`',
    'throw new Error(`${decodePhase}: ${error?.message || String(error)}`)',
    'retries are reserved for transient engine errors'
  ]) assert.ok(decodeSource.includes(decodeContract), `WebM decode audit must enforce ${decodeContract}`);
  assert.equal((decodeSource.match(/auditBrowser = await browserType\.launch\(/g) || []).length, 1,
    'the per-attempt loop must contain exactly one dedicated browser launch site');
  assert.match(decodeSource,
    /for \(let attempt = 1; attempt <= STORY_RUNTIME_VIDEO_CONTRACT\.maximumDecodeAttempts; attempt \+= 1\)[\s\S]*auditBrowser = await browserType\.launch\(\{[\s\S]*\.\.\.launchOptions[\s\S]*auditContext = await withDeadline\(auditBrowser\.newContext/,
    'every attempt must start its own same-mode browser process and one context');
  assert.match(decodeSource,
    /if \(!launchOptions\.headless\) \{[\s\S]*auditPage\.bringToFront\(\)/,
    'headed audits must activate their sole page under the workflow display');
  assert.match(decodeSource,
    /finally \{[\s\S]*withDeadline\([\s\S]*auditContext\.close\(\), cleanupDeadline[\s\S]*withDeadline\([\s\S]*auditBrowser\.close\(\), cleanupDeadline[\s\S]*auditBrowser\.isConnected\(\)/,
    'every dedicated browser must disconnect after its audit context closes');
  assert.match(decodeSource,
    /if \(attemptError\)[\s\S]*decodeAttempts\.push\(attemptRecord\)[\s\S]*continue;[\s\S]*status:attemptResult\.passed \? 'passed' : 'invalid-content'[\s\S]*return result;/,
    'engine errors may retry, but a completed invalid content audit must return immediately');
  assert.match(decodeSource,
    /const launchMode = launchOptions\.headless \? 'headless' : 'headed';[\s\S]*const processIsolation = 'dedicated-browser-process-after-producer-close';/,
    'every attempt must record dedicated-process isolation and the original launch mode');
  assert.match(decodeSource,
    /sourceSha256Before = sha256\(fs\.readFileSync\(filePath\)\)[\s\S]*sourceSha256After = sha256\(fs\.readFileSync\(filePath\)\)[\s\S]*sourceSha256After !== sourceSha256/,
    'each attempt must hash-check the original artifact before and after browser inspection');
  assert.match(decodeSource,
    /dedicated audit browser close failed[\s\S]*stopRetries = true;[\s\S]*auditCleanupFailed = true;/,
    'a failed dedicated-browser close must stop retries and fail orchestration closed');
  assert.match(decodeSource,
    /artifactDeadline = Math\.min\([\s\S]*videoArtifactAuditTimeoutMs[\s\S]*totalAuditDeadline[\s\S]*attemptDeadline = Math\.min\([\s\S]*decodeAttemptTimeoutMs[\s\S]*artifactDeadline/,
    'artifact and attempt deadlines must be nested under the global audit deadline');
  assert.match(decodeSource,
    /withDeadline\(auditPage\.evaluate[\s\S]*attemptDeadline, 'dedicated video content audit'/,
    'the complete eight-sample browser evaluation must have an outer attempt deadline');
  assert.match(decodeSource,
    /decodePhase = 'first-frame';[\s\S]*HTMLMediaElement\.HAVE_CURRENT_DATA[\s\S]*waitFor\('loadeddata', 10000\)[\s\S]*decodePhase = `seek@\$\{fraction\}`/,
    'the audit must wait for first-frame data before phase-labelled seeking');
  assert.match(decodeSource,
    /const browserName = browserType\.name\(\);\s+const presentationStrategy = browserName === 'webkit'\s+\? 'webkit-playback-quality-raf'\s+: 'request-video-frame-callback';/,
    'the public Playwright browser name must select the presentation strategy on the Node side');
  assert.match(decodeSource,
    /auditPage\.evaluate\(async \(\{[\s\S]*presentationStrategy[\s\S]*\}\) =>[\s\S]*base64:buffer\.toString\('base64'\)[\s\S]*presentationStrategy/,
    'the selected Node-side strategy must be passed explicitly into the browser audit');
  const qualitySource = decodeSource.slice(
    decodeSource.indexOf('const captureWithPlaybackQuality'),
    decodeSource.indexOf('const capturePresentedFrame')
  );
  assert.match(qualitySource,
    /new Promise\(\(resolve, reject\) => \{[\s\S]*qualityBefore = readPlaybackQuality\(true\)[\s\S]*setTimeout\([\s\S]*video\.addEventListener\('error', onError, \{ once:true \}\)[\s\S]*frameId = requestAnimationFrame\(inspectPresentedFrame\)[\s\S]*video\.play\(\)/,
    'WebKit playback-quality capture must be bounded, error-aware, and driven by real playback plus rAF');
  assert.match(qualitySource,
    /qualityAfter\.displayedVideoFrames <= qualityBefore\.displayedVideoFrames[\s\S]*video\.currentTime < targetSeconds - frameToleranceSeconds[\s\S]*video\.currentTime > targetSeconds \+ frameToleranceSeconds[\s\S]*video\.pause\(\);\s+try \{\s+context\.drawImage\(video[\s\S]*qualityBefore,[\s\S]*qualityAfter,/,
    'WebKit must synchronously draw only after a strict displayed-frame increase inside target tolerance');
  assert.match(qualitySource,
    /const cleanup = \(\) => \{[\s\S]*clearTimeout\(timer\)[\s\S]*removeEventListener\('error', onError\)[\s\S]*cancelAnimationFrame\(frameId\)/,
    'the WebKit playback-quality path must cancel its timer, rAF, and error listener');
  assert.doesNotMatch(qualitySource, /requestVideoFrameCallback|timeAdvanced|initialTime \+ 1 \/ 120/,
    'the WebKit strategy must bypass rVFC and cannot accept currentTime-only readiness');
  const strategyDispatchSource = decodeSource.slice(
    decodeSource.indexOf('const capturePresentedFrame'),
    decodeSource.indexOf("let decodePhase = 'metadata'")
  );
  assert.match(strategyDispatchSource,
    /presentationStrategy === 'webkit-playback-quality-raf'[\s\S]*return captureWithPlaybackQuality[\s\S]*presentationStrategy !== 'request-video-frame-callback'[\s\S]*typeof video\.requestVideoFrameCallback !== 'function'/,
    'WebKit must exit through playback quality before the Chromium rVFC path is considered');
  assert.match(decodeSource,
    /totalVideoFrames < droppedVideoFrames[\s\S]*displayedVideoFrames:totalVideoFrames - droppedVideoFrames/,
    'playback quality must require finite coherent total/dropped counters and derive displayed frames');
  assert.match(decodeSource,
    /playbackQualityEvidenceComplete[\s\S]*before\.totalVideoFrames >= before\.droppedVideoFrames[\s\S]*after\.totalVideoFrames >= after\.droppedVideoFrames[\s\S]*after\.displayedVideoFrames > before\.displayedVideoFrames[\s\S]*&& playbackQualityEvidenceComplete/,
    'WebKit before/after counter evidence and strict increase must be part of the pass gate');
  assert.doesNotMatch(decodeSource,
    /captureWithPlaybackFallback|playback-quality-or-time-fallback|timeAdvanced|initialTime \+ 1 \/ 120/,
    'currentTime-only readiness and the former fallback must be removed');
  assert.match(decodeSource,
    /callbackId = video\.requestVideoFrameCallback\(onFrame\);\s+let playPromise;[\s\S]*playPromise = video\.play\(\)/,
    'the compositor callback must be armed synchronously before muted playback starts');
  assert.match(decodeSource,
    /const onFrame = \(_now, metadata\) =>[\s\S]*mediaTime < targetSeconds - frameToleranceSeconds[\s\S]*mediaTime > targetSeconds \+ frameToleranceSeconds[\s\S]*video\.pause\(\);\s+try \{\s+context\.drawImage\(video[\s\S]*presentationMethod:'requestVideoFrameCallback'/,
    'only a near-target compositor frame may be drawn synchronously inside rVFC');
  assert.match(decodeSource,
    /if \(typeof video\.requestVideoFrameCallback !== 'function'\) \{\s+return Promise\.reject\(new Error\('requestVideoFrameCallback is unavailable'\)\)/,
    'the Chromium strategy must fail closed if rVFC is unavailable instead of changing readiness strategy');
  assert.match(decodeSource,
    /const seeked = waitFor\('seeked', 10000\);\s+video\.currentTime = targetSeconds;\s+await seeked;[\s\S]*frameReadiness = await capturePresentedFrame/,
    'each seek must finish before the compositor-frame capture is armed');
  assert.ok(
    decodeSource.indexOf("presentationMethod:'requestVideoFrameCallback'")
      > decodeSource.indexOf('context.drawImage(video'),
    'the rVFC path must draw synchronously inside its accepted frame callback'
  );
  assert.doesNotMatch(decodeSource, /setTimeout\(resolve, 50\)|paint-ready-fallback/,
    'post-seek readiness must not reuse the WebKit double-paint timing heuristic');
  assert.doesNotMatch(decodeSource, /getImageData\([\s\S]*while \(/,
    'the decoder must not canvas-poll until content appears');
  assert.doesNotMatch(decodeSource, /ffprobe|child_process|newCDPSession|_channel/,
    'WebM audit must use public Playwright and web APIs only');
  assert.doesNotMatch(decodeSource, /headless:true|producer-browser|existing-browser|fresh-browser-process/,
    'deferred audits must preserve the producer launch mode and never reuse its process');
  assert.ok(
    runtimeFunction.indexOf('await context.close()')
      < runtimeFunction.indexOf('await video.saveAs(videoPath)'),
    'video context must close before the finalized WebM is saved'
  );
  assert.ok(
    runtimeFunction.indexOf('await video.saveAs(videoPath)')
      < runtimeFunction.indexOf('record.videoArtifact = await inspectStoryVideoArtifact('),
    'decode audit must run only after the finalized WebM is saved'
  );
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
