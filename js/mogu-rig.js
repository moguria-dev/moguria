/* Moguria protagonist continuous-pose controller.
 *
 * The controller is intentionally independent from Phaser. It evaluates a
 * stable pose from one neutral atlas frame, then a renderer may apply that
 * pose to any sprite-like object. Keeping animation time here (instead of in
 * the render loop) makes pause/resume, state blending and attack restarts
 * deterministic.
 */
(function (global) {
  'use strict';

  const VERSION = '1.0.0';
  const TAU = Math.PI * 2;
  const DEG_TO_RAD = Math.PI / 180;
  const MAX_DELTA_SECONDS = 0.25;
  const DEFAULT_BLEND_SECONDS = 0.12;
  const ATTACK_BLEND_SECONDS = 0.085;
  const HURT_BLEND_SECONDS = 0.045;

  const NEUTRAL_POSE = Object.freeze({
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    glow: 0,
    shadow: 1
  });

  const STATE_ALIASES = Object.freeze({
    idle: 'idle',
    recover: 'idle',
    recovery: 'idle',
    celebrate: 'idle',
    move: 'move',
    run: 'move',
    walk: 'move',
    attack: 'attack',
    skill: 'attack',
    telegraph: 'attack',
    windup: 'attack',
    slam: 'attack',
    burst: 'attack',
    attack_release: 'attack',
    hurt: 'hurt',
    hit: 'hurt',
    damage: 'hurt',
    damaged: 'hurt',
    defeat: 'defeat',
    defeated: 'defeat',
    dead: 'defeat',
    gameover: 'defeat'
  });

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, finite(value, min)));
  }

  function lerp(from, to, amount) {
    return from + ((to - from) * amount);
  }

  function smoothstep(value) {
    const amount = clamp(value, 0, 1);
    return amount * amount * (3 - (2 * amount));
  }

  function normalizeState(value) {
    const key = String(value || 'idle').trim().toLowerCase().replace(/[ -]+/g, '_');
    return STATE_ALIASES[key] || 'idle';
  }

  function normalizeQuality(value) {
    const key = String(value || 'high').toLowerCase();
    return key === 'low' || key === 'medium' ? key : 'high';
  }

  function blendDurationFor(state) {
    const normalized = normalizeState(state);
    if (normalized === 'attack') return ATTACK_BLEND_SECONDS;
    if (normalized === 'hurt') return HURT_BLEND_SECONDS;
    return DEFAULT_BLEND_SECONDS;
  }

  function pose(overrides) {
    return { ...NEUTRAL_POSE, ...(overrides || {}) };
  }

  function interpolatePose(from, to, amount) {
    const progress = clamp(amount, 0, 1);
    return {
      x: lerp(finite(from?.x), finite(to?.x), progress),
      y: lerp(finite(from?.y), finite(to?.y), progress),
      rotation: lerp(finite(from?.rotation), finite(to?.rotation), progress),
      scaleX: lerp(finite(from?.scaleX, 1), finite(to?.scaleX, 1), progress),
      scaleY: lerp(finite(from?.scaleY, 1), finite(to?.scaleY, 1), progress),
      glow: lerp(finite(from?.glow), finite(to?.glow), progress),
      shadow: lerp(finite(from?.shadow, 1), finite(to?.shadow, 1), progress)
    };
  }

  function sampleApprovedPose(state, elapsedSeconds) {
    const normalized = normalizeState(state);
    const elapsed = Math.max(0, finite(elapsedSeconds));

    if (normalized === 'idle') {
      const phase = elapsed * TAU / 1.45;
      const breath = Math.sin(phase);
      return pose({
        y: -1.7 * breath,
        rotation: 0.75 * Math.sin(phase - 0.5) * DEG_TO_RAD,
        scaleX: 1 + (0.015 * breath),
        scaleY: 1 - (0.012 * breath),
        glow: 0.16 + (0.08 * ((breath + 1) / 2))
      });
    }

    if (normalized === 'move') {
      const phase = elapsed * TAU / 0.46;
      const stride = Math.sin(phase);
      const contact = Math.abs(Math.cos(phase));
      return pose({
        x: 1.6 * stride,
        y: -4.3 * contact,
        rotation: (-3 + (2.1 * stride)) * DEG_TO_RAD,
        scaleX: 1 + (0.024 * contact),
        scaleY: 1 - (0.035 * contact),
        glow: 0.2 + (0.07 * contact)
      });
    }

    if (normalized === 'attack') {
      if (elapsed < 0.12) {
        const progress = smoothstep(elapsed / 0.12);
        return pose({
          x: lerp(0, -4, progress),
          y: lerp(0, 1.2, progress),
          rotation: lerp(0, -4.8, progress) * DEG_TO_RAD,
          scaleX: lerp(1, 1.035, progress),
          scaleY: lerp(1, 0.965, progress),
          glow: lerp(0.22, 0.45, progress)
        });
      }
      if (elapsed < 0.32) {
        const progress = smoothstep((elapsed - 0.12) / 0.2);
        return pose({
          x: lerp(-4, 9, progress),
          y: lerp(1.2, -3, progress),
          rotation: lerp(-4.8, 6.5, progress) * DEG_TO_RAD,
          scaleX: lerp(1.035, 0.965, progress),
          scaleY: lerp(0.965, 1.055, progress),
          glow: lerp(0.45, 1, progress)
        });
      }
      if (elapsed < 0.54) {
        const progress = smoothstep((elapsed - 0.32) / 0.22);
        const recoil = Math.sin(((elapsed - 0.32) * Math.PI) / 0.22);
        return pose({
          x: lerp(9, -2, progress),
          y: lerp(-3, 0, progress),
          rotation: lerp(6.5, -1.8, progress) * DEG_TO_RAD,
          scaleX: 1 + (0.025 * recoil),
          scaleY: 1 - (0.02 * recoil),
          glow: lerp(1, 0.28, progress)
        });
      }
      const progress = smoothstep(Math.min(1, (elapsed - 0.54) / 0.24));
      return pose({
        x: lerp(-2, 0, progress),
        rotation: lerp(-1.8, 0, progress) * DEG_TO_RAD,
        glow: lerp(0.28, 0.18, progress)
      });
    }

    if (normalized === 'hurt') {
      const progress = Math.min(1, elapsed / 0.16);
      const impact = Math.sin(progress * Math.PI);
      return pose({
        x: -7 * impact,
        rotation: -7 * impact * DEG_TO_RAD,
        scaleX: 1 + (0.035 * impact),
        scaleY: 1 - (0.045 * impact),
        glow: 0.1
      });
    }

    const progress = smoothstep(Math.min(1, elapsed / 0.72));
    const settle = Math.exp(-Math.max(0, elapsed - 0.72) * 2.4);
    return pose({
      x: -8 * progress,
      y: 16 * progress,
      rotation: (-32 * progress + (1.2 * Math.sin(elapsed * 5) * settle)) * DEG_TO_RAD,
      scaleX: 1 + (0.1 * progress),
      scaleY: 1 - (0.2 * progress),
      glow: 0.03,
      shadow: 1 - (0.25 * progress)
    });
  }

  function scaleMotion(source, amount, glowAmount = amount) {
    const scale = clamp(amount, 0, 1);
    const glowScale = clamp(glowAmount, 0, 1);
    return {
      x: source.x * scale,
      y: source.y * scale,
      rotation: source.rotation * scale,
      scaleX: 1 + ((source.scaleX - 1) * scale),
      scaleY: 1 + ((source.scaleY - 1) * scale),
      glow: source.glow * glowScale,
      shadow: 1 + ((source.shadow - 1) * scale)
    };
  }

  function samplePose(state, elapsedSeconds, options = {}) {
    const normalized = normalizeState(state);
    const approved = sampleApprovedPose(normalized, elapsedSeconds);
    const quality = normalizeQuality(options.quality);
    const reduced = Boolean(options.reducedMotion);

    // Quality only trims ambient body motion; combat semantics stay readable
    // on every tier. Reduced-motion still keeps a smaller anticipation,
    // release, impact and defeat settle instead of replacing them with a cut.
    const ambientQualityScale = quality === 'low' ? 0.82 : (quality === 'medium' ? 0.92 : 1);
    let motionScale = ambientQualityScale;
    if (reduced) {
      if (normalized === 'idle') motionScale *= 0.35;
      else if (normalized === 'move') motionScale *= 0.62;
      else motionScale = 0.78;
    } else if (normalized !== 'idle' && normalized !== 'move') {
      motionScale = 1;
    }
    return scaleMotion(approved, motionScale, reduced ? 0.55 : ambientQualityScale);
  }

  function profileKey(reducedMotion, quality) {
    return `${Boolean(reducedMotion) ? 'reduced' : 'full'}:${normalizeQuality(quality)}`;
  }

  function createController(options = {}) {
    let state = normalizeState(options.initialState);
    let elapsed = Math.max(0, finite(options.initialElapsed));
    let reducedMotion = Boolean(options.reducedMotion);
    let quality = normalizeQuality(options.quality);
    let profile = profileKey(reducedMotion, quality);
    let currentPose = samplePose(state, elapsed, { reducedMotion, quality });
    let blendFrom = null;
    let blendElapsed = 0;
    let blendDuration = 0;
    let attackSerial;
    let hasAttackSerial = false;
    let paused = false;
    let destroyed = false;

    function beginBlend(duration, resetElapsed) {
      blendFrom = { ...currentPose };
      blendElapsed = 0;
      blendDuration = Math.max(0, finite(duration));
      if (resetElapsed) elapsed = 0;
    }

    function update(input = {}) {
      if (destroyed) {
        return { ...NEUTRAL_POSE, state: 'idle', elapsed: 0, transition: 1 };
      }

      const nextState = normalizeState(input.state ?? state);
      const nextReducedMotion = input.reducedMotion == null ? reducedMotion : Boolean(input.reducedMotion);
      const nextQuality = input.quality == null ? quality : normalizeQuality(input.quality);
      const nextProfile = profileKey(nextReducedMotion, nextQuality);
      const stateChanged = nextState !== state;
      const nextHasSerial = input.attackSerial !== undefined && input.attackSerial !== null;
      const attackRestarted = nextState === 'attack'
        && !stateChanged
        && nextHasSerial
        && hasAttackSerial
        && !Object.is(input.attackSerial, attackSerial);

      if (stateChanged || attackRestarted) {
        state = nextState;
        beginBlend(blendDurationFor(state), true);
      } else if (nextProfile !== profile) {
        beginBlend(DEFAULT_BLEND_SECONDS, false);
      }

      if (nextState === 'attack' && nextHasSerial) {
        attackSerial = input.attackSerial;
        hasAttackSerial = true;
      }
      if (nextState !== 'attack') hasAttackSerial = false;

      reducedMotion = nextReducedMotion;
      quality = nextQuality;
      profile = nextProfile;

      const mayAdvance = !paused && input.advance !== false;
      const delta = mayAdvance ? clamp(input.delta, 0, MAX_DELTA_SECONDS) : 0;
      elapsed += delta;
      if (blendFrom) blendElapsed += delta;

      const target = samplePose(state, elapsed, { reducedMotion, quality });
      if (blendFrom && blendDuration > 0 && blendElapsed < blendDuration) {
        const transition = smoothstep(blendElapsed / blendDuration);
        currentPose = interpolatePose(blendFrom, target, transition);
      } else {
        currentPose = target;
        blendFrom = null;
      }

      return {
        ...currentPose,
        state,
        elapsed,
        transition: blendFrom && blendDuration > 0 ? clamp(blendElapsed / blendDuration, 0, 1) : 1
      };
    }

    return Object.freeze({
      update,
      setPaused(value) { paused = Boolean(value); },
      isPaused() { return paused; },
      reset(nextState = 'idle') {
        state = normalizeState(nextState);
        elapsed = 0;
        blendFrom = null;
        blendElapsed = 0;
        blendDuration = 0;
        attackSerial = undefined;
        hasAttackSerial = false;
        currentPose = samplePose(state, 0, { reducedMotion, quality });
        return { ...currentPose, state, elapsed, transition: 1 };
      },
      destroy() {
        destroyed = true;
        blendFrom = null;
      }
    });
  }

  function applyPose(sprite, sampledPose, options = {}) {
    if (!sprite || !sampledPose) return false;
    const facing = finite(options.facing, 1) < 0 ? -1 : 1;
    const x = finite(options.x) + (finite(sampledPose.x) * facing);
    const y = finite(options.y) + finite(sampledPose.y);
    const rotation = finite(sampledPose.rotation) * facing;
    const baseScaleX = finite(options.baseScaleX, 1);
    const baseScaleY = finite(options.baseScaleY, 1);
    const scaleX = baseScaleX * finite(sampledPose.scaleX, 1);
    const scaleY = baseScaleY * finite(sampledPose.scaleY, 1);

    if (typeof sprite.setPosition === 'function') sprite.setPosition(x, y);
    else { sprite.x = x; sprite.y = y; }
    if (typeof sprite.setRotation === 'function') sprite.setRotation(rotation);
    else sprite.rotation = rotation;
    if (typeof sprite.setScale === 'function') sprite.setScale(scaleX, scaleY);
    else { sprite.scaleX = scaleX; sprite.scaleY = scaleY; }
    if (typeof sprite.setFlipX === 'function') sprite.setFlipX(facing < 0);
    else sprite.flipX = facing < 0;
    return true;
  }

  global.MoguriaMoguRig = Object.freeze({
    version: VERSION,
    states: Object.freeze(['idle', 'move', 'attack', 'hurt', 'defeat']),
    normalizeState,
    blendDurationFor,
    samplePose,
    createController,
    applyPose
  });
})(typeof window !== 'undefined' ? window : globalThis);
