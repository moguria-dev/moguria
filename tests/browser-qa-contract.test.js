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
  assert.deepStrictEqual(runner.STORY_RUNTIME_VIDEO_CONTRACT, {
    logicalTiming:'runtime-1x-no-seek',
    holdTimeoutMs:3000,
    completionTimeoutMs:15000,
    minimumRuntimeWallMs:20000,
    minimumVideoBytes:65536,
    maximumVideoBytes:134217728,
    minimumVideoDurationSeconds:20,
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
    'await inspectStoryVideoArtifact(browser, videoPath, videoSize)',
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
    'lifecycleResumeAdvanceMs',
    'context.newPage()',
    "coverPage.goto('about:blank')",
    'coverPage.bringToFront()',
    'waitForActualPageVisibility(page, true)',
    'page.bringToFront()',
    'waitForActualPageVisibility(page, false)',
    "document.addEventListener('visibilitychange', evidence.handler)",
    "event.hidden === true && event.visibilityState === 'hidden'",
    "event.hidden === false && event.visibilityState === 'visible'"
  ]) assert.ok(lifecycleSource.includes(lifecycleContract), `runtime lifecycle evidence must use ${lifecycleContract}`);
  assert.doesNotMatch(lifecycleSource,
    /dispatchEvent|Object\.defineProperty|emulateMedia|newCDPSession|_channel|player\.(?:pause|resume)\(/,
    'runtime lifecycle evidence must observe real browser/UI events without emulation or private APIs');

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
  assert.equal((runtimeFunction.match(/browser\.newContext\(/g) || []).length, 1);
  assert.equal((runtimeFunction.match(/context\.newPage\(\)/g) || []).length, 1);
  for (const holdContract of [
    "mode.holdTiming === 'delayed'",
    'page.waitForTimeout(STORY_RUNTIME_VIDEO_CONTRACT.delayedHoldWaitMs)',
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
    'minimumDecodedUniqueFrames'
  ]) assert.ok(decodeSource.includes(decodeContract), `WebM decode audit must enforce ${decodeContract}`);
  assert.doesNotMatch(decodeSource, /ffprobe|child_process|newCDPSession|_channel/,
    'WebM audit must use the generated browser and public web APIs only');
  assert.ok(
    runtimeFunction.indexOf('await context.close()')
      < runtimeFunction.indexOf('await video.saveAs(videoPath)'),
    'video context must close before the finalized WebM is saved'
  );
  assert.ok(
    runtimeFunction.indexOf('await video.saveAs(videoPath)')
      < runtimeFunction.indexOf('await inspectStoryVideoArtifact(browser, videoPath, videoSize)'),
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
