/* Moguria Motion Rig 2.
 *
 * MoguriaGame owns combat, collision, cooldowns and saves. This module owns
 * presentation-only poses for one stable atlas cell. Actor-local clocks and
 * explicit event serials keep anticipation, release, recoil and recovery
 * deterministic across pause/resume and rapid retriggers.
 */
(function (global) {
  'use strict';

  const VERSION = '2.0.0';
  const TAU = Math.PI * 2;
  const MAX_DELTA_SECONDS = 0.25;
  const DEFAULT_BLEND_SECONDS = 0.12;
  const ATTACK_BLEND_SECONDS = 0.085;
  const HURT_BLEND_SECONDS = 0.045;

  const NEUTRAL_POSE = Object.freeze({
    x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1,
    glow: 0, shadow: 1, stage: 'idle', fire: false
  });

  // Approved motion-preview-v1 values. Keep release markers unrounded: the
  // core uses them to start a visual windup without delaying the projectile.
  const ROLE_PROFILES = Object.freeze({
    mogu: Object.freeze({
      role: 'mogu', anticipate: 0.14, release: 0.2, recoil: 0.22, recover: 0.28,
      pull: 4, drop: 1.1, lift: 3, windupRotation: 0.08, releaseRotation: 0.11,
      compressX: 0.034, compressY: 0.04, releaseNarrow: 0.035, releaseStretch: 0.055,
      lunge: 8, recoilX: 2, recoilRotation: 0.032, recoilSquash: 0.028,
      ambientPhase: 0, muzzle: Object.freeze({ x: 25, y: -13 })
    }),
    companion: Object.freeze({
      role: 'companion', anticipate: 0.12, release: 0.13, recoil: 0.16, recover: 0.17,
      pull: 4.5, drop: 1.8, lift: 3.4, windupRotation: 0.11, releaseRotation: 0.12,
      compressX: 0.05, compressY: 0.07, releaseNarrow: 0.045, releaseStretch: 0.075,
      lunge: 7.5, recoilX: 2.4, recoilRotation: 0.055, recoilSquash: 0.04,
      ambientPhase: 0.2, muzzle: Object.freeze({ x: 18, y: -11 })
    }),
    enemy: Object.freeze({
      role: 'enemy', anticipate: 0.18, release: 0.14, recoil: 0.2, recover: 0.26,
      pull: 2.4, drop: 2.2, lift: 2.2, windupRotation: 0, releaseRotation: 0,
      compressX: 0.055, compressY: 0.06, releaseNarrow: 0.03, releaseStretch: 0.065,
      lunge: 4.8, recoilX: 2, recoilRotation: 0, recoilSquash: 0.045,
      ambientPhase: 0.42, muzzle: Object.freeze({ x: -18, y: -5 })
    })
  });

  const ATTACK_TIMINGS = Object.freeze(Object.fromEntries(Object.entries(ROLE_PROFILES).map(([role, profile]) => {
    const duration = profile.anticipate + profile.release + profile.recoil + profile.recover;
    const fireAt = profile.anticipate + profile.release * 0.42;
    return [role, Object.freeze({
      anticipate: profile.anticipate, release: profile.release,
      recoil: profile.recoil, recover: profile.recover,
      duration, fireAt, normalizedFireAt: fireAt / duration, muzzle: profile.muzzle
    })];
  })));

  const STATE_ALIASES = Object.freeze({
    idle: 'idle', recover: 'idle', recovery: 'idle',
    move: 'move', run: 'move', walk: 'move',
    attack: 'attack', skill: 'attack', telegraph: 'attack', windup: 'attack',
    slam: 'attack', burst: 'attack', attack_release: 'attack',
    hurt: 'hurt', hit: 'hurt', damage: 'hurt', damaged: 'hurt',
    consume: 'consume', munch: 'consume', eat: 'consume', absorb: 'consume',
    celebrate: 'celebrate', growth: 'celebrate', levelup: 'celebrate', level_up: 'celebrate',
    defeat: 'defeat', defeated: 'defeat', dead: 'defeat', gameover: 'defeat'
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

  function easeOutBack(value) {
    const amount = clamp(value, 0, 1);
    return 1 + (2.70158 * Math.pow(amount - 1, 3)) + (1.70158 * Math.pow(amount - 1, 2));
  }

  function damped(value, frequency = 1.2, decay = 3.4) {
    const amount = Math.max(0, finite(value));
    return Math.sin(amount * TAU * frequency) * Math.exp(-amount * decay);
  }

  function normalizeRole(value) {
    const role = String(value || 'mogu').trim().toLowerCase();
    return ROLE_PROFILES[role] ? role : 'mogu';
  }

  function normalizeState(value) {
    const key = String(value || 'idle').trim().toLowerCase().replace(/[ -]+/g, '_');
    return STATE_ALIASES[key] || 'idle';
  }

  function normalizeQuality(value) {
    const key = String(value || 'high').toLowerCase();
    return key === 'low' || key === 'medium' ? key : 'high';
  }

  function normalizeDurationScale(value) {
    return clamp(value == null ? 1 : value, 0.18, 1);
  }

  function blendDurationFor(state) {
    const normalized = normalizeState(state);
    if (normalized === 'attack') return ATTACK_BLEND_SECONDS;
    if (normalized === 'hurt' || normalized === 'consume') return HURT_BLEND_SECONDS;
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

  function ambientPose(role, elapsedSeconds, moving) {
    const normalizedRole = normalizeRole(role);
    const elapsed = finite(elapsedSeconds);
    if (moving) {
      const period = normalizedRole === 'companion' ? 0.54 : 0.62;
      const stride = Math.sin(elapsed * TAU / period);
      const contact = Math.abs(Math.cos(elapsed * TAU / period));
      return pose({
        x: stride * (normalizedRole === 'enemy' ? 0.8 : 1.4),
        y: -contact * (normalizedRole === 'enemy' ? 2.6 : 3.2),
        rotation: normalizedRole === 'enemy' ? 0 : stride * 0.018,
        scaleX: 1 + contact * 0.028,
        scaleY: 1 - contact * 0.037,
        glow: 0.15 + contact * 0.08,
        stage: 'move'
      });
    }
    const period = normalizedRole === 'enemy' ? 1.72 : 1.42;
    const breath = Math.sin(elapsed * TAU / period);
    return pose({
      y: -breath * 1.35,
      rotation: normalizedRole === 'enemy' ? 0 : breath * 0.008,
      scaleX: 1 + breath * 0.014,
      scaleY: 1 - breath * 0.012,
      glow: 0.15 + ((breath + 1) * 0.04),
      stage: 'idle'
    });
  }

  function attackPose(role, elapsedSeconds, durationScale = 1) {
    const normalizedRole = normalizeRole(role);
    const profile = ROLE_PROFILES[normalizedRole];
    const local = Math.max(0, finite(elapsedSeconds)) / normalizeDurationScale(durationScale);
    const releaseEnd = profile.anticipate + profile.release;
    const recoilEnd = releaseEnd + profile.recoil;
    const end = recoilEnd + profile.recover;

    if (local >= end) {
      const idle = ambientPose(normalizedRole, local + profile.ambientPhase, false);
      idle.stage = 'idle';
      idle.fire = false;
      return idle;
    }
    if (local < profile.anticipate) {
      const progress = smoothstep(local / profile.anticipate);
      return pose({
        x: lerp(0, -profile.pull, progress),
        y: lerp(0, profile.drop, progress),
        rotation: lerp(0, -profile.windupRotation, progress),
        scaleX: lerp(1, 1 + profile.compressX, progress),
        scaleY: lerp(1, 1 - profile.compressY, progress),
        glow: lerp(0.15, 0.48, progress),
        stage: 'anticipation'
      });
    }
    if (local < releaseEnd) {
      // Keep the authored overshoot. Only glow is clamped; transform progress
      // deliberately reaches about 1.10 for the approved release snap.
      const progress = easeOutBack((local - profile.anticipate) / profile.release);
      return pose({
        x: lerp(-profile.pull, profile.lunge, progress),
        y: lerp(profile.drop, -profile.lift, progress),
        rotation: lerp(-profile.windupRotation, profile.releaseRotation, progress),
        scaleX: lerp(1 + profile.compressX, 1 - profile.releaseNarrow, progress),
        scaleY: lerp(1 - profile.compressY, 1 + profile.releaseStretch, progress),
        glow: lerp(0.48, 1, clamp(progress, 0, 1)),
        stage: 'release',
        fire: local >= ATTACK_TIMINGS[normalizedRole].fireAt
      });
    }
    if (local < recoilEnd) {
      const progress = smoothstep((local - releaseEnd) / profile.recoil);
      const spring = Math.sin(progress * Math.PI);
      return pose({
        x: lerp(profile.lunge, -profile.recoilX, progress),
        y: lerp(-profile.lift, 0, progress),
        rotation: lerp(profile.releaseRotation, -profile.recoilRotation, progress),
        scaleX: 1 + spring * profile.recoilSquash,
        scaleY: 1 - spring * profile.recoilSquash * 0.8,
        glow: lerp(1, 0.25, progress),
        stage: 'recoil',
        fire: true
      });
    }
    const progress = smoothstep((local - recoilEnd) / profile.recover);
    const settle = damped(progress, 1.2, 3.4);
    return pose({
      x: lerp(-profile.recoilX, 0, progress),
      y: settle * 1.2,
      rotation: ((1 - progress) * -profile.recoilRotation) + settle * 0.012,
      scaleX: 1 + settle * 0.016,
      scaleY: 1 - settle * 0.014,
      glow: lerp(0.25, 0.15, progress),
      stage: 'recovery'
    });
  }

  function hurtPose(role, elapsedSeconds) {
    const normalizedRole = normalizeRole(role);
    const elapsed = Math.max(0, finite(elapsedSeconds));
    const duration = normalizedRole === 'enemy' ? 0.52 : 0.26;
    const progress = clamp(elapsed / duration, 0, 1);
    const impact = Math.sin(progress * Math.PI);
    if (normalizedRole === 'enemy') {
      return pose({
        x: 6 * impact, y: -2 * impact, rotation: 0,
        scaleX: 1 + 0.05 * impact, scaleY: 1 - 0.07 * impact,
        glow: 0.25, stage: progress >= 1 ? 'idle' : 'hurt'
      });
    }
    return pose({
      x: -6 * impact, y: -1.6 * impact, rotation: -0.07 * impact,
      scaleX: 1 + 0.04 * impact, scaleY: 1 - 0.055 * impact,
      glow: 0.14, stage: progress >= 1 ? 'idle' : 'hurt'
    });
  }

  function consumePose(elapsedSeconds) {
    const progress = clamp(Math.max(0, finite(elapsedSeconds)) / 0.34, 0, 1);
    const bite = Math.sin(progress * Math.PI);
    const sparkle = Math.sin(Math.min(1, progress * 1.25) * Math.PI);
    return pose({
      x: -1.8 * bite, y: 2.4 * bite - 1.3 * sparkle,
      rotation: -0.028 * bite,
      scaleX: 1 + 0.045 * bite, scaleY: 1 - 0.065 * bite,
      glow: 0.2 + 0.5 * sparkle,
      stage: progress >= 1 ? 'idle' : 'consume'
    });
  }

  function celebratePose(role, elapsedSeconds) {
    const normalizedRole = normalizeRole(role);
    const progress = clamp(Math.max(0, finite(elapsedSeconds)) / 0.75, 0, 1);
    const lift = Math.sin(progress * Math.PI);
    const settle = damped(progress, 1.45, 2.8);
    return pose({
      y: -7 * lift + settle,
      rotation: normalizedRole === 'enemy' ? 0 : settle * 0.025,
      scaleX: 1 - lift * 0.035 + settle * 0.012,
      scaleY: 1 + lift * 0.065 - settle * 0.01,
      glow: 0.22 + lift * 0.78,
      stage: progress >= 1 ? 'idle' : 'celebrate'
    });
  }

  function defeatPose(role, elapsedSeconds) {
    const normalizedRole = normalizeRole(role);
    const elapsed = Math.max(0, finite(elapsedSeconds));
    if (normalizedRole === 'enemy') {
      const progress = smoothstep(elapsed / 0.48);
      return pose({
        x: 2.5 * progress, y: 10 * progress, rotation: 0,
        scaleX: 1 + 0.08 * progress, scaleY: 1 - 0.22 * progress,
        glow: 0.18 * (1 - progress), shadow: 1 - 0.58 * progress, stage: 'defeat'
      });
    }
    const progress = smoothstep(elapsed / 0.72);
    const settle = Math.exp(-Math.max(0, elapsed - 0.72) * 2.4);
    return pose({
      x: -8 * progress, y: 16 * progress,
      rotation: -0.56 * progress + 0.02 * Math.sin(elapsed * 5) * settle,
      scaleX: 1 + 0.1 * progress, scaleY: 1 - 0.2 * progress,
      glow: 0.03, shadow: 1 - 0.25 * progress, stage: 'defeat'
    });
  }

  function scaleMotion(source, amount, glowAmount = amount) {
    const scale = clamp(amount, 0, 1);
    const glowScale = clamp(glowAmount, 0, 1);
    return {
      ...source,
      x: finite(source.x) * scale,
      y: finite(source.y) * scale,
      rotation: finite(source.rotation) * scale,
      scaleX: 1 + ((finite(source.scaleX, 1) - 1) * scale),
      scaleY: 1 + ((finite(source.scaleY, 1) - 1) * scale),
      glow: finite(source.glow) * glowScale,
      shadow: 1 + ((finite(source.shadow, 1) - 1) * scale)
    };
  }

  function samplePose(state, elapsedSeconds, options = {}) {
    const normalized = normalizeState(state);
    const role = normalizeRole(options.role);
    const phaseOffset = finite(options.phaseOffset, ROLE_PROFILES[role].ambientPhase);
    const elapsed = Math.max(0, finite(elapsedSeconds));
    let sampled;
    if (normalized === 'attack') sampled = attackPose(role, elapsed, options.durationScale);
    else if (normalized === 'hurt') sampled = hurtPose(role, elapsed);
    else if (normalized === 'consume') sampled = consumePose(elapsed);
    else if (normalized === 'celebrate') sampled = celebratePose(role, elapsed);
    else if (normalized === 'defeat') sampled = defeatPose(role, elapsed);
    else sampled = ambientPose(role, elapsed + phaseOffset, normalized === 'move');

    const quality = normalizeQuality(options.quality);
    const reduced = Boolean(options.reducedMotion);
    const ambient = normalized === 'idle' || normalized === 'move';
    const qualityScale = quality === 'low' ? 0.82 : (quality === 'medium' ? 0.92 : 1);
    // Approved reduced-motion values: ambience .48, semantic combat .65.
    const motionScale = ambient ? qualityScale * (reduced ? 0.48 : 1) : (reduced ? 0.65 : 1);
    return scaleMotion(sampled, motionScale, reduced ? 0.65 : qualityScale);
  }

  function profileKey(reducedMotion, quality, durationScale) {
    return `${Boolean(reducedMotion) ? 'reduced' : 'full'}:${normalizeQuality(quality)}:${normalizeDurationScale(durationScale)}`;
  }

  function createController(options = {}) {
    const role = normalizeRole(options.role);
    const phaseOffset = finite(options.phaseOffset, finite(options.ambientPhase, ROLE_PROFILES[role].ambientPhase));
    let state = normalizeState(options.initialState);
    let elapsed = Math.max(0, finite(options.initialElapsed));
    let reducedMotion = Boolean(options.reducedMotion);
    let quality = normalizeQuality(options.quality);
    let durationScale = normalizeDurationScale(options.durationScale);
    let profile = profileKey(reducedMotion, quality, durationScale);
    let currentPose = samplePose(state, elapsed, { role, phaseOffset, reducedMotion, quality, durationScale });
    let blendFrom = null;
    let blendElapsed = 0;
    let blendDuration = 0;
    let eventSerial;
    let hasEventSerial = false;
    let paused = false;
    let destroyed = false;

    function beginBlend(duration, startElapsed) {
      blendFrom = { ...currentPose };
      blendElapsed = 0;
      blendDuration = Math.max(0, finite(duration));
      elapsed = Math.max(0, finite(startElapsed));
    }

    function update(input = {}) {
      if (destroyed) return { ...NEUTRAL_POSE, state: 'idle', role, elapsed: 0, transition: 1 };
      const nextState = normalizeState(input.state ?? state);
      const nextReducedMotion = input.reducedMotion == null ? reducedMotion : Boolean(input.reducedMotion);
      const nextQuality = input.quality == null ? quality : normalizeQuality(input.quality);
      const nextDurationScale = input.durationScale == null ? durationScale : normalizeDurationScale(input.durationScale);
      const nextProfile = profileKey(nextReducedMotion, nextQuality, nextDurationScale);
      const stateChanged = nextState !== state;
      const incomingSerial = input.eventSerial !== undefined && input.eventSerial !== null ? input.eventSerial : input.attackSerial;
      const nextHasSerial = incomingSerial !== undefined && incomingSerial !== null;
      const eventRestarted = !stateChanged && nextHasSerial && hasEventSerial && !Object.is(incomingSerial, eventSerial);

      if (stateChanged || eventRestarted) {
        state = nextState;
        beginBlend(blendDurationFor(state), input.startElapsed);
      } else if (nextProfile !== profile) {
        blendFrom = { ...currentPose };
        blendElapsed = 0;
        blendDuration = DEFAULT_BLEND_SECONDS;
      }
      if (nextHasSerial) {
        eventSerial = incomingSerial;
        hasEventSerial = true;
      } else if (stateChanged) {
        eventSerial = undefined;
        hasEventSerial = false;
      }

      reducedMotion = nextReducedMotion;
      quality = nextQuality;
      durationScale = nextDurationScale;
      profile = nextProfile;
      const mayAdvance = !paused && input.advance !== false;
      const delta = mayAdvance ? clamp(input.delta, 0, MAX_DELTA_SECONDS) : 0;
      elapsed += delta;
      if (blendFrom) blendElapsed += delta;

      const target = samplePose(state, elapsed, { role, phaseOffset, reducedMotion, quality, durationScale });
      if (blendFrom && blendDuration > 0 && blendElapsed < blendDuration) {
        currentPose = interpolatePose(blendFrom, target, smoothstep(blendElapsed / blendDuration));
      } else {
        currentPose = target;
        blendFrom = null;
      }
      return {
        ...currentPose, state, role, stage: target.stage, fire: Boolean(target.fire),
        elapsed, durationScale,
        transition: blendFrom && blendDuration > 0 ? clamp(blendElapsed / blendDuration, 0, 1) : 1
      };
    }

    return Object.freeze({
      role, update,
      setPaused(value) { paused = Boolean(value); },
      isPaused() { return paused; },
      reset(nextState = 'idle') {
        state = normalizeState(nextState);
        elapsed = 0;
        blendFrom = null;
        blendElapsed = 0;
        blendDuration = 0;
        eventSerial = undefined;
        hasEventSerial = false;
        currentPose = samplePose(state, 0, { role, phaseOffset, reducedMotion, quality, durationScale });
        return { ...currentPose, state, role, elapsed, transition: 1 };
      },
      destroy() { destroyed = true; blendFrom = null; }
    });
  }

  function applyPose(sprite, sampledPose, options = {}) {
    if (!sprite || !sampledPose) return false;
    const frontFacing = Boolean(options.frontFacing);
    const facing = frontFacing ? 1 : (finite(options.facing, 1) < 0 ? -1 : 1);
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
    if (typeof sprite.setFlipX === 'function') sprite.setFlipX(!frontFacing && facing < 0);
    else sprite.flipX = !frontFacing && facing < 0;
    return true;
  }

  global.MoguriaMoguRig = Object.freeze({
    version: VERSION,
    roles: Object.freeze(Object.keys(ROLE_PROFILES)),
    states: Object.freeze(['idle', 'move', 'attack', 'hurt', 'consume', 'celebrate', 'defeat']),
    profiles: ROLE_PROFILES,
    attackTimings: ATTACK_TIMINGS,
    normalizeRole, normalizeState, blendDurationFor, smoothstep, easeOutBack,
    ambientPose, attackPose, samplePose, createController, applyPose
  });
})(typeof window !== 'undefined' ? window : globalThis);
