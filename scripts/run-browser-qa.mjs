import fs from 'node:fs';
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
export const SCREEN_IDS = Object.freeze([
  'startup-loading', 'home', 'dex', 'logs', 'equipment', 'gacha', 'outing', 'adventure-loading',
  'battle-hud', 'battle-vfx-lv1', 'battle-vfx-lv3', 'battle-vfx-lv5', 'battle-vfx-lv5-reduced', 'battle-vfx-lv5-low',
  'skill-choice', 'artifact-choice', 'pause', 'result'
]);
export const VISUAL_SCROLL_ROOTS = Object.freeze({
  'startup-loading': Object.freeze([]),
  home: Object.freeze([]),
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
  'startup-loading', 'home', 'dex', 'logs', 'equipment', 'gacha', 'outing', 'adventure-loading',
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
export const SPECULATIVE_BATTLE_PACK_URLS = Object.freeze(
  (RUNTIME_ASSET_MANIFEST.packs || [])
    .find((pack) => pack.id === 'battle-v3')
    ?.assets?.map((asset) => String(asset.src || ''))
    .filter(Boolean) || []
);
const SPECULATIVE_BATTLE_PACK_URL_SET = new Set(SPECULATIVE_BATTLE_PACK_URLS);
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
    || failure.errorText !== 'net::ERR_ABORTED') return false;
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
  if (!result.ok || result.equipment < 5) throw new Error('version-3 browser fixture could not be saved');
}

async function waitForStablePage(page) {
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

async function inspectLoadingState(page, kind) {
  return page.evaluate((loadingKind) => {
    const root = document.querySelector(`[data-loading-surface="${loadingKind}"]`);
    if (!root) throw new Error(`loading surface is missing: ${loadingKind}`);
    const query = (selector) => root.querySelector(selector);
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none'
        && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
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
        visible: visible(tips),
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
      await page.waitForTimeout(LOADING_QA_CONTRACT.revealMs - 80);
      fixture.tipsBeforeBoundary = await inspectLoadingState(page, kind);
      await page.waitForTimeout(160);
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
      await page.waitForTimeout(LOADING_QA_CONTRACT.autoMs + LOADING_QA_CONTRACT.tipTransitionMs + 180);
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
        await page.evaluate((loadingKind) => {
          document.querySelector(`[data-loading-surface="${loadingKind}"] [data-loading-tip-button]`)?.click();
        }, kind);
        await page.waitForTimeout(LOADING_QA_CONTRACT.manualDebounceMs + 30);
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
      // let the real Tips opacity transition settle before asserting visibility.
      await page.waitForTimeout(LOADING_QA_CONTRACT.tipTransitionMs + 80);
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
  if (!displayedTips?.visible || displayedTips.dataVisible !== 'true' || displayedTips.ariaHidden !== 'false'
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
    touch: ['#startBtn', '#snackBtn', '#dexBtn', '#logsBtn', '#equipBtn', '#gachaBtn', '#outingBtn'],
    setup: async (page) => page.locator('#home.active').waitFor({ state: 'visible' })
  },
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

function summaryMarkdown(summary) {
  const lines = [
    '# Moguria browser visual QA',
    '',
    `- Browser: ${summary.browser}`,
    `- Mode: ${summary.headed ? 'headed' : 'headless'}`,
    `- Playwright: ${summary.playwrightVersion}`,
    `- Seed: ${summary.seed}`,
    `- Result: ${summary.passed ? 'PASS' : 'FAIL'}`,
    `- Checks: ${summary.passedCount}/${summary.records.length} passed`,
    '',
    '| Viewport | Screen | Result | Screenshot |',
    '| --- | --- | --- | --- |'
  ];
  for (const record of summary.records) {
    lines.push(`| ${record.dimensions} | ${record.screen} | ${record.status.toUpperCase()} | ${record.screenshot} |`);
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
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/playwright/package.json'), 'utf8'));
  if (packageJson.version !== PLAYWRIGHT_VERSION) {
    throw new Error(`Playwright ${PLAYWRIGHT_VERSION} is required; installed ${packageJson.version}`);
  }
  const playwright = await import('playwright');
  const browserType = playwright[options.browser];
  let browser;
  let server;
  const startedAt = new Date().toISOString();
  try {
    ({ server, baseUrl: options.baseUrl } = await startStaticServer());
    browser = await browserType.launch({ headless: !options.headed });
    const records = [];
    for (const viewport of VIEWPORTS) {
      for (const screenId of SCREEN_IDS) {
        process.stdout.write(`[${options.browser}] ${viewport.id} / ${screenId} ... `);
        const record = await runScreen(browser, options.baseUrl, options.browser, viewport, screenId, options.output);
        records.push(record);
        console.log(record.status.toUpperCase());
      }
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
      passed: records.every((record) => record.status === 'passed'),
      passedCount: records.filter((record) => record.status === 'passed').length,
      records
    };
    fs.writeFileSync(path.join(options.output, 'qa-summary.json'), JSON.stringify(summary, null, 2) + '\n');
    fs.writeFileSync(path.join(options.output, 'qa-summary.md'), summaryMarkdown(summary));
    if (!summary.passed) process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (server) await closeServer(server);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Browser QA failed before completion: ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}
