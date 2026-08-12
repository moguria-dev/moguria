/* Moguria Battle V3 Phaser scene and core/render bridge.
 *
 * MoguriaGame remains authoritative for movement, combat, waves, rewards and
 * save data. Phaser owns the battle frame: Scene.update invokes the registered
 * core step once, then renders that same authoritative state immediately.
 */
(function (global) {
  'use strict';

  const VERSION = '3.0.0-phaser-bridge';
  const SCENE_KEY = 'MoguriaBattleV3Scene';
  const HOST_ID = 'moguriaBattleV3CanvasHost';
  const TAU = Math.PI * 2;
  const MAX_COMPANIONS = 6;

  const DEFAULT_ASSETS = Object.freeze({
    manifest: Object.freeze({ key: 'moguria-v3-atlas-manifest', src: 'assets/images/battle-v3/atlas.json?v=20260812-battle-v3-2' }),
    backgrounds: Object.freeze([
      Object.freeze({ key: 'moguria-v3-bg-far', src: 'assets/images/battle-v3/bg-far.webp', scrollFactor: 0.04, alpha: 1 }),
      Object.freeze({ key: 'moguria-v3-bg-mid', src: 'assets/images/battle-v3/bg-mid.webp', scrollFactor: 0.18, alpha: 0.34 }),
      Object.freeze({ key: 'moguria-v3-bg-ground', src: 'assets/images/battle-v3/bg-ground.webp', scrollFactor: 0.42, alpha: 0.48 }),
      Object.freeze({ key: 'moguria-v3-bg-foreground', src: 'assets/images/battle-v3/bg-foreground.webp', scrollFactor: 0.76, alpha: 0.54 })
    ]),
    sheets: Object.freeze({
      mogu: Object.freeze({ key: 'moguria-v3-mogu', src: 'assets/images/battle-v3/mogu-atlas.png', frameWidth: 256, frameHeight: 256 }),
      enemy: Object.freeze({ key: 'moguria-v3-enemy', src: 'assets/images/battle-v3/enemy-atlas.png', frameWidth: 256, frameHeight: 256 }),
      companion: Object.freeze({ key: 'moguria-v3-companion', src: 'assets/images/battle-v3/companion-atlas.png', frameWidth: 256, frameHeight: 256 }),
      boss: Object.freeze({ key: 'moguria-v3-boss', src: 'assets/images/battle-v3/boss-atlas.png', frameWidth: 256, frameHeight: 256 })
    })
  });

  // Regular-cell frame layouts. Missing rows safely fall back to a compatible
  // state or the first frame, which lets art packs arrive independently.
  const DEFAULT_LAYOUTS = Object.freeze({
    mogu: Object.freeze({
      idle: Object.freeze({ frames: Object.freeze([1, 2]), fps: 7, repeat: -1 }),
      move: Object.freeze({ frames: Object.freeze([5, 6]), fps: 11, repeat: -1 }),
      attack: Object.freeze({ frames: Object.freeze([9, 10]), fps: 15, repeat: 0 }),
      hurt: Object.freeze({ frames: Object.freeze([12, 13]), fps: 12, repeat: 0 }),
      skill: Object.freeze({ frames: Object.freeze([9, 10]), fps: 12, repeat: 0 }),
      defeat: Object.freeze({ frames: Object.freeze([14, 15]), fps: 7, repeat: 0 })
    }),
    enemy: Object.freeze({
      idle: Object.freeze({ frames: Object.freeze([0]), fps: 7, repeat: -1 }),
      move: Object.freeze({ frames: Object.freeze([1]), fps: 10, repeat: -1 }),
      attack: Object.freeze({ frames: Object.freeze([2]), fps: 13, repeat: 0 }),
      hurt: Object.freeze({ frames: Object.freeze([3]), fps: 12, repeat: 0 })
    }),
    companion: Object.freeze({
      idle: Object.freeze({ frames: Object.freeze([0, 1]), fps: 8, repeat: -1 }),
      move: Object.freeze({ frames: Object.freeze([4, 5]), fps: 10, repeat: -1 }),
      attack: Object.freeze({ frames: Object.freeze([2, 3]), fps: 14, repeat: 0 }),
      hurt: Object.freeze({ frames: Object.freeze([6]), fps: 12, repeat: 0 }),
      celebrate: Object.freeze({ frames: Object.freeze([7]), fps: 8, repeat: -1 })
    }),
    boss: Object.freeze({
      idle: Object.freeze({ frames: Object.freeze([0]), fps: 6, repeat: -1 }),
      move: Object.freeze({ frames: Object.freeze([0]), fps: 8, repeat: -1 }),
      attack: Object.freeze({ frames: Object.freeze([2]), fps: 12, repeat: 0 }),
      hurt: Object.freeze({ frames: Object.freeze([7]), fps: 10, repeat: 0 }),
      telegraph: Object.freeze({ frames: Object.freeze([1]), fps: 9, repeat: -1 }),
      recover: Object.freeze({ frames: Object.freeze([3]), fps: 7, repeat: 0 })
    })
  });

  const DEFAULT_VARIANT_LAYOUTS = Object.freeze({
    enemy: Object.freeze({
      soft: Object.freeze({ idle: { frames: [0] }, move: { frames: [1] }, attack: { frames: [2] }, hurt: { frames: [3] } }),
      bat: Object.freeze({ idle: { frames: [4] }, move: { frames: [5] }, attack: { frames: [6] }, hurt: { frames: [7] } }),
      stone: Object.freeze({ idle: { frames: [8] }, move: { frames: [9] }, attack: { frames: [10] }, hurt: { frames: [11] } }),
      ghost: Object.freeze({ idle: { frames: [12] }, move: { frames: [13] }, attack: { frames: [14] }, hurt: { frames: [15] } })
    }),
    boss: Object.freeze({
      phase1: Object.freeze({ idle: { frames: [0] }, move: { frames: [0] }, attack: { frames: [2] }, hurt: { frames: [3] }, telegraph: { frames: [1] }, recover: { frames: [3] } }),
      phase2: Object.freeze({ idle: { frames: [4] }, move: { frames: [4] }, attack: { frames: [6] }, hurt: { frames: [7] }, telegraph: { frames: [5] }, recover: { frames: [7] } })
    })
  });

  const STATE_ALIASES = Object.freeze({
    mogu: Object.freeze({ telegraph: 'skill', recover: 'idle' }),
    enemy: Object.freeze({ telegraph: 'attack', recover: 'idle', skill: 'attack' }),
    companion: Object.freeze({ telegraph: 'attack', recover: 'idle', skill: 'attack' }),
    boss: Object.freeze({ skill: 'attack' })
  });

  const FALLBACK_COLORS = Object.freeze({
    mogu: 0xfff2df,
    enemy: 0x8d75b9,
    companion: 0xffd28e,
    boss: 0x58396f
  });

  let phaserGame = null;
  let sceneRef = null;
  let hostEl = null;
  let bootPromise = null;
  let resolveBoot = null;
  let rejectBoot = null;
  let ready = false;
  let running = false;
  let pendingState = null;
  let pendingCameraFx = [];
  let companionOrigins = [];
  let runtimeOptions = null;
  let reducedMotion = false;
  let reducedMotionQuery = null;
  let resizeTimer = 0;
  let loadErrors = [];
  let fallbackAssets = [];
  let coreStep = null;
  let coreStepping = false;
  let lastCoreStepError = null;
  let maxDeltaSeconds = 1 / 30;
  const legacyDisplay = new Map();

  function clonePlain(value) {
    if (!value || typeof value !== 'object') return {};
    return { ...value };
  }

  function mergeAssets(override) {
    const custom = override && typeof override === 'object' ? override : {};
    const customSheets = custom.sheets && typeof custom.sheets === 'object' ? custom.sheets : {};
    return {
      manifest: { ...DEFAULT_ASSETS.manifest, ...(custom.manifest || {}) },
      backgrounds: Array.isArray(custom.backgrounds) && custom.backgrounds.length
        ? custom.backgrounds.map((item, index) => ({ ...(DEFAULT_ASSETS.backgrounds[index] || {}), ...item }))
        : DEFAULT_ASSETS.backgrounds.map(item => ({ ...item })),
      sheets: Object.fromEntries(Object.entries(DEFAULT_ASSETS.sheets).map(([role, item]) => [
        role,
        { ...item, ...(customSheets[role] || {}) }
      ]))
    };
  }

  function mergeLayouts(override) {
    const custom = override && typeof override === 'object' ? override : {};
    const out = {};
    for (const [role, layout] of Object.entries(DEFAULT_LAYOUTS)) {
      out[role] = {};
      const customRole = custom[role] && typeof custom[role] === 'object' ? custom[role] : {};
      for (const [stateName, definition] of Object.entries(layout)) {
        out[role][stateName] = frameDefinition(customRole[stateName] || definition, definition);
      }
      for (const [stateName, definition] of Object.entries(customRole)) {
        if (!out[role][stateName]) out[role][stateName] = frameDefinition(definition);
      }
    }
    return out;
  }

  function copyLayout(layout) {
    return Object.fromEntries(Object.entries(layout || {}).map(([name, definition]) => [
      name,
      { ...definition, frames: Array.isArray(definition?.frames) ? definition.frames.slice() : definition?.frames }
    ]));
  }

  function copyVariantLayouts(source = DEFAULT_VARIANT_LAYOUTS) {
    const result = {};
    for (const [role, variants] of Object.entries(source || {})) {
      result[role] = Object.fromEntries(Object.entries(variants || {}).map(([variant, layout]) => [
        variant,
        copyLayout(layout)
      ]));
    }
    return result;
  }

  function frameDefinition(value, fallback = {}) {
    const metadata = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    let frames = [];
    if (Array.isArray(value)) frames = value;
    else if (Number.isFinite(Number(value))) frames = [Number(value)];
    else if (Array.isArray(metadata.frames)) frames = metadata.frames;
    else if (Number.isFinite(Number(metadata.frame))) frames = [Number(metadata.frame)];
    else if (Number.isFinite(Number(metadata.start))) {
      const start = Math.max(0, Math.floor(Number(metadata.start)));
      const end = Math.max(start, Math.floor(Number(metadata.end) || start));
      for (let frame = start; frame <= end; frame++) frames.push(frame);
    }
    frames = [...new Set(frames.map(Number).filter(Number.isFinite).map(frame => Math.max(0, Math.floor(frame))))];
    if (!frames.length && Array.isArray(fallback.frames)) frames = fallback.frames.slice();
    return {
      ...fallback,
      ...metadata,
      frames,
      fps: Math.max(1, Number(metadata.fps ?? fallback.fps) || 8),
      repeat: Number.isFinite(Number(metadata.repeat)) ? Number(metadata.repeat) : (Number.isFinite(Number(fallback.repeat)) ? Number(fallback.repeat) : -1)
    };
  }

  function applyManifestState(layout, stateName, value, sourceName = stateName) {
    const aliases = {
      hit: 'hurt',
      run: 'move',
      walk: 'move',
      windup: 'telegraph',
      slam: 'attack',
      burst: 'attack',
      attack_release: 'attack'
    };
    const target = aliases[stateName] || stateName;
    layout[target] = frameDefinition(value, layout[target] || {});
    if (sourceName === 'enraged') layout.hurt = frameDefinition(value, layout.hurt || {});
  }

  function layoutFromStateMap(stateMap, fallback) {
    const layout = copyLayout(fallback);
    for (const [stateName, value] of Object.entries(stateMap || {})) {
      applyManifestState(layout, stateName, value, stateName);
    }
    return layout;
  }

  function applyAtlasManifest(manifest, baseLayouts, customLayouts) {
    const layouts = Object.fromEntries(Object.entries(baseLayouts).map(([role, layout]) => [role, copyLayout(layout)]));
    const variants = copyVariantLayouts();
    const atlases = manifest?.atlases;
    if (atlases && typeof atlases === 'object') {
      for (const role of ['mogu', 'companion']) {
        const states = atlases[role]?.states;
        if (states && typeof states === 'object') layouts[role] = layoutFromStateMap(states, layouts[role]);
      }

      const enemyStates = atlases.enemy?.states;
      if (enemyStates && typeof enemyStates === 'object') {
        variants.enemy = {};
        for (const [variant, states] of Object.entries(enemyStates)) {
          if (!states || typeof states !== 'object') continue;
          variants.enemy[variant] = layoutFromStateMap(states, layouts.enemy);
        }
        layouts.enemy = copyLayout(variants.enemy.soft || Object.values(variants.enemy)[0] || layouts.enemy);
      }

      const bossStates = atlases.boss?.states;
      if (bossStates && typeof bossStates === 'object') {
        variants.boss = {};
        for (const [variant, states] of Object.entries(bossStates)) {
          if (!states || typeof states !== 'object') continue;
          const layout = copyLayout(layouts.boss);
          if (states.idle != null) applyManifestState(layout, 'idle', states.idle);
          if (states.idle != null) applyManifestState(layout, 'move', states.idle);
          if (states.windup != null) applyManifestState(layout, 'telegraph', states.windup);
          if (states.slam != null) applyManifestState(layout, 'attack', states.slam);
          if (states.burst != null) applyManifestState(layout, 'attack', states.burst);
          if (states.recover != null) applyManifestState(layout, 'recover', states.recover);
          if (states.enraged != null) {
            applyManifestState(layout, 'recover', states.enraged, 'enraged');
            applyManifestState(layout, 'hurt', states.enraged, 'enraged');
          }
          variants.boss[variant] = layout;
        }
        layouts.boss = copyLayout(variants.boss.phase1 || Object.values(variants.boss)[0] || layouts.boss);
      }
    }

    // Explicit boot-time overrides win over the generated atlas metadata.
    for (const [role, roleOverrides] of Object.entries(customLayouts || {})) {
      if (!layouts[role] || !roleOverrides || typeof roleOverrides !== 'object') continue;
      for (const [stateName, value] of Object.entries(roleOverrides)) {
        layouts[role][stateName] = frameDefinition(value, layouts[role][stateName] || {});
      }
    }
    return { layouts, variants };
  }

  function frameNumbers(definition, maxFrame = Infinity) {
    const explicit = Array.isArray(definition?.frames) ? definition.frames : null;
    const frames = explicit ? explicit.slice() : [];
    if (!explicit && Number.isFinite(Number(definition?.start))) {
      const start = Math.max(0, Math.floor(Number(definition.start)));
      const end = Math.max(start, Math.floor(Number(definition.end) || start));
      for (let frame = start; frame <= end; frame++) frames.push(frame);
    }
    return [...new Set(frames.map(Number).filter(frame => Number.isFinite(frame) && frame >= 0 && frame <= maxFrame).map(Math.floor))];
  }

  function currentQuality() {
    const quality = global.MoguriaPerformance?.getQuality?.();
    return quality === 'low' || quality === 'medium' ? quality : 'high';
  }

  function safeResolution() {
    const dpr = Math.max(1, Number(global.devicePixelRatio) || 1);
    const quality = currentQuality();
    const cap = quality === 'low' ? 1.25 : quality === 'medium' ? 1.6 : 2;
    return Math.max(1, Math.min(cap, dpr));
  }

  function ensureHost(parent) {
    if (!parent) return null;
    let host = parent.querySelector?.('#' + HOST_ID) || null;
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      host.setAttribute('aria-hidden', 'true');
      parent.insertBefore(host, parent.firstChild || null);
    }
    Object.assign(host.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: '2',
      display: running ? 'block' : 'none'
    });
    return host;
  }

  function suppressLegacyLayers() {
    global.document?.body?.classList?.add?.('battle-v3-active');
    const ids = ['gameCanvas', 'kvGameVisualOverlay', 'kvBattleWorldLayer'];
    for (const id of ids) {
      const element = document.getElementById(id);
      if (!element) continue;
      if (!legacyDisplay.has(element)) legacyDisplay.set(element, element.style.display);
      element.style.display = 'none';
    }
  }

  function restoreLegacyLayers() {
    global.document?.body?.classList?.remove?.('battle-v3-active');
    for (const [element, display] of legacyDisplay.entries()) {
      if (element?.isConnected) element.style.display = display;
    }
    legacyDisplay.clear();
  }

  function configureCanvas() {
    const canvas = phaserGame?.canvas;
    if (!canvas) return;
    canvas.dataset.moguriaBattleV3 = 'true';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.tabIndex = -1;
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
      pointerEvents: 'none',
      touchAction: 'none',
      zIndex: '0'
    });
  }

  function setReducedMotion(value) {
    reducedMotion = !!value;
    sceneRef?.applyMotionPreference?.();
  }

  function installEnvironmentListeners() {
    if (global.matchMedia) {
      reducedMotionQuery = global.matchMedia('(prefers-reduced-motion: reduce)');
      setReducedMotion(reducedMotionQuery.matches);
      reducedMotionQuery.addEventListener?.('change', onReducedMotionChange);
    }
    global.addEventListener?.('resize', onResize, { passive: true });
  }

  function removeEnvironmentListeners() {
    reducedMotionQuery?.removeEventListener?.('change', onReducedMotionChange);
    reducedMotionQuery = null;
    global.removeEventListener?.('resize', onResize);
    if (resizeTimer) global.clearTimeout?.(resizeTimer);
    resizeTimer = 0;
  }

  function onReducedMotionChange(event) {
    setReducedMotion(event.matches);
  }

  function onResize() {
    if (resizeTimer) return;
    resizeTimer = global.setTimeout(() => {
      resizeTimer = 0;
      if (!phaserGame) return;
      const { width, height } = layoutSize(hostEl?.parentElement);
      phaserGame.scale?.resize?.(width, height);
      sceneRef?.handleResize?.(width, height);
      configureCanvas();
    }, 16);
  }

  function layoutSize(parent) {
    const app = parent?.closest?.('#app') || document.getElementById('app') || parent;
    const rect = app?.getBoundingClientRect?.();
    const width = Math.max(1, Math.round(Number(rect?.width) || Number(app?.clientWidth) || Number(global.innerWidth) || 390));
    const height = Math.max(1, Math.round(Number(rect?.height) || Number(app?.clientHeight) || Number(global.innerHeight) || 844));
    return { width, height };
  }

  function normalizeActorState(value) {
    const text = String(value || '').toLowerCase();
    if (!text) return '';
    if (/telegraph|warning|windup|chargeup|予兆/.test(text)) return 'telegraph';
    if (/recover|cooldown|stun|硬直|回復待ち/.test(text)) return 'recover';
    if (/skill|special|cast|magic|スキル|魔法/.test(text)) return 'skill';
    if (/hurt|hit|damage|被弾|痛/.test(text)) return 'hurt';
    if (/attack|strike|shoot|slam|攻撃|射撃/.test(text)) return 'attack';
    if (/move|walk|run|chase|移動|追跡/.test(text)) return 'move';
    if (/idle|wait|ready|待機/.test(text)) return 'idle';
    return '';
  }

  function explicitActorState(entity) {
    if (!entity || typeof entity !== 'object') return '';
    const fields = ['animState', 'animationState', 'actionState', 'visualState', 'bossState', 'phaseState', 'state'];
    for (const field of fields) {
      if (typeof entity[field] !== 'string') continue;
      const normalized = normalizeActorState(entity[field]);
      if (normalized) return normalized;
    }
    return '';
  }

  function actorAnimationKey(role, stateName, variant = 'default') {
    return `moguria-v3-${role}-${variant}-${stateName}`;
  }

  function createSceneClass(Phaser) {
    return class MoguriaBattleV3Scene extends Phaser.Scene {
      constructor() {
        super({ key: SCENE_KEY });
        this.assets = runtimeOptions.assets;
        this.layouts = runtimeOptions.layouts;
        this.variantLayouts = copyVariantLayouts();
        this.backgroundLayers = [];
        this.enemySprites = new Map();
        this.companionSprites = new Map();
        this.actorTracks = new Map();
        this.playerSprite = null;
        this.projectileGraphics = null;
        this.dropGraphics = null;
        this.effectGraphics = null;
        this.statusGraphics = null;
        this.floatingTexts = new Map();
        this.floatingTextIds = new WeakMap();
        this.floatingTextSerial = 0;
        this.lastState = null;
        this.stateTime = 0;
        this.syncSerial = 0;
        this.targetCamera = { x: 0, y: 0, initialized: false };
        this.lastCameraSignal = { shake: 0, flash: 0, bossPhase: 0, eventId: null };
        this.appliedQuality = '';
        this.resizeSignature = '';
        this.animationPauseSignature = '';
        this._loadErrors = [];
      }

      preload() {
        this.load.on?.('loaderror', file => {
          const label = file?.src || file?.url || file?.key || 'unknown asset';
          this._loadErrors.push(String(label));
        });
        if (this.assets.manifest?.key && this.assets.manifest?.src) {
          this.load.json(this.assets.manifest.key, this.assets.manifest.src);
        }
        for (const background of this.assets.backgrounds) {
          if (background?.key && background?.src) this.load.image(background.key, background.src);
        }
        for (const sheet of Object.values(this.assets.sheets)) {
          if (!sheet?.key || !sheet?.src) continue;
          this.load.spritesheet(sheet.key, sheet.src, {
            frameWidth: Math.max(1, Number(sheet.frameWidth) || 256),
            frameHeight: Math.max(1, Number(sheet.frameHeight) || 256),
            margin: Math.max(0, Number(sheet.margin) || 0),
            spacing: Math.max(0, Number(sheet.spacing) || 0)
          });
        }
      }

      create() {
        sceneRef = this;
        loadErrors = this._loadErrors.slice();
        this._fallbackAssets = [];
        this.createFallbackTextures();
        fallbackAssets = this._fallbackAssets.slice();
        const manifest = this.assets.manifest?.key ? this.cache.json?.get?.(this.assets.manifest.key) : null;
        if (!manifest && this.assets.manifest?.src && !loadErrors.includes(this.assets.manifest.src)) {
          loadErrors.push(this.assets.manifest.src);
        }
        const atlasMetadata = applyAtlasManifest(manifest, this.layouts, runtimeOptions.layoutOverrides);
        this.layouts = atlasMetadata.layouts;
        this.variantLayouts = atlasMetadata.variants;
        this.registerAnimations();
        this.createBackgrounds();
        this.createDrawLayers();
        this.playerSprite = this.createActorSprite('mogu', 'mogu', 126).setDepth(40);

        const camera = this.cameras.main;
        camera.setBackgroundColor?.('#070819');
        camera.setRoundPixels?.(false);
        this.handleResize(this.scale.width || global.innerWidth || 390, this.scale.height || global.innerHeight || 844);
        this.applyQuality(true);
        this.applyMotionPreference();

        this.events.once?.('shutdown', () => this.releaseSceneObjects());
        this.events.once?.('destroy', () => this.releaseSceneObjects());

        ready = true;
        configureCanvas();
        suppressLegacyLayers();
        if (hostEl) hostEl.style.display = running ? 'block' : 'none';
        if (pendingState) this.syncState(pendingState);
        this.flushCameraFx();
        resolveBoot?.(global.MoguriaBattleV3);
        resolveBoot = null;
        rejectBoot = null;
      }

      createFallbackTextures() {
        const backgroundColors = [0x11172e, 0x1e2444, 0x302449, 0x160f2a];
        this.assets.backgrounds.forEach((background, index) => {
          if (this.textures.exists(background.key)) return;
          this._fallbackAssets.push(background.src || background.key);
          const graphics = this.make.graphics({ x: 0, y: 0, add: false });
          const size = 256;
          graphics.fillStyle(backgroundColors[index] || 0x11172e, 1);
          graphics.fillRect(0, 0, size, size);
          graphics.fillStyle(index % 2 ? 0x8068b4 : 0xf2cf7c, index === 0 ? 0.18 : 0.1);
          for (let i = 0; i < 18; i++) {
            const x = (i * 71 + index * 29) % size;
            const y = (i * 43 + index * 53) % size;
            graphics.fillCircle(x, y, 1 + (i % 3), 1);
          }
          graphics.generateTexture(background.key, size, size);
          graphics.destroy();
        });

        for (const [role, sheet] of Object.entries(this.assets.sheets)) {
          if (this.textures.exists(sheet.key)) continue;
          this._fallbackAssets.push(sheet.src || sheet.key);
          const size = 128;
          const color = FALLBACK_COLORS[role] || 0xffffff;
          const graphics = this.make.graphics({ x: 0, y: 0, add: false });
          graphics.fillStyle(0x000000, 0);
          graphics.fillRect(0, 0, size, size);
          graphics.fillStyle(color, 1);
          graphics.fillCircle(size / 2, size / 2 + 7, role === 'boss' ? 46 : 35, 1);
          graphics.fillStyle(0xffffff, 0.3);
          graphics.fillCircle(size / 2 - 13, size / 2 - 8, role === 'boss' ? 11 : 8, 1);
          graphics.fillStyle(0x2c2036, 1);
          graphics.fillCircle(size / 2 - 9, size / 2 + 1, 3, 1);
          graphics.fillCircle(size / 2 + 9, size / 2 + 1, 3, 1);
          graphics.generateTexture(sheet.key, size, size);
          graphics.destroy();
        }
      }

      registerAnimations() {
        for (const [role, layout] of Object.entries(this.layouts)) {
          const sheet = this.assets.sheets[role];
          if (!sheet || !this.textures.exists(sheet.key)) continue;
          const texture = this.textures.get(sheet.key);
          const available = texture.getFrameNames?.()
            ?.map(name => Number(name))
            .filter(Number.isFinite)
            .sort((a, b) => a - b) || [];
          if (!available.length) continue;
          const maxFrame = available[available.length - 1];
          const availableSet = new Set(available);
          const candidates = [['default', layout]];
          for (const [variant, variantLayout] of Object.entries(this.variantLayouts[role] || {})) {
            candidates.push([variant, variantLayout]);
          }
          for (const [variant, candidateLayout] of candidates) {
            for (const [stateName, definition] of Object.entries(candidateLayout)) {
              const frames = frameNumbers(definition, maxFrame)
                .filter(frame => availableSet.has(frame))
                .map(frame => ({ key: sheet.key, frame }));
              if (!frames.length) continue;
              const key = actorAnimationKey(role, stateName, variant);
              if (this.anims.exists?.(key)) continue;
              this.anims.create({
                key,
                frames,
                frameRate: Math.max(1, Number(definition.fps) || 8),
                repeat: Number.isFinite(definition.repeat) ? definition.repeat : -1,
                skipMissedFrames: true
              });
            }
          }
        }
      }

      createBackgrounds() {
        const { width, height } = this.backgroundDisplaySize();
        this.backgroundLayers = this.assets.backgrounds.map((background, index) => {
          // The source paintings are deliberately portrait and non-tileable.
          // A viewport-sized overscan avoids repeat seams. Camera-independent
          // placement plus per-layer offsets supply restrained parallax while
          // controlled alpha keeps every painted layer visible.
          const layer = this.add.image(0, 0, background.key)
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(-100 + index)
            .setAlpha(background.alpha == null ? 1 : Number(background.alpha));
          layer.parallaxFactor = Number(background.scrollFactor) || 0;
          layer.baseAlpha = background.alpha == null ? 1 : Number(background.alpha);
          layer.setDisplaySize?.(width, height);
          return layer;
        });
      }

      createDrawLayers() {
        this.dropGraphics = this.add.graphics().setDepth(20);
        this.statusGraphics = this.add.graphics().setDepth(31);
        this.projectileGraphics = this.add.graphics().setDepth(50);
        this.effectGraphics = this.add.graphics().setDepth(70);
        this.projectileGraphics.setBlendMode?.(Phaser.BlendModes?.ADD ?? 1);
        this.effectGraphics.setBlendMode?.(Phaser.BlendModes?.ADD ?? 1);
      }

      backgroundDisplaySize() {
        const width = Math.max(390, this.scale?.width || global.innerWidth || 390);
        const height = Math.max(844, this.scale?.height || global.innerHeight || 844);
        const displayWidth = Math.max(width + 80, (height + 80) / 2);
        return { width: displayWidth, height: displayWidth * 2 };
      }

      handleResize(width, height) {
        width = Math.max(1, Number(width) || 390);
        height = Math.max(1, Number(height) || 844);
        const bounds = this.lastState?.mapBounds || { minX: -760, maxX: 760, minY: -760, maxY: 760 };
        const signature = [width, height, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY].map(Number).join(':');
        if (signature === this.resizeSignature) return;
        this.resizeSignature = signature;
        const display = this.backgroundDisplaySize();
        for (const layer of this.backgroundLayers) layer.setDisplaySize?.(display.width, display.height);
        this.cameras.main.setBounds?.(
          Number(bounds.minX) - width,
          Number(bounds.minY) - height,
          (Number(bounds.maxX) - Number(bounds.minX)) + width * 2,
          (Number(bounds.maxY) - Number(bounds.minY)) + height * 2
        );
      }

      createActorSprite(role, id, size) {
        const sheet = this.assets.sheets[role] || this.assets.sheets.enemy;
        const sprite = this.add.sprite(0, 0, sheet.key);
        this.animationPauseSignature = '';
        sprite.setName?.(`moguria-v3-${role}-${id}`);
        sprite.setDisplaySize?.(size, size);
        sprite.setOrigin?.(0.5, 0.62);
        sprite.moguriaRole = role;
        sprite.moguriaState = '';
        sprite.moguriaFallback = !(this.textures.get(sheet.key)?.getFrameNames?.() || []).some(name => Number.isFinite(Number(name)));
        return sprite;
      }

      syncState(state) {
        if (!state || !state.p) return false;
        this.lastState = state;
        this.stateTime = Number.isFinite(state.time) ? state.time : this.stateTime;
        this.syncSerial += 1;
        this.applyQuality(false);
        this.handleResize(this.scale.width, this.scale.height);

        const p = state.p;
        this.targetCamera.x = Number(p.x) || 0;
        this.targetCamera.y = Number(p.y) || 0;
        if (!this.targetCamera.initialized || reducedMotion) {
          this.cameras.main.centerOn?.(this.targetCamera.x, this.targetCamera.y);
          this.targetCamera.initialized = true;
        }

        this.syncBackgrounds(p);
        this.syncPlayer(state, p);
        this.syncEnemies(state, p);
        this.syncCompanions(state, p);
        this.drawTransientObjects(state, p);
        this.syncCameraSignals(state);
        this.applyAnimationPause(state.mode !== 'run');
        return true;
      }

      sampleMotion(key, entity) {
        const x = Number(entity?.x) || 0;
        const y = Number(entity?.y) || 0;
        const sampleTime = Number.isFinite(this.stateTime) ? this.stateTime : global.performance?.now?.() / 1000 || 0;
        let track = this.actorTracks.get(key);
        if (!track) {
          track = { x, y, time: sampleTime, vx: 0, vy: 0, facing: 1, attackCd: Number(entity?.attackCd) || 0, attackUntil: 0 };
          this.actorTracks.set(key, track);
          return track;
        }
        const dt = Math.max(1 / 240, Math.min(0.12, sampleTime - track.time || 1 / 60));
        const vx = (x - track.x) / dt;
        const vy = (y - track.y) / dt;
        track.vx += (vx - track.vx) * Math.min(1, dt * 14);
        track.vy += (vy - track.vy) * Math.min(1, dt * 14);
        if (Math.abs(track.vx) > 6) track.facing = track.vx < 0 ? -1 : 1;
        const attackCd = Number(entity?.attackCd);
        if (Number.isFinite(attackCd) && attackCd > track.attackCd + 0.2) track.attackUntil = sampleTime + 0.2;
        track.attackCd = Number.isFinite(attackCd) ? attackCd : track.attackCd;
        track.x = x;
        track.y = y;
        track.time = sampleTime;
        return track;
      }

      inferredState(role, entity, track) {
        const explicit = explicitActorState(entity);
        if (explicit) return explicit;
        if ((Number(entity?.hitFlash) || 0) > 0 || (role === 'mogu' && (Number(entity?.invuln) || 0) > 0.36)) return 'hurt';
        if (role === 'boss') {
          if ((Number(entity?.telegraphTimer) || 0) > 0 || (Number(entity?.warningTimer) || 0) > 0) return 'telegraph';
          if ((Number(entity?.recoverTimer) || 0) > 0 || (Number(entity?.stunTimer) || 0) > 0) return 'recover';
        }
        if (track && this.stateTime < (track.attackUntil || 0)) return 'attack';
        if (role === 'mogu') {
          const rate = Math.max(0.01, Number(entity?.attackRate) || 0.65);
          if ((Number(entity?.attackCd) || 0) > rate * 0.72) return 'attack';
        }
        if (entity?.behavior === 'charge' && (Number(entity?.chargeCd) || 0) < 0.43) return 'attack';
        if (Math.hypot(track?.vx || 0, track?.vy || 0) > 12) return 'move';
        return 'idle';
      }

      actorVariant(role, entity) {
        const requested = String(entity?.spriteVariant || entity?.visualVariant || '').toLowerCase();
        const variants = this.variantLayouts[role] || {};
        if (requested && variants[requested]) return requested;
        if (role === 'boss') {
          const phase = entity?.phase2 || Number(entity?.phase) >= 2 ? 'phase2' : 'phase1';
          return variants[phase] ? phase : Object.keys(variants)[0] || 'default';
        }
        if (role === 'enemy') {
          const behavior = String(entity?.behavior || '').toLowerCase();
          const variant = behavior === 'swarm' ? 'bat' : behavior === 'tank' ? 'stone' : behavior === 'ranged' ? 'ghost' : 'soft';
          return variants[variant] ? variant : Object.keys(variants)[0] || 'default';
        }
        return 'default';
      }

      setActorAnimation(sprite, role, requestedState, requestedVariant = 'default') {
        const variant = this.variantLayouts[role]?.[requestedVariant] ? requestedVariant : 'default';
        let stateName = requestedState || 'idle';
        const layout = this.variantLayouts[role]?.[variant] || this.layouts[role] || {};
        if (!layout[stateName]) stateName = STATE_ALIASES[role]?.[stateName] || 'idle';
        if (!layout[stateName]) stateName = Object.keys(layout)[0] || 'idle';
        const marker = `${variant}:${stateName}`;
        if (sprite.moguriaState === marker) return;
        sprite.moguriaState = marker;
        const key = actorAnimationKey(role, stateName, variant);
        const defaultKey = actorAnimationKey(role, stateName, 'default');
        if (this.anims.exists?.(key)) sprite.play?.(key, true);
        else if (this.anims.exists?.(defaultKey)) sprite.play?.(defaultKey, true);
        else {
          const frame = frameNumbers(layout[stateName], Infinity)[0];
          if (Number.isFinite(frame) && sprite.texture?.has?.(frame)) sprite.setFrame?.(frame);
        }
      }

      syncBackgrounds(p) {
        const x = reducedMotion ? 0 : Number(p.x) || 0;
        const y = reducedMotion ? 0 : Number(p.y) || 0;
        const centerX = Math.max(1, Number(this.scale?.width) || 390) / 2;
        const centerY = Math.max(1, Number(this.scale?.height) || 844) / 2;
        for (let index = 0; index < this.backgroundLayers.length; index++) {
          const layer = this.backgroundLayers[index];
          const factor = Number(layer.parallaxFactor) || 0;
          layer.setPosition?.(
            centerX - x * factor * 0.05,
            centerY - y * factor * 0.035 + index * 2
          );
        }
      }

      syncPlayer(state, p) {
        const sprite = this.playerSprite;
        const track = this.sampleMotion('player', p);
        sprite.setPosition(Number(p.x) || 0, Number(p.y) || 0);
        sprite.setFlipX?.(track.facing < 0);
        // Atlas cells contain generous transparent breathing room. 126px keeps
        // the painted Mogu itself near the approved 84–96px visual size while
        // leaving the authoritative 15px collision radius untouched.
        sprite.setDisplaySize?.(126, 126);
        sprite.setDepth?.(40 + (Number(p.y) || 0) * 0.001);
        sprite.setAlpha?.((Number(p.invuln) || 0) > 0 && !reducedMotion ? 0.78 : 1);
        const stateName = this.inferredState('mogu', p, track);
        this.setActorAnimation(sprite, 'mogu', stateName, this.actorVariant('mogu', p));
        this.applyProceduralActorMotion(sprite, 'mogu', p, stateName, 'player');
      }

      syncEnemies(state, player) {
        const seen = new Set();
        for (const entity of state.enemies || []) {
          if (!entity || (Number(entity.hp) || 0) <= 0) continue;
          const id = String(entity.id ?? `enemy-${seen.size}`);
          seen.add(id);
          const boss = entity.kind === 'boss' || entity.kind === 'midBoss';
          const role = boss ? 'boss' : 'enemy';
          let record = this.enemySprites.get(id);
          if (!record || record.role !== role) {
            record?.sprite?.destroy?.();
            const radius = Math.max(10, Number(entity.r) || 16);
            const sprite = this.createActorSprite(role, id, boss ? radius * 5.15 : radius * 4.35);
            record = { sprite, role, retiring: false };
            this.enemySprites.set(id, record);
          }
          record.retiring = false;
          const sprite = record.sprite;
          const track = this.sampleMotion(`enemy:${id}`, entity);
          const radius = Math.max(10, Number(entity.r) || 16);
          const size = boss ? Math.max(184, radius * 5.15) : Math.max(68, radius * 4.35);
          sprite.setPosition(Number(entity.x) || 0, Number(entity.y) || 0);
          sprite.setDisplaySize?.(size, size);
          sprite.setFlipX?.(!boss && track.facing < 0);
          sprite.setDepth?.(30 + (Number(entity.y) || 0) * 0.001);
          sprite.setAlpha?.((Number(entity.hitFlash) || 0) > 0 ? 0.76 : 1);
          if (entity.kind === 'rare') sprite.setTint?.(0xffd978);
          else if (entity.kind === 'midBoss') sprite.setTint?.(0xd9c4ff);
          else sprite.clearTint?.();
          const stateName = this.inferredState(role, entity, track);
          this.setActorAnimation(sprite, role, stateName, this.actorVariant(role, entity));
          this.applyProceduralActorMotion(sprite, role, entity, stateName, id);
        }

        for (const [id, record] of this.enemySprites.entries()) {
          if (seen.has(id) || record.retiring) continue;
          record.retiring = true;
          this.actorTracks.delete(`enemy:${id}`);
          if (reducedMotion || currentQuality() === 'low' || !this.tweens?.add) {
            record.sprite.destroy?.();
            this.enemySprites.delete(id);
            continue;
          }
          this.tweens.add({
            targets: record.sprite,
            alpha: 0,
            scaleX: (record.sprite.scaleX || 1) * 0.82,
            scaleY: (record.sprite.scaleY || 1) * 0.82,
            duration: 210,
            ease: 'Quad.easeOut',
            onComplete: () => {
              record.sprite.destroy?.();
              this.enemySprites.delete(id);
            }
          });
        }
      }

      syncCompanions(state, p) {
        const explicit = Array.isArray(state.companions) ? state.companions : null;
        const count = explicit
          ? Math.min(MAX_COMPANIONS, explicit.length)
          : Math.min(MAX_COMPANIONS, Math.max(0, Math.floor(Number(p.summons) || 0)));
        const nextOrigins = [];
        const seen = new Set();
        for (let index = 0; index < count; index++) {
          const entity = explicit?.[index] || null;
          const id = String(entity?.id ?? `derived-${index}`);
          seen.add(id);
          const phase = reducedMotion
            ? -0.62 + index * TAU / Math.max(1, count)
            : this.stateTime * 0.86 + index * TAU / Math.max(1, count);
          const x = entity && Number.isFinite(Number(entity.x)) ? Number(entity.x) : (Number(p.x) || 0) + Math.cos(phase) * 58;
          const y = entity && Number.isFinite(Number(entity.y)) ? Number(entity.y) : (Number(p.y) || 0) + Math.sin(phase) * 32;
          const visualEntity = { ...(entity || { attackCd: p.summonCd, attackRate: p.summonRate }), x, y };
          const track = this.sampleMotion(`companion:${id}`, visualEntity);
          let sprite = this.companionSprites.get(id);
          if (!sprite) {
            sprite = this.createActorSprite('companion', id, 60);
            this.companionSprites.set(id, sprite);
          }
          const depthScale = 0.88 + ((Math.sin(phase) + 1) * 0.06);
          sprite.setPosition(x, y);
          sprite.setDisplaySize?.(60 * depthScale, 60 * depthScale);
          sprite.setFlipX?.(track.facing < 0);
          sprite.setDepth?.((y >= (Number(p.y) || 0) ? 45 : 35) + y * 0.001);
          const stateName = entity
            ? this.inferredState('companion', entity, track)
            : ((Number(p.summonCd) || 0) > Math.max(0.05, Number(p.summonRate) || 1.1) * 0.58 ? 'attack' : 'move');
          this.setActorAnimation(sprite, 'companion', stateName, this.actorVariant('companion', visualEntity));
          this.applyProceduralActorMotion(sprite, 'companion', visualEntity, stateName, id);
          nextOrigins.push(Object.freeze({
            id,
            index,
            x,
            y,
            facing: track.facing,
            attackX: x + track.facing * 14,
            attackY: y - 4
          }));
        }
        for (const [id, sprite] of this.companionSprites.entries()) {
          if (seen.has(id)) continue;
          sprite.destroy?.();
          this.companionSprites.delete(id);
          this.actorTracks.delete(`companion:${id}`);
        }
        companionOrigins = nextOrigins;
      }

      applyProceduralActorMotion(sprite, role, entity, stateName, id) {
        if (!sprite || reducedMotion) {
          sprite?.setRotation?.(0);
          return;
        }
        const seed = String(id || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) * 0.017;
        const time = this.stateTime + seed;
        const boss = role === 'boss';
        const moving = stateName === 'move';
        const attacking = stateName === 'attack' || stateName === 'telegraph' || stateName === 'skill';
        const hurt = stateName === 'hurt';
        const bob = Math.sin(time * (boss ? 2.5 : moving ? 8.2 : 3.8));
        const baseY = Number(entity?.y) || 0;
        sprite.y = baseY + bob * (boss ? 3.4 : moving ? 2.8 : 1.7);
        sprite.setRotation?.(hurt ? Math.sin(time * 34) * 0.045 : attacking ? Math.sin(time * 10) * 0.025 : bob * 0.012);
        const pulse = attacking ? 1 + Math.max(0, Math.sin(time * 10)) * 0.045 : 1 + bob * (boss ? 0.018 : 0.012);
        sprite.setScale?.(Math.abs(sprite.scaleX || 1) * pulse, Math.abs(sprite.scaleY || 1) * (2 - pulse));
      }

      drawTransientObjects(state, p) {
        const quality = currentQuality();
        const projectileBudget = quality === 'low' ? 52 : quality === 'medium' ? 76 : 110;
        const effectBudget = quality === 'low' ? 30 : quality === 'medium' ? 58 : 100;
        this.projectileGraphics.clear();
        this.dropGraphics.clear();
        this.effectGraphics.clear();
        this.statusGraphics.clear();

        let drawn = 0;
        for (const bullet of state.bullets || []) {
          if (drawn++ >= projectileBudget) break;
          const x = Number(bullet.x) || 0;
          const y = Number(bullet.y) || 0;
          const radius = Math.max(3, Number(bullet.r) || 5);
          const color = bullet.summon ? 0xffc77e : bullet.split ? 0xd8c2ff : 0xffed9a;
          this.projectileGraphics.lineStyle(2, color, 0.34);
          this.projectileGraphics.lineBetween(x - (Number(bullet.vx) || 0) * 0.025, y - (Number(bullet.vy) || 0) * 0.025, x, y);
          this.projectileGraphics.fillStyle(color, 0.94);
          this.projectileGraphics.fillCircle(x, y, radius + 2);
        }
        for (const bullet of state.enemyBullets || []) {
          if (drawn++ >= projectileBudget) break;
          const x = Number(bullet.x) || 0;
          const y = Number(bullet.y) || 0;
          const radius = Math.max(4, Number(bullet.r) || 5);
          this.projectileGraphics.fillStyle(0xb19ad8, 0.92);
          this.projectileGraphics.fillCircle(x, y, radius + 2);
          this.projectileGraphics.lineStyle(2, 0xf2d8ff, 0.48);
          this.projectileGraphics.strokeCircle(x, y, radius + 5);
        }

        for (const drop of (state.drops || []).slice(-(quality === 'low' ? 60 : 110))) {
          const x = Number(drop.x) || 0;
          const y = Number(drop.y) || 0;
          if (drop.kind === 'heal') {
            this.dropGraphics.fillStyle(0x95e18a, 0.94);
            this.dropGraphics.fillCircle(x, y, 8);
            this.dropGraphics.fillStyle(0xffffff, 0.82);
            this.dropGraphics.fillRect(x - 1.5, y - 6, 3, 12);
            this.dropGraphics.fillRect(x - 6, y - 1.5, 12, 3);
          } else {
            this.drawStar(this.dropGraphics, x, y, drop.rare ? 11 : 8, drop.rare ? 5 : 3.5, 0xffe68b, 0.95);
          }
        }

        for (const mine of state.mines || []) {
          this.drawStar(this.dropGraphics, Number(mine.x) || 0, Number(mine.y) || 0, Math.max(10, Number(mine.r) || 16), 6, 0xffb36a, 0.78);
        }

        const enemies = state.enemies || [];
        for (const enemy of enemies) {
          const x = Number(enemy.x) || 0;
          const y = Number(enemy.y) || 0;
          const radius = Math.max(10, Number(enemy.r) || 16);
          if ((Number(enemy.poison) || 0) > 0) {
            this.statusGraphics.lineStyle(2, 0xb77ae0, 0.58);
            this.statusGraphics.strokeCircle(x, y, radius + 8);
          }
          if ((Number(enemy.slow) || 0) > 0) {
            this.statusGraphics.lineStyle(2, 0x9fe5ff, 0.64);
            this.statusGraphics.strokeCircle(x, y, radius + 11);
          }
          if (enemy.kind === 'rare') {
            const rarePulse = reducedMotion ? 0 : Math.sin(this.stateTime * 7) * 0.12;
            this.statusGraphics.lineStyle(3, 0xffdd72, 0.72 + rarePulse);
            this.statusGraphics.strokeCircle(x, y, radius + 13);
            this.drawStar(this.statusGraphics, x, y - radius - 18, 7, 3.2, 0xffe68b, 0.96);
          }
          if ((Number(enemy.maxHp) || 0) > 40) this.drawHpBar(enemy);
        }
        this.drawPlayerStatus(state, p);
        this.drawDirectionIndicators(state, p);
        this.syncFloatingTexts(state);
        if ((Number(p.auraRadius) || 0) > 0) {
          this.statusGraphics.lineStyle(3, 0x9aeeb7, 0.25);
          this.statusGraphics.strokeCircle(Number(p.x) || 0, Number(p.y) || 0, Number(p.auraRadius));
        }

        if (!reducedMotion) {
          let effects = 0;
          for (const fx of state.fx || []) {
            if (effects++ >= effectBudget) break;
            this.drawEffect(fx);
          }
          for (const particle of (state.particles || []).slice(-effectBudget)) {
            const life = Math.max(0.08, Math.min(1, (Number(particle.life) || 0.2) / 0.55));
            this.effectGraphics.fillStyle(this.colorNumber(particle.color, 0xffed9a), life);
            this.effectGraphics.fillCircle(Number(particle.x) || 0, Number(particle.y) || 0, Math.max(1, Number(particle.r) || 2));
          }
        }
      }

      drawPlayerStatus(state, player) {
        const x = Number(player.x) || 0;
        const y = Number(player.y) || 0;
        const pct = Math.max(0, Math.min(1, (Number(player.hp) || 0) / Math.max(1, Number(player.maxHp) || 1)));
        const width = 64;
        const top = y - 62;
        this.statusGraphics.fillStyle(0x070612, 0.72);
        this.statusGraphics.fillRoundedRect(x - width / 2, top, width, 7, 3);
        this.statusGraphics.fillStyle(pct < 0.28 ? 0xff7895 : 0x86e495, 0.96);
        this.statusGraphics.fillRoundedRect(x - width / 2, top, width * pct, 7, 3);
        this.statusGraphics.lineStyle(1, 0xffefc4, 0.48);
        this.statusGraphics.strokeRoundedRect(x - width / 2, top, width, 7, 3);
        if ((Number(state.dangerPulse) || 0) > 0) {
          this.statusGraphics.lineStyle(3, 0xff7895, Math.min(0.72, Number(state.dangerPulse)));
          this.statusGraphics.strokeCircle(x, y, 42 + (reducedMotion ? 0 : Math.sin(this.stateTime * 11) * 3));
        }
        if ((Number(state.awakenTimer) || 0) > 0 || (Number(state.returnGlow) || 0) > 0) {
          const strength = Math.min(0.8, Math.max(Number(state.awakenTimer) || 0, Number(state.returnGlow) || 0) / 2.2);
          this.statusGraphics.lineStyle(4, 0xffe68b, strength);
          this.statusGraphics.strokeCircle(x, y, 50 + (reducedMotion ? 0 : Math.sin(this.stateTime * 7) * 5));
          this.drawStar(this.statusGraphics, x, y - 72, 8, 3.6, 0xffe68b, strength);
        }
      }

      drawDirectionIndicators(state, player) {
        const view = this.cameras.main?.worldView;
        if (!view) return;
        const margin = 46;
        const left = Number(view.x) + margin;
        const right = Number(view.x) + Number(view.width) - margin;
        const top = Number(view.y) + margin + 44;
        const bottom = Number(view.y) + Number(view.height) - margin - 72;
        for (const entity of state.enemies || []) {
          if (!entity || !['rare', 'boss', 'midBoss'].includes(entity.kind)) continue;
          const ex = Number(entity.x) || 0;
          const ey = Number(entity.y) || 0;
          if (ex >= left && ex <= right && ey >= top && ey <= bottom) continue;
          const dx = ex - (Number(player.x) || 0);
          const dy = ey - (Number(player.y) || 0);
          const length = Math.hypot(dx, dy) || 1;
          const ux = dx / length;
          const uy = dy / length;
          const playerX = Number(player.x) || 0;
          const playerY = Number(player.y) || 0;
          const tx = ux === 0 ? Infinity : (ux > 0 ? (right - playerX) / ux : (left - playerX) / ux);
          const ty = uy === 0 ? Infinity : (uy > 0 ? (bottom - playerY) / uy : (top - playerY) / uy);
          const distance = Math.max(0, Math.min(Math.abs(tx), Math.abs(ty)));
          const x = playerX + ux * distance;
          const y = playerY + uy * distance;
          const color = entity.kind === 'rare' ? 0xffdf72 : 0xd4a0ff;
          const size = entity.kind === 'rare' ? 12 : 15;
          const px = -uy;
          const py = ux;
          this.statusGraphics.fillStyle(color, 0.94);
          this.statusGraphics.fillTriangle(
            x + ux * size,
            y + uy * size,
            x - ux * size * 0.72 + px * size * 0.72,
            y - uy * size * 0.72 + py * size * 0.72,
            x - ux * size * 0.72 - px * size * 0.72,
            y - uy * size * 0.72 - py * size * 0.72
          );
          this.statusGraphics.lineStyle(2, 0x171025, 0.78);
          this.statusGraphics.strokeCircle(x, y, size + 5);
          if (entity.kind === 'rare') this.drawStar(this.statusGraphics, x, y, 6, 2.8, 0xffffff, 0.94);
        }
      }

      syncFloatingTexts(state) {
        const seen = new Set();
        for (const fx of state.fx || []) {
          if (fx?.type !== 'text' || !fx.text) continue;
          let fallbackId = fx && typeof fx === 'object' ? this.floatingTextIds.get(fx) : null;
          if (!fallbackId && fx && typeof fx === 'object') {
            fallbackId = `text_${++this.floatingTextSerial}`;
            this.floatingTextIds.set(fx, fallbackId);
          }
          const id = String(fx.id || fallbackId || `text_${++this.floatingTextSerial}`);
          seen.add(id);
          let label = this.floatingTexts.get(id);
          if (!label) {
            label = this.add.text(Number(fx.x) || 0, Number(fx.y) || 0, String(fx.text), {
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: '17px',
              fontStyle: 'bold',
              color: typeof fx.color === 'string' ? fx.color : '#fff4dc',
              stroke: '#171025',
              strokeThickness: 4,
              align: 'center'
            }).setOrigin(0.5).setDepth(82);
            this.floatingTexts.set(id, label);
          }
          const life = Math.max(0, Math.min(1, (Number(fx.life) || 0) / 0.55));
          label.setPosition?.(Number(fx.x) || 0, (Number(fx.y) || 0) - (reducedMotion ? 0 : (1 - life) * 28));
          label.setAlpha?.(Math.min(1, life * 1.8));
        }
        for (const [id, label] of this.floatingTexts.entries()) {
          if (seen.has(id)) continue;
          label.destroy?.();
          this.floatingTexts.delete(id);
        }
      }

      drawHpBar(entity) {
        const x = Number(entity.x) || 0;
        const y = Number(entity.y) || 0;
        const radius = Math.max(10, Number(entity.r) || 16);
        const boss = entity.kind === 'boss' || entity.kind === 'midBoss';
        const width = boss ? Math.max(88, radius * 2.5) : Math.max(34, radius * 2.1);
        const pct = Math.max(0, Math.min(1, (Number(entity.hp) || 0) / Math.max(1, Number(entity.maxHp) || 1)));
        const top = y - (boss ? radius * 2.05 : radius * 1.85);
        this.statusGraphics.fillStyle(0x070612, 0.6);
        this.statusGraphics.fillRoundedRect(x - width / 2, top, width, 6, 3);
        this.statusGraphics.fillStyle(boss ? 0xd09bff : 0xffe793, 0.95);
        this.statusGraphics.fillRoundedRect(x - width / 2, top, width * pct, 6, 3);
      }

      drawEffect(fx) {
        const x = Number(fx?.x) || 0;
        const y = Number(fx?.y) || 0;
        const radius = Math.max(8, Number(fx?.r) || 24);
        const life = Math.max(0.06, Math.min(1, Number(fx?.life) || 0.2));
        if (fx?.type === 'text') return;
        if (fx?.type === 'bossTelegraph') {
          const rawTargetX = Number(fx.tx);
          const rawTargetY = Number(fx.ty);
          const targetX = Number.isFinite(rawTargetX) ? rawTargetX : x;
          const targetY = Number.isFinite(rawTargetY) ? rawTargetY : y;
          const maxLife = Math.max(0.06, Number(fx.maxLife) || 1);
          const progress = Math.max(0, Math.min(1, 1 - (Number(fx.life) || 0) / maxLife));
          const alpha = 0.32 + progress * 0.56;
          const pattern = String(fx.pattern || '');
          if (pattern === 'dash') {
            const dx = targetX - x;
            const dy = targetY - y;
            const length = Math.hypot(dx, dy) || 1;
            const px = -dy / length * 18;
            const py = dx / length * 18;
            this.effectGraphics.lineStyle(4, 0xd6a3ff, alpha);
            this.effectGraphics.lineBetween(x + px, y + py, targetX + px, targetY + py);
            this.effectGraphics.lineBetween(x - px, y - py, targetX - px, targetY - py);
            this.effectGraphics.strokeCircle(targetX, targetY, 24);
          } else if (pattern === 'slam') {
            this.effectGraphics.lineStyle(6, 0xd6a3ff, alpha);
            this.effectGraphics.strokeCircle(x, y, radius);
            this.effectGraphics.lineStyle(2, 0xffe2a1, alpha * 0.72);
            this.effectGraphics.strokeCircle(x, y, radius * 0.72);
          } else if (pattern === 'nova') {
            this.effectGraphics.lineStyle(5, 0xd6a3ff, alpha);
            this.effectGraphics.strokeCircle(x, y, radius);
            for (let ray = 0; ray < 12; ray++) {
              const angle = ray * TAU / 12;
              this.effectGraphics.lineBetween(x + Math.cos(angle) * radius * 0.35, y + Math.sin(angle) * radius * 0.35, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
            }
          } else {
            const angle = Math.atan2(targetY - y, targetX - x);
            this.effectGraphics.lineStyle(4, 0xd6a3ff, alpha);
            for (const offset of [-0.44, -0.22, 0, 0.22, 0.44]) {
              this.effectGraphics.lineBetween(x, y, x + Math.cos(angle + offset) * 210, y + Math.sin(angle + offset) * 210);
            }
          }
          return;
        }
        if (fx?.type === 'lightning' || fx?.type === 'meteor' || fx?.type === 'absorb') {
          this.effectGraphics.lineStyle(fx.type === 'lightning' ? 4 : 3, fx.type === 'lightning' ? 0xbfefff : 0xffe39a, Math.min(0.9, life * 2));
          this.effectGraphics.lineBetween(x, y, Number(fx.tx) || x, Number(fx.ty) || y);
          return;
        }
        const color = fx?.type?.includes?.('boss') ? 0xd1a0ff : fx?.type === 'boom' ? 0xffbd72 : 0xffefa2;
        this.effectGraphics.lineStyle(fx?.type === 'boom' ? 6 : 3, color, Math.min(0.85, life * 1.6));
        this.effectGraphics.strokeCircle(x, y, radius * (1.08 - life * 0.18));
      }

      drawStar(graphics, x, y, outer, inner, color, alpha) {
        graphics.fillStyle(color, alpha);
        graphics.beginPath();
        for (let point = 0; point < 10; point++) {
          const angle = -Math.PI / 2 + point * Math.PI / 5;
          const radius = point % 2 ? inner : outer;
          const px = x + Math.cos(angle) * radius;
          const py = y + Math.sin(angle) * radius;
          if (point === 0) graphics.moveTo(px, py);
          else graphics.lineTo(px, py);
        }
        graphics.closePath();
        graphics.fillPath();
      }

      colorNumber(value, fallback) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
          const match = value.trim().match(/^#([0-9a-f]{6})$/i);
          if (match) return parseInt(match[1], 16);
        }
        return fallback;
      }

      syncCameraSignals(state) {
        const shake = Number(state.shake) || 0;
        const flash = Number(state.flash) || 0;
        const bossPhase = Number(state.bossPhaseTimer) || 0;
        if (shake > this.lastCameraSignal.shake + 1.2) this.cameraFx('shake', { duration: 100, intensity: Math.min(0.012, shake / 900) });
        if (flash > this.lastCameraSignal.flash + 0.045) this.cameraFx('flash', { duration: 90, alpha: Math.min(0.28, flash) });
        if (bossPhase > this.lastCameraSignal.bossPhase + 0.5) this.cameraFx('zoom', { zoom: 1.045, duration: 180, hold: 170 });
        this.lastCameraSignal.shake = shake;
        this.lastCameraSignal.flash = flash;
        this.lastCameraSignal.bossPhase = bossPhase;

        const event = state.cameraEvent || state.cameraFxEvent;
        const eventId = event?.id ?? event?.eventId ?? null;
        if (event && (eventId == null || eventId !== this.lastCameraSignal.eventId)) {
          this.cameraFx(event.type || event.name, event);
          this.lastCameraSignal.eventId = eventId;
        }
      }

      cameraFx(type, options) {
        options = clonePlain(options);
        type = String(type || options.type || '').toLowerCase();
        const camera = this.cameras.main;
        if (!camera || !type) return false;
        if (reducedMotion && (type === 'shake' || type === 'zoom')) return false;
        if (type === 'shake') {
          camera.shake?.(Math.max(40, Number(options.duration) || 120), Math.max(0.001, Number(options.intensity) || 0.007), true);
          return true;
        }
        if (type === 'flash') {
          const color = this.colorNumber(options.color, 0xffedb2);
          const red = (color >> 16) & 255;
          const green = (color >> 8) & 255;
          const blue = color & 255;
          camera.flash?.(Math.max(40, Number(options.duration) || 100), red, green, blue, false, null, null, Math.max(0.04, Number(options.alpha) || 0.18));
          return true;
        }
        if (type === 'zoom') {
          const zoom = Math.max(0.92, Math.min(1.16, Number(options.zoom) || 1.04));
          const duration = Math.max(60, Number(options.duration) || 180);
          camera.zoomTo?.(zoom, duration, options.ease || 'Sine.easeOut', true);
          this.time.delayedCall?.(duration + Math.max(0, Number(options.hold) || 120), () => {
            if (!this.sys?.isActive?.()) return;
            camera.zoomTo?.(1, duration, options.ease || 'Sine.easeInOut', true);
          });
          return true;
        }
        return false;
      }

      flushCameraFx() {
        const queued = pendingCameraFx;
        pendingCameraFx = [];
        for (const request of queued) this.cameraFx(request.type, request.options);
      }

      applyAnimationPause(paused) {
        const shouldPause = paused || reducedMotion;
        const quality = currentQuality();
        const qualityScale = quality === 'low' ? 0.72 : quality === 'medium' ? 0.88 : 1;
        const sprites = [this.playerSprite, ...[...this.enemySprites.values()].map(record => record.sprite), ...this.companionSprites.values()];
        const signature = `${shouldPause}:${quality}:${sprites.length}`;
        if (signature === this.animationPauseSignature) return;
        this.animationPauseSignature = signature;
        for (const sprite of sprites) {
          if (!sprite?.anims) continue;
          sprite.anims.timeScale = shouldPause ? 0 : qualityScale;
          if (shouldPause) sprite.anims.pause?.();
          else sprite.anims.resume?.();
        }
      }

      applyMotionPreference() {
        this.applyAnimationPause(this.lastState?.mode !== 'run');
        if (reducedMotion) this.cameras.main.resetFX?.();
      }

      applyQuality(force) {
        const quality = currentQuality();
        if (!force && quality === this.appliedQuality) return;
        this.appliedQuality = quality;
        const foreground = this.backgroundLayers[3];
        if (foreground) {
          foreground.setVisible?.(quality !== 'low');
          foreground.setAlpha?.(quality === 'medium' ? foreground.baseAlpha * 0.72 : foreground.baseAlpha);
        }
        const middle = this.backgroundLayers[1];
        if (middle) middle.setAlpha?.(quality === 'low' ? middle.baseAlpha * 0.58 : middle.baseAlpha);
        const ground = this.backgroundLayers[2];
        if (ground) ground.setAlpha?.(quality === 'low' ? ground.baseAlpha * 0.72 : ground.baseAlpha);
        this.applyAnimationPause(this.lastState?.mode !== 'run');
      }

      update(time, delta) {
        if (!running) return;
        const frameDelta = Math.max(0, Math.min(maxDeltaSeconds, (Number(delta) || 0) / 1000));
        if (coreStep && !coreStepping) {
          coreStepping = true;
          try {
            const nextState = coreStep(frameDelta, Number(time) || 0, pendingState);
            if (nextState && typeof nextState === 'object') pendingState = nextState;
            lastCoreStepError = null;
          } catch (error) {
            lastCoreStepError = error;
            // Disable a failed callback so Phaser can keep the last valid frame
            // alive instead of throwing once per animation frame.
            coreStep = null;
            global.console?.error?.('[MoguriaBattleV3] core step failed', error);
          } finally {
            coreStepping = false;
          }
        }
        if (pendingState?.p) this.syncState(pendingState);
        if (!this.targetCamera.initialized) return;
        const camera = this.cameras.main;
        if (reducedMotion) {
          camera.centerOn?.(this.targetCamera.x, this.targetCamera.y);
          return;
        }
        const desiredX = this.targetCamera.x - camera.width / (2 * Math.max(0.001, camera.zoom || 1));
        const desiredY = this.targetCamera.y - camera.height / (2 * Math.max(0.001, camera.zoom || 1));
        const blend = 1 - Math.exp(-Math.max(0, Number(delta) || 16) / 46);
        camera.scrollX += (desiredX - camera.scrollX) * blend;
        camera.scrollY += (desiredY - camera.scrollY) * blend;
      }

      releaseSceneObjects() {
        companionOrigins = [];
        fallbackAssets = [];
        this.enemySprites.clear();
        this.companionSprites.clear();
        this.actorTracks.clear();
        for (const label of this.floatingTexts.values()) label.destroy?.();
        this.floatingTexts.clear();
      }
    };
  }

  function boot(options = {}) {
    if (ready && phaserGame && sceneRef) return Promise.resolve(global.MoguriaBattleV3);
    if (bootPromise) return bootPromise;
    const Phaser = global.Phaser;
    if (!Phaser?.Game || !Phaser?.Scene) {
      return Promise.reject(new Error('Moguria Battle V3 requires the Phaser 4.2.1 global build.'));
    }
    const parent = typeof options.parent === 'string'
      ? document.querySelector(options.parent)
      : options.parent || document.getElementById('game');
    if (!parent) return Promise.reject(new Error('Moguria Battle V3 could not find #game.'));
    const initialLayout = layoutSize(parent);

    runtimeOptions = {
      assets: mergeAssets(options.assets),
      layouts: mergeLayouts(options.layouts),
      layoutOverrides: clonePlain(options.layouts)
    };
    if (typeof options.step === 'function') coreStep = options.step;
    maxDeltaSeconds = Math.max(1 / 240, Math.min(0.1, Number(options.maxDeltaSeconds) || 1 / 30));
    running = options.autoStart === true;
    hostEl = ensureHost(parent);
    suppressLegacyLayers();
    installEnvironmentListeners();

    const pendingBoot = new Promise((resolve, reject) => {
      resolveBoot = resolve;
      rejectBoot = reject;
    });
    bootPromise = pendingBoot;

    const SceneClass = createSceneClass(Phaser);
    try {
      phaserGame = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostEl,
        width: initialLayout.width,
        height: initialLayout.height,
        resolution: safeResolution(),
        transparent: false,
        backgroundColor: '#070819',
        antialias: true,
        pixelArt: false,
        banner: false,
        audio: { noAudio: true },
        input: { keyboard: false, mouse: false, touch: false, gamepad: false },
        render: {
          antialias: true,
          antialiasGL: true,
          roundPixels: false,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: false,
          failIfMajorPerformanceCaveat: false
        },
        scale: {
          mode: Phaser.Scale?.RESIZE,
          autoCenter: Phaser.Scale?.CENTER_BOTH,
          width: initialLayout.width,
          height: initialLayout.height
        },
        fps: { target: 60, min: 30, smoothStep: true },
        scene: [SceneClass],
        callbacks: { postBoot: configureCanvas }
      });
    } catch (error) {
      const reject = rejectBoot;
      rejectBoot = null;
      resolveBoot = null;
      bootPromise = null;
      removeEnvironmentListeners();
      restoreLegacyLayers();
      reject?.(error);
    }
    return pendingBoot;
  }

  function start(state, options = {}) {
    if (state) pendingState = state;
    if (typeof options.step === 'function') coreStep = options.step;
    if (Number.isFinite(Number(options.maxDeltaSeconds))) {
      maxDeltaSeconds = Math.max(1 / 240, Math.min(0.1, Number(options.maxDeltaSeconds)));
    }
    running = true;
    if (hostEl) hostEl.style.display = 'block';
    suppressLegacyLayers();
    const begin = () => {
      phaserGame?.loop?.wake?.();
      sceneRef?.scene?.setVisible?.(true);
      sceneRef?.scene?.resume?.();
      if (pendingState) sceneRef?.syncState?.(pendingState);
      configureCanvas();
      return global.MoguriaBattleV3;
    };
    if (ready) return Promise.resolve(begin());
    return boot({ ...options, autoStart: true }).then(begin).catch(error => {
      running = false;
      coreStep = null;
      if (hostEl) hostEl.style.display = 'none';
      restoreLegacyLayers();
      throw error;
    });
  }

  function stop(options = {}) {
    running = false;
    coreStep = null;
    coreStepping = false;
    pendingState = null;
    companionOrigins = [];
    sceneRef?.scene?.pause?.();
    sceneRef?.scene?.setVisible?.(false);
    phaserGame?.loop?.sleep?.();
    if (hostEl) hostEl.style.display = 'none';
    global.document?.body?.classList?.remove?.('battle-v3-active');
    if (options.destroy === true) {
      const oldGame = phaserGame;
      phaserGame = null;
      sceneRef = null;
      ready = false;
      bootPromise = null;
      resolveBoot = null;
      rejectBoot = null;
      removeEnvironmentListeners();
      oldGame?.destroy?.(true);
      hostEl?.remove?.();
      hostEl = null;
    }
    if (options.restoreLegacy === true) restoreLegacyLayers();
    return true;
  }

  function sync(state) {
    pendingState = state || null;
    if (!ready || !sceneRef || !state?.p) return false;
    return sceneRef.syncState(state);
  }

  function setCoreStep(step) {
    if (step != null && typeof step !== 'function') {
      throw new TypeError('MoguriaBattleV3.setCoreStep expects a function or null.');
    }
    coreStep = step || null;
    lastCoreStepError = null;
    return !!coreStep;
  }

  function getCompanionOrigins() {
    return companionOrigins.map(origin => ({ ...origin }));
  }

  function cameraFx(type, options = {}) {
    if (type && typeof type === 'object') {
      options = type;
      type = options.type || options.name;
    }
    if (!ready || !sceneRef) {
      pendingCameraFx.push({ type, options: clonePlain(options) });
      if (pendingCameraFx.length > 12) pendingCameraFx.splice(0, pendingCameraFx.length - 12);
      return false;
    }
    return sceneRef.cameraFx(type, options);
  }

  function isReady() {
    return !!(ready && phaserGame && sceneRef);
  }

  global.MoguriaBattleV3 = Object.freeze({
    boot,
    start,
    stop,
    sync,
    setCoreStep,
    getCompanionOrigins,
    cameraFx,
    isReady,
    version: VERSION,
    getLoadErrors: () => loadErrors.slice(),
    getFallbackAssets: () => fallbackAssets.slice(),
    getLastCoreStepError: () => lastCoreStepError
  });
})(window);
