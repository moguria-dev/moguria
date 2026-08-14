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
  'home', 'dex', 'logs', 'equipment', 'gacha', 'outing',
  'battle-hud', 'skill-choice', 'artifact-choice', 'pause', 'result'
]);
export const VISUAL_SCROLL_ROOTS = Object.freeze({
  home: Object.freeze([]),
  dex: Object.freeze(['#overlayBody']),
  logs: Object.freeze(['#overlayBody']),
  equipment: Object.freeze(['#overlayBody']),
  gacha: Object.freeze(['#overlayBody']),
  outing: Object.freeze(['#overlayBody']),
  'battle-hud': Object.freeze([]),
  'skill-choice': Object.freeze(['#levelOwnedSkills', '#skillChoices']),
  'artifact-choice': Object.freeze(['#artifactOwnedSkills', '#artifactChoices']),
  pause: Object.freeze(['#pauseModal .pause-power-panels']),
  result: Object.freeze(['#result'])
});
export const GLOBAL_VISUAL_SCROLL_ROOTS = Object.freeze(['html', 'body', '#app', '#overlay']);
export const VIEWPORT_SURFACE_SCREENS = Object.freeze([
  'home', 'dex', 'logs', 'equipment', 'gacha', 'outing', 'battle-hud', 'result'
]);
export const TRANSIENT_ABSENCE = Object.freeze({
  'battle-hud': Object.freeze(['#game.active > .big-cue', '#game.active > .wave-toast'])
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = path.join(ROOT, 'browser-qa-output');
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
  await page.addStyleTag({ content: `
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

const SCREEN_CONTRACTS = Object.freeze({
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
  'battle-hud': {
    surface: '#game.active',
    touch: ['#pauseBtn'],
    setup: async (page) => {
      const health = await prepareBattle(page, 'battle-hud');
      if (health.mode !== 'run') throw new Error(`battle HUD mode is ${health.mode}`);
    }
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
  page.on('requestfailed', (request) => record.diagnostics.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`));
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
    await contract.setup(page);
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
