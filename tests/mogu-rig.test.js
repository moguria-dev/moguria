'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'js/mogu-rig.js'), 'utf8');
const TAU = Math.PI * 2;

const APPROVED = Object.freeze({
  mogu: Object.freeze({
    anticipate: 0.14, release: 0.2, recoil: 0.22, recover: 0.28,
    pull: 4, drop: 1.1, lift: 3, windupRotation: 0.08, releaseRotation: 0.11,
    compressX: 0.034, compressY: 0.04, releaseNarrow: 0.035, releaseStretch: 0.055,
    lunge: 8, recoilX: 2, recoilRotation: 0.032, recoilSquash: 0.028,
    ambientPhase: 0, muzzle: Object.freeze({ x: 25, y: -13 }),
    duration: 0.84, fireAt: 0.224, normalizedFireAt: 0.26666666666666666
  }),
  companion: Object.freeze({
    anticipate: 0.12, release: 0.13, recoil: 0.16, recover: 0.17,
    pull: 4.5, drop: 1.8, lift: 3.4, windupRotation: 0.11, releaseRotation: 0.12,
    compressX: 0.05, compressY: 0.07, releaseNarrow: 0.045, releaseStretch: 0.075,
    lunge: 7.5, recoilX: 2.4, recoilRotation: 0.055, recoilSquash: 0.04,
    ambientPhase: 0.2, muzzle: Object.freeze({ x: 18, y: -11 }),
    duration: 0.58, fireAt: 0.1746, normalizedFireAt: 0.3010344827586207
  }),
  enemy: Object.freeze({
    anticipate: 0.18, release: 0.14, recoil: 0.2, recover: 0.26,
    pull: 2.4, drop: 2.2, lift: 2.2, windupRotation: 0, releaseRotation: 0,
    compressX: 0.055, compressY: 0.06, releaseNarrow: 0.03, releaseStretch: 0.065,
    lunge: 4.8, recoilX: 2, recoilRotation: 0, recoilSquash: 0.045,
    ambientPhase: 0.42, muzzle: Object.freeze({ x: -18, y: -5 }),
    duration: 0.78, fireAt: 0.2388, normalizedFireAt: 0.30615384615384617
  })
});

function loadRig() {
  const context = { Math, Number, Object, String, Boolean };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(SOURCE, context, { filename: 'js/mogu-rig.js' });
  return context.MoguriaMoguRig;
}

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} should be within ${tolerance} of ${expected}`
  );
}

function poseVector(value) {
  return [value.x, value.y, value.rotation, value.scaleX, value.scaleY];
}

function assertPoseClose(actual, expected, tolerance = 1e-9) {
  for (const key of ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'glow', 'shadow']) {
    close(actual[key], expected[key], tolerance);
  }
}

function smoothstep(value) {
  return value * value * (3 - (2 * value));
}

function easeOutBack(value) {
  return 1 + (2.70158 * Math.pow(value - 1, 3)) + (1.70158 * Math.pow(value - 1, 2));
}

function lerp(from, to, amount) {
  return from + ((to - from) * amount);
}

test('exports the exact approved role profiles, durations and release markers', () => {
  const rig = loadRig();
  assert.equal(rig.version, '2.0.0');
  assert.deepEqual(Array.from(rig.roles), ['mogu', 'companion', 'enemy']);

  for (const [role, approved] of Object.entries(APPROVED)) {
    const profile = rig.profiles[role];
    const timing = rig.attackTimings[role];
    for (const key of [
      'anticipate', 'release', 'recoil', 'recover', 'pull', 'drop', 'lift',
      'windupRotation', 'releaseRotation', 'compressX', 'compressY',
      'releaseNarrow', 'releaseStretch', 'lunge', 'recoilX',
      'recoilRotation', 'recoilSquash', 'ambientPhase'
    ]) close(profile[key], approved[key]);
    close(profile.muzzle.x, approved.muzzle.x);
    close(profile.muzzle.y, approved.muzzle.y);

    close(timing.anticipate, approved.anticipate);
    close(timing.release, approved.release);
    close(timing.recoil, approved.recoil);
    close(timing.recover, approved.recover);
    close(timing.duration, approved.duration);
    close(timing.fireAt, approved.fireAt);
    close(timing.normalizedFireAt, approved.normalizedFireAt);
    close(timing.muzzle.x, approved.muzzle.x);
    close(timing.muzzle.y, approved.muzzle.y);
  }
});

test('all roles follow the approved smoothstep, release, recoil and recovery curves', () => {
  const rig = loadRig();

  for (const [role, p] of Object.entries(APPROVED)) {
    const timing = rig.attackTimings[role];
    const anticipation = rig.samplePose('attack', p.anticipate * 0.5, { role });
    const anticipationProgress = smoothstep(0.5);
    assert.equal(anticipation.stage, 'anticipation');
    assert.equal(anticipation.fire, false);
    close(anticipation.x, lerp(0, -p.pull, anticipationProgress));
    close(anticipation.y, lerp(0, p.drop, anticipationProgress));
    close(anticipation.rotation, lerp(0, -p.windupRotation, anticipationProgress));
    close(anticipation.scaleX, lerp(1, 1 + p.compressX, anticipationProgress));
    close(anticipation.scaleY, lerp(1, 1 - p.compressY, anticipationProgress));

    const releaseProgress = easeOutBack(0.5);
    const release = rig.samplePose('attack', p.anticipate + p.release * 0.5, { role });
    assert.equal(release.stage, 'release');
    assert.equal(release.fire, true);
    close(release.x, lerp(-p.pull, p.lunge, releaseProgress));
    close(release.y, lerp(p.drop, -p.lift, releaseProgress));
    close(release.rotation, lerp(-p.windupRotation, p.releaseRotation, releaseProgress));
    close(release.scaleX, lerp(1 + p.compressX, 1 - p.releaseNarrow, releaseProgress));
    close(release.scaleY, lerp(1 - p.compressY, 1 + p.releaseStretch, releaseProgress));
    close(release.glow, 1);

    const releaseEnd = p.anticipate + p.release;
    const recoil = rig.samplePose('attack', releaseEnd + p.recoil * 0.5, { role });
    const recoilProgress = smoothstep(0.5);
    assert.equal(recoil.stage, 'recoil');
    assert.equal(recoil.fire, true);
    close(recoil.x, lerp(p.lunge, -p.recoilX, recoilProgress));
    close(recoil.y, lerp(-p.lift, 0, recoilProgress));
    close(recoil.rotation, lerp(p.releaseRotation, -p.recoilRotation, recoilProgress));
    close(recoil.scaleX, 1 + p.recoilSquash);
    close(recoil.scaleY, 1 - p.recoilSquash * 0.8);

    const recoilEnd = releaseEnd + p.recoil;
    const recovery = rig.samplePose('attack', recoilEnd + p.recover * 0.5, { role });
    const recoveryProgress = smoothstep(0.5);
    const settle = Math.sin(TAU * 1.2 * recoveryProgress) * Math.exp(-3.4 * recoveryProgress);
    assert.equal(recovery.stage, 'recovery');
    assert.equal(recovery.fire, false);
    close(recovery.x, lerp(-p.recoilX, 0, recoveryProgress));
    close(recovery.y, settle * 1.2);
    close(recovery.rotation, ((1 - recoveryProgress) * -p.recoilRotation) + settle * 0.012);
    close(recovery.scaleX, 1 + settle * 0.016);
    close(recovery.scaleY, 1 - settle * 0.014);

    const complete = rig.samplePose('attack', timing.duration, { role, phaseOffset: 0 });
    assert.equal(complete.stage, 'idle');
    assert.equal(complete.fire, false);
  }
});

test('release fire markers and segment boundaries remain exact for every role', () => {
  const rig = loadRig();
  const epsilon = 1e-7;

  for (const [role, p] of Object.entries(APPROVED)) {
    const timing = rig.attackTimings[role];
    assert.equal(rig.samplePose('attack', 0, { role }).stage, 'anticipation');
    assert.equal(rig.samplePose('attack', p.anticipate, { role }).stage, 'release');
    assert.equal(rig.samplePose('attack', timing.fireAt - epsilon, { role }).fire, false);
    const marker = rig.samplePose('attack', timing.fireAt, { role });
    assert.equal(marker.stage, 'release');
    assert.equal(marker.fire, true);
    assert.equal(rig.samplePose('attack', p.anticipate + p.release, { role }).stage, 'recoil');
    assert.equal(rig.samplePose('attack', p.anticipate + p.release + p.recoil, { role }).stage, 'recovery');
    assert.equal(rig.samplePose('attack', timing.duration, { role }).stage, 'idle');
  }
});

test('easeOutBack keeps its authored transform overshoot instead of clamping it', () => {
  const rig = loadRig();
  const progress = rig.easeOutBack(0.5);
  close(progress, 1.0876975);
  assert.ok(progress > 1);

  for (const [role, p] of Object.entries(APPROVED)) {
    const release = rig.samplePose('attack', p.anticipate + p.release * 0.5, { role });
    assert.ok(release.x > p.lunge, `${role} release x should overshoot its endpoint`);
    assert.ok(release.y < -p.lift, `${role} release y should overshoot its endpoint`);
    assert.equal(release.glow, 1, `${role} glow alone should be clamped`);
  }
});

test('ambient periods and amplitudes match the approved role-local values', () => {
  const rig = loadRig();
  const cases = [
    ['mogu', 1.42, 0.62, 1.4, 3.2, 0.018],
    ['companion', 1.42, 0.54, 1.4, 3.2, 0.018],
    ['enemy', 1.72, 0.62, 0.8, 2.6, 0]
  ];

  for (const [role, idlePeriod, movePeriod, strideX, contactY, rotation] of cases) {
    const idle = rig.samplePose('idle', idlePeriod / 4, { role, phaseOffset: 0 });
    close(idle.x, 0);
    close(idle.y, -1.35);
    close(idle.rotation, role === 'enemy' ? 0 : 0.008);
    close(idle.scaleX, 1.014);
    close(idle.scaleY, 0.988);
    close(idle.glow, 0.23);

    const stride = rig.samplePose('move', movePeriod / 4, { role, phaseOffset: 0 });
    close(stride.x, strideX);
    close(stride.y, 0);
    close(stride.rotation, rotation);

    const contact = rig.samplePose('move', 0, { role, phaseOffset: 0 });
    close(contact.x, 0);
    close(contact.y, -contactY);
    close(contact.scaleX, 1.028);
    close(contact.scaleY, 0.963);
  }
});

test('enemy presentation remains front-facing with zero authored rotation', () => {
  const rig = loadRig();
  const samples = [
    rig.samplePose('idle', 0.31, { role: 'enemy' }),
    rig.samplePose('move', 0.19, { role: 'enemy' }),
    rig.samplePose('attack', 0.09, { role: 'enemy' }),
    rig.samplePose('attack', 0.25, { role: 'enemy' }),
    rig.samplePose('hurt', 0.26, { role: 'enemy' }),
    rig.samplePose('celebrate', 0.3, { role: 'enemy' }),
    rig.samplePose('defeat', 0.3, { role: 'enemy' })
  ];
  for (const sampled of samples) close(sampled.rotation, 0);
});

test('durationScale changes playback duration without moving semantic markers', () => {
  const rig = loadRig();

  for (const [role, p] of Object.entries(APPROVED)) {
    const timing = rig.attackTimings[role];
    const normalMarker = rig.samplePose('attack', timing.fireAt, { role, durationScale: 1 });
    const fastMarker = rig.samplePose('attack', timing.fireAt * 0.5, { role, durationScale: 0.5 });
    assertPoseClose(fastMarker, normalMarker);
    assert.equal(fastMarker.stage, normalMarker.stage);
    assert.equal(fastMarker.fire, true);
    assert.equal(rig.samplePose('attack', timing.duration * 0.5, { role, durationScale: 0.5 }).stage, 'idle');
  }

  const controller = rig.createController({ role: 'companion', durationScale: 0.5 });
  const sampled = controller.update({
    state: 'attack', eventSerial: 1,
    startElapsed: APPROVED.companion.fireAt * 0.5,
    delta: 0
  });
  close(sampled.durationScale, 0.5);
  assert.equal(sampled.stage, 'release');
  assert.equal(sampled.fire, true);
});

test('eventSerial restarts an active event at startElapsed and blends from the current pose', () => {
  const rig = loadRig();
  const timing = APPROVED.companion;
  const controller = rig.createController({ role: 'companion', phaseOffset: 0 });
  controller.update({ state: 'idle', delta: 0.2 });

  const started = controller.update({
    state: 'attack', eventSerial: 10, startElapsed: timing.fireAt, delta: 0
  });
  close(started.elapsed, timing.fireAt);
  assert.equal(started.stage, 'release');
  assert.equal(started.fire, true);
  assert.equal(started.transition, 0);

  const active = controller.update({
    state: 'skill', eventSerial: 10, startElapsed: 0, delta: 0.04
  });
  close(active.elapsed, timing.fireAt + 0.04);
  const beforeRestart = poseVector(active);

  const restarted = controller.update({
    state: 'attack', eventSerial: 11, startElapsed: timing.anticipate, delta: 0
  });
  close(restarted.elapsed, timing.anticipate);
  assert.equal(restarted.stage, 'release');
  assert.equal(restarted.fire, false);
  assert.equal(restarted.transition, 0);
  assert.deepEqual(poseVector(restarted), beforeRestart);

  const advanced = controller.update({ state: 'attack', eventSerial: 11, delta: 1 / 60 });
  close(advanced.elapsed, timing.anticipate + 1 / 60);
  assert.ok(advanced.transition > 0);
});

test('pause and advance gates freeze actor-local clocks and resume deterministically', () => {
  const rig = loadRig();
  const controller = rig.createController({ role: 'mogu', phaseOffset: 0.17 });
  const beforePause = controller.update({ state: 'move', delta: 0.2 });

  controller.setPaused(true);
  const paused = controller.update({ state: 'move', delta: 1 });
  assert.deepEqual(poseVector(paused), poseVector(beforePause));
  close(paused.elapsed, beforePause.elapsed);

  controller.setPaused(false);
  const gated = controller.update({ state: 'move', delta: 1, advance: false });
  assert.deepEqual(poseVector(gated), poseVector(beforePause));
  close(gated.elapsed, beforePause.elapsed);

  const resumed = controller.update({ state: 'move', delta: 1 / 60, advance: true });
  close(resumed.elapsed, beforePause.elapsed + 1 / 60);
  assert.notDeepEqual(poseVector(resumed), poseVector(beforePause));
});

test('ambient phase is actor-local and deterministic across independent update traces', () => {
  const rig = loadRig();
  const zeroPhase = rig.createController({ role: 'companion', phaseOffset: 0 });
  const delayedPhase = rig.createController({ role: 'companion', phaseOffset: 0.2 });
  const splitStep = rig.createController({ role: 'companion', phaseOffset: 0 });

  const zero = zeroPhase.update({ state: 'idle', delta: 0.1 });
  const delayed = delayedPhase.update({ state: 'idle', delta: 0.1 });
  splitStep.update({ state: 'idle', delta: 0.04 });
  const split = splitStep.update({ state: 'idle', delta: 0.06 });

  assertPoseClose(zero, rig.samplePose('idle', 0.1, { role: 'companion', phaseOffset: 0 }));
  assertPoseClose(delayed, rig.samplePose('idle', 0.1, { role: 'companion', phaseOffset: 0.2 }));
  assert.notDeepEqual(poseVector(zero), poseVector(delayed));
  assertPoseClose(split, zero);
  close(split.elapsed, zero.elapsed);
});

test('reduced motion scales ambience by .48 and semantic combat motion by .65', () => {
  const rig = loadRig();
  const idleFull = rig.samplePose('idle', 1.42 / 4, { role: 'mogu', phaseOffset: 0 });
  const idleReduced = rig.samplePose('idle', 1.42 / 4, {
    role: 'mogu', phaseOffset: 0, reducedMotion: true
  });
  close(idleReduced.y, idleFull.y * 0.48);
  close(idleReduced.rotation, idleFull.rotation * 0.48);
  close(idleReduced.scaleX - 1, (idleFull.scaleX - 1) * 0.48);
  close(idleReduced.scaleY - 1, (idleFull.scaleY - 1) * 0.48);

  for (const [role, p] of Object.entries(APPROVED)) {
    const full = rig.samplePose('attack', p.anticipate * 0.5, { role });
    const reduced = rig.samplePose('attack', p.anticipate * 0.5, { role, reducedMotion: true });
    close(reduced.x, full.x * 0.65);
    close(reduced.y, full.y * 0.65);
    close(reduced.rotation, full.rotation * 0.65);
    close(reduced.scaleX - 1, (full.scaleX - 1) * 0.65);
    close(reduced.scaleY - 1, (full.scaleY - 1) * 0.65);
    assert.equal(reduced.stage, full.stage);
    assert.equal(reduced.fire, full.fire);
  }
});

test('low quality trims ambience but preserves combat stages, fire timing and transforms', () => {
  const rig = loadRig();
  const ambientFull = rig.samplePose('move', 0.11, { role: 'mogu', phaseOffset: 0 });
  const ambientLow = rig.samplePose('move', 0.11, { role: 'mogu', phaseOffset: 0, quality: 'low' });
  close(ambientLow.x, ambientFull.x * 0.82);
  close(ambientLow.y, ambientFull.y * 0.82);
  close(ambientLow.rotation, ambientFull.rotation * 0.82);

  for (const [role, p] of Object.entries(APPROVED)) {
    for (const elapsed of [p.fireAt - 1e-7, p.fireAt, p.anticipate + p.release, p.duration]) {
      const high = rig.samplePose('attack', elapsed, { role, quality: 'high' });
      const low = rig.samplePose('attack', elapsed, { role, quality: 'low' });
      assert.equal(low.stage, high.stage);
      assert.equal(low.fire, high.fire);
      for (const key of ['x', 'y', 'rotation', 'scaleX', 'scaleY']) close(low[key], high[key]);
    }
  }
});

test('state transitions retain continuous 60fps presentation poses', () => {
  const rig = loadRig();
  const controller = rig.createController({ role: 'mogu' });
  let previous = controller.update({ state: 'idle', delta: 1 / 60, advance: true });
  let worstStep = 0;

  for (const [state, frames, serial] of [
    ['idle', 70, null],
    ['move', 70, null],
    ['attack', 54, 1],
    ['move', 42, null],
    ['hurt', 30, 2],
    ['consume', 28, 3],
    ['celebrate', 48, 4],
    ['idle', 40, null],
    ['defeat', 70, 5]
  ]) {
    for (let frame = 0; frame < frames; frame++) {
      const current = controller.update({
        state, eventSerial: serial, delta: 1 / 60, advance: true
      });
      const step = Math.hypot(current.x - previous.x, current.y - previous.y);
      worstStep = Math.max(worstStep, step);
      assert.ok(poseVector(current).every(Number.isFinite));
      assert.equal('frame' in current, false);
      previous = current;
    }
  }

  assert.ok(worstStep < 4, `largest 60fps position step was ${worstStep}px`);
});

test('sprite adapter mirrors directional actors and locks front-facing enemies', () => {
  const rig = loadRig();
  const directionalCalls = [];
  const directional = {
    setPosition(x, y) { directionalCalls.push(['position', x, y]); },
    setRotation(value) { directionalCalls.push(['rotation', value]); },
    setScale(x, y) { directionalCalls.push(['scale', x, y]); },
    setFlipX(value) { directionalCalls.push(['flip', value]); }
  };
  const sampled = { x: 4, y: -3, rotation: 0.2, scaleX: 1.1, scaleY: 0.9 };
  assert.equal(rig.applyPose(directional, sampled, {
    x: 100, y: 200, facing: -1, baseScaleX: 0.5, baseScaleY: 0.6
  }), true);
  assert.deepEqual(directionalCalls, [
    ['position', 96, 197],
    ['rotation', -0.2],
    ['scale', 0.55, 0.54],
    ['flip', true]
  ]);

  const frontCalls = [];
  const frontFacing = {
    setPosition(x, y) { frontCalls.push(['position', x, y]); },
    setRotation(value) { frontCalls.push(['rotation', value]); },
    setScale(x, y) { frontCalls.push(['scale', x, y]); },
    setFlipX(value) { frontCalls.push(['flip', value]); }
  };
  assert.equal(rig.applyPose(frontFacing, sampled, {
    x: 100, y: 200, facing: -1, frontFacing: true,
    baseScaleX: 0.5, baseScaleY: 0.6
  }), true);
  assert.deepEqual(frontCalls, [
    ['position', 104, 197],
    ['rotation', 0.2],
    ['scale', 0.55, 0.54],
    ['flip', false]
  ]);
});
