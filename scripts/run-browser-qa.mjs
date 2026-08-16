import fs from 'node:fs';
import { createHash } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const PLAYWRIGHT_VERSION = '1.62.0';
export const FIXED_SEED = 20260814;
export const VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'iphone-390x844', width: 390, height: 844, deviceScaleFactor: 3 }),
  Object.freeze({ id: 'iphone-se-375x667', width: 375, height: 667, deviceScaleFactor: 2 })
]);
export const STORY_SCENE_FIXTURES = Object.freeze({
  'story-return-light': Object.freeze({
    sceneIndex: 0, sceneId: 'return-light', sceneTimeMs: 2860, postTimeMs: 0,
    holdCommitted: false, reducedMotion: false, holdVisible: false, closeDisabled: false
  }),
  'story-rescue': Object.freeze({
    sceneIndex: 1, sceneId: 'reverse-rescue', sceneTimeMs: 4050, postTimeMs: 0,
    holdCommitted: false, reducedMotion: false, holdVisible: false, closeDisabled: true
  }),
  'story-fragment-hold': Object.freeze({
    sceneIndex: 2, sceneId: 'fragment-chamber', sceneTimeMs: 700, postTimeMs: 0,
    holdCommitted: false, reducedMotion: false, holdVisible: true, closeDisabled: false
  }),
  'story-fragment-postcommit': Object.freeze({
    sceneIndex: 2, sceneId: 'fragment-chamber', sceneTimeMs: 700, postTimeMs: 2600,
    holdCommitted: true, reducedMotion: false, holdVisible: false, closeDisabled: true
  }),
  'story-ledger': Object.freeze({
    sceneIndex: 3, sceneId: 'archive-ledger', sceneTimeMs: 2940, postTimeMs: 0,
    holdCommitted: false, reducedMotion: false, holdVisible: false, closeDisabled: true
  }),
  'story-fragment-reduced': Object.freeze({
    sceneIndex: 2, sceneId: 'fragment-chamber', sceneTimeMs: 700, postTimeMs: 2600,
    holdCommitted: true, reducedMotion: true, holdVisible: false, closeDisabled: true
  })
});
export const STORY_CANVAS_PROBE = Object.freeze({
  minStandardDeviation: 8,
  minColorBuckets: 80
});
export const STORY_LIFECYCLE_SCREEN_ID = 'story-ledger';
export const STORY_MOTION_EVIDENCE = Object.freeze({
  'story-return-light': Object.freeze({
    motionId: 'returnLightFlicker',
    frames: Object.freeze([
      Object.freeze({ label:'before-weakening', sceneIndex:0, sceneTimeMs:2240, postTimeMs:0, holdCommitted:false }),
      Object.freeze({ label:'minimum-not-off', sceneIndex:0, sceneTimeMs:2880, postTimeMs:0, holdCommitted:false }),
      Object.freeze({ label:'unstable-recovery', sceneIndex:0, sceneTimeMs:4400, postTimeMs:0, holdCommitted:false })
    ])
  }),
  'story-rescue': Object.freeze({
    motionId: 'reverseCrackRescue',
    frames: Object.freeze([
      Object.freeze({ label:'reverse-before-crack', sceneIndex:1, sceneTimeMs:1200, postTimeMs:0, holdCommitted:false }),
      Object.freeze({ label:'crack-after-reverse', sceneIndex:1, sceneTimeMs:1600, postTimeMs:0, holdCommitted:false }),
      Object.freeze({ label:'guardian-contact', sceneIndex:1, sceneTimeMs:3700, postTimeMs:0, holdCommitted:false })
    ])
  }),
  'story-fragment-postcommit': Object.freeze({
    motionId: 'fragmentConsumeStumble',
    frames: Object.freeze([
      Object.freeze({ label:'lamp-before-interference', sceneIndex:2, sceneTimeMs:700, postTimeMs:1100, holdCommitted:true }),
      Object.freeze({ label:'body-interference', sceneIndex:2, sceneTimeMs:700, postTimeMs:1550, holdCommitted:true }),
      Object.freeze({ label:'stumble', sceneIndex:2, sceneTimeMs:700, postTimeMs:2200, holdCommitted:true }),
      Object.freeze({ label:'companion-approach', sceneIndex:2, sceneTimeMs:700, postTimeMs:2500, holdCommitted:true })
    ])
  }),
  'story-ledger': Object.freeze({
    motionId: 'ledgerBrokenPulse',
    frames: Object.freeze([
      Object.freeze({ label:'pulse-before-gap', sceneIndex:3, sceneTimeMs:2300, postTimeMs:0, holdCommitted:false }),
      Object.freeze({ label:'inside-320ms-gap', sceneIndex:3, sceneTimeMs:2500, postTimeMs:0, holdCommitted:false }),
      Object.freeze({ label:'pulse-after-gap', sceneIndex:3, sceneTimeMs:2700, postTimeMs:0, holdCommitted:false }),
      Object.freeze({ label:'silence', sceneIndex:3, sceneTimeMs:4250, postTimeMs:0, holdCommitted:false })
    ])
  })
});
export const SCREEN_IDS = Object.freeze([
  'startup-loading', 'home',
  'story-return-light', 'story-rescue', 'story-fragment-hold', 'story-fragment-postcommit',
  'story-ledger', 'story-fragment-reduced',
  'dex', 'logs', 'equipment', 'gacha', 'outing', 'adventure-loading',
  'battle-hud', 'battle-vfx-lv1', 'battle-vfx-lv3', 'battle-vfx-lv5', 'battle-vfx-lv5-reduced', 'battle-vfx-lv5-low',
  'skill-choice', 'artifact-choice', 'pause', 'result'
]);
export const VISUAL_SCROLL_ROOTS = Object.freeze({
  'startup-loading': Object.freeze([]),
  home: Object.freeze([]),
  'story-return-light': Object.freeze([]),
  'story-rescue': Object.freeze([]),
  'story-fragment-hold': Object.freeze([]),
  'story-fragment-postcommit': Object.freeze([]),
  'story-ledger': Object.freeze([]),
  'story-fragment-reduced': Object.freeze([]),
  dex: Object.freeze(['#overlayBody']),
  logs: Object.freeze(['#overlayBody']),
  equipment: Object.freeze(['#overlayBody']),
  gacha: Object.freeze(['#overlayBody']),
  outing: Object.freeze(['#overlayBody']),
  'adventure-loading': Object.freeze([]),
  'battle-hud': Object.freeze([]),
  'battle-vfx-lv1': Object.freeze([]),
  'battle-vfx-lv3': Object.freeze([]),
  'battle-vfx-lv5': Object.freeze([]),
  'battle-vfx-lv5-reduced': Object.freeze([]),
  'battle-vfx-lv5-low': Object.freeze([]),
  'skill-choice': Object.freeze(['#levelOwnedSkills', '#skillChoices']),
  'artifact-choice': Object.freeze(['#artifactOwnedSkills', '#artifactChoices']),
  pause: Object.freeze(['#pauseModal .pause-power-panels']),
  result: Object.freeze(['#result'])
});
export const GLOBAL_VISUAL_SCROLL_ROOTS = Object.freeze(['html', 'body', '#app', '#overlay']);
export const VIEWPORT_SURFACE_SCREENS = Object.freeze([
  'startup-loading', 'home',
  'story-return-light', 'story-rescue', 'story-fragment-hold', 'story-fragment-postcommit',
  'story-ledger', 'story-fragment-reduced',
  'dex', 'logs', 'equipment', 'gacha', 'outing', 'adventure-loading',
  'battle-hud', 'battle-vfx-lv1', 'battle-vfx-lv3', 'battle-vfx-lv5', 'battle-vfx-lv5-reduced', 'battle-vfx-lv5-low', 'result'
]);
export const TRANSIENT_ABSENCE = Object.freeze({
  'battle-hud': Object.freeze(['#game.active > .big-cue', '#game.active > .wave-toast']),
  'battle-vfx-lv1': Object.freeze(['#game.active > .big-cue', '#game.active > .wave-toast']),
  'battle-vfx-lv3': Object.freeze(['#game.active > .big-cue', '#game.active > .wave-toast']),
  'battle-vfx-lv5': Object.freeze(['#game.active > .big-cue', '#game.active > .wave-toast']),
  'battle-vfx-lv5-reduced': Object.freeze(['#game.active > .big-cue', '#game.active > .wave-toast']),
  'battle-vfx-lv5-low': Object.freeze(['#game.active > .big-cue', '#game.active > .wave-toast'])
});
export const BATTLE_CANVAS_PROBE = Object.freeze({
  xRatio: 0.1,
  yRatio: 0.2,
  widthRatio: 0.8,
  heightRatio: 0.55,
  requiredPasses: 2,
  intervalMs: 250,
  minStandardDeviation: 8,
  minColorBuckets: 80
});
export const LOADING_QA_CONTRACT = Object.freeze({
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = path.join(ROOT, 'browser-qa-output');
const RUNTIME_ASSET_MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));
const STORY_ANIMATION_PROJECTION = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'assets/animations/story-ch01.json'), 'utf8')
);
const STORY_PIVOT_ATLAS_IDS = Object.freeze([
  'currentMogu', 'youngMogu', 'starGuardianCandidate', 'starCompanion'
]);
export const STORY_PIVOT_ATLASES = Object.freeze(STORY_PIVOT_ATLAS_IDS.map((id) => {
  const atlas = STORY_ANIMATION_PROJECTION.poseAtlases?.[id];
  if (!atlas?.assetId
    || atlas.frameOrder !== 'row-major'
    || atlas.cellOrigin !== 'top-left'
    || atlas.pivot?.space !== 'cell-normalized'
    || atlas.noAutoCrop !== true
    || atlas.width !== atlas.columns * atlas.cell?.width
    || atlas.height !== atlas.rows * atlas.cell?.height) {
    throw new Error(`Chapter 1 fixed-cell pose atlas contract is invalid: ${id}`);
  }
  const pack = (RUNTIME_ASSET_MANIFEST.packs || [])
    .find((candidate) => candidate.assets?.some((asset) => asset.id === atlas.assetId));
  if (!pack) throw new Error(`Chapter 1 pose atlas is absent from runtime packs: ${atlas.assetId}`);
  return Object.freeze({
    id,
    assetId:atlas.assetId,
    packId:pack.id,
    width:atlas.width,
    height:atlas.height,
    columns:atlas.columns,
    rows:atlas.rows,
    cell:Object.freeze({ width:atlas.cell.width, height:atlas.cell.height }),
    pivot:Object.freeze({ x:atlas.pivot.x, y:atlas.pivot.y })
  });
}));
export const BROWSER_QA_TIME_BUDGET = Object.freeze({
  workflowTimeoutMs:20 * 60 * 1000,
  maximumCaptureSetupMs:14 * 60 * 1000,
  maximumDeferredVideoAuditMs:210000,
  summaryUploadReserveMs:2 * 60 * 1000
});
export const STORY_RUNTIME_VIDEO_CONTRACT = Object.freeze({
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
  totalVideoAuditTimeoutMs:BROWSER_QA_TIME_BUDGET.maximumDeferredVideoAuditMs,
  browserCloseTimeoutMs:5000,
  lifecycleFreezeWallMs:600,
  lifecycleClockToleranceMs:34,
  lifecycleResumeAdvanceMs:120,
  delayedHoldWaitMs:1200,
  earlyHoldMaximumDelayMs:750,
  minimumHoldWallMs:700,
  videoSampleFractions:Object.freeze([0.08, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92]),
  minimumDecodedStandardDeviation:3,
  minimumDecodedColorBuckets:8,
  minimumDecodedNonBlankSamples:7,
  minimumDecodedChangedPairs:3,
  minimumDecodedUniqueFrames:4,
  minimumDecodedMeanDifference:2,
  minimumDecodedChangedPixelRatio:0.02,
  motions:Object.freeze([
    Object.freeze({
      sceneIndex:0, sceneId:'return-light', motionId:'returnLightFlicker',
      durationMs:Number(STORY_ANIMATION_PROJECTION.storyAnimations.returnLightFlicker.durationMs)
    }),
    Object.freeze({
      sceneIndex:1, sceneId:'reverse-rescue', motionId:'reverseCrackRescue',
      durationMs:Number(STORY_ANIMATION_PROJECTION.storyAnimations.reverseCrackRescue.durationMs)
    }),
    Object.freeze({
      sceneIndex:2, sceneId:'fragment-chamber', motionId:'fragmentConsumeStumble',
      preCommitMs:Number(STORY_ANIMATION_PROJECTION.storyAnimations.fragmentConsumeStumble.preCommitLogicalTimeMs),
      durationMs:Number(STORY_ANIMATION_PROJECTION.storyAnimations.fragmentConsumeStumble.nominalDurationMsAfterHoldConfirmed)
    }),
    Object.freeze({
      sceneIndex:3, sceneId:'archive-ledger', motionId:'ledgerBrokenPulse',
      durationMs:Number(STORY_ANIMATION_PROJECTION.storyAnimations.ledgerBrokenPulse.durationMs)
    })
  ])
});
export const STORY_RUNTIME_EVIDENCE_MODES = Object.freeze([
  Object.freeze({
    id:'normal',
    reducedMotion:false,
    exerciseLifecycle:false,
    holdTiming:'early'
  }),
  Object.freeze({
    id:'reduced-lifecycle-delayed',
    reducedMotion:true,
    exerciseLifecycle:true,
    holdTiming:'delayed'
  })
]);
export const SPECULATIVE_BATTLE_PACK_URLS = Object.freeze(
  (RUNTIME_ASSET_MANIFEST.packs || [])
    .find((pack) => pack.id === 'battle-v3')
    ?.assets?.map((asset) => String(asset.src || ''))
    .filter(Boolean) || []
);
const SPECULATIVE_BATTLE_PACK_URL_SET = new Set(SPECULATIVE_BATTLE_PACK_URLS);
const SPECULATIVE_WARM_ABORT_ERROR_TEXTS = new Set([
  'net::ERR_ABORTED',
  'Load request cancelled'
]);
const MIME = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.webp': 'image/webp'
});

export function isExpectedSpeculativeWarmAbort(failure = {}, baseUrl = '') {
  if (failure.method !== 'GET'
    || failure.resourceType !== 'fetch'
    || failure.isNavigationRequest !== false
    || failure.headers?.['x-moguria-purpose'] !== 'warm-pack:battle-v3'
    || !SPECULATIVE_WARM_ABORT_ERROR_TEXTS.has(failure.errorText)) return false;
  try {
    const requested = new URL(failure.url);
    const base = new URL(baseUrl);
    if (requested.origin !== base.origin) return false;
    const requestKey = `${requested.pathname.replace(/^\/+/, '')}${requested.search}`;
    return SPECULATIVE_BATTLE_PACK_URL_SET.has(requestKey);
  } catch {
    return false;
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = { browser: 'chromium', output: DEFAULT_OUTPUT, headed: false };
  for (const argument of argv) {
    if (argument.startsWith('--browser=')) parsed.browser = argument.slice('--browser='.length);
    else if (argument.startsWith('--output=')) parsed.output = path.resolve(ROOT, argument.slice('--output='.length));
    else if (argument === '--headed') parsed.headed = true;
    else if (argument === '--list') parsed.list = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!['chromium', 'webkit'].includes(parsed.browser)) throw new Error(`Unsupported browser: ${parsed.browser}`);
  return parsed;
}

function startStaticServer(root = ROOT) {
  const server = http.createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
      const relative = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '') || 'index.html';
      const absolute = path.resolve(root, relative);
      if (absolute !== root && !absolute.startsWith(root + path.sep)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      let target = absolute;
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
        return;
      }
      const stat = fs.statSync(target);
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': stat.size,
        'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream'
      });
      fs.createReadStream(target).pipe(response);
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(error.message);
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}/` });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function pngVisualStats(buffer) {
  const signature = '89504e470d0a1a0a';
  if (!Buffer.isBuffer(buffer) || buffer.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('screenshot is not a PNG');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += length + 12;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (!width || !height || bitDepth !== 8 || !channels || interlace !== 0) {
    throw new Error(`unsupported screenshot PNG (${width}x${height}, depth ${bitDepth}, color ${colorType}, interlace ${interlace})`);
  }
  const packed = zlib.inflateSync(Buffer.concat(idat));
  const rowBytes = width * channels;
  const pixels = Buffer.alloc(rowBytes * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = packed[sourceOffset++];
    const rowStart = y * rowBytes;
    const previousStart = (y - 1) * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = packed[sourceOffset++];
      const left = x >= channels ? pixels[rowStart + x - channels] : 0;
      const above = y > 0 ? pixels[previousStart + x] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[previousStart + x - channels] : 0;
      let value = raw;
      if (filter === 1) value += left;
      else if (filter === 2) value += above;
      else if (filter === 3) value += Math.floor((left + above) / 2);
      else if (filter === 4) value += paeth(left, above, upperLeft);
      else if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}`);
      pixels[rowStart + x] = value & 255;
    }
  }
  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / 180000)));
  let samples = 0;
  let mean = 0;
  let m2 = 0;
  let dark = 0;
  let light = 0;
  const buckets = new Set();
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const index = y * rowBytes + x * channels;
      const r = pixels[index];
      const g = channels === 1 ? r : pixels[index + 1];
      const b = channels === 1 ? r : pixels[index + 2];
      const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
      samples += 1;
      const delta = luminance - mean;
      mean += delta / samples;
      m2 += delta * (luminance - mean);
      if (luminance < 8) dark += 1;
      if (luminance > 247) light += 1;
      buckets.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
    }
  }
  const standardDeviation = Math.sqrt(m2 / Math.max(1, samples - 1));
  const darkRatio = dark / samples;
  const lightRatio = light / samples;
  const nearBlank = standardDeviation < 3 || buckets.size < 6
    || ((darkRatio > 0.998 || lightRatio > 0.998) && standardDeviation < 7);
  return {
    width,
    height,
    samples,
    meanLuminance: Number(mean.toFixed(2)),
    standardDeviation: Number(standardDeviation.toFixed(2)),
    darkRatio: Number(darkRatio.toFixed(5)),
    lightRatio: Number(lightRatio.toFixed(5)),
    colorBuckets: buckets.size,
    nearBlank
  };
}

async function installFixture(page) {
  const result = await page.evaluate(() => {
    const save = window.MoguriaMeta.normalize(window.MoguriaSave.fresh());
    const now = Date.now();
    save.lastBellyAt = now;
    save.belly = save.maxBelly;
    save.meta.coins = 999;
    save.meta.inventory = window.MoguriaMeta.EQUIPMENT.map((base, index) => ({
      ...base,
      uid: `qa_${base.id}`,
      level: index % 3 + 1,
      obtainedAt: now - index * 1000
    }));
    for (const slot of Object.keys(save.meta.equipped)) {
      save.meta.equipped[slot] = save.meta.inventory.find((item) => item.slot === slot)?.uid || null;
    }
    save.dex.skills = Object.fromEntries(window.MoguriaSkills.skills.slice(0, 12).map((item, index) => [item.id, index % 3 + 1]));
    save.dex.artifacts = Object.fromEntries(window.MoguriaSkills.artifacts.slice(0, 8).map((item, index) => [item.id, index % 2 + 1]));
    save.dex.synergies = { '星のよりみち': true, 'もぐもぐ連鎖': true };
    save.dex.titles = { '星をつなぐもの': true };
    save.runs = [{
      runId: 'browser-qa-complete',
      date: now - 60000,
      name: '星あかりの探検家',
      comment: '小さな光をたくさん見つけたね。',
      floor: 8,
      wave: 8,
      lv: 7,
      kills: 42,
      maxDamage: 128,
      dps: 36,
      skills: window.MoguriaSkills.skills.slice(0, 4).map((item) => ({ id: item.id, name: item.name, tags: item.tags })),
      artifacts: window.MoguriaSkills.artifacts.slice(0, 2).map((item) => ({ id: item.id, name: item.name, tags: item.tags })),
      synergies: ['星のよりみち'],
      titles: ['星をつなぐもの'],
      visual: { star: 2, guard: 1 }
    }];
    save.best = { floor: 8, damage: 128, kills: 42, dps: 36 };
    const saved = window.MoguriaSave.save(save);
    window.MoguriaHome.update();
    return { ok: saved.ok, equipment: save.meta.inventory.length };
  });
  if (!result.ok || result.equipment < 5) throw new Error('version-4 browser fixture could not be saved');
}

async function waitForAppReady(page) {
  await page.waitForFunction(() => window.MoguriaStartup?.isReady?.() === true, null, { timeout: 45000 });
  await page.locator('#startupLoader').waitFor({ state: 'hidden', timeout: 10000 });
  await page.waitForFunction(() => {
    const app = document.getElementById('app');
    return app && !app.hasAttribute('inert') && app.getAttribute('aria-hidden') !== 'true'
      && (window.MoguriaAssets?.stats?.().errors?.length || 0) === 0;
  }, null, { timeout: 10000 });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
}

async function waitForStablePage(page) {
  await waitForAppReady(page);
  await installFixture(page);
  const freezeStyle = await page.addStyleTag({ content: `
    html { scroll-behavior: auto !important; }
    *, *::before, *::after {
      animation-delay: 0s !important;
      animation-duration: 0s !important;
      caret-color: transparent !important;
      scroll-behavior: auto !important;
      transition-delay: 0s !important;
      transition-duration: 0s !important;
    }
  ` });
  await freezeStyle.evaluate((element) => element.setAttribute('data-moguria-qa-freeze', ''));
}

async function setQaFreeze(page, frozen) {
  await page.evaluate((enabled) => {
    const style = document.querySelector('style[data-moguria-qa-freeze]');
    if (!style?.sheet) throw new Error('browser QA freeze stylesheet is missing');
    style.sheet.disabled = !enabled;
  }, frozen);
}

async function waitForRenderedLoadingTip(page, kind) {
  try {
    await page.waitForFunction((loadingKind) => {
      const root = document.querySelector(`[data-loading-surface="${loadingKind}"]`);
      const tips = root?.querySelector('[data-loading-tips]');
      const tipText = root?.querySelector('[data-loading-tip-text]');
      if (!tips || !tipText
        || tips.getAttribute('data-visible') !== 'true'
        || tips.getAttribute('aria-hidden') !== 'false'
        || tips.hasAttribute('inert')
        || !tipText.textContent?.trim()
        || !tipText.getAttribute('data-tip-id')) return false;
      const rect = tipText.getBoundingClientRect();
      const panelOpacity = Number(getComputedStyle(tips).opacity);
      const textOpacity = Number(getComputedStyle(tipText).opacity);
      if (rect.width <= 0 || rect.height <= 0
        || !Number.isFinite(panelOpacity) || panelOpacity < 0.95
        || !Number.isFinite(textOpacity) || textOpacity < 0.99) return false;
      for (let current = tipText; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === 'none'
          || style.visibility === 'hidden'
          || style.visibility === 'collapse'
          || Number(style.opacity) === 0) return false;
        if (current === root) break;
      }
      return true;
    }, kind, { timeout:LOADING_QA_CONTRACT.tipTransitionMs + 1800 });
  } catch (error) {
    let diagnostic = null;
    try { diagnostic = await inspectLoadingState(page, kind); }
    catch (inspectError) { diagnostic = { inspectError:inspectError?.message || String(inspectError) }; }
    throw new Error(`rendered loading tip did not become ready: ${JSON.stringify({
      kind,
      waitError:error?.message || String(error),
      tips:diagnostic?.tips || null,
      diagnostic
    })}`);
  }
}

async function inspectLoadingState(page, kind) {
  return page.evaluate((loadingKind) => {
    const root = document.querySelector(`[data-loading-surface="${loadingKind}"]`);
    if (!root) throw new Error(`loading surface is missing: ${loadingKind}`);
    const query = (selector) => root.querySelector(selector);
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      for (let current = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === 'none'
          || style.visibility === 'hidden'
          || style.visibility === 'collapse'
          || Number(style.opacity) === 0) return false;
      }
      return true;
    };
    const rect = (element) => {
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return {
        x: Number(value.x.toFixed(2)), y: Number(value.y.toFixed(2)),
        left: Number(value.left.toFixed(2)), right: Number(value.right.toFixed(2)),
        top: Number(value.top.toFixed(2)), bottom: Number(value.bottom.toFixed(2)),
        width: Number(value.width.toFixed(2)), height: Number(value.height.toFixed(2)),
        centerX: Number(((value.left + value.right) / 2).toFixed(2)),
        centerY: Number(((value.top + value.bottom) / 2).toFixed(2))
      };
    };
    const fill = query('[data-loading-fill]');
    const frontier = query('[data-loading-frontier]');
    const light = query('[data-loading-carried-light]');
    const child = query('[data-loading-child]');
    const childImage = query('[data-loading-child-image]');
    const gate = query('[data-loading-gate]');
    const progress = query('[data-loading-progress]');
    const percentText = query('[data-loading-percent]');
    const phase = query('[data-loading-phase]');
    const tips = query('[data-loading-tips]');
    const tipButton = query('[data-loading-tip-button]');
    const tipText = query('[data-loading-tip-text]');
    const autoToggle = query('[data-loading-tip-auto-toggle]');
    const announcement = query('[data-loading-tip-announcement]');
    const action = loadingKind === 'startup'
      ? root.querySelector('#startupRetryBtn')
      : root.querySelector('[data-loading-actions]');
    const fillRect = rect(fill);
    const frontierRect = rect(frontier);
    const lightRect = rect(light);
    const childRect = rect(child);
    const childImageRect = rect(childImage);
    const gateRect = rect(gate);
    const surfaceRect = rect(root);
    const card = root.querySelector('.startup-loader__card, .system-loading__card, .system-dialog');
    const cardRect = rect(card);
    const tipStyle = tipText ? getComputedStyle(tipText) : null;
    const numericLineHeight = Number.parseFloat(tipStyle?.lineHeight || '0');
    const renderedLines = tipText && numericLineHeight > 0
      ? Number((tipText.getBoundingClientRect().height / numericLineHeight).toFixed(2))
      : null;
    const gateStyle = gate ? getComputedStyle(gate) : null;
    const frontierStyle = frontier ? getComputedStyle(frontier) : null;
    const gateAfter = gate ? getComputedStyle(gate, '::after') : null;
    const topAtGateCenter = gateRect
      ? document.elementFromPoint(gateRect.centerX, gateRect.centerY)
      : null;
    const snapshot = root.moguriaLoadingExperience?.getSnapshot?.() || null;
    const counterLike = [...(tips?.querySelectorAll('*') || [])].filter(element => {
      const marker = `${element.getAttribute('data-loading-tip-counter') || ''} ${element.getAttribute('data-loading-tip-dot') || ''}`;
      return marker.trim() || element.matches?.('.loading-tips__dots, [aria-label*="件中"]');
    });
    return {
      state: root.getAttribute('data-state'),
      mirroredState: root.getAttribute('data-loading-state'),
      rootProgress: root.getAttribute('data-loading-progress'),
      snapshot,
      visible: visible(root),
      inertAncestor: root.closest('[inert]')?.id || '',
      ariaHiddenAncestor: root.closest('[aria-hidden="true"]')?.id || '',
      surfaceRect,
      cardRect,
      documentOverflowX: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
        - document.documentElement.clientWidth,
      cardFitsViewport: Boolean(cardRect && cardRect.left >= -1 && cardRect.right <= innerWidth + 1
        && cardRect.top >= -1 && cardRect.bottom <= innerHeight + 1),
      progress: progress ? {
        visible: visible(progress),
        role: progress.getAttribute('role'),
        label: progress.getAttribute('aria-label'),
        busy: progress.getAttribute('aria-busy'),
        min: progress.getAttribute('aria-valuemin'),
        max: progress.getAttribute('aria-valuemax'),
        now: progress.getAttribute('aria-valuenow'),
        valueText: progress.getAttribute('aria-valuetext'),
        percentText: percentText?.textContent?.trim() || '',
        fillInlineWidth: fill?.style?.width || ''
      } : null,
      geometry: {
        fillTipX: fillRect?.right ?? null,
        frontierX: frontierRect?.left ?? null,
        lightCenterX: lightRect?.centerX ?? null,
        childX: childRect?.left ?? null,
        childRect,
        childImageRect,
        gateRect
      },
      child: childImage ? {
        actorCount: root.querySelectorAll('[data-loading-child-image]').length,
        visible: visible(childImage),
        backgroundImage: getComputedStyle(childImage).backgroundImage,
        backgroundSize: getComputedStyle(childImage).backgroundSize,
        backgroundRepeat: getComputedStyle(childImage).backgroundRepeat,
        animationName: getComputedStyle(childImage).animationName,
        animationDuration: getComputedStyle(childImage).animationDuration,
        animationIterationCount: getComputedStyle(childImage).animationIterationCount,
        decorativeAncestor: Boolean(childImage.closest('[aria-hidden="true"]'))
      } : null,
      phase: phase ? {
        text: phase.textContent?.trim() || '',
        visible: visible(phase),
        role: phase.getAttribute('role'),
        live: phase.getAttribute('aria-live'),
        atomic: phase.getAttribute('aria-atomic'),
        insideBusyProgress: Boolean(progress?.contains(phase)),
        insideBusyRegion: Boolean(phase.closest('[aria-busy="true"]'))
      } : null,
      tips: tips ? {
        visible: visible(tipText),
        containerVisible: visible(tips),
        textVisible: visible(tipText),
        dataVisible: tips.getAttribute('data-visible'),
        quiet: tips.getAttribute('data-quiet'),
        ariaHidden: tips.getAttribute('aria-hidden'),
        inert: tips.hasAttribute('inert'),
        oneTextNode: root.querySelectorAll('[data-loading-tip-text]').length === 1,
        text: tipText?.textContent?.trim() || '',
        tipId: tipText?.getAttribute('data-tip-id') || '',
        renderedLines,
        buttonDisabled: Boolean(tipButton?.disabled),
        autoDisabled: Boolean(autoToggle?.disabled),
        autoPressed: autoToggle?.getAttribute('aria-pressed'),
        announcementRole: announcement?.getAttribute('role'),
        announcementLive: announcement?.getAttribute('aria-live'),
        announcementText: announcement?.textContent?.trim() || '',
        counterNodeCount: counterLike.length,
        hasCounterCopy: /(?:^|\s)[1-5]\s*\/\s*5(?:\s|$)|[●•]{2,}/.test(tips.textContent || ''),
        poolSize: Number(tips.getAttribute('data-tip-pool-size') || root.getAttribute('data-tip-pool-size') || 0),
        selectionSize: Number(tips.getAttribute('data-tip-selection-size') || root.getAttribute('data-tip-selection-size') || 0)
      } : null,
      gate: gate ? {
        visible: visible(gate),
        zIndex: Number.parseInt(gateStyle?.zIndex || '0', 10) || 0,
        frontierZIndex: Number.parseInt(frontierStyle?.zIndex || '0', 10) || 0,
        centerIsGate: topAtGateCenter === gate || gate.contains(topAtGateCenter),
        socketContent: gateAfter?.content || '',
        socketVisible: gateAfter?.display !== 'none' && gateAfter?.visibility !== 'hidden'
          && Number(gateAfter?.opacity || 1) !== 0
      } : null,
      errorActionPresent: Boolean(action),
      errorActionVisible: visible(action)
    };
  }, kind);
}

async function inspectLoadingAsset(page, kind) {
  return page.evaluate(async (loadingKind) => {
    const root = document.querySelector(`[data-loading-surface="${loadingKind}"]`);
    const actor = root?.querySelector('[data-loading-child-image]');
    if (!actor) return { decoded: false, error: 'sprite element missing' };
    const backgroundImage = getComputedStyle(actor).backgroundImage;
    const match = backgroundImage.match(/url\(["']?(.*?)["']?\)/);
    if (!match?.[1]) return { decoded: false, backgroundImage, error: 'background URL missing' };
    const image = new Image();
    image.src = match[1];
    try {
      await image.decode();
    } catch (error) {
      return { decoded: false, backgroundImage, error: error?.message || String(error) };
    }
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const frameWidth = Math.floor(image.naturalWidth / 2);
    const pixels = context.getImageData(0, 0, frameWidth, image.naturalHeight).data;
    let minX = frameWidth;
    let maxX = -1;
    let minY = image.naturalHeight;
    let maxY = -1;
    for (let y = 0; y < image.naturalHeight; y += 1) {
      for (let x = 0; x < frameWidth; x += 1) {
        if (pixels[(y * frameWidth + x) * 4 + 3] <= 8) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    const alphaWidth = maxX >= minX ? maxX - minX + 1 : 0;
    const alphaHeight = maxY >= minY ? maxY - minY + 1 : 0;
    const scale = actor.offsetWidth / Math.max(1, frameWidth);
    const sourcePath = new URL(image.src, location.href).pathname;
    return {
      decoded: image.naturalWidth > 0 && image.naturalHeight > 0,
      sourcePath,
      naturalSize: [image.naturalWidth, image.naturalHeight],
      frameSize: [frameWidth, image.naturalHeight],
      alphaBounds: [minX, minY, alphaWidth, alphaHeight],
      displaySilhouette: [
        Number((alphaWidth * scale).toFixed(2)),
        Number((alphaHeight * scale).toFixed(2))
      ],
      viewportWidthRatio: Number((alphaWidth * scale / innerWidth).toFixed(4)),
      backgroundImage,
      backgroundSize: getComputedStyle(actor).backgroundSize,
      backgroundRepeat: getComputedStyle(actor).backgroundRepeat
    };
  }, kind);
}

async function inspectLoadingMotion(page, kind) {
  return page.evaluate(async (loadingKind) => {
    const root = document.querySelector(`[data-loading-surface="${loadingKind}"]`);
    const actor = root?.querySelector('[data-loading-child-image]');
    if (!actor) return { found: false, error: 'child actor missing' };
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const animation = actor.getAnimations().find(item => item.animationName === 'loadingChildFlight');
    if (!animation) {
      return { found: false, animationName: getComputedStyle(actor).animationName };
    }
    await animation.ready.catch(() => {});
    const timing = animation.effect?.getComputedTiming?.() || {};
    const duration = Number(timing.duration) || 540;
    const read = () => {
      const rect = actor.getBoundingClientRect();
      return {
        x: Number(((rect.left + rect.right) / 2).toFixed(2)),
        y: Number(((rect.top + rect.bottom) / 2).toFixed(2)),
        transform: getComputedStyle(actor).transform
      };
    };
    animation.pause();
    animation.currentTime = 0;
    const at0 = read();
    animation.currentTime = duration / 4;
    const atQuarter = read();
    animation.play();
    return {
      found: true,
      duration,
      animationName: animation.animationName,
      iterationCount: timing.iterations,
      at0,
      atQuarter,
      xDelta: Number(Math.abs(atQuarter.x - at0.x).toFixed(2)),
      yDelta: Number(Math.abs(atQuarter.y - at0.y).toFixed(2))
    };
  }, kind);
}

async function prepareLoadingFixture(page, kind, percent) {
  const fixture = { kind, targetPercent: percent };
  const failures = [];
  const fullTemporal = await page.evaluate(() => innerWidth === 390 && innerHeight === 844);
  await page.emulateMedia({ reducedMotion:'no-preference' });
  await setQaFreeze(page, false);
  try {
    fixture.defaults = await page.evaluate(() => ({
      ...window.MoguriaLoadingExperience?.defaults,
      poolSize: window.MoguriaLoadingExperience?.TIPS?.length || 0
    }));
    await page.evaluate(({ loadingKind, targetPercent }) => {
      const root = document.querySelector(`[data-loading-surface="${loadingKind}"]`);
      if (!root) throw new Error(`loading surface is missing: ${loadingKind}`);
      if (loadingKind === 'startup') {
        root.hidden = false;
        document.body.classList.add('moguria-booting');
        const app = document.getElementById('app');
        app?.setAttribute('inert', '');
        app?.setAttribute('aria-hidden', 'true');
      } else {
        window.MoguriaUI.showAdventureLoading({
          title: '冒険の準備中',
          message: '星影洞窟への道を探しています',
          percent: targetPercent
        });
      }
      const controller = root.moguriaLoadingExperience;
      if (!controller?.start || !controller?.advance || !controller?.error || !controller?.getSnapshot) {
        throw new Error(`${loadingKind} loading controller contract is missing`);
      }
      controller.start({
        progress: targetPercent,
        title: loadingKind === 'startup' ? 'ホームを準備中' : '冒険の準備中',
        phase: loadingKind === 'startup' ? 'ホームの灯りをともしています' : '星影洞窟をひらいています'
      });
    }, { loadingKind: kind, targetPercent: percent });

    if (fullTemporal) {
      fixture.tipsBeforeReveal = await inspectLoadingState(page, kind);
      // Keep a generous margin from the 1.2 s reveal boundary: headed WebKit
      // can spend appreciable wall time collecting the preceding geometry.
      const preRevealMarginMs = 400;
      await page.waitForTimeout(LOADING_QA_CONTRACT.revealMs - preRevealMarginMs);
      fixture.tipsBeforeBoundary = await inspectLoadingState(page, kind);
      await page.waitForTimeout(preRevealMarginMs + 160);
      fixture.tipsAfterReveal = await inspectLoadingState(page, kind);
      fixture.keyboardReachability = await page.evaluate((loadingKind) => {
        const root = document.querySelector(`[data-loading-surface="${loadingKind}"]`);
        const tipButton = root?.querySelector('[data-loading-tip-button]');
        const card = root?.querySelector('.system-loading__card, .system-dialog');
        if (loadingKind === 'adventure') card?.focus?.();
        else tipButton?.focus?.();
        return {
          startsOnTip: document.activeElement === tipButton,
          startsOnCard: document.activeElement === card
        };
      }, kind);
      if (kind === 'adventure') {
        await page.keyboard.press('Tab');
        fixture.keyboardReachability.firstTab = await page.evaluate((loadingKind) => (
          document.activeElement === document.querySelector(`[data-loading-surface="${loadingKind}"] [data-loading-tip-button]`)
        ), kind);
      } else {
        fixture.keyboardReachability.firstTab = fixture.keyboardReachability.startsOnTip;
      }
      await page.keyboard.press('Tab');
      fixture.keyboardReachability.secondTab = await page.evaluate((loadingKind) => (
        document.activeElement === document.querySelector(`[data-loading-surface="${loadingKind}"] [data-loading-tip-auto-toggle]`)
      ), kind);
      await page.keyboard.press('Tab');
      fixture.keyboardReachability.wrapsToFirst = await page.evaluate((loadingKind) => (
        document.activeElement === document.querySelector(`[data-loading-surface="${loadingKind}"] [data-loading-tip-button]`)
      ), kind);
      await page.evaluate(() => document.activeElement?.blur?.());
      const autoStartTip = fixture.tipsAfterReveal.tips?.tipId;
      await page.waitForFunction(({ loadingKind, previousTip }) => {
        const tip = document.querySelector(
          `[data-loading-surface="${loadingKind}"] [data-loading-tip-text]`
        );
        return Boolean(tip?.getAttribute('data-tip-id')
          && tip.getAttribute('data-tip-id') !== previousTip);
      }, { loadingKind:kind, previousTip:autoStartTip }, {
        timeout:LOADING_QA_CONTRACT.autoMs + LOADING_QA_CONTRACT.tipTransitionMs + 1800
      });
      fixture.tipsAfterAuto = await inspectLoadingState(page, kind);
      fixture.autoChangedTip = Boolean(autoStartTip && fixture.tipsAfterAuto.tips?.tipId !== autoStartTip);
      await page.evaluate((loadingKind) => {
        document.querySelector(`[data-loading-surface="${loadingKind}"] [data-loading-tip-auto-toggle]`)?.click();
      }, kind);
      fixture.tipsPaused = await inspectLoadingState(page, kind);
      const pausedTip = fixture.tipsPaused.tips?.tipId;
      await page.waitForTimeout(LOADING_QA_CONTRACT.autoMs + LOADING_QA_CONTRACT.tipTransitionMs + 180);
      fixture.tipsAfterPausedInterval = await inspectLoadingState(page, kind);
      fixture.pausedTipStayed = Boolean(pausedTip && fixture.tipsAfterPausedInterval.tips?.tipId === pausedTip);
      fixture.manualTipIds = [pausedTip];
      for (let index = 1; index < LOADING_QA_CONTRACT.sessionTipCount; index += 1) {
        const previousTip = fixture.manualTipIds.at(-1);
        await page.evaluate((loadingKind) => {
          document.querySelector(`[data-loading-surface="${loadingKind}"] [data-loading-tip-button]`)?.click();
        }, kind);
        await page.waitForFunction(({ loadingKind, previousTipId }) => {
          const tip = document.querySelector(
            `[data-loading-surface="${loadingKind}"] [data-loading-tip-text]`
          );
          return Boolean(tip?.getAttribute('data-tip-id')
            && tip.getAttribute('data-tip-id') !== previousTipId);
        }, { loadingKind:kind, previousTipId:previousTip }, { timeout:1800 });
        // Start the next tap only after the 300 ms debounce window has elapsed.
        await page.waitForTimeout(LOADING_QA_CONTRACT.manualDebounceMs + 50);
        fixture.manualTipIds.push((await inspectLoadingState(page, kind)).tips?.tipId);
      }
      fixture.manualAnnouncement = (await inspectLoadingState(page, kind)).tips?.announcementText || '';
      fixture.manualTipsUnique = new Set(fixture.manualTipIds).size === LOADING_QA_CONTRACT.sessionTipCount;
    } else {
      await page.evaluate((loadingKind) => {
        document.querySelector(`[data-loading-surface="${loadingKind}"]`).moguriaLoadingExperience.start({
          progress: 47,
          revealMs: 0,
          phase: '星灯りを運んでいます'
        });
      }, kind);
      // Compact-view QA skips the full 1.2 s timing exercise, but it must still
      // observe the real rendered Tips state before inspecting it.
      await waitForRenderedLoadingTip(page, kind);
      fixture.tipsAfterReveal = await inspectLoadingState(page, kind);
    }

    await page.evaluate(({ loadingKind, targetPercent }) => {
      document.querySelector(`[data-loading-surface="${loadingKind}"]`).moguriaLoadingExperience.start({
        progress: targetPercent,
        revealMs: 0,
        phase: '星灯りを運んでいます'
      });
    }, { loadingKind: kind, targetPercent: percent });
    await page.waitForTimeout(270);
    fixture.asset = await inspectLoadingAsset(page, kind);
    fixture.plateau = await inspectLoadingState(page, kind);
    fixture.normalMotion = await inspectLoadingMotion(page, kind);
    const advancedPercent = Math.min(90, percent + 20);
    await page.evaluate(({ loadingKind, targetPercent }) => {
      document.querySelector(`[data-loading-surface="${loadingKind}"]`).moguriaLoadingExperience.advance(targetPercent, {
        phase: '星灯りの道をつないでいます'
      });
    }, { loadingKind: kind, targetPercent: advancedPercent });
    await page.waitForTimeout(110);
    fixture.advanceMidpoint = await inspectLoadingState(page, kind);
    await page.waitForTimeout(170);
    fixture.advanceSettled = await inspectLoadingState(page, kind);
    fixture.advancedPercent = advancedPercent;

    fixture.completion = await page.evaluate(async (loadingKind) => {
      const root = document.querySelector(`[data-loading-surface="${loadingKind}"]`);
      const controller = root.moguriaLoadingExperience;
      const states = [root.getAttribute('data-state')];
      const observer = new MutationObserver(() => {
        const next = root.getAttribute('data-state');
        if (states.at(-1) !== next) states.push(next);
      });
      observer.observe(root, { attributes: true, attributeFilter: ['data-state'] });
      controller.start({ progress: 82, revealMs: 0, phase: '最後の灯りを運んでいます' });
      if (states.at(-1) !== 'loading') states.push('loading');
      const completed = await controller.advance(100, {
        contactPhase: '星灯りが扉へ届きました',
        completeTitle: '準備できました',
        completePhase: '冒険の扉がひらきます'
      });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      observer.disconnect();
      return { states, completed };
    }, kind);
    fixture.completeState = await inspectLoadingState(page, kind);

    await page.emulateMedia({ reducedMotion:'reduce' });
    await page.evaluate((loadingKind) => {
      document.querySelector(`[data-loading-surface="${loadingKind}"]`).moguriaLoadingExperience.start({
        progress: 47,
        revealMs: 0,
        phase: '静かに星灯りを運んでいます'
      });
    }, kind);
    await page.waitForTimeout(30);
    fixture.reducedBeforeManual = await inspectLoadingState(page, kind);
    await page.evaluate((loadingKind) => {
      document.querySelector(`[data-loading-surface="${loadingKind}"]`).moguriaLoadingExperience.nextTip();
    }, kind);
    fixture.reducedAfterManual = await inspectLoadingState(page, kind);

    await page.evaluate((loadingKind) => {
      document.querySelector(`[data-loading-surface="${loadingKind}"]`).moguriaLoadingExperience.error({
        title: '読み込めませんでした',
        phase: '通信状態を確認して、もう一度ためしてください'
      });
    }, kind);
    fixture.errorState = await inspectLoadingState(page, kind);

    await page.evaluate(({ loadingKind, targetPercent }) => {
      document.querySelector(`[data-loading-surface="${loadingKind}"]`).moguriaLoadingExperience.start({
        progress: targetPercent,
        revealMs: 0,
        phase: loadingKind === 'startup' ? 'ホームの灯りをともしています' : '星影洞窟をひらいています'
      });
    }, { loadingKind: kind, targetPercent: percent });
    await page.waitForTimeout(30);
    fixture.finalState = await inspectLoadingState(page, kind);
  } finally {
    await page.emulateMedia({ reducedMotion:'reduce' });
    await setQaFreeze(page, true);
  }

  const alignmentFailures = (label, state) => {
    const geometry = state?.geometry || {};
    for (const [name, value] of [['frontier', geometry.frontierX], ['carried light', geometry.lightCenterX]]) {
      if (!Number.isFinite(value) || !Number.isFinite(geometry.fillTipX)
        || Math.abs(value - geometry.fillTipX) > LOADING_QA_CONTRACT.frontierTolerancePx) {
        failures.push(`${label} fill tip does not align with ${name}: ${JSON.stringify(geometry)}`);
      }
    }
  };
  if (fixture.defaults?.revealMs !== LOADING_QA_CONTRACT.revealMs
    || fixture.defaults?.autoMs !== LOADING_QA_CONTRACT.autoMs
    || fixture.defaults?.transitionMs !== LOADING_QA_CONTRACT.tipTransitionMs
    || fixture.defaults?.debounceMs !== LOADING_QA_CONTRACT.manualDebounceMs
    || fixture.defaults?.quietMs !== LOADING_QA_CONTRACT.progressQuietMs) {
    failures.push(`loading timing defaults differ: ${JSON.stringify(fixture.defaults)}`);
  }
  if (!fixture.asset?.decoded || fixture.asset.sourcePath !== LOADING_QA_CONTRACT.assetPath
    || fixture.asset.naturalSize?.[0] !== 256 || fixture.asset.naturalSize?.[1] !== 128
    || fixture.asset.backgroundRepeat !== 'no-repeat') {
    failures.push(`child Mogu production sprite did not decode: ${JSON.stringify(fixture.asset)}`);
  }
  const silhouetteWidth = fixture.asset?.displaySilhouette?.[0];
  if (!Number.isFinite(silhouetteWidth)
    || silhouetteWidth < LOADING_QA_CONTRACT.silhouetteWidthMinPx
    || silhouetteWidth > LOADING_QA_CONTRACT.silhouetteWidthMaxPx
    || fixture.asset.viewportWidthRatio > LOADING_QA_CONTRACT.silhouetteViewportRatioMax) {
    failures.push(`child Mogu silhouette is not small: ${JSON.stringify(fixture.asset)}`);
  }
  if (!fixture.plateau?.child?.visible || fixture.plateau.child.actorCount !== 1
    || !fixture.plateau.child.decorativeAncestor
    || fixture.plateau?.inertAncestor || fixture.plateau?.ariaHiddenAncestor) {
    failures.push(`child Mogu sprite visibility/semantics differ: ${JSON.stringify(fixture.plateau?.child)}`);
  }
  if (!fixture.normalMotion?.found || fixture.normalMotion.animationName !== 'loadingChildFlight'
    || (fixture.normalMotion.iterationCount !== Infinity && fixture.normalMotion.iterationCount !== 'Infinity')
    || fixture.normalMotion.xDelta > LOADING_QA_CONTRACT.frontierTolerancePx
    || fixture.normalMotion.yDelta < 2) {
    failures.push(`child Mogu plateau motion differs: ${JSON.stringify(fixture.normalMotion)}`);
  }
  alignmentFailures('plateau', fixture.plateau);
  alignmentFailures('progress midpoint', fixture.advanceMidpoint);
  alignmentFailures('progress settled', fixture.advanceSettled);
  const beforeGeometry = fixture.plateau?.geometry || {};
  const afterGeometry = fixture.advanceSettled?.geometry || {};
  const frontierAdvance = (afterGeometry.frontierX ?? 0) - (beforeGeometry.frontierX ?? 0);
  const childAdvance = (afterGeometry.childX ?? 0) - (beforeGeometry.childX ?? 0);
  if (frontierAdvance <= 1 || childAdvance <= 1
    || Math.abs(frontierAdvance - childAdvance) > LOADING_QA_CONTRACT.frontierTolerancePx
    || fixture.advanceSettled?.progress?.now !== String(fixture.advancedPercent)) {
    failures.push(`progress and child did not advance together: ${JSON.stringify({ beforeGeometry, afterGeometry })}`);
  }
  const plateauProgress = fixture.plateau?.progress;
  if (!fixture.plateau?.visible || fixture.plateau.state !== 'loading'
    || fixture.plateau.mirroredState !== 'loading' || fixture.plateau.rootProgress !== String(percent)
    || plateauProgress?.role !== 'progressbar'
    || !plateauProgress?.label
    || plateauProgress?.busy !== 'true' || plateauProgress?.min !== '0' || plateauProgress?.max !== '100'
    || plateauProgress?.now !== String(percent) || plateauProgress?.percentText !== `${percent}%`
    || plateauProgress?.fillInlineWidth !== `${percent}%`) {
    failures.push(`loading progress semantics differ: ${JSON.stringify(plateauProgress)}`);
  }
  if (!fixture.plateau?.phase?.visible || !fixture.plateau.phase.text
    || fixture.plateau.phase.role !== 'status' || fixture.plateau.phase.live !== 'polite'
    || fixture.plateau.phase.atomic !== 'true'
    || fixture.plateau.phase.insideBusyProgress || fixture.plateau.phase.insideBusyRegion) {
    failures.push(`loading live-region semantics differ: ${JSON.stringify(fixture.plateau?.phase)}`);
  }
  const sessionTips = fixture.plateau?.snapshot?.sessionTips || [];
  const sessionTipIds = sessionTips.map(tip => tip.id);
  if (sessionTips.length !== LOADING_QA_CONTRACT.sessionTipCount
    || new Set(sessionTipIds).size !== LOADING_QA_CONTRACT.sessionTipCount
    || fixture.defaults?.poolSize < LOADING_QA_CONTRACT.tipPoolMinimum
    || fixture.plateau?.tips?.poolSize < LOADING_QA_CONTRACT.tipPoolMinimum
    || fixture.plateau?.tips?.selectionSize !== LOADING_QA_CONTRACT.sessionTipCount) {
    failures.push(`loading tip session is not five unique entries from a large pool: ${JSON.stringify({ sessionTipIds, tips:fixture.plateau?.tips })}`);
  }
  const displayedTips = fixture.tipsAfterReveal?.tips;
  if (!displayedTips?.textVisible || displayedTips.dataVisible !== 'true' || displayedTips.ariaHidden !== 'false'
    || displayedTips.inert || !displayedTips.oneTextNode || !displayedTips.tipId
    || displayedTips.announcementRole !== 'status' || displayedTips.announcementLive !== 'polite'
    || displayedTips.counterNodeCount !== 0 || displayedTips.hasCounterCopy || displayedTips.renderedLines > 2) {
    failures.push(`loading tip presentation differs: ${JSON.stringify(displayedTips)}`);
  }
  if (fullTemporal && (fixture.tipsBeforeReveal?.tips?.dataVisible !== 'false'
    || !fixture.tipsBeforeReveal?.tips?.inert || !fixture.tipsBeforeReveal?.tips?.buttonDisabled
    || fixture.tipsBeforeBoundary?.tips?.dataVisible !== 'false' || !fixture.autoChangedTip
    || !fixture.keyboardReachability?.firstTab || !fixture.keyboardReachability?.secondTab
    || (kind === 'adventure' && !fixture.keyboardReachability?.wrapsToFirst)
    || fixture.tipsPaused?.tips?.autoPressed !== 'true' || !fixture.pausedTipStayed
    || !fixture.manualTipsUnique || !fixture.manualAnnouncement?.startsWith('次のヒント。'))) {
    failures.push(`loading tip timing/manual/pause contract differs: ${JSON.stringify({
      before: fixture.tipsBeforeReveal?.tips,
      boundary: fixture.tipsBeforeBoundary?.tips,
      after: displayedTips,
      keyboardReachability: fixture.keyboardReachability,
      autoChangedTip: fixture.autoChangedTip,
      paused: fixture.tipsPaused?.tips,
      pausedTipStayed: fixture.pausedTipStayed,
      manualTipIds: fixture.manualTipIds,
      manualAnnouncement: fixture.manualAnnouncement
    })}`);
  }
  const completionStates = fixture.completion?.states || [];
  const ordered = ['arriving', 'contact', 'complete'].map(state => completionStates.indexOf(state));
  if (ordered.some(index => index < 0) || !(ordered[0] < ordered[1] && ordered[1] < ordered[2])
    || fixture.completeState?.state !== 'complete' || fixture.completeState?.mirroredState !== 'complete'
    || fixture.completeState?.progress?.busy !== 'false'
    || !fixture.completeState?.gate?.visible
    || fixture.completeState.gate.zIndex <= fixture.completeState.gate.frontierZIndex
    || !fixture.completeState.gate.centerIsGate || !fixture.completeState.gate.socketVisible
    || !fixture.completeState.gate.socketContent.includes('◇')) {
    failures.push(`arrival-contact-complete/gate contract differs: ${JSON.stringify({ completion:fixture.completion, complete:fixture.completeState })}`);
  }
  if (fixture.reducedBeforeManual?.snapshot?.reducedMotion !== true
    || fixture.reducedBeforeManual?.child?.animationName !== 'none'
    || fixture.reducedBeforeManual?.tips?.autoDisabled !== true
    || fixture.reducedBeforeManual?.tips?.autoPressed !== 'true'
    || !fixture.reducedBeforeManual?.tips?.tipId
    || fixture.reducedAfterManual?.tips?.tipId === fixture.reducedBeforeManual?.tips?.tipId) {
    failures.push(`loading reduced-motion contract differs: ${JSON.stringify({ before:fixture.reducedBeforeManual, after:fixture.reducedAfterManual })}`);
  }
  if (fixture.errorState?.state !== 'error' || fixture.errorState?.mirroredState !== 'error'
    || fixture.errorState?.progress?.busy !== 'false'
    || fixture.errorState?.phase?.role !== 'alert' || fixture.errorState?.phase?.live !== 'assertive'
    || fixture.errorState?.tips?.dataVisible !== 'false' || !fixture.errorState?.tips?.inert
    || !fixture.errorState?.errorActionPresent) {
    failures.push(`loading error/retry contract differs: ${JSON.stringify(fixture.errorState)}`);
  }
  if (!fixture.finalState?.cardFitsViewport || fixture.finalState.documentOverflowX > 1
    || fixture.finalState?.surfaceRect?.width !== await page.evaluate(() => innerWidth)
    || fixture.finalState?.surfaceRect?.height !== await page.evaluate(() => innerHeight)) {
    failures.push(`loading surface does not fit the mobile viewport: ${JSON.stringify(fixture.finalState)}`);
  }
  if (failures.length) throw new Error(failures.join(' | '));
  return fixture;
}

async function prepareBattle(page, kind) {
  const health = await page.evaluate(async (mode) => {
    const now = Date.now();
    const player = window.MoguriaPlayer.create();
    const skills = window.MoguriaSkills.skills.slice(0, 4);
    const artifacts = window.MoguriaSkills.artifacts.slice(0, 2);
    player.lv = mode === 'skill-choice' ? 2 : 6;
    player.hp = 84;
    player.skills = skills;
    player.artifacts = artifacts;
    player.skillLevels = Object.fromEntries(skills.map((item, index) => [item.id, index % 2 + 1]));
    player.visual = { ...player.visual, star: 2, guard: 1, poison: 1 };
    const wave = mode === 'artifact-choice' ? 3 : mode === 'skill-choice' ? 2 : 5;
    const skillChoices = window.MoguriaSkills.skills.slice(4, 7).map((item) => item.id);
    const artifactChoices = window.MoguriaSkills.artifacts.slice(2, 5).map((item) => item.id);
    const pendingChoice = mode === 'skill-choice'
      ? { type: 'skill', wave, choiceIds: skillChoices, level: 2, exp: 0, nextExp: 39 }
      : mode === 'artifact-choice'
        ? { type: 'artifact', wave, choiceIds: artifactChoices }
        : null;
    const checkpoint = {
      version: 1,
      savedAt: now,
      wave,
      floor: wave,
      time: 18,
      player: window.MoguriaPlayer.snapshot(player),
      stats: {
        kills: 12, maxDamage: 48, totalDamage: 230, shots: 20, crits: 3,
        hitsTaken: 1, dodges: 2, explosions: 4, poisonKills: 2, rareKills: 1,
        bossKills: 0, combo: 2, bestCombo: 5
      },
      rerolls: 3,
      artifactRerolls: 3,
      bans: 2,
      bannedSkills: [],
      artifactWaves: {},
      collectAllSchedule: { version: 1, nextWave: 6, triggerRatio: 0.5, wave, waveKills: 0, lastSpawnWave: 0 },
      collectAllDrop: null,
      defeated: false,
      dungeon: { seed: 20260814 },
      choiceType: pendingChoice?.type || null,
      pendingChoice
    };
    const runId = `browser-qa-${mode}`;
    const activeRun = {
      runId,
      startedAt: now - 30000,
      updatedAt: now,
      checkpoint,
      checkpointReason: 'browser-qa'
    };
    const save = window.MoguriaSave.load();
    save.activeRun = activeRun;
    const saved = window.MoguriaSave.save(save);
    if (!saved.ok) throw new Error('battle fixture save failed');
    window.MoguriaUI.show('game');
    const prepared = await window.MoguriaBattleV3Loader.prepare();
    if (!prepared?.ok) throw new Error(`battle prepare failed: ${prepared?.reason || 'unknown'}`);
    const started = await window.MoguriaGame.start({ runId, activeRun, resume: true });
    if (!started) throw new Error('battle start failed');
    if (mode === 'pause') window.MoguriaGame.pauseRun();
    const renderer = window.MoguriaBattleV3;
    return {
      mode: window.MoguriaGame.getState()?.mode,
      ready: renderer?.isReady?.() === true,
      errors: renderer?.getLoadErrors?.() || [],
      fallbacks: renderer?.getFallbackAssets?.() || [],
      coreError: renderer?.getLastCoreStepError?.()
        ? String(renderer.getLastCoreStepError().message || renderer.getLastCoreStepError())
        : null
    };
  }, kind);
  if (!health.ready || health.errors.length || health.fallbacks.length || health.coreError) {
    throw new Error(`renderer health failed: ${JSON.stringify(health)}`);
  }
  await page.locator('#moguriaBattleV3CanvasHost canvas[data-moguria-battle-v3="true"]').waitFor({ state: 'visible', timeout: 15000 });
  return health;
}

async function prepareSkillVfx(page, level, { reducedMotion = false, quality = 'high' } = {}) {
  await page.emulateMedia({ reducedMotion:reducedMotion ? 'reduce' : 'no-preference' });
  const health = await prepareBattle(page, `battle-vfx-lv${level}`);
  if (health.mode !== 'run') throw new Error(`skill VFX fixture started in ${health.mode}`);
  const fixture = await page.evaluate(async ({ skillLevel, forcedQuality, motionPreference }) => {
    const state = window.MoguriaGame.getState();
    const renderer = window.MoguriaBattleV3;
    const ids = ['poison_seed', 'spark_pop', 'thunder_gum', 'mogu_field'];
    state.p.skillLevels = { ...state.p.skillLevels, ...Object.fromEntries(ids.map(id => [id, skillLevel])) };
    state.p.auraDamage = 5 * skillLevel;
    state.p.x = 0;
    state.p.y = 0;
    state.enemies = [];
    state.bullets = [];
    state.enemyBullets = [];
    state.drops = [];
    state.particles = [];
    state.shake = 0;
    state.hitStop = 0;
    const linkCount = skillLevel + 2;
    const points = Array.from({ length:linkCount + 1 }, (_, index) => ({
      x:-120 + index * 240 / linkCount,
      y:102 + (index % 2 ? -20 : 10)
    }));
    const fx = [
      { id:`qa-poison-${skillLevel}`, type:'poisonProc', x:-88, y:-94, r:30, life:.48, maxLife:.64, targetId:'qa-poison-target', skillId:'poison_seed', skillLevel, essential:true },
      { id:`qa-spark-${skillLevel}`, type:'boom', x:88, y:-94, r:54, life:.27, maxLife:.38, chainDepth:0, skillId:'spark_pop', skillLevel, essential:true },
      { id:`qa-field-${skillLevel}`, type:'auraPulse', x:0, y:0, r:68, life:.2, maxLife:.26, skillId:'mogu_field', skillLevel, essential:true },
      ...Array.from({ length:linkCount }, (_, index) => ({
        id:`qa-thunder-${skillLevel}-${index}`,
        type:'lightning',
        x:points[index].x,
        y:points[index].y,
        tx:points[index + 1].x,
        ty:points[index + 1].y,
        life:.2,
        maxLife:.26,
        chainIndex:index,
        sourceId:index ? `qa-enemy-${index - 1}` : 'player',
        targetId:`qa-enemy-${index}`,
        skillId:'thunder_gum',
        skillLevel,
        essential:true
      }))
    ];
    state.mode = 'pause';
    window.MoguriaPerformance = {
      ...window.MoguriaPerformance,
      getQuality: () => forcedQuality,
      shouldReduceEffects: () => forcedQuality !== 'high',
      stats: () => ({ fps:60, quality:forcedQuality, reduceEffects:forcedQuality !== 'high' })
    };

    const sampleFrameTimings = async (count = 48) => {
      const timestamps = [];
      await new Promise(resolve => {
        const sample = timestamp => {
          timestamps.push(timestamp);
          if (timestamps.length >= count + 1) resolve();
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      const frames = timestamps.slice(1).map((timestamp, index) => timestamp - timestamps[index]);
      const ordered = frames.slice().sort((a, b) => a - b);
      const percentile = value => ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * value))];
      const averageMs = frames.reduce((sum, value) => sum + value, 0) / frames.length;
      return {
        frames:frames.length,
        averageMs:Number(averageMs.toFixed(3)),
        averageFps:Number((1000 / averageMs).toFixed(2)),
        p50Ms:Number(percentile(.5).toFixed(3)),
        p95Ms:Number(percentile(.95).toFixed(3)),
        p99Ms:Number(percentile(.99).toFixed(3)),
        over33ms:frames.filter(value => value > 33.3).length,
        over50ms:frames.filter(value => value > 50).length
      };
    };

    state.p.auraRadius = 0;
    state.fx = [];
    renderer.sync(state);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const baselineTiming = await sampleFrameTimings();
    state.p.auraRadius = 68;
    state.fx = fx;
    renderer.sync(state);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const vfxTiming = await sampleFrameTimings();
    return {
      effectCount:state.fx.length,
      expectedEffectCount:linkCount + 3,
      level:skillLevel,
      mode:state.mode,
      levels:Object.fromEntries(ids.map(id => [id, state.p.skillLevels[id]])),
      radius:state.p.auraRadius,
      quality:window.MoguriaPerformance.getQuality(),
      motionPreference,
      performance:{
        baseline:baselineTiming,
        vfx:vfxTiming,
        averageDeltaMs:Number((vfxTiming.averageMs - baselineTiming.averageMs).toFixed(3)),
        p95DeltaMs:Number((vfxTiming.p95Ms - baselineTiming.p95Ms).toFixed(3))
      },
      errors:renderer.getLoadErrors?.() || [],
      fallbacks:renderer.getFallbackAssets?.() || [],
      coreError:renderer.getLastCoreStepError?.()
        ? String(renderer.getLastCoreStepError().message || renderer.getLastCoreStepError())
        : null
    };
  }, { skillLevel:level, forcedQuality:quality, motionPreference:reducedMotion ? 'reduce' : 'no-preference' });
  if (fixture.effectCount !== fixture.expectedEffectCount
    || fixture.mode !== 'pause'
    || fixture.radius !== 68
    || fixture.quality !== quality
    || fixture.motionPreference !== (reducedMotion ? 'reduce' : 'no-preference')
    || Object.values(fixture.levels).some(value => value !== level)
    || fixture.errors.length
    || fixture.fallbacks.length
    || fixture.coreError) {
    throw new Error(`skill VFX fixture failed: ${JSON.stringify(fixture)}`);
  }
  return fixture;
}

async function openFreshStoryEntry(page) {
  const before = await page.evaluate(() => {
    const cleared = window.MoguriaSave.clear();
    window.MoguriaHome.update();
    const save = window.MoguriaSave.load();
    return {
      cleared,
      entryMode: save.story?.entryMode || '',
      currentNodeId: save.story?.currentNodeId || '',
      belly: save.belly,
      activeRun: save.activeRun,
      playerLoaded: typeof window.MoguriaStoryChapter01?.open === 'function',
      playerScriptCount: document.querySelectorAll('script[data-moguria-story-ch01]').length,
      playerStyleCount: document.querySelectorAll('link[data-moguria-story-ch01-style]').length
    };
  });
  if (!before.cleared
    || before.entryMode !== 'new'
    || before.currentNodeId !== 'c1_available'
    || before.activeRun != null
    || before.playerLoaded
    || before.playerScriptCount !== 0
    || before.playerStyleCount !== 0) {
    throw new Error(`fresh Chapter 1 Home precondition failed: ${JSON.stringify(before)}`);
  }

  const entry = page.locator('#startBtn');
  await entry.waitFor({ state: 'visible' });
  const entryLabel = await entry.getAttribute('aria-label');
  if (!String(entryLabel || '').includes('物語をはじめる')) {
    throw new Error(`fresh-save story entry is not the Home primary action: ${entryLabel || '(missing)'}`);
  }
  await entry.click();
  await page.waitForFunction(() => (
    typeof window.MoguriaStoryChapter01?.seekForVerification === 'function'
      && window.MoguriaStoryChapter01?.getHealth?.()?.ok === true
  ), null, { timeout: 30000 });
  await page.locator('#storyChapter01.active[data-story-state="running"]').waitFor({ state: 'visible', timeout: 10000 });
  const afterEntry = await page.evaluate(() => {
    const save = window.MoguriaSave.load();
    return {
      entryMode: save.story?.entryMode || '',
      currentNodeId: save.story?.currentNodeId || '',
      transitionIds: Array.from(save.story?.transitionIds || []),
      belly: save.belly,
      activeRun: save.activeRun,
      playerLoaded: typeof window.MoguriaStoryChapter01?.open === 'function',
      playerScriptCount: document.querySelectorAll('script[data-moguria-story-ch01][data-moguria-story-state="loaded"]').length,
      playerStyleCount: document.querySelectorAll('link[data-moguria-story-ch01-style="loaded"]').length,
      health: window.MoguriaStoryChapter01?.getHealth?.() || null
    };
  });
  if (afterEntry.entryMode !== 'new'
    || afterEntry.currentNodeId !== 'c1_seat'
    || !afterEntry.transitionIds.includes('c1-enter-seat')
    || afterEntry.belly !== before.belly
    || afterEntry.activeRun != null
    || !afterEntry.playerLoaded
    || afterEntry.playerScriptCount !== 1
    || afterEntry.playerStyleCount !== 1
    || !afterEntry.health?.ok
    || afterEntry.health.sceneId !== 'return-light') {
    throw new Error(`fresh Chapter 1 lazy entry failed: ${JSON.stringify({ before, afterEntry })}`);
  }
  return { entryLabel, before, afterEntry };
}

async function exerciseStoryLifecycle(page, entryEvidence) {
  const result = await page.evaluate(async ({ profileId, runId }) => {
    const saveApi = window.MoguriaSave;
    const storyPlayer = window.MoguriaStoryChapter01;
    const assertOk = (value, label) => {
      if (!value?.ok) throw new Error(`${label} failed: ${JSON.stringify(value)}`);
      return value;
    };
    assertOk(await storyPlayer.close(), 'initial story close');
    const transitions = [
      assertOk(saveApi.transitionStory('c1_return_lamp'), 'return-lamp transition'),
      assertOk(saveApi.transitionStory('c1_shard'), 'shard transition'),
      assertOk(saveApi.transitionStory('c1_investigation_ready'), 'investigation-ready transition')
    ];
    const ready = saveApi.load();
    const started = assertOk(saveApi.startRun({ runId, profileId }), 'story run start');
    const run = {
      runId: started.runId,
      profileId,
      runKind: 'story',
      cleared: true,
      floor: 4,
      wave: 4,
      lv: 1,
      survived: 1,
      kills: 0,
      maxDamage: 0,
      totalDamage: 0,
      dps: 0,
      critRate: 0,
      dodgeRate: 0,
      explosions: 0,
      bestCombo: 0,
      skills: [],
      artifacts: [],
      synergies: [],
      titles: [],
      visual: {},
      giveup: false
    };
    const settlement = assertOk(window.MoguriaMeta.awardFromRun(run), 'story run settlement');
    const afterSettlement = saveApi.load();
    const resumed = assertOk(await storyPlayer.resumeAfterRun({ run, settlement }), 'story settlement handoff');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const returned = saveApi.load();
    return {
      transitions: transitions.map((item) => item.transitionId),
      ready: {
        currentNodeId: ready.story?.currentNodeId || '',
        belly: ready.belly,
        transitionIds: Array.from(ready.story?.transitionIds || [])
      },
      started: {
        runId: started.runId,
        profileId: started.activeRun?.profileId || '',
        currentNodeId: started.data?.story?.currentNodeId || '',
        boundRunId: started.data?.story?.boundRun?.runId || '',
        belly: started.data?.belly
      },
      settlement: {
        ok: settlement.ok,
        amount: settlement.amount,
        runId: settlement.runId,
        currentNodeId: afterSettlement.story?.currentNodeId || '',
        activeRun: afterSettlement.activeRun,
        boundRun: afterSettlement.story?.boundRun,
        transitionIds: Array.from(afterSettlement.story?.transitionIds || [])
      },
      handoff: {
        ok: resumed.ok,
        currentNodeId: returned.story?.currentNodeId || '',
        transitionIds: Array.from(returned.story?.transitionIds || []),
        health: storyPlayer.getHealth?.() || null,
        resultScreenActive: document.getElementById('result')?.classList?.contains('active') || false
      }
    };
  }, { profileId:'story-c1-investigation-v1', runId:'browser-qa-story-lifecycle' });

  const expectedTransitions = ['c1-seat-complete','c1-return-lamp-complete','c1-shard-complete'];
  if (JSON.stringify(result.transitions) !== JSON.stringify(expectedTransitions)
    || result.ready.currentNodeId !== 'c1_investigation_ready'
    || result.started.profileId !== 'story-c1-investigation-v1'
    || result.started.currentNodeId !== 'c1_investigation_active'
    || result.started.boundRunId !== result.started.runId
    || result.started.belly !== entryEvidence.before.belly
    || result.settlement.amount !== 0
    || result.settlement.runId !== result.started.runId
    || result.settlement.currentNodeId !== 'c1_return_pending'
    || result.settlement.activeRun != null
    || result.settlement.boundRun != null
    || !result.settlement.transitionIds.includes('c1-investigation-settled')
    || result.handoff.currentNodeId !== 'c1_record_signal'
    || !result.handoff.transitionIds.includes('c1-record-opened')
    || !result.handoff.health?.ok
    || result.handoff.health.sceneId !== 'archive-ledger'
    || result.handoff.resultScreenActive) {
    throw new Error(`Chapter 1 production lifecycle did not reach the ledger: ${JSON.stringify(result)}`);
  }
  return result;
}

async function prepareStoryFixture(page, screenId) {
  const fixture = STORY_SCENE_FIXTURES[screenId];
  if (!fixture) throw new Error(`unknown Chapter 1 browser fixture: ${screenId}`);
  await page.emulateMedia({ reducedMotion: fixture.reducedMotion ? 'reduce' : 'no-preference' });
  const entry = await openFreshStoryEntry(page);
  const lifecycle = screenId === STORY_LIFECYCLE_SCREEN_ID
    ? await exerciseStoryLifecycle(page, entry)
    : null;
  const result = await page.evaluate(async (options) => {
    const api = window.MoguriaStoryChapter01;
    const sought = await api.seekForVerification(options);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const section = document.getElementById('storyChapter01');
    const loading = document.getElementById('storyChapter01Loading');
    return {
      sought,
      verification: api.getVerification?.() || null,
      sectionState: section?.dataset?.storyState || '',
      sectionScene: section?.dataset?.storyScene || '',
      paused: section?.getAttribute?.('data-story-paused') || '',
      loadingHidden: Boolean(loading?.hidden),
      assetStats: window.MoguriaAssets?.stats?.() || null
    };
  }, fixture);
  const verification = result.verification || {};
  if (!result.sought?.ok
    || !verification.ok
    || verification.sceneIndex !== fixture.sceneIndex
    || verification.sceneId !== fixture.sceneId
    || verification.sceneTimeMs !== fixture.sceneTimeMs
    || verification.postTimeMs !== fixture.postTimeMs
    || verification.holdCommitted !== fixture.holdCommitted
    || verification.reducedMotion !== fixture.reducedMotion
    || result.sectionState !== 'running'
    || result.sectionScene !== fixture.sceneId
    || result.paused !== 'true'
    || !result.loadingHidden
    || result.assetStats?.errors?.length) {
    throw new Error(`Chapter 1 verification seek did not settle: ${JSON.stringify({ screenId, fixture, result })}`);
  }
  return { screenId, expected: fixture, entry, lifecycle, ...result };
}

function storyScreenContract(screenId) {
  const fixture = STORY_SCENE_FIXTURES[screenId];
  const persistentControls = ['#storyChapter01Close', '#storyChapter01Pause'];
  return {
    surface: '#storyChapter01.active[data-story-state="running"]',
    touch: fixture.holdVisible
      ? [...persistentControls, '#storyChapter01Hold', '#storyChapter01HoldAlternative']
      : persistentControls,
    fit: fixture.holdVisible
      ? [...persistentControls, '#storyChapter01Hold', '#storyChapter01HoldAlternative']
      : persistentControls,
    setup: async (page) => prepareStoryFixture(page, screenId)
  };
}

const SCREEN_CONTRACTS = Object.freeze({
  'startup-loading': {
    surface: '#startupLoader:not([hidden])',
    touch: [
      '[data-loading-surface="startup"] [data-loading-tip-button]',
      '[data-loading-surface="startup"] [data-loading-tip-auto-toggle]'
    ],
    fit: [
      '[data-loading-surface="startup"] [data-loading-tip-button]',
      '[data-loading-surface="startup"] [data-loading-tip-auto-toggle]'
    ],
    setup: async (page) => prepareLoadingFixture(page, 'startup', 50)
  },
  home: {
    surface: '#home.active',
    touch: ['#startBtn', '#snackBtn', '#dexBtn', '#logsBtn', '#storyBtn', '#equipBtn', '#gachaBtn', '#outingBtn'],
    setup: async (page) => page.locator('#home.active').waitFor({ state: 'visible' })
  },
  'story-return-light': storyScreenContract('story-return-light'),
  'story-rescue': storyScreenContract('story-rescue'),
  'story-fragment-hold': storyScreenContract('story-fragment-hold'),
  'story-fragment-postcommit': storyScreenContract('story-fragment-postcommit'),
  'story-ledger': storyScreenContract('story-ledger'),
  'story-fragment-reduced': storyScreenContract('story-fragment-reduced'),
  dex: {
    surface: '#overlay[data-view="dex"]:not(.hidden) .meta-shell',
    touch: ['#closeOverlay', '[data-dex-tab]'],
    fit: ['[data-dex-tab]'],
    setup: async (page) => {
      await page.click('#dexBtn');
      await page.locator('#overlay[data-view="dex"]:not(.hidden)').waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelector('[data-dex-tab="artifacts"]')?.getAttribute('aria-selected') === 'true');
    }
  },
  logs: {
    surface: '#overlay[data-view="logs"]:not(.hidden) .meta-shell',
    touch: ['#closeOverlay', '.meta-log-card__details > summary'],
    setup: async (page) => {
      await page.click('#logsBtn');
      await page.locator('#overlay[data-view="logs"]:not(.hidden)').waitFor({ state: 'visible' });
      await page.evaluate(() => {
        const details = document.querySelector('.meta-log-card__details');
        if (details) details.open = true;
      });
    }
  },
  equipment: {
    surface: '#overlay[data-view="equipment"]:not(.hidden) .meta-shell',
    touch: ['#closeOverlay', '[data-equip]', '[data-upgrade]'],
    setup: async (page) => {
      await page.click('#equipBtn');
      await page.locator('#overlay[data-view="equipment"]:not(.hidden)').waitFor({ state: 'visible' });
    }
  },
  gacha: {
    surface: '#overlay[data-view="gacha"]:not(.hidden) .meta-shell',
    touch: ['#closeOverlay', '#pullGachaBtn'],
    setup: async (page) => {
      await page.click('#gachaBtn');
      await page.locator('#overlay[data-view="gacha"]:not(.hidden)').waitFor({ state: 'visible' });
    }
  },
  outing: {
    surface: '#overlay[data-view="outing"]:not(.hidden) .meta-shell',
    touch: ['#closeOverlay', '[data-claim], .meta-outing-card button'],
    setup: async (page) => {
      await page.click('#outingBtn');
      await page.locator('#overlay[data-view="outing"]:not(.hidden)').waitFor({ state: 'visible' });
    }
  },
  'adventure-loading': {
    surface: '#adventureLoading:not(.hidden)',
    touch: [
      '[data-loading-surface="adventure"] [data-loading-tip-button]',
      '[data-loading-surface="adventure"] [data-loading-tip-auto-toggle]'
    ],
    fit: [
      '[data-loading-surface="adventure"] [data-loading-tip-button]',
      '[data-loading-surface="adventure"] [data-loading-tip-auto-toggle]'
    ],
    setup: async (page) => prepareLoadingFixture(page, 'adventure', 47)
  },
  'battle-hud': {
    surface: '#game.active',
    touch: ['#pauseBtn'],
    setup: async (page) => {
      const health = await prepareBattle(page, 'battle-hud');
      if (health.mode !== 'run') throw new Error(`battle HUD mode is ${health.mode}`);
    }
  },
  'battle-vfx-lv1': {
    surface: '#game.active',
    touch: ['#pauseBtn'],
    setup: async (page) => prepareSkillVfx(page, 1)
  },
  'battle-vfx-lv3': {
    surface: '#game.active',
    touch: ['#pauseBtn'],
    setup: async (page) => prepareSkillVfx(page, 3)
  },
  'battle-vfx-lv5': {
    surface: '#game.active',
    touch: ['#pauseBtn'],
    setup: async (page) => prepareSkillVfx(page, 5)
  },
  'battle-vfx-lv5-reduced': {
    surface: '#game.active',
    touch: ['#pauseBtn'],
    setup: async (page) => prepareSkillVfx(page, 5, { reducedMotion:true })
  },
  'battle-vfx-lv5-low': {
    surface: '#game.active',
    touch: ['#pauseBtn'],
    setup: async (page) => prepareSkillVfx(page, 5, { quality:'low' })
  },
  'skill-choice': {
    surface: '#levelModal:not(.hidden) .modal-card',
    touch: [
      '#rerollBtn',
      '#skillChoices > .skill-card, #skillChoices > .skill-choice-entry > .skill-card',
      '#skillChoices > .skill-card .ban-skill, #skillChoices > .skill-choice-entry > .ban-skill'
    ],
    setup: async (page) => {
      const health = await prepareBattle(page, 'skill-choice');
      if (health.mode !== 'choice') throw new Error(`skill choice mode is ${health.mode}`);
      await page.locator('#levelModal:not(.hidden)').waitFor({ state: 'visible' });
      const ids = await page.locator('#skillChoices > [data-skill-id]').evaluateAll((nodes) => nodes.map((node) => node.dataset.skillId));
      if (ids.length !== 3 || new Set(ids).size !== 3) throw new Error(`skill choices are not three unique cards: ${ids}`);
    }
  },
  'artifact-choice': {
    surface: '#artifactModal:not(.hidden) .modal-card',
    touch: ['#artifactRerollBtn', '#artifactChoices > [data-artifact-id]'],
    setup: async (page) => {
      const health = await prepareBattle(page, 'artifact-choice');
      if (health.mode !== 'artifact') throw new Error(`artifact choice mode is ${health.mode}`);
      await page.locator('#artifactModal:not(.hidden)').waitFor({ state: 'visible' });
      const ids = await page.locator('#artifactChoices [data-artifact-id]').evaluateAll((nodes) => nodes.map((node) => node.dataset.artifactId));
      if (ids.length !== 3 || new Set(ids).size !== 3) throw new Error(`artifact choices are not three unique cards: ${ids}`);
    }
  },
  pause: {
    surface: '#pauseModal:not(.hidden) .modal-card',
    touch: ['#resumeBtn', '#pauseGiveupBtn', '[data-pause-tab]'],
    setup: async (page) => {
      const health = await prepareBattle(page, 'pause');
      if (health.mode !== 'pause') throw new Error(`pause mode is ${health.mode}`);
      await page.locator('#pauseModal:not(.hidden)').waitFor({ state: 'visible' });
      await page.locator('#pauseArtifactTab').click();
      await page.waitForFunction(() => document.querySelector('#pauseArtifactTab')?.getAttribute('aria-selected') === 'true');
    }
  },
  result: {
    surface: '#result.active',
    touch: ['#againBtn', '#homeBtn', '.result-detail > summary'],
    setup: async (page) => {
      await page.evaluate(() => window.MoguriaUI.showResult({
        name: '星あかりの探検家',
        comment: '小さな光をたくさん見つけたね。',
        floor: 8, wave: 8, kills: 42, coins: 96, lv: 7, maxDamage: 128,
        dps: 36, bestCombo: 18, explosions: 12, critRate: 24, dodgeRate: 16,
        skills: [
          ...window.MoguriaSkills.skills.slice(0, 5).map((item, index) => ({ ...item, level: index % 3 + 1 })),
          ...window.MoguriaSkills.fusions.slice(0, 1).map((item) => ({ ...item, fusion: true, level: 1 }))
        ],
        artifacts: window.MoguriaSkills.artifacts.slice(0, 3),
        synergies: ['星のよりみち', 'もぐもぐ連鎖'],
        titles: ['星をつなぐもの'],
        visual: { star: 2, guard: 1 }
      }));
      await page.locator('#result.active').waitFor({ state: 'visible' });
    }
  }
});

async function waitForTransientAbsence(page, selectors = []) {
  if (!selectors.length) return;
  await page.waitForFunction((targets) => (
    targets.every((selector) => !document.querySelector(selector))
  ), selectors, { timeout: 7000 });
}

async function settleVisuals(page, surfaceSelector, scrollRootSelectors = []) {
  const scrollState = await page.evaluate(async ({ selector, rootSelectors, globalRootSelectors }) => {
    if (document.fonts?.ready) await document.fonts.ready;
    const surface = document.querySelector(selector);
    if (!surface) throw new Error(`visual surface is missing: ${selector}`);
    const allRootSelectors = [...globalRootSelectors, ...rootSelectors];
    const scrollRoots = allRootSelectors.map((rootSelector) => {
      const root = document.querySelector(rootSelector);
      if (!root) throw new Error(`visual scroll root is missing: ${rootSelector}`);
      return { root, selector: rootSelector };
    });
    const surfaceImages = surface ? [...surface.querySelectorAll('img')] : [];
    for (const image of surfaceImages) {
      if (!image.getClientRects().length) continue;
      image.loading = 'eager';
      image.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      if (!image.complete) await new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
        setTimeout(resolve, 5000);
      });
      if (image.complete && image.naturalWidth > 0 && typeof image.decode === 'function') {
        await image.decode().catch(() => {});
      }
    }

    const resetScroll = () => {
      for (const { root } of scrollRoots) {
        root.scrollTop = 0;
        root.scrollLeft = 0;
      }
      const documentRoot = document.scrollingElement;
      if (documentRoot) {
        documentRoot.scrollTop = 0;
        documentRoot.scrollLeft = 0;
      }
      window.scrollTo(0, 0);
    };
    resetScroll();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    resetScroll();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return scrollRoots.map(({ root, selector: rootSelector }) => ({
      selector: rootSelector,
      top: Number(root.scrollTop.toFixed(1)),
      left: Number(root.scrollLeft.toFixed(1)),
      scrollHeight: root.scrollHeight,
      clientHeight: root.clientHeight
    }));
  }, {
    selector: surfaceSelector,
    rootSelectors: scrollRootSelectors,
    globalRootSelectors: GLOBAL_VISUAL_SCROLL_ROOTS
  });
  const unrestored = scrollState.filter(({ top, left }) => Math.abs(top) > 1 || Math.abs(left) > 1);
  if (unrestored.length) throw new Error(`visual scroll roots did not return to origin: ${JSON.stringify(unrestored)}`);
  await page.waitForTimeout(100);
  return scrollState;
}

async function battleRendererDiagnostics(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('#moguriaBattleV3CanvasHost canvas[data-moguria-battle-v3="true"]');
    const phaserGame = [...(window.Phaser?.GAMES || [])].find((game) => game?.canvas === canvas) || null;
    const gl = phaserGame?.renderer?.gl || null;
    const renderer = window.MoguriaBattleV3;
    const stringify = (value) => String(value?.message || value || 'unknown');
    const rect = canvas?.getBoundingClientRect?.();
    return {
      canvas: canvas ? {
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
        rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null
      } : null,
      phaser: {
        games: window.Phaser?.GAMES?.length || 0,
        rendererType: phaserGame?.renderer?.type ?? null,
        drawingBufferWidth: gl?.drawingBufferWidth ?? null,
        drawingBufferHeight: gl?.drawingBufferHeight ?? null,
        contextLost: typeof gl?.isContextLost === 'function' ? gl.isContextLost() : null
      },
      renderer: {
        ready: renderer?.isReady?.() === true,
        loadErrors: (renderer?.getLoadErrors?.() || []).map(stringify),
        fallbackAssets: (renderer?.getFallbackAssets?.() || []).map(stringify),
        coreStepError: renderer?.getLastCoreStepError?.()
          ? stringify(renderer.getLastCoreStepError())
          : null
      },
      contextEvents: [...(window.__moguriaQaCanvasEvents || [])]
    };
  });
}

async function recoverBattleCanvas(page) {
  const recovery = await page.evaluate(async () => {
    const state = window.MoguriaGame?.getState?.();
    let synced = false;
    let error = null;
    try {
      synced = window.MoguriaBattleV3?.sync?.(state) === true;
      window.dispatchEvent(new Event('resize'));
    } catch (caught) {
      error = String(caught?.message || caught);
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { synced, error };
  });
  await page.waitForTimeout(BATTLE_CANVAS_PROBE.intervalMs);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return recovery;
}

async function waitForBattleProbeInterval(page) {
  await page.waitForTimeout(BATTLE_CANVAS_PROBE.intervalMs);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function captureBattleProbe(page, clip, output, viewport, label, scale = 'device') {
  const fileName = `${viewport.id}--battle-hud--canvas-probe-${label}.png`;
  const filePath = path.join(output, 'screenshots', fileName);
  const screenshot = await page.screenshot({ path: filePath, clip, scale, animations: 'disabled' });
  const visual = pngVisualStats(screenshot);
  return {
    screenshot: path.posix.join('screenshots', fileName),
    scale,
    passed: !visual.nearBlank
      && visual.standardDeviation >= BATTLE_CANVAS_PROBE.minStandardDeviation
      && visual.colorBuckets >= BATTLE_CANVAS_PROBE.minColorBuckets,
    visual,
    renderer: await battleRendererDiagnostics(page)
  };
}

async function verifyBattleCanvas(page, viewport, output) {
  const x = Math.floor(viewport.width * BATTLE_CANVAS_PROBE.xRatio);
  const y = Math.floor(viewport.height * BATTLE_CANVAS_PROBE.yRatio);
  const clip = {
    x,
    y,
    width: Math.max(1, Math.floor(viewport.width * BATTLE_CANVAS_PROBE.widthRatio)),
    height: Math.max(1, Math.floor(viewport.height * BATTLE_CANVAS_PROBE.heightRatio))
  };
  const result = {
    clip,
    passed: false,
    preProbeRenderer: await battleRendererDiagnostics(page),
    unassisted: []
  };
  result.backingStoreReady = Number(result.preProbeRenderer.canvas?.width) > 0
    && Number(result.preProbeRenderer.canvas?.height) > 0;
  for (let attempt = 1; attempt <= BATTLE_CANVAS_PROBE.requiredPasses; attempt += 1) {
    const item = await captureBattleProbe(page, clip, output, viewport, `${attempt}-device`);
    result.unassisted.push({ attempt, ...item });
    if (attempt < BATTLE_CANVAS_PROBE.requiredPasses) await waitForBattleProbeInterval(page);
  }
  result.passed = result.backingStoreReady
    && result.unassisted.length === BATTLE_CANVAS_PROBE.requiredPasses
    && result.unassisted.every((item) => item.passed);
  if (!result.passed) {
    result.cssScaleDiagnostic = await captureBattleProbe(
      page, clip, output, viewport, 'css-diagnostic', 'css'
    );
    result.recovery = await recoverBattleCanvas(page);
    result.recoveryProbe = await captureBattleProbe(
      page, clip, output, viewport, '3-recovery-device'
    );
  }
  return result;
}

async function verifyStoryCanvas(page, viewport, screenId, output) {
  const snapshot = await page.evaluate(() => {
    const canvas = document.getElementById('storyChapter01Canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      width: canvas.width,
      height: canvas.height,
      rect: {
        x: Number(rect.x.toFixed(2)),
        y: Number(rect.y.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2))
      },
      verification: window.MoguriaStoryChapter01?.getVerification?.() || null,
      dataUrl: canvas.toDataURL('image/png')
    };
  });
  if (!snapshot?.dataUrl?.startsWith('data:image/png;base64,')) {
    throw new Error('Chapter 1 canvas did not yield a PNG verification capture');
  }
  const buffer = Buffer.from(snapshot.dataUrl.slice(snapshot.dataUrl.indexOf(',') + 1), 'base64');
  const fileName = `${viewport.id}--${screenId}--canvas-probe.png`;
  fs.writeFileSync(path.join(output, 'screenshots', fileName), buffer);
  const visual = pngVisualStats(buffer);
  const expectedDpr = Math.min(2, viewport.deviceScaleFactor);
  const expectedWidth = Math.round(viewport.width * expectedDpr);
  const expectedHeight = Math.round(viewport.height * expectedDpr);
  const backingStoreReady = snapshot.width === expectedWidth && snapshot.height === expectedHeight;
  const viewportAligned = Math.max(
    Math.abs(snapshot.rect.x), Math.abs(snapshot.rect.y),
    Math.abs(snapshot.rect.width - viewport.width), Math.abs(snapshot.rect.height - viewport.height)
  ) <= 1;
  const visuallyRich = !visual.nearBlank
    && visual.standardDeviation >= STORY_CANVAS_PROBE.minStandardDeviation
    && visual.colorBuckets >= STORY_CANVAS_PROBE.minColorBuckets;
  return {
    screenshot: path.posix.join('screenshots', fileName),
    passed: backingStoreReady && viewportAligned && visuallyRich,
    backingStoreReady,
    viewportAligned,
    expectedBackingStore: { width: expectedWidth, height: expectedHeight, dpr: expectedDpr },
    canvas: { width: snapshot.width, height: snapshot.height, rect: snapshot.rect },
    verification: snapshot.verification,
    visual
  };
}

async function captureStoryMotionEvidence(page, viewport, screenId, output) {
  const contract = STORY_MOTION_EVIDENCE[screenId];
  if (!contract) return null;
  const frames = [];
  for (const frame of contract.frames) {
    const verification = await page.evaluate(async (options) => {
      const api = window.MoguriaStoryChapter01;
      const sought = await api.seekForVerification({ ...options, reducedMotion:false });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { sought, snapshot:api.getVerification?.() || null };
    }, frame);
    if (!verification.sought?.ok
      || !verification.snapshot?.ok
      || verification.snapshot.sceneIndex !== frame.sceneIndex
      || verification.snapshot.sceneTimeMs !== frame.sceneTimeMs
      || verification.snapshot.postTimeMs !== frame.postTimeMs
      || verification.snapshot.holdCommitted !== frame.holdCommitted) {
      throw new Error(`Chapter 1 marker evidence did not settle: ${JSON.stringify({ screenId, frame, verification })}`);
    }
    const fileName = `${viewport.id}--${screenId}--motion-${frame.label}.png`;
    const screenshot = await page.locator('#storyChapter01Canvas').screenshot({
      path: path.join(output, 'screenshots', fileName),
      animations: 'disabled',
      scale: 'css'
    });
    const visual = pngVisualStats(screenshot);
    const passed = !visual.nearBlank
      && visual.standardDeviation >= STORY_CANVAS_PROBE.minStandardDeviation
      && visual.colorBuckets >= STORY_CANVAS_PROBE.minColorBuckets;
    frames.push({
      label:frame.label,
      sceneTimeMs:frame.sceneTimeMs,
      postTimeMs:frame.postTimeMs,
      screenshot:path.posix.join('screenshots', fileName),
      passed,
      visual,
      verification:verification.snapshot
    });
  }
  const stable = STORY_SCENE_FIXTURES[screenId];
  const restored = await page.evaluate(async (options) => {
    const api = window.MoguriaStoryChapter01;
    const sought = await api.seekForVerification(options);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { sought, snapshot:api.getVerification?.() || null };
  }, stable);
  const passed = frames.every((frame) => frame.passed)
    && restored.sought?.ok
    && restored.snapshot?.sceneId === stable.sceneId
    && restored.snapshot?.sceneTimeMs === stable.sceneTimeMs
    && restored.snapshot?.postTimeMs === stable.postTimeMs;
  return { motionId:contract.motionId, passed, frames, restored:restored.snapshot };
}

async function auditStoryDom(page, screenId, viewport) {
  const fixture = STORY_SCENE_FIXTURES[screenId];
  return page.evaluate(({ expected, width, height }) => {
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none'
        && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
    };
    const rectOf = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: Number(rect.x.toFixed(2)), y: Number(rect.y.toFixed(2)),
        left: Number(rect.left.toFixed(2)), right: Number(rect.right.toFixed(2)),
        top: Number(rect.top.toFixed(2)), bottom: Number(rect.bottom.toFixed(2)),
        width: Number(rect.width.toFixed(2)), height: Number(rect.height.toFixed(2))
      };
    };
    const failures = [];
    const section = document.getElementById('storyChapter01');
    const canvas = document.getElementById('storyChapter01Canvas');
    const header = section?.querySelector('.story-ch01__header');
    const dialogue = section?.querySelector('.story-ch01__dialogue');
    const chapterTitle = document.getElementById('storyChapter01Title');
    const sceneTitle = document.getElementById('storyChapter01SceneTitle');
    const sceneText = document.getElementById('storyChapter01SceneText');
    const count = document.getElementById('storyChapter01Count');
    const close = document.getElementById('storyChapter01Close');
    const pause = document.getElementById('storyChapter01Pause');
    const hold = document.getElementById('storyChapter01Hold');
    const holdTrack = document.getElementById('storyChapter01HoldTrack');
    const holdAlternative = document.getElementById('storyChapter01HoldAlternative');
    const next = document.getElementById('storyChapter01Next');
    const loading = document.getElementById('storyChapter01Loading');
    const essential = [section, canvas, header, dialogue, chapterTitle, sceneTitle, sceneText, count, close, pause];
    for (const element of essential) {
      if (!visible(element)) failures.push(`Chapter 1 DOM element is missing or hidden: ${element?.id || element?.className || '(missing)'}`);
    }
    const fitted = expected.holdVisible ? [...essential, hold, holdAlternative] : essential;
    for (const element of fitted.filter(Boolean)) {
      const rect = rectOf(element);
      if (!rect || rect.left < -1 || rect.right > width + 1 || rect.top < -1 || rect.bottom > height + 1) {
        failures.push(`Chapter 1 DOM element does not fit the viewport: ${element.id || element.className}`);
      }
    }
    const text = {
      chapter: chapterTitle?.textContent?.trim() || '',
      scene: sceneTitle?.textContent?.trim() || '',
      dialogue: sceneText?.textContent?.trim() || '',
      count: count?.textContent?.trim() || ''
    };
    if (!text.chapter || !text.scene || text.dialogue.length < 8 || text.count !== `${expected.sceneIndex + 1} / 4`) {
      failures.push(`Chapter 1 DOM copy is blank or inconsistent: ${JSON.stringify(text)}`);
    }
    if (section?.dataset?.storyState !== 'running' || section?.dataset?.storyScene !== expected.sceneId) {
      failures.push(`Chapter 1 DOM state is inconsistent: ${section?.dataset?.storyState}/${section?.dataset?.storyScene}`);
    }
    if (Boolean(close?.disabled) !== expected.closeDisabled
      || close?.getAttribute?.('aria-disabled') !== String(expected.closeDisabled)) {
      failures.push(`Chapter 1 close-boundary state differs: disabled=${Boolean(close?.disabled)}`);
    }
    if (visible(hold) !== expected.holdVisible
      || visible(holdAlternative) !== expected.holdVisible
      || visible(next)
      || visible(loading)) {
      failures.push(`Chapter 1 action visibility differs: hold=${visible(hold)} alternative=${visible(holdAlternative)} next=${visible(next)} loading=${visible(loading)}`);
    }
    if (expected.holdVisible && (holdTrack?.getAttribute?.('role') !== 'progressbar'
      || holdTrack?.getAttribute?.('aria-valuemin') !== '0'
      || holdTrack?.getAttribute?.('aria-valuemax') !== '100'
      || holdTrack?.getAttribute?.('aria-valuenow') !== '0')) {
      failures.push('Chapter 1 deliberate-hold progress semantics differ');
    }
    return {
      failures,
      state: { value: section?.dataset?.storyState || '', scene: section?.dataset?.storyScene || '' },
      text,
      visible: { hold: visible(hold), next: visible(next), loading: visible(loading) },
      controls: {
        close: { disabled: Boolean(close?.disabled), rect: rectOf(close) },
        pause: { visible: visible(pause), pressed: pause?.getAttribute?.('aria-pressed') || null, rect: rectOf(pause) },
        hold: { visible: visible(hold), rect: rectOf(hold), progressNow: holdTrack?.getAttribute?.('aria-valuenow') || null },
        holdAlternative: { visible: visible(holdAlternative), rect: rectOf(holdAlternative) }
      },
      geometry: {
        section: rectOf(section), canvas: rectOf(canvas), header: rectOf(header), dialogue: rectOf(dialogue)
      }
    };
  }, { expected: fixture, width: viewport.width, height: viewport.height });
}

async function auditDom(page, contract, viewport, screenId) {
  return page.evaluate(({ surfaceSelector, touchSelectors, contentFitSelectors, width, height, viewportSurfaceExpected }) => {
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none'
        && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
    };
    const surface = document.querySelector(surfaceSelector);
    const failures = [];
    if (!visible(surface)) failures.push(`active surface is missing or hidden: ${surfaceSelector}`);
    const surfaceRect = surface?.getBoundingClientRect();
    if (surfaceRect && (surfaceRect.left < -1 || surfaceRect.right > width + 1)) {
      failures.push(`active surface overflows horizontally: ${surfaceRect.left.toFixed(1)}..${surfaceRect.right.toFixed(1)}`);
    }
    if (surfaceRect && viewportSurfaceExpected) {
      const viewportDelta = Math.max(
        Math.abs(surfaceRect.x), Math.abs(surfaceRect.y),
        Math.abs(surfaceRect.width - width), Math.abs(surfaceRect.height - height)
      );
      if (viewportDelta > 1) {
        failures.push(`full-viewport surface is displaced by ${viewportDelta.toFixed(1)}px: `
          + `${surfaceRect.x.toFixed(1)},${surfaceRect.y.toFixed(1)} `
          + `${surfaceRect.width.toFixed(1)}x${surfaceRect.height.toFixed(1)}`);
      }
    }
    const rootOverflow = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth;
    if (rootOverflow > 1) failures.push(`document horizontal overflow is ${rootOverflow}px`);

    const brokenImages = [...(surface?.querySelectorAll('img') || [])].filter((image) => image.getClientRects().length)
      .filter((image) => !image.complete || image.naturalWidth <= 0)
      .map((image) => image.currentSrc || image.src || '(unknown image)');
    if (brokenImages.length) failures.push(`broken visible images: ${brokenImages.join(', ')}`);

    const clipped = [...document.querySelectorAll('button, [role="button"], h1, h2, h3, p, canvas, .modal-card, .panel, img:not([alt=""])')]
      .filter(visible)
      .map((element) => ({
        selector: element.id ? `#${element.id}` : element.tagName.toLowerCase(),
        rect: element.getBoundingClientRect()
      }))
      .filter(({ rect }) => rect.right > 1 && rect.left < width - 1 && (rect.left < -1 || rect.right > width + 1));
    if (clipped.length) failures.push(`visible semantic elements cross horizontal viewport: ${clipped.slice(0, 5).map((item) => item.selector).join(', ')}`);

    const touchTargets = [];
    for (const selector of touchSelectors) {
      const nodes = [...document.querySelectorAll(selector)].filter(visible);
      if (!nodes.length) {
        failures.push(`required primary control is missing: ${selector}`);
        continue;
      }
      for (const node of nodes) {
        const rect = node.getBoundingClientRect();
        const record = {
          selector,
          id: node.id || node.getAttribute('data-skill-id') || node.getAttribute('data-artifact-id') || '',
          width: Number(rect.width.toFixed(1)),
          height: Number(rect.height.toFixed(1)),
          disabled: Boolean(node.disabled)
        };
        touchTargets.push(record);
        if (rect.width < 43.5 || rect.height < 43.5) {
          failures.push(`primary touch target below 44px: ${selector} ${record.width}x${record.height}`);
        }
      }
    }

    const contentFit = [];
    for (const selector of contentFitSelectors) {
      const nodes = [...document.querySelectorAll(selector)].filter(visible);
      if (!nodes.length) {
        failures.push(`required content-fit control is missing: ${selector}`);
        continue;
      }
      for (const node of nodes) {
        const record = {
          selector,
          id: node.id || node.getAttribute('data-dex-tab') || '',
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
          clientHeight: node.clientHeight,
          scrollHeight: node.scrollHeight
        };
        contentFit.push(record);
        if (record.scrollWidth > record.clientWidth + 1 || record.scrollHeight > record.clientHeight + 1) {
          failures.push(`required content overflows its control: ${selector} ${record.id || '(unidentified)'}`);
        }
      }
    }
    const textLength = (surface?.innerText || '').replace(/\s+/g, '').length;
    const canvasCount = surface ? [...surface.querySelectorAll('canvas')].filter(visible).length : 0;
    const imageCount = surface ? [...surface.querySelectorAll('img')].filter(visible).length : 0;
    if (textLength < 4 && canvasCount === 0 && imageCount === 0) failures.push('active surface has no visible content signal');
    const focused = document.activeElement;
    const game = document.getElementById('game');
    const battleCanvas = document.querySelector('#moguriaBattleV3CanvasHost canvas[data-moguria-battle-v3="true"]');
    let rendererCanvas = null;
    if (visible(game) && visible(battleCanvas)) {
      const gameRect = game.getBoundingClientRect();
      const canvasRect = battleCanvas.getBoundingClientRect();
      rendererCanvas = {
        game: { x: gameRect.x, y: gameRect.y, width: gameRect.width, height: gameRect.height },
        canvas: {
          x: canvasRect.x,
          y: canvasRect.y,
          width: canvasRect.width,
          height: canvasRect.height,
          backingWidth: battleCanvas.width,
          backingHeight: battleCanvas.height
        }
      };
      if (battleCanvas.width <= 0 || battleCanvas.height <= 0) {
        failures.push(`battle renderer canvas backing store is ${battleCanvas.width}x${battleCanvas.height}`);
      }
      const delta = Math.max(
        Math.abs(gameRect.x - canvasRect.x), Math.abs(gameRect.y - canvasRect.y),
        Math.abs(gameRect.width - canvasRect.width), Math.abs(gameRect.height - canvasRect.height)
      );
      if (delta > 2) failures.push(`battle renderer canvas is misaligned by ${delta.toFixed(1)}px`);
    }
    return {
      failures,
      rootOverflow,
      brokenImages,
      touchTargets,
      contentFit,
      surface: surfaceRect ? {
        x: Number(surfaceRect.x.toFixed(1)), y: Number(surfaceRect.y.toFixed(1)),
        width: Number(surfaceRect.width.toFixed(1)), height: Number(surfaceRect.height.toFixed(1))
      } : null,
      signals: { textLength, canvasCount, imageCount },
      viewport: { width, height },
      rendererCanvas,
      focused: focused?.id || focused?.getAttribute?.('data-skill-id') || focused?.getAttribute?.('data-artifact-id') || focused?.tagName || null
    };
  }, {
    surfaceSelector: contract.surface,
    touchSelectors: contract.touch,
    contentFitSelectors: contract.fit || [],
    width: viewport.width,
    height: viewport.height,
    viewportSurfaceExpected: VIEWPORT_SURFACE_SCREENS.includes(screenId)
  });
}

async function runScreen(browser, baseUrl, browserName, viewport, screenId, output) {
  const contract = SCREEN_CONTRACTS[screenId];
  const record = {
    browser: browserName,
    viewport: viewport.id,
    dimensions: `${viewport.width}x${viewport.height}@${viewport.deviceScaleFactor}`,
    screen: screenId,
    status: 'failed',
    failures: [],
    ignoredDiagnostics: { speculativeWarmAborts: [] },
    diagnostics: { consoleErrors: [], pageErrors: [], requestFailures: [], responseErrors: [] }
  };
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    hasTouch: true,
    isMobile: true,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    ...(browserName === 'webkit' ? {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    } : {})
  });
  await context.addInitScript((seed) => {
    window.__moguriaQaCanvasEvents = [];
    const recordCanvasEvent = (event) => {
      const canvas = event.target;
      window.__moguriaQaCanvasEvents.push({
        type: event.type,
        at: Number(performance.now().toFixed(1)),
        width: Number(canvas?.width || 0),
        height: Number(canvas?.height || 0),
        statusMessage: String(event.statusMessage || '')
      });
    };
    document.addEventListener('webglcontextlost', recordCanvasEvent, true);
    document.addEventListener('webglcontextrestored', recordCanvasEvent, true);
    document.addEventListener('webglcontextcreationerror', recordCanvasEvent, true);
    let value = seed >>> 0;
    Math.random = () => {
      value += 0x6D2B79F5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    try { localStorage.removeItem('moguria.save.v2'); } catch {}
  }, FIXED_SEED);
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') record.diagnostics.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => record.diagnostics.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    const failure = {
      method: request.method(),
      resourceType: request.resourceType(),
      isNavigationRequest: request.isNavigationRequest(),
      headers: request.headers(),
      url: request.url(),
      errorText: request.failure()?.errorText || ''
    };
    const description = `${failure.method} ${failure.url} ${failure.errorText}`;
    if (isExpectedSpeculativeWarmAbort(failure, baseUrl)) {
      record.ignoredDiagnostics.speculativeWarmAborts.push(description);
      return;
    }
    record.diagnostics.requestFailures.push(description);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().startsWith(baseUrl)) {
      record.diagnostics.responseErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  const screenshotName = `${viewport.id}--${screenId}.png`;
  const screenshotPath = path.join(output, 'screenshots', screenshotName);
  record.screenshot = path.posix.join('screenshots', screenshotName);
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitForStablePage(page);
    const fixture = await contract.setup(page);
    if (fixture != null) record.fixture = fixture;
    await waitForTransientAbsence(page, TRANSIENT_ABSENCE[screenId]);
    record.scrollRoots = await settleVisuals(page, contract.surface, VISUAL_SCROLL_ROOTS[screenId]);
    record.dom = await auditDom(page, contract, viewport, screenId);
    if (Object.hasOwn(STORY_SCENE_FIXTURES, screenId)) {
      record.storyDom = await auditStoryDom(page, screenId, viewport);
      record.storyCanvas = await verifyStoryCanvas(page, viewport, screenId, output);
      record.storyMotionEvidence = await captureStoryMotionEvidence(page, viewport, screenId, output);
      record.failures.push(...record.storyDom.failures);
      if (!record.storyCanvas.passed) {
        record.failures.push(`Chapter 1 canvas is blank, undersized, or displaced: ${JSON.stringify(record.storyCanvas)}`);
      }
      if (record.storyMotionEvidence && !record.storyMotionEvidence.passed) {
        record.failures.push(`Chapter 1 marker evidence is incomplete or blank: ${JSON.stringify(record.storyMotionEvidence)}`);
      }
    }
    if (screenId === 'battle-hud') {
      record.canvasProbe = await verifyBattleCanvas(page, viewport, output);
      if (!record.canvasProbe.passed) {
        throw new Error('battle canvas probe did not pass two consecutive unassisted captures: '
          + JSON.stringify(record.canvasProbe));
      }
    }
    const screenshot = await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
    record.visual = pngVisualStats(screenshot);
    if (['logs', 'equipment', 'gacha', 'outing'].includes(screenId)) {
      const tailName = `${viewport.id}--${screenId}--tail.png`;
      const tailPath = path.join(output, 'screenshots', tailName);
      await page.evaluate(() => {
        const body = document.getElementById('overlayBody');
        if (body) body.scrollTop = body.scrollHeight;
      });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({ path: tailPath, fullPage: false, animations: 'disabled' });
      record.screenshotTail = path.posix.join('screenshots', tailName);
    }
    record.failures.push(...record.dom.failures);
    if (record.visual.nearBlank) record.failures.push(`screenshot is near blank: ${JSON.stringify(record.visual)}`);
  } catch (error) {
    record.failures.push(error?.stack || error?.message || String(error));
    try {
      await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
    } catch {}
  } finally {
    for (const [kind, items] of Object.entries(record.diagnostics)) {
      if (items.length) record.failures.push(`${kind}: ${items.join(' | ')}`);
    }
    record.status = record.failures.length ? 'failed' : 'passed';
    await context.close();
  }
  return record;
}

function attachRuntimeEvidenceDiagnostics(page, record, baseUrl) {
  page.on('console', (message) => {
    if (message.type() === 'error') record.diagnostics.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => record.diagnostics.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    const failure = {
      method:request.method(),
      resourceType:request.resourceType(),
      isNavigationRequest:request.isNavigationRequest(),
      headers:request.headers(),
      url:request.url(),
      errorText:request.failure()?.errorText || ''
    };
    const description = `${failure.method} ${failure.url} ${failure.errorText}`;
    if (isExpectedSpeculativeWarmAbort(failure, baseUrl)) {
      record.ignoredDiagnostics.speculativeWarmAborts.push(description);
      return;
    }
    record.diagnostics.requestFailures.push(description);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().startsWith(baseUrl)) {
      record.diagnostics.responseErrors.push(`${response.status()} ${response.url()}`);
    }
  });
}

async function openFreshStoryRuntimeEntry(page) {
  const before = await page.evaluate(() => {
    const cleared = window.MoguriaSave.clear();
    window.MoguriaHome.update();
    const save = window.MoguriaSave.load();
    return {
      cleared,
      entryMode:save.story?.entryMode || '',
      currentNodeId:save.story?.currentNodeId || '',
      belly:save.belly,
      activeRun:save.activeRun,
      playerLoaded:typeof window.MoguriaStoryChapter01?.open === 'function',
      playerScriptCount:document.querySelectorAll('script[data-moguria-story-ch01]').length,
      playerStyleCount:document.querySelectorAll('link[data-moguria-story-ch01-style]').length
    };
  });
  if (!before.cleared
    || before.entryMode !== 'new'
    || before.currentNodeId !== 'c1_available'
    || before.activeRun != null
    || before.playerLoaded
    || before.playerScriptCount !== 0
    || before.playerStyleCount !== 0) {
    throw new Error(`runtime video fresh-entry precondition failed: ${JSON.stringify(before)}`);
  }

  const entry = page.locator('#startBtn');
  await entry.waitFor({ state:'visible' });
  const entryLabel = await entry.getAttribute('aria-label');
  if (!String(entryLabel || '').includes('物語をはじめる')) {
    throw new Error(`runtime video Home primary action differs: ${entryLabel || '(missing)'}`);
  }
  await entry.click();
  await page.waitForFunction(() => (
    typeof window.MoguriaStoryChapter01?.open === 'function'
      && window.MoguriaStoryChapter01?.getHealth?.()?.ok === true
  ), null, { timeout:30000 });
  await page.locator('#storyChapter01.active[data-story-state="running"]')
    .waitFor({ state:'visible', timeout:10000 });

  const after = await page.evaluate(() => {
    const save = window.MoguriaSave.load();
    return {
      entryMode:save.story?.entryMode || '',
      currentNodeId:save.story?.currentNodeId || '',
      transitionIds:Array.from(save.story?.transitionIds || []),
      belly:save.belly,
      activeRun:save.activeRun,
      playerScriptCount:document.querySelectorAll('script[data-moguria-story-ch01][data-moguria-story-state="loaded"]').length,
      playerStyleCount:document.querySelectorAll('link[data-moguria-story-ch01-style="loaded"]').length,
      health:window.MoguriaStoryChapter01.getHealth()
    };
  });
  if (after.entryMode !== 'new'
    || after.currentNodeId !== 'c1_seat'
    || !after.transitionIds.includes('c1-enter-seat')
    || after.belly !== before.belly
    || after.activeRun != null
    || after.playerScriptCount !== 1
    || after.playerStyleCount !== 1
    || !after.health?.ok
    || after.health.sceneId !== 'return-light') {
    throw new Error(`runtime video lazy entry failed: ${JSON.stringify({ before, after })}`);
  }
  return { entryLabel, before, after };
}

async function waitForRuntimeMotionCompletion(page, motion, mode, startedAt) {
  await page.waitForFunction(({ sceneIndex, sceneId }) => {
    const health = window.MoguriaStoryChapter01?.getHealth?.();
    return health?.ok === true
      && health.replay === true
      && health.sceneIndex === sceneIndex
      && health.sceneId === sceneId
      && health.completed === true;
  }, motion, { timeout:STORY_RUNTIME_VIDEO_CONTRACT.completionTimeoutMs });
  const checkpoint = await page.evaluate(() => {
    const health = window.MoguriaStoryChapter01.getHealth();
    const section = document.getElementById('storyChapter01');
    const next = document.getElementById('storyChapter01Next');
    return {
      health,
      domScene:section?.dataset?.storyScene || '',
      domState:section?.dataset?.storyState || '',
      nextVisible:Boolean(next && !next.hidden && !next.disabled)
    };
  });
  const clockMs = motion.sceneIndex === 2
    ? checkpoint.health.postTimeMs
    : checkpoint.health.sceneTimeMs;
  if (checkpoint.health.reducedMotion !== mode.reducedMotion
    || checkpoint.domScene !== motion.sceneId
    || checkpoint.domState !== 'running'
    || !checkpoint.nextVisible
    || clockMs < motion.durationMs) {
    throw new Error(`runtime video motion did not complete at 1x: ${JSON.stringify({ motion, mode, checkpoint })}`);
  }
  return {
    sceneIndex:motion.sceneIndex,
    sceneId:motion.sceneId,
    motionId:motion.motionId,
    sceneTimeMs:checkpoint.health.sceneTimeMs,
    postTimeMs:checkpoint.health.postTimeMs,
    wallDurationMs:Date.now() - startedAt,
    replay:checkpoint.health.replay,
    reducedMotion:checkpoint.health.reducedMotion
  };
}

async function exerciseStoryPauseResume(page) {
  await page.waitForFunction((minimumSceneTimeMs) => {
    const health = window.MoguriaStoryChapter01?.getHealth?.();
    return health?.sceneIndex === 0
      && health.completed === false
      && health.sceneTimeMs >= minimumSceneTimeMs;
  }, 900, { timeout:10000 });
  const before = await page.evaluate(() => {
    const health = window.MoguriaStoryChapter01.getHealth();
    const section = document.getElementById('storyChapter01');
    const button = document.getElementById('storyChapter01Pause');
    return {
      sceneId:health.sceneId,
      sceneTimeMs:health.sceneTimeMs,
      completed:health.completed,
      domPaused:section?.dataset?.storyPaused,
      ariaPressed:button?.getAttribute?.('aria-pressed')
    };
  });
  if (before.sceneId !== 'return-light'
    || before.completed
    || before.domPaused !== 'false'
    || before.ariaPressed !== 'false') {
    throw new Error(`Story pause precondition failed: ${JSON.stringify(before)}`);
  }
  const pauseButton = page.locator('#storyChapter01Pause');
  await pauseButton.click();
  await page.waitForFunction(() => {
    const section = document.getElementById('storyChapter01');
    const button = document.getElementById('storyChapter01Pause');
    return section?.dataset?.storyPaused === 'true'
      && button?.getAttribute?.('aria-pressed') === 'true';
  }, null, { timeout:3000 });
  const pausedAt = await page.evaluate(() => window.MoguriaStoryChapter01.getHealth().sceneTimeMs);
  await page.waitForTimeout(STORY_RUNTIME_VIDEO_CONTRACT.lifecycleFreezeWallMs);
  const frozen = await page.evaluate(() => window.MoguriaStoryChapter01.getHealth());
  const frozenAt = frozen.sceneTimeMs;
  const frozenDeltaMs = Math.abs(frozenAt - pausedAt);
  if (frozen.sceneId !== 'return-light'
    || frozen.completed
    || frozenDeltaMs > STORY_RUNTIME_VIDEO_CONTRACT.lifecycleClockToleranceMs) {
    throw new Error(`Story pause did not freeze the production clock: ${JSON.stringify({ pausedAt, frozenAt, frozenDeltaMs })}`);
  }

  await pauseButton.click();
  await page.waitForFunction(() => {
    const section = document.getElementById('storyChapter01');
    const button = document.getElementById('storyChapter01Pause');
    return section?.dataset?.storyPaused === 'false'
      && button?.getAttribute?.('aria-pressed') === 'false';
  }, null, { timeout:3000 });
  await page.waitForFunction(({ baseline, advance }) => (
    window.MoguriaStoryChapter01?.getHealth?.()?.sceneTimeMs >= baseline + advance
  ), {
    baseline:frozenAt,
    advance:STORY_RUNTIME_VIDEO_CONTRACT.lifecycleResumeAdvanceMs
  }, { timeout:3000 });
  const resumedAt = await page.evaluate(() => window.MoguriaStoryChapter01.getHealth().sceneTimeMs);
  return {
    passed:true,
    pauseControl:'storyChapter01Pause',
    before,
    pausedAtMs:pausedAt,
    frozenAtMs:frozenAt,
    frozenWallMs:STORY_RUNTIME_VIDEO_CONTRACT.lifecycleFreezeWallMs,
    frozenDeltaMs,
    resumedAtMs:resumedAt,
    resumedAdvanceMs:resumedAt - frozenAt
  };
}

async function captureStoryPivotOverlay(page, viewport, output, mode) {
  const atlasIds = STORY_PIVOT_ATLASES.map((atlas) => atlas.id);
  const packIds = [...new Set(STORY_PIVOT_ATLASES.map((atlas) => atlas.packId))];
  const result = await page.evaluate(async ({ expectedAtlasIds, requiredPackIds }) => {
    const assets = window.MoguriaAssets;
    const loadedPackIds = [];
    try {
      for (const packId of requiredPackIds) {
        const loaded = await assets.loadPack(packId);
        if (!loaded?.ok) throw new Error(`pivot overlay pack failed: ${packId}`);
        loadedPackIds.push(packId);
      }
      const projection = assets.getJson('story_ch01_animation_manifest');
      if (!projection?.poseAtlases) throw new Error('runtime Story projection is unavailable');

      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 900;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('pivot overlay canvas context is unavailable');
      ctx.fillStyle = '#070816';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = '600 18px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      const metadata = [];

      for (const [atlasIndex, atlasId] of expectedAtlasIds.entries()) {
        const definition = projection.poseAtlases[atlasId];
        const image = assets.getImage(definition?.assetId);
        if (!definition || !image) throw new Error(`runtime pose atlas is unavailable: ${atlasId}`);
        if (typeof image.decode === 'function') await image.decode();
        if (image.naturalWidth !== definition.width || image.naturalHeight !== definition.height) {
          throw new Error(`runtime pose atlas dimensions differ: ${atlasId}`);
        }
        if (definition.width !== definition.columns * definition.cell.width
          || definition.height !== definition.rows * definition.cell.height
          || definition.pivot?.space !== 'cell-normalized'
          || definition.frameOrder !== 'row-major'
          || definition.cellOrigin !== 'top-left'
          || definition.noAutoCrop !== true) {
          throw new Error(`runtime fixed-cell projection differs: ${atlasId}`);
        }

        const column = atlasIndex % 2;
        const row = Math.floor(atlasIndex / 2);
        const panelX = 20 + column * 590;
        const panelY = 20 + row * 440;
        const imageX = panelX + 20;
        const imageY = panelY + 48;
        const imageWidth = 540;
        const imageHeight = 360;
        const scaleX = imageWidth / definition.width;
        const scaleY = imageHeight / definition.height;

        ctx.fillStyle = '#11152b';
        ctx.fillRect(panelX, panelY, 570, 420);
        ctx.strokeStyle = '#3f466d';
        ctx.lineWidth = 2;
        ctx.strokeRect(panelX + 1, panelY + 1, 568, 418);
        ctx.fillStyle = '#f4e7b8';
        ctx.fillText(`${atlasId} · ${definition.columns}×${definition.rows} · pivot ${definition.pivot.x}, ${definition.pivot.y}`, panelX + 18, panelY + 24);
        for (let y = 0; y < imageHeight; y += 18) {
          for (let x = 0; x < imageWidth; x += 18) {
            ctx.fillStyle = ((x / 18 + y / 18) % 2) ? '#181b30' : '#242941';
            ctx.fillRect(imageX + x, imageY + y, 18, 18);
          }
        }
        ctx.drawImage(image, imageX, imageY, imageWidth, imageHeight);

        const stateByIndex = Object.fromEntries(
          Object.entries(definition.states || {}).map(([name, index]) => [index, name])
        );
        const frameCount = definition.columns * definition.rows;
        for (let frame = 0; frame < frameCount; frame += 1) {
          const frameColumn = frame % definition.columns;
          const frameRow = Math.floor(frame / definition.columns);
          const cellX = imageX + frameColumn * definition.cell.width * scaleX;
          const cellY = imageY + frameRow * definition.cell.height * scaleY;
          const cellWidth = definition.cell.width * scaleX;
          const cellHeight = definition.cell.height * scaleY;
          const pivotX = cellX + definition.pivot.x * cellWidth;
          const pivotY = cellY + definition.pivot.y * cellHeight;
          ctx.strokeStyle = 'rgba(111, 221, 255, .92)';
          ctx.lineWidth = 2;
          ctx.strokeRect(cellX, cellY, cellWidth, cellHeight);
          ctx.strokeStyle = '#ff597f';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(pivotX - 10, pivotY);
          ctx.lineTo(pivotX + 10, pivotY);
          ctx.moveTo(pivotX, pivotY - 10);
          ctx.lineTo(pivotX, pivotY + 10);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(pivotX, pivotY, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#fff6b7';
          ctx.fill();
          ctx.font = '600 13px system-ui, sans-serif';
          const frameName = stateByIndex[frame]
            || (definition.emptyFrames?.includes(frame) ? 'empty' : `frame-${frame}`);
          ctx.fillStyle = 'rgba(5, 7, 19, .78)';
          ctx.fillRect(cellX + 4, cellY + 4, Math.min(cellWidth - 8, 142), 22);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(`${frame}: ${frameName}`, cellX + 9, cellY + 15);
          ctx.font = '600 18px system-ui, sans-serif';
        }
        metadata.push({
          id:atlasId,
          assetId:definition.assetId,
          naturalWidth:image.naturalWidth,
          naturalHeight:image.naturalHeight,
          columns:definition.columns,
          rows:definition.rows,
          cell:{ width:definition.cell.width, height:definition.cell.height },
          pivot:{ x:definition.pivot.x, y:definition.pivot.y },
          frameCount
        });
      }
      return { dataUrl:canvas.toDataURL('image/png'), width:canvas.width, height:canvas.height, atlases:metadata };
    } finally {
      for (const packId of loadedPackIds.reverse()) assets.releasePack(packId);
    }
  }, { expectedAtlasIds:atlasIds, requiredPackIds:packIds });

  if (!result?.dataUrl?.startsWith('data:image/png;base64,')) {
    throw new Error('runtime pivot overlay did not yield a PNG');
  }
  const contractsMatch = result.atlases?.length === STORY_PIVOT_ATLASES.length
    && result.atlases.every((actual, index) => {
      const expected = STORY_PIVOT_ATLASES[index];
      return actual.id === expected.id
        && actual.assetId === expected.assetId
        && actual.naturalWidth === expected.width
        && actual.naturalHeight === expected.height
        && actual.columns === expected.columns
        && actual.rows === expected.rows
        && actual.cell.width === expected.cell.width
        && actual.cell.height === expected.cell.height
        && actual.pivot.x === expected.pivot.x
        && actual.pivot.y === expected.pivot.y;
    });
  const buffer = Buffer.from(result.dataUrl.slice(result.dataUrl.indexOf(',') + 1), 'base64');
  const modeSuffix = mode.id === 'normal' ? '' : `--${mode.id}`;
  const fileName = `${viewport.id}--story-pose-atlas-pivots${modeSuffix}.png`;
  const filePath = path.join(output, 'screenshots', fileName);
  fs.writeFileSync(filePath, buffer);
  const visual = pngVisualStats(buffer);
  const passed = contractsMatch
    && result.width === 1200
    && result.height === 900
    && !visual.nearBlank
    && visual.standardDeviation >= STORY_CANVAS_PROBE.minStandardDeviation
    && visual.colorBuckets >= STORY_CANVAS_PROBE.minColorBuckets;
  if (!passed) {
    throw new Error(`runtime pivot overlay is incomplete or blank: ${JSON.stringify({ contractsMatch, result, visual })}`);
  }
  return {
    passed,
    screenshot:path.posix.join('screenshots', fileName),
    width:result.width,
    height:result.height,
    atlases:result.atlases,
    visual
  };
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function withDeadline(promise, deadline, label) {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) {
    Promise.resolve(promise).catch(() => {});
    throw new Error(`${label} deadline elapsed`);
  }
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), remainingMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function inspectStoryVideoArtifact(
  browserType, filePath, expectedVideoSize, launchOptions, totalAuditDeadline
) {
  if (!fs.existsSync(filePath)) return { passed:false, bytes:0, container:'missing', decode:null };
  const bytes = fs.statSync(filePath).size;
  if (bytes > STORY_RUNTIME_VIDEO_CONTRACT.maximumVideoBytes) {
    return { passed:false, bytes, container:'oversize', decode:null };
  }
  const buffer = fs.readFileSync(filePath);
  const sourceSha256 = sha256(buffer);
  const headerHex = buffer.subarray(0, 4).toString('hex');
  const webm = headerHex === '1a45dfa3';
  const base = {
    passed:false,
    bytes,
    container:webm ? 'webm' : headerHex || 'empty',
    expectedWidth:expectedVideoSize.width,
    expectedHeight:expectedVideoSize.height,
    sourceSha256,
    decodeAttemptLimit:STORY_RUNTIME_VIDEO_CONTRACT.maximumDecodeAttempts,
    decodeAttemptCount:0,
    auditCleanupFailed:false,
    decodeAttempts:[],
    decodeErrors:[],
    decode:null
  };
  if (!webm || bytes < STORY_RUNTIME_VIDEO_CONTRACT.minimumVideoBytes) return base;

  const launchMode = launchOptions.headless ? 'headless' : 'headed';
  const artifactDeadline = Math.min(
    Date.now() + STORY_RUNTIME_VIDEO_CONTRACT.videoArtifactAuditTimeoutMs,
    totalAuditDeadline
  );
  const decodeAttempts = [];
  const decodeErrors = [];
  let auditCleanupFailed = false;
  for (let attempt = 1; attempt <= STORY_RUNTIME_VIDEO_CONTRACT.maximumDecodeAttempts; attempt += 1) {
    const processIsolation = 'dedicated-browser-process-after-producer-close';
    const startedAt = new Date().toISOString();
    const attemptDeadline = Math.min(
      Date.now() + STORY_RUNTIME_VIDEO_CONTRACT.decodeAttemptTimeoutMs,
      artifactDeadline
    );
    let sourceSha256Before = null;
    let sourceSha256After = null;
    let stopRetries = false;
    let auditBrowser = null;
    let auditContext = null;
    let attemptResult = null;
    let attemptError = '';
    try {
      if (attemptDeadline <= Date.now()) throw new Error('video artifact audit deadline elapsed');
      sourceSha256Before = sha256(fs.readFileSync(filePath));
      if (sourceSha256Before !== sourceSha256) {
        throw new Error(`video artifact bytes changed before audit attempt ${attempt}`);
      }
      auditBrowser = await browserType.launch({
        ...launchOptions,
        timeout:Math.max(1, attemptDeadline - Date.now())
      });
      if (auditBrowser.contexts().length !== 0) {
        throw new Error('dedicated audit browser did not start without contexts');
      }
      auditContext = await withDeadline(auditBrowser.newContext({
        viewport:{ width:expectedVideoSize.width, height:expectedVideoSize.height },
        serviceWorkers:'block'
      }), attemptDeadline, 'dedicated audit context creation');
      if (auditBrowser.contexts().length !== 1) {
        throw new Error('dedicated audit browser must own exactly one context');
      }
      const auditPage = await withDeadline(
        auditContext.newPage(), attemptDeadline, 'dedicated audit page creation'
      );
      if (auditContext.pages().length !== 1) {
        throw new Error('dedicated audit context must own exactly one page');
      }
      if (!launchOptions.headless) {
        await withDeadline(
          auditPage.bringToFront(), attemptDeadline, 'headed audit page activation'
        );
      }
      const decode = await withDeadline(auditPage.evaluate(async ({ base64, sampleFractions }) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const url = URL.createObjectURL(new Blob([bytes], { type:'video/webm' }));
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = url;
      document.body.append(video);
      const canPlayType = video.canPlayType('video/webm; codecs="vp8"');

      const waitFor = (eventName, timeoutMs) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error(`video ${eventName} timed out`));
        }, timeoutMs);
        const onEvent = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error(`video decode failed (${video.error?.code || 'unknown'})`));
        };
        const cleanup = () => {
          clearTimeout(timer);
          video.removeEventListener(eventName, onEvent);
          video.removeEventListener('error', onError);
        };
        video.addEventListener(eventName, onEvent, { once:true });
        video.addEventListener('error', onError, { once:true });
        if (video.error) onError();
      });
      const frameToleranceSeconds = 0.25;
      const playbackFrameCount = () => {
        if (typeof video.getVideoPlaybackQuality !== 'function') return null;
        const count = video.getVideoPlaybackQuality()?.totalVideoFrames;
        return Number.isFinite(count) ? count : null;
      };
      const waitForAnimationFrameUntil = (deadline) => new Promise((resolve, reject) => {
        const remainingMs = deadline - performance.now();
        if (remainingMs <= 0) {
          reject(new Error('playback fallback animation frame deadline elapsed'));
          return;
        }
        let settled = false;
        let frameId = null;
        const cleanup = () => {
          clearTimeout(timer);
          if (frameId !== null) cancelAnimationFrame(frameId);
        };
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error('playback fallback animation frame timed out'));
        }, remainingMs);
        frameId = requestAnimationFrame(() => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve();
        });
      });
      const captureWithPlaybackFallback = async (targetSeconds, context, canvas, timeoutMs) => {
        const startedAt = performance.now();
        const deadline = startedAt + timeoutMs;
        const initialTime = video.currentTime;
        const initialFrameCount = playbackFrameCount();
        const frameCountAvailable = initialFrameCount !== null;
        try {
          let playStartTimer = null;
          try {
            await Promise.race([
              video.play(),
              new Promise((_, reject) => {
                playStartTimer = setTimeout(
                  () => reject(new Error('video play start timed out')),
                  Math.max(1, deadline - performance.now())
                );
              })
            ]);
          } finally {
            clearTimeout(playStartTimer);
          }
          while (performance.now() < deadline) {
            if (video.error) throw new Error(`video decode failed (${video.error.code || 'unknown'})`);
            await waitForAnimationFrameUntil(deadline);
            const currentFrameCount = playbackFrameCount();
            const frameCountAdvanced = frameCountAvailable && currentFrameCount !== null
              && currentFrameCount > initialFrameCount;
            const timeAdvanced = !frameCountAvailable && video.currentTime >= initialTime + 1 / 120;
            if (!frameCountAdvanced && !timeAdvanced) continue;
            video.pause();
            await waitForAnimationFrameUntil(deadline);
            if (Math.abs(video.currentTime - targetSeconds) > frameToleranceSeconds) {
              throw new Error(`playback fallback left requested frame tolerance (${video.currentTime})`);
            }
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            return {
              presentationMethod:'playback-quality-or-time-fallback',
              targetSeconds,
              currentTime:video.currentTime,
              mediaTime:null,
              initialFrameCount,
              currentFrameCount,
              frameCountAvailable,
              frameCountAdvanced,
              timeAdvanced
            };
          }
          throw new Error('playback fallback timed out before a presented frame advanced');
        } finally {
          video.pause();
        }
      };
      const capturePresentedFrame = (targetSeconds, context, canvas, timeoutMs) => {
        if (typeof video.requestVideoFrameCallback !== 'function') {
          return captureWithPlaybackFallback(targetSeconds, context, canvas, timeoutMs);
        }
        return new Promise((resolve, reject) => {
          let settled = false;
          let callbackId = 0;
          const cleanup = () => {
            clearTimeout(timer);
            video.removeEventListener('error', onError);
            if (callbackId && typeof video.cancelVideoFrameCallback === 'function') {
              video.cancelVideoFrameCallback(callbackId);
            }
          };
          const fail = (error) => {
            if (settled) return;
            settled = true;
            video.pause();
            cleanup();
            reject(error instanceof Error ? error : new Error(String(error)));
          };
          const onError = () => {
            fail(new Error(`video decode failed (${video.error?.code || 'unknown'})`));
          };
          const onFrame = (_now, metadata) => {
            if (settled) return;
            const mediaTime = Number(metadata?.mediaTime);
            if (!Number.isFinite(mediaTime)) {
              fail(new Error('requestVideoFrameCallback returned no finite mediaTime'));
              return;
            }
            if (mediaTime < targetSeconds - frameToleranceSeconds) {
              callbackId = video.requestVideoFrameCallback(onFrame);
              return;
            }
            if (mediaTime > targetSeconds + frameToleranceSeconds) {
              fail(new Error(`requestVideoFrameCallback overshot requested frame (${mediaTime})`));
              return;
            }
            video.pause();
            try {
              context.drawImage(video, 0, 0, canvas.width, canvas.height);
            } catch (error) {
              fail(error);
              return;
            }
            settled = true;
            const result = {
              presentationMethod:'requestVideoFrameCallback',
              targetSeconds,
              currentTime:video.currentTime,
              mediaTime,
              presentedFrames:Number(metadata?.presentedFrames) || null
            };
            cleanup();
            resolve(result);
          };
          const timer = setTimeout(() => {
            fail(new Error('requestVideoFrameCallback timed out for the requested frame'));
          }, timeoutMs);
          video.addEventListener('error', onError, { once:true });
          if (video.error) {
            onError();
            return;
          }
          callbackId = video.requestVideoFrameCallback(onFrame);
          let playPromise;
          try { playPromise = video.play(); }
          catch (error) {
            fail(new Error(`video play failed: ${error?.message || String(error)}`));
            return;
          }
          Promise.resolve(playPromise).catch((error) => {
            fail(new Error(`video play failed: ${error?.message || String(error)}`));
          });
        });
      };

      let decodePhase = 'metadata';
      try {
        if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
          const metadataReady = waitFor('loadedmetadata', 10000);
          video.load();
          await metadataReady;
        }
        if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) {
          throw new Error('decoded WebM metadata is incomplete');
        }
        decodePhase = 'first-frame';
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          await waitFor('loadeddata', 10000);
        }
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          throw new Error('decoded WebM has no current frame data');
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(128, video.videoWidth);
        canvas.height = Math.max(1, Math.round(canvas.width * video.videoHeight / video.videoWidth));
        const context = canvas.getContext('2d', { willReadFrequently:true });
        if (!context) throw new Error('video audit canvas is unavailable');
        const luminanceVectors = [];
        const samples = [];
        for (const fraction of sampleFractions) {
          decodePhase = `seek@${fraction}`;
          const targetSeconds = Math.min(
            Math.max(0.05, video.duration * fraction),
            Math.max(0.05, video.duration - 0.05)
          );
          video.pause();
          if (Math.abs(video.currentTime - targetSeconds) > 0.01) {
            const seeked = waitFor('seeked', 10000);
            video.currentTime = targetSeconds;
            await seeked;
          }
          const frameReadiness = await capturePresentedFrame(
            targetSeconds, context, canvas, 10000
          );
          const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
          const luminanceVector = new Uint8Array(canvas.width * canvas.height);
          const buckets = new Set();
          let sum = 0;
          let sumSquares = 0;
          let darkPixels = 0;
          let lightPixels = 0;
          let hash = 2166136261;
          let vectorIndex = 0;
          for (let pixel = 0; pixel < rgba.length; pixel += 4) {
            const red = rgba[pixel];
            const green = rgba[pixel + 1];
            const blue = rgba[pixel + 2];
            const luminance = Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);
            sum += luminance;
            sumSquares += luminance * luminance;
            if (luminance < 8) darkPixels += 1;
            if (luminance > 247) lightPixels += 1;
            buckets.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
            luminanceVector[vectorIndex++] = luminance;
            hash ^= luminance >> 4;
            hash = Math.imul(hash, 16777619) >>> 0;
          }
          const pixelCount = canvas.width * canvas.height;
          const mean = sum / pixelCount;
          const standardDeviation = Math.sqrt(Math.max(0, sumSquares / pixelCount - mean * mean));
          const darkRatio = darkPixels / pixelCount;
          const lightRatio = lightPixels / pixelCount;
          luminanceVectors.push(luminanceVector);
          samples.push({
            fraction,
            targetSeconds,
            standardDeviation,
            colorBuckets:buckets.size,
            darkRatio,
            lightRatio,
            frameReadiness,
            frameHash:hash.toString(16).padStart(8, '0')
          });
        }
        const adjacentDifferences = [];
        for (let index = 1; index < luminanceVectors.length; index += 1) {
          let totalDifference = 0;
          let changedPixels = 0;
          const previous = luminanceVectors[index - 1];
          const current = luminanceVectors[index];
          for (let pixel = 0; pixel < current.length; pixel += 1) {
            const difference = Math.abs(previous[pixel] - current[pixel]);
            totalDifference += difference;
            if (difference >= 8) changedPixels += 1;
          }
          adjacentDifferences.push({
            fromFraction:sampleFractions[index - 1],
            toFraction:sampleFractions[index],
            meanAbsoluteDifference:totalDifference / current.length,
            changedPixelRatio:changedPixels / current.length
          });
        }
        return {
          canPlayType,
          durationSeconds:video.duration,
          width:video.videoWidth,
          height:video.videoHeight,
          sampleCanvas:{ width:canvas.width, height:canvas.height },
          samples,
          adjacentDifferences,
          uniqueFrameHashes:new Set(samples.map((sample) => sample.frameHash)).size
        };
      } catch (error) {
        throw new Error(`${decodePhase}: ${error?.message || String(error)}`);
      } finally {
        video.removeAttribute('src');
        video.load();
        video.remove();
        URL.revokeObjectURL(url);
      }
    }, {
      base64:buffer.toString('base64'),
      sampleFractions:STORY_RUNTIME_VIDEO_CONTRACT.videoSampleFractions
    }), attemptDeadline, 'dedicated video content audit');
      const samplingComplete = decode.samples.length === STORY_RUNTIME_VIDEO_CONTRACT.videoSampleFractions.length
        && decode.samples.every((sample, index) => (
          sample.fraction === STORY_RUNTIME_VIDEO_CONTRACT.videoSampleFractions[index]
        ));
      const nonBlankSamples = decode.samples.filter((sample) => (
        sample.standardDeviation >= STORY_RUNTIME_VIDEO_CONTRACT.minimumDecodedStandardDeviation
          && sample.colorBuckets >= STORY_RUNTIME_VIDEO_CONTRACT.minimumDecodedColorBuckets
          && !((sample.darkRatio > 0.998 || sample.lightRatio > 0.998) && sample.standardDeviation < 7)
      )).length;
      const changedPairs = decode.adjacentDifferences.filter((difference) => (
        difference.meanAbsoluteDifference >= STORY_RUNTIME_VIDEO_CONTRACT.minimumDecodedMeanDifference
          && difference.changedPixelRatio >= STORY_RUNTIME_VIDEO_CONTRACT.minimumDecodedChangedPixelRatio
      )).length;
      const passed = decode.durationSeconds >= STORY_RUNTIME_VIDEO_CONTRACT.minimumVideoDurationSeconds
        && decode.width === expectedVideoSize.width
        && decode.height === expectedVideoSize.height
        && samplingComplete
        && nonBlankSamples >= STORY_RUNTIME_VIDEO_CONTRACT.minimumDecodedNonBlankSamples
        && changedPairs >= STORY_RUNTIME_VIDEO_CONTRACT.minimumDecodedChangedPairs
        && decode.uniqueFrameHashes >= STORY_RUNTIME_VIDEO_CONTRACT.minimumDecodedUniqueFrames;
      attemptResult = {
        ...base,
        passed,
        decode:{ ...decode, attempt, processIsolation, launchMode, samplingComplete, nonBlankSamples, changedPairs }
      };
    } catch (error) {
      attemptError = error?.message || String(error);
    } finally {
      const cleanupDeadline = Date.now() + STORY_RUNTIME_VIDEO_CONTRACT.browserCloseTimeoutMs;
      if (auditContext) {
        try {
          await withDeadline(
            auditContext.close(), cleanupDeadline, 'dedicated audit context close'
          );
        }
        catch (error) {
          const closeError = `audit context close failed: ${error?.message || String(error)}`;
          attemptError = attemptError ? `${attemptError}; ${closeError}` : closeError;
        }
      }
      if (auditBrowser) {
        try {
          await withDeadline(
            auditBrowser.close(), cleanupDeadline, 'dedicated audit browser close'
          );
          if (auditBrowser.isConnected()) {
            throw new Error('dedicated audit browser remained connected after close');
          }
        }
        catch (error) {
          const closeError = `dedicated audit browser close failed: ${error?.message || String(error)}`;
          attemptError = attemptError ? `${attemptError}; ${closeError}` : closeError;
          stopRetries = true;
          auditCleanupFailed = true;
        }
      }
      try {
        sourceSha256After = sha256(fs.readFileSync(filePath));
        if (sourceSha256After !== sourceSha256) {
          const hashError = `video artifact bytes changed during audit attempt ${attempt}`;
          attemptError = attemptError ? `${attemptError}; ${hashError}` : hashError;
          stopRetries = true;
        }
      } catch (error) {
        const hashError = `video artifact post-audit hash failed: ${error?.message || String(error)}`;
        attemptError = attemptError ? `${attemptError}; ${hashError}` : hashError;
        stopRetries = true;
      }
    }

    const completedAt = new Date().toISOString();
    if (attemptError) {
      const attemptRecord = {
        attempt, processIsolation, launchMode, startedAt, completedAt,
        sourceSha256Before, sourceSha256After, status:'error', error:attemptError
      };
      decodeAttempts.push(attemptRecord);
      decodeErrors.push({
        attempt, processIsolation, launchMode, startedAt, completedAt, error:attemptError
      });
      if (stopRetries || Date.now() >= artifactDeadline) break;
      continue;
    }
    decodeAttempts.push({
      attempt,
      processIsolation,
      launchMode,
      startedAt,
      completedAt,
      sourceSha256Before,
      sourceSha256After,
      status:attemptResult.passed ? 'passed' : 'invalid-content'
    });
    const result = {
      ...attemptResult,
      decodeAttemptCount:attempt,
      auditCleanupFailed,
      decodeAttempts:[...decodeAttempts],
      decodeErrors:[...decodeErrors]
    };
    // A complete decode that fails content/duration checks is deterministic and
    // remains a hard failure; retries are reserved for transient engine errors.
    return result;
  }
  return {
    ...base,
    decodeAttemptCount:decodeAttempts.length,
    auditCleanupFailed,
    decodeAttempts,
    decodeErrors,
    decode:{
      passed:false,
      attempt:decodeAttempts.length,
      processIsolation:'dedicated-browser-process-after-producer-close',
      launchMode,
      error:decodeErrors.at(-1)?.error || 'video decode failed without an error detail'
    }
  };
}

async function runStoryRuntimeEvidence(browser, baseUrl, browserName, viewport, output, mode) {
  const record = {
    browser:browserName,
    viewport:viewport.id,
    dimensions:`${viewport.width}x${viewport.height}@${viewport.deviceScaleFactor}`,
    mode:mode.id,
    reducedMotion:mode.reducedMotion,
    holdTiming:mode.holdTiming,
    status:'pending-capture',
    captureStatus:'pending',
    logicalTiming:STORY_RUNTIME_VIDEO_CONTRACT.logicalTiming,
    failures:[],
    ignoredDiagnostics:{ speculativeWarmAborts:[] },
    diagnostics:{ consoleErrors:[], pageErrors:[], requestFailures:[], responseErrors:[] },
    lifecycle:null,
    motions:[]
  };
  const evidenceSuffix = mode.id === 'normal' ? '' : `--${mode.id}`;
  const captureDirectory = path.join(output, 'videos', '.capture', viewport.id, mode.id);
  const videoName = `${viewport.id}--story-four-motions${evidenceSuffix}.webm`;
  const videoPath = path.join(output, 'videos', videoName);
  const videoSize = { width:viewport.width & ~1, height:viewport.height & ~1 };
  record.video = path.posix.join('videos', videoName);
  record.videoDimensions = `${videoSize.width}x${videoSize.height}`;
  let context = null;
  let page = null;
  let video = null;
  try {
    context = await browser.newContext({
      viewport:{ width:viewport.width, height:viewport.height },
      deviceScaleFactor:viewport.deviceScaleFactor,
      hasTouch:true,
      isMobile:true,
      locale:'ja-JP',
      timezoneId:'Asia/Tokyo',
      colorScheme:'dark',
      reducedMotion:mode.reducedMotion ? 'reduce' : 'no-preference',
      serviceWorkers:'block',
      recordVideo:{ dir:captureDirectory, size:videoSize },
      ...(browserName === 'webkit' ? {
        userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
      } : {})
    });
    page = await context.newPage();
    video = page.video();
    attachRuntimeEvidenceDiagnostics(page, record, baseUrl);
    if (!video) throw new Error('Playwright did not attach a video artifact to the evidence page');
    await page.goto(baseUrl, { waitUntil:'domcontentloaded', timeout:45000 });
    await waitForAppReady(page);
    record.lazyEntry = await openFreshStoryRuntimeEntry(page);
    const replaySetup = await page.evaluate(async () => {
      const player = window.MoguriaStoryChapter01;
      const beforeReplay = JSON.stringify(window.MoguriaSave.load());
      const closed = await player.close();
      const opened = await player.open({ replay:true, currentNodeId:'c1_available' });
      return { closed, opened, beforeReplay, health:player.getHealth() };
    });
    if (!replaySetup.closed?.ok
      || !replaySetup.opened?.ok
      || !replaySetup.health?.ok
      || replaySetup.health.sceneIndex !== 0
      || replaySetup.health.sceneId !== 'return-light'
      || replaySetup.health.replay !== true
      || replaySetup.health.reducedMotion !== mode.reducedMotion) {
      throw new Error(`runtime replay did not start at scene zero: ${JSON.stringify(replaySetup)}`);
    }

    const replayStartedAt = Date.now();
    for (const motion of STORY_RUNTIME_VIDEO_CONTRACT.motions) {
      await page.waitForFunction(({ sceneIndex, sceneId }) => {
        const health = window.MoguriaStoryChapter01?.getHealth?.();
        return health?.ok === true
          && health.replay === true
          && health.sceneIndex === sceneIndex
          && health.sceneId === sceneId
          && health.completed === false;
      }, motion, { timeout:10000 });
      const motionStartedAt = Date.now();
      if (mode.exerciseLifecycle && motion.sceneIndex === 0) {
        record.lifecycle = { pauseResume:await exerciseStoryPauseResume(page) };
      }
      let holdWallDurationMs = null;
      if (motion.sceneIndex === 2) {
        await page.waitForFunction((preCommitMs) => {
          const health = window.MoguriaStoryChapter01?.getHealth?.();
          return health?.sceneIndex === 2
            && health.sceneTimeMs >= preCommitMs
            && health.holdCommitted === false;
        }, motion.preCommitMs, { timeout:10000 });
        const boundaryReachedAt = Date.now();
        const hold = page.locator('#storyChapter01Hold');
        await hold.waitFor({ state:'visible', timeout:5000 });
        const boundary = await page.evaluate(() => {
          const health = window.MoguriaStoryChapter01.getHealth();
          const section = document.getElementById('storyChapter01');
          const holdControl = document.getElementById('storyChapter01Hold');
          return {
            ...health,
            documentHidden:document.hidden,
            domPaused:section?.dataset?.storyPaused,
            holdVisible:Boolean(holdControl && !holdControl.hidden),
            holdPressed:holdControl?.getAttribute?.('aria-pressed')
          };
        });
        if (boundary.sceneTimeMs !== motion.preCommitMs
          || boundary.postTimeMs !== 0
          || boundary.holding
          || boundary.holdCommitted
          || boundary.documentHidden
          || boundary.domPaused !== 'false'
          || !boundary.holdVisible
          || boundary.holdPressed !== 'false') {
          throw new Error(`Story fragment hold boundary is invalid: ${JSON.stringify(boundary)}`);
        }
        await hold.focus();
        const holdReadyAt = Date.now();
        let delayedBoundary = null;
        if (mode.holdTiming === 'delayed') {
          await page.waitForTimeout(STORY_RUNTIME_VIDEO_CONTRACT.delayedHoldWaitMs);
          delayedBoundary = await page.evaluate(() => {
            const health = window.MoguriaStoryChapter01.getHealth();
            const holdControl = document.getElementById('storyChapter01Hold');
            return {
              ...health,
              documentHidden:document.hidden,
              domPaused:document.getElementById('storyChapter01')?.dataset?.storyPaused,
              holdVisible:Boolean(holdControl && !holdControl.hidden),
              holdPressed:holdControl?.getAttribute?.('aria-pressed')
            };
          });
          const boundaryClockDeltaMs = Math.abs(delayedBoundary.sceneTimeMs - boundary.sceneTimeMs);
          if (delayedBoundary.sceneTimeMs !== motion.preCommitMs
            || delayedBoundary.postTimeMs !== 0
            || delayedBoundary.holdCommitted
            || delayedBoundary.holding
            || delayedBoundary.documentHidden
            || delayedBoundary.domPaused !== 'false'
            || !delayedBoundary.holdVisible
            || delayedBoundary.holdPressed !== 'false'
            || boundaryClockDeltaMs > STORY_RUNTIME_VIDEO_CONTRACT.lifecycleClockToleranceMs) {
            throw new Error(`Story delayed hold boundary was not stable: ${JSON.stringify({ boundary, delayedBoundary, boundaryClockDeltaMs })}`);
          }
        }
        const holdStartedAt = Date.now();
        const holdStartDelayMs = holdStartedAt - holdReadyAt;
        if (mode.holdTiming === 'early'
          && holdStartDelayMs > STORY_RUNTIME_VIDEO_CONTRACT.earlyHoldMaximumDelayMs) {
          throw new Error(`Story early hold began too late: ${holdStartDelayMs} ms`);
        }
        if (mode.holdTiming === 'delayed'
          && holdStartDelayMs < STORY_RUNTIME_VIDEO_CONTRACT.delayedHoldWaitMs) {
          throw new Error(`Story delayed hold did not wait at the fragment boundary: ${holdStartDelayMs} ms`);
        }
        await page.keyboard.down('Space');
        try {
          const activeHold = await page.evaluate(() => {
            const health = window.MoguriaStoryChapter01.getHealth();
            const holdControl = document.getElementById('storyChapter01Hold');
            return {
              holding:health.holding,
              holdCommitted:health.holdCommitted,
              domHolding:holdControl?.dataset?.holding,
              holdPressed:holdControl?.getAttribute?.('aria-pressed')
            };
          });
          if (!activeHold.holding
            || activeHold.holdCommitted
            || activeHold.domHolding !== 'true'
            || activeHold.holdPressed !== 'true') {
            throw new Error(`Story hold did not begin through the real keyboard control: ${JSON.stringify(activeHold)}`);
          }
          await page.waitForFunction(() => window.MoguriaStoryChapter01?.getHealth?.()?.holdCommitted === true,
            null, { timeout:STORY_RUNTIME_VIDEO_CONTRACT.holdTimeoutMs });
        } finally {
          await page.keyboard.up('Space');
        }
        holdWallDurationMs = Date.now() - holdStartedAt;
        const committedHold = await page.evaluate(() => window.MoguriaStoryChapter01.getHealth());
        if (!committedHold.holdCommitted
          || committedHold.holding
          || holdWallDurationMs < STORY_RUNTIME_VIDEO_CONTRACT.minimumHoldWallMs) {
          throw new Error(`Story hold did not reach a real committed duration: ${JSON.stringify({ committedHold, holdWallDurationMs })}`);
        }
        record.fragmentHold = {
          passed:true,
          timing:mode.holdTiming,
          boundarySceneTimeMs:boundary.sceneTimeMs,
          delayedBoundarySceneTimeMs:delayedBoundary?.sceneTimeMs ?? null,
          boundaryPreparationWallMs:holdReadyAt - boundaryReachedAt,
          boundaryWaitMs:holdStartDelayMs,
          holdWallDurationMs
        };
      }
      const checkpoint = await waitForRuntimeMotionCompletion(page, motion, mode, motionStartedAt);
      if (holdWallDurationMs != null) checkpoint.holdWallDurationMs = holdWallDurationMs;
      record.motions.push(checkpoint);
      if (motion.sceneIndex < STORY_RUNTIME_VIDEO_CONTRACT.motions.length - 1) {
        await page.locator('#storyChapter01Next').click();
      }
    }
    record.runtimeWallDurationMs = Date.now() - replayStartedAt;
    await page.waitForTimeout(300);
    record.pivotOverlay = await captureStoryPivotOverlay(page, viewport, output, mode);
    record.replayIntegrity = await page.evaluate((beforeReplay) => ({
      unchanged:JSON.stringify(window.MoguriaSave.load()) === beforeReplay,
      health:window.MoguriaStoryChapter01.getHealth(),
      resultActive:document.getElementById('result')?.classList?.contains('active') || false,
      assetErrors:window.MoguriaAssets?.stats?.().errors || []
    }), replaySetup.beforeReplay);
    if (!record.replayIntegrity.unchanged
      || record.replayIntegrity.resultActive
      || record.replayIntegrity.assetErrors.length
      || record.runtimeWallDurationMs < STORY_RUNTIME_VIDEO_CONTRACT.minimumRuntimeWallMs
      || record.motions.length !== STORY_RUNTIME_VIDEO_CONTRACT.motions.length
      || (mode.exerciseLifecycle && !record.lifecycle?.pauseResume?.passed)
      || !record.fragmentHold?.passed
      || record.fragmentHold.timing !== mode.holdTiming) {
      throw new Error(`runtime replay evidence integrity failed: ${JSON.stringify({
        ...record.replayIntegrity,
        runtimeWallDurationMs:record.runtimeWallDurationMs,
        motionCount:record.motions.length
      })}`);
    }
  } catch (error) {
    record.failures.push(error?.stack || error?.message || String(error));
  } finally {
    for (const [kind, items] of Object.entries(record.diagnostics)) {
      if (items.length) record.failures.push(`${kind}: ${items.join(' | ')}`);
    }
    if (context) {
      try { await context.close(); }
      catch (error) { record.failures.push(`video context close failed: ${error?.message || error}`); }
    }
    if (video) {
      try {
        await video.saveAs(videoPath);
        await video.delete();
      } catch (error) {
        record.failures.push(`video finalization failed: ${error?.message || error}`);
      }
    }
    if (!record.pivotOverlay?.passed
      || !fs.existsSync(path.join(output, record.pivotOverlay.screenshot || ''))) {
      record.failures.push('runtime Story pivot overlay is missing or invalid');
    }
    record.captureStatus = record.failures.length ? 'failed' : 'passed';
    record.status = 'pending-audit';
  }
  return record;
}

async function finalizeStoryRuntimeEvidence(
  record, browserType, output, launchOptions, totalAuditDeadline
) {
  if (record.status !== 'pending-audit') {
    record.failures.push(`runtime Story evidence entered audit in an invalid state: ${record.status}`);
  }
  const dimensions = String(record.videoDimensions || '').split('x').map(Number);
  const expectedVideoSize = { width:dimensions[0], height:dimensions[1] };
  const videoPath = path.join(output, record.video || '');
  try {
    record.videoArtifact = await inspectStoryVideoArtifact(
      browserType, videoPath, expectedVideoSize, launchOptions, totalAuditDeadline
    );
  } catch (error) {
    record.videoArtifact = {
      passed:false,
      decode:null,
      auditError:error?.message || String(error)
    };
    throw error;
  }
  if (!record.videoArtifact.passed) {
    record.failures.push(`runtime Story video is missing or invalid: ${JSON.stringify(record.videoArtifact)}`);
  }
  record.status = record.failures.length ? 'failed' : 'passed';
  return record;
}

function summaryMarkdown(summary) {
  const lines = [
    '# Moguria browser visual QA',
    '',
    `- Browser: ${summary.browser}`,
    `- Mode: ${summary.headed ? 'headed' : 'headless'}`,
    `- Playwright: ${summary.playwrightVersion}`,
    `- Seed: ${summary.seed}`,
    `- Result: ${summary.passed ? 'PASS' : 'FAIL'}`,
    `- Screen checks: ${summary.passedCount}/${summary.records.length} passed`,
    `- Continuous runtime evidence: ${summary.evidencePassedCount}/${summary.storyRuntimeEvidence.length} passed`,
    '',
    '| Viewport | Screen | Result | Screenshot |',
    '| --- | --- | --- | --- |'
  ];
  for (const record of summary.records) {
    lines.push(`| ${record.dimensions} | ${record.screen} | ${record.status.toUpperCase()} | ${record.screenshot} |`);
  }
  lines.push('', '## Story continuous runtime evidence', '',
    '| Viewport | Mode | Timing | Result | Four-motion video | Decoded duration / dimensions | Pose-atlas pivot overlay |',
    '| --- | --- | --- | --- | --- | --- | --- |');
  for (const record of summary.storyRuntimeEvidence) {
    const timing = record.runtimeWallDurationMs
      ? `${record.logicalTiming} (${record.runtimeWallDurationMs} ms)`
      : record.logicalTiming;
    const decode = record.videoArtifact?.decode;
    const decoded = Number.isFinite(decode?.durationSeconds)
      ? `${decode.durationSeconds.toFixed(2)} s / ${decode.width}x${decode.height}; nonblank ${decode.nonBlankSamples}/${decode.samples.length}; changed ${decode.changedPairs}/${decode.adjacentDifferences.length}`
      : `(failed: ${decode?.error || 'missing'})`;
    lines.push(`| ${record.dimensions} (video ${record.videoDimensions}) | ${record.mode} | ${timing} | ${record.status.toUpperCase()} | ${record.video} | ${decoded} | ${record.pivotOverlay?.screenshot || '(missing)'} |`);
  }
  for (const record of summary.storyRuntimeEvidence.filter((item) => item.motions.length)) {
    lines.push('', `### ${record.viewport} / ${record.mode} motion checkpoints`, '',
      '| Motion | Scene clock | Post-commit clock | Wall time |',
      '| --- | ---: | ---: | ---: |');
    for (const motion of record.motions) {
      lines.push(`| ${motion.motionId} | ${motion.sceneTimeMs} ms | ${motion.postTimeMs} ms | ${motion.wallDurationMs} ms |`);
    }
  }
  const motionRecords = summary.records.filter((record) => record.storyMotionEvidence?.frames?.length);
  if (motionRecords.length) {
    lines.push('', '## Story motion marker evidence', '',
      '| Viewport | Motion | Marker frame | Logical time | Screenshot |',
      '| --- | --- | --- | --- | --- |');
    for (const record of motionRecords) {
      for (const frame of record.storyMotionEvidence.frames) {
        const time = frame.postTimeMs
          ? `scene ${frame.sceneTimeMs} ms / post ${frame.postTimeMs} ms`
          : `scene ${frame.sceneTimeMs} ms`;
        lines.push(`| ${record.dimensions} | ${record.storyMotionEvidence.motionId} | ${frame.label} | ${time} | ${frame.screenshot} |`);
      }
    }
  }
  const failures = summary.records.filter((record) => record.failures.length);
  if (failures.length) {
    lines.push('', '## Failures', '');
    for (const record of failures) {
      lines.push(`### ${record.viewport} / ${record.screen}`, '');
      for (const failure of record.failures) lines.push(`- ${String(failure).replace(/\s+/g, ' ').trim()}`);
      lines.push('');
    }
  }
  const evidenceFailures = summary.storyRuntimeEvidence.filter((record) => record.failures.length);
  if (evidenceFailures.length) {
    lines.push('', '## Runtime evidence failures', '');
    for (const record of evidenceFailures) {
      lines.push(`### ${record.viewport} / ${record.mode} Story continuous replay`, '');
      for (const failure of record.failures) lines.push(`- ${String(failure).replace(/\s+/g, ' ').trim()}`);
      lines.push('');
    }
  }
  if (summary.orchestrationFailures?.length) {
    lines.push('', '## QA orchestration failures', '');
    for (const failure of summary.orchestrationFailures) {
      lines.push(`- ${String(failure).replace(/\s+/g, ' ').trim()}`);
    }
  }
  lines.push('', '> Viewport emulation is not a real-device Safari pass.', '');
  return lines.join('\n');
}

async function main() {
  const options = parseArgs();
  if (options.list) {
    console.log(JSON.stringify({
      playwright: PLAYWRIGHT_VERSION,
      browsers: ['chromium', 'webkit'],
      headed: options.headed,
      viewports: VIEWPORTS,
      screens: SCREEN_IDS
    }, null, 2));
    return;
  }
  fs.rmSync(options.output, { recursive: true, force: true });
  fs.mkdirSync(path.join(options.output, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(options.output, 'videos'), { recursive: true });
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/playwright/package.json'), 'utf8'));
  if (packageJson.version !== PLAYWRIGHT_VERSION) {
    throw new Error(`Playwright ${PLAYWRIGHT_VERSION} is required; installed ${packageJson.version}`);
  }
  const playwright = await import('playwright');
  const browserType = playwright[options.browser];
  const launchOptions = Object.freeze({ headless:!options.headed });
  let browser;
  let server;
  const startedAt = new Date().toISOString();
  const orchestrationFailures = [];
  const producerShutdown = {
    contextsBeforeClose:null,
    closeStartedAt:null,
    closedAt:null,
    disconnected:false
  };
  try {
    ({ server, baseUrl: options.baseUrl } = await startStaticServer());
    browser = await browserType.launch(launchOptions);
    const records = [];
    const storyRuntimeEvidence = [];
    for (const viewport of VIEWPORTS) {
      for (const screenId of SCREEN_IDS) {
        process.stdout.write(`[${options.browser}] ${viewport.id} / ${screenId} ... `);
        const record = await runScreen(browser, options.baseUrl, options.browser, viewport, screenId, options.output);
        records.push(record);
        console.log(record.status.toUpperCase());
      }
      for (const mode of STORY_RUNTIME_EVIDENCE_MODES) {
        process.stdout.write(`[${options.browser}] ${viewport.id} / Story runtime evidence (${mode.id}) ... `);
        const evidence = await runStoryRuntimeEvidence(
          browser, options.baseUrl, options.browser, viewport, options.output, mode
        );
        storyRuntimeEvidence.push(evidence);
        console.log(evidence.captureStatus === 'passed' ? 'CAPTURED' : 'CAPTURE-FAILED');
      }
    }
    producerShutdown.contextsBeforeClose = browser.contexts().length;
    if (producerShutdown.contextsBeforeClose !== 0) {
      orchestrationFailures.push(
        `producer browser retained ${producerShutdown.contextsBeforeClose} context(s) after capture finalization`
      );
    }
    producerShutdown.closeStartedAt = new Date().toISOString();
    const producerCloseDeadline = Date.now() + STORY_RUNTIME_VIDEO_CONTRACT.browserCloseTimeoutMs;
    try {
      await withDeadline(browser.close(), producerCloseDeadline, 'producer browser close');
    }
    catch (error) {
      orchestrationFailures.push(`producer browser close failed: ${error?.message || String(error)}`);
    }
    producerShutdown.closedAt = new Date().toISOString();
    producerShutdown.disconnected = !browser.isConnected();
    if (!producerShutdown.disconnected) {
      orchestrationFailures.push('producer browser remained connected; deferred video audits were not started');
    } else {
      browser = null;
    }

    const totalAuditDeadline = Math.min(
      Date.now() + STORY_RUNTIME_VIDEO_CONTRACT.totalVideoAuditTimeoutMs,
      Date.parse(startedAt) + BROWSER_QA_TIME_BUDGET.workflowTimeoutMs
        - BROWSER_QA_TIME_BUDGET.summaryUploadReserveMs
    );
    let auditOrchestrationBlocked = !producerShutdown.disconnected;
    for (const evidence of storyRuntimeEvidence) {
      if (auditOrchestrationBlocked || Date.now() >= totalAuditDeadline) {
        const reason = auditOrchestrationBlocked
          ? 'video audit orchestration stopped after browser cleanup failure'
          : 'total deferred video audit deadline elapsed';
        if (!orchestrationFailures.includes(reason)) orchestrationFailures.push(reason);
        evidence.failures.push(reason);
        evidence.status = 'failed';
        continue;
      }
      process.stdout.write(`[${options.browser}] ${evidence.viewport} / Story video audit (${evidence.mode}) ... `);
      try {
        await finalizeStoryRuntimeEvidence(
          evidence, browserType, options.output, launchOptions, totalAuditDeadline
        );
      } catch (error) {
        const reason = `video audit orchestration failed: ${error?.message || String(error)}`;
        orchestrationFailures.push(reason);
        evidence.failures.push(reason);
        evidence.status = 'failed';
        auditOrchestrationBlocked = true;
      }
      if (evidence.videoArtifact?.auditCleanupFailed) {
        const reason = 'video audit orchestration stopped after dedicated browser cleanup failure';
        orchestrationFailures.push(reason);
        auditOrchestrationBlocked = true;
      }
      console.log(evidence.status.toUpperCase());
    }
    const summary = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      startedAt,
      browser: options.browser,
      headed: options.headed,
      headless: !options.headed,
      playwrightVersion: PLAYWRIGHT_VERSION,
      seed: FIXED_SEED,
      locale: 'ja-JP',
      timezone: 'Asia/Tokyo',
      mobileEmulation: true,
      realDevice: false,
      orchestrationFailures,
      producerShutdown,
      passed: orchestrationFailures.length === 0
        && records.every((record) => record.status === 'passed')
        && storyRuntimeEvidence.every((record) => record.status === 'passed'),
      passedCount: records.filter((record) => record.status === 'passed').length,
      evidencePassedCount:storyRuntimeEvidence.filter((record) => record.status === 'passed').length,
      storyRuntimeEvidence,
      records
    };
    fs.writeFileSync(path.join(options.output, 'qa-summary.json'), JSON.stringify(summary, null, 2) + '\n');
    fs.writeFileSync(path.join(options.output, 'qa-summary.md'), summaryMarkdown(summary));
    if (!summary.passed) process.exitCode = 1;
  } finally {
    if (browser) {
      try {
        await withDeadline(
          browser.close(),
          Date.now() + STORY_RUNTIME_VIDEO_CONTRACT.browserCloseTimeoutMs,
          'final producer browser close'
        );
      } catch {}
    }
    if (server) await closeServer(server);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Browser QA failed before completion: ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}
