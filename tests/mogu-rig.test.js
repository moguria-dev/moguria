'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'js/mogu-rig.js'), 'utf8');

function loadRig() {
  const context = { Math, Number, Object, String, Boolean };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(SOURCE, context, { filename: 'js/mogu-rig.js' });
  return context.MoguriaMoguRig;
}

function close(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
}

function poseVector(value) {
  return [value.x, value.y, value.rotation, value.scaleX, value.scaleY];
}

test('approved high-quality motion curves retain their authored key poses', () => {
  const rig = loadRig();
  const idle = rig.samplePose('idle', 1.45 / 4);
  close(idle.y, -1.7);
  close(idle.scaleX, 1.015);
  close(idle.scaleY, 0.988);

  const move = rig.samplePose('move', 0.46 / 4);
  close(move.x, 1.6);
  close(move.y, 0);
  close(move.rotation, -0.9 * Math.PI / 180);

  const anticipation = rig.samplePose('attack', 0.12);
  close(anticipation.x, -4);
  close(anticipation.y, 1.2);
  close(anticipation.scaleX, 1.035);

  const release = rig.samplePose('attack', 0.32);
  close(release.x, 9);
  close(release.y, -3);
  close(release.rotation, 6.5 * Math.PI / 180);

  const recoil = rig.samplePose('attack', 0.54);
  close(recoil.x, -2);
  close(recoil.rotation, -1.8 * Math.PI / 180);

  const recovered = rig.samplePose('attack', 0.78);
  close(recovered.x, 0);
  close(recovered.rotation, 0);

  const hurt = rig.samplePose('hurt', 0.08);
  close(hurt.x, -7);
  close(hurt.rotation, -7 * Math.PI / 180);

  const defeat = rig.samplePose('defeat', 0.72);
  close(defeat.x, -8);
  close(defeat.y, 16);
  close(defeat.scaleX, 1.1);
  close(defeat.scaleY, 0.8);
});

test('state changes blend without a one-frame pose cut', () => {
  const rig = loadRig();
  const controller = rig.createController();
  let previous = controller.update({ state: 'idle', delta: 1 / 60, advance: true });
  let worstStep = 0;

  for (const [state, frames, serial] of [
    ['idle', 70, null],
    ['move', 70, null],
    ['attack', 48, 1],
    ['move', 42, null],
    ['hurt', 30, null],
    ['idle', 40, null],
    ['defeat', 70, null]
  ]) {
    for (let frame = 0; frame < frames; frame++) {
      const current = controller.update({ state, attackSerial: serial, delta: 1 / 60, advance: true });
      const step = Math.hypot(current.x - previous.x, current.y - previous.y);
      worstStep = Math.max(worstStep, step);
      assert.ok(poseVector(current).every(Number.isFinite));
      assert.equal('frame' in current, false);
      previous = current;
    }
  }

  assert.ok(worstStep < 3.6, `largest 60fps position step was ${worstStep}px`);
});

test('a changed attack serial restarts the same attack state smoothly', () => {
  const rig = loadRig();
  const controller = rig.createController();
  controller.update({ state: 'idle', delta: 0.3 });
  controller.update({ state: 'attack', attackSerial: 10, delta: 0.1 });
  const active = controller.update({ state: 'skill', attackSerial: 10, delta: 0.2 });
  assert.ok(active.elapsed > 0.29);

  const restarted = controller.update({ state: 'attack', attackSerial: 11, delta: 0 });
  close(restarted.elapsed, 0);
  close(restarted.x, active.x);
  close(restarted.y, active.y);
  assert.equal(restarted.transition, 0);

  const advanced = controller.update({ state: 'attack', attackSerial: 11, delta: 1 / 60 });
  close(advanced.elapsed, 1 / 60);
  assert.ok(advanced.transition > 0);
});

test('pause and advance gates freeze the deterministic animation clock', () => {
  const rig = loadRig();
  const controller = rig.createController();
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
  assert.ok(resumed.elapsed > beforePause.elapsed);
});

test('reduced motion keeps semantic combat poses while trimming ambience', () => {
  const rig = loadRig();
  const idleFull = rig.samplePose('idle', 1.45 / 4);
  const idleReduced = rig.samplePose('idle', 1.45 / 4, { reducedMotion: true });
  assert.ok(Math.abs(idleReduced.y) < Math.abs(idleFull.y));
  assert.ok(Math.abs(idleReduced.y) > 0);

  for (const [state, elapsed] of [['attack', 0.32], ['hurt', 0.08], ['defeat', 0.72]]) {
    const full = rig.samplePose(state, elapsed);
    const reduced = rig.samplePose(state, elapsed, { reducedMotion: true, quality: 'low' });
    const fullDistance = Math.hypot(full.x, full.y);
    const reducedDistance = Math.hypot(reduced.x, reduced.y);
    assert.ok(reducedDistance >= fullDistance * 0.77, `${state} semantic pose should remain legible`);
  }
});

test('two controllers produce identical output for the same update trace', () => {
  const rig = loadRig();
  const first = rig.createController();
  const second = rig.createController();
  const trace = [
    { state: 'idle', delta: 0.017, quality: 'high' },
    { state: 'move', delta: 0.033, quality: 'medium' },
    { state: 'attack', attackSerial: 1, delta: 0.09 },
    { state: 'attack', attackSerial: 1, delta: 0.13, reducedMotion: true },
    { state: 'attack', attackSerial: 2, delta: 0.02, reducedMotion: true },
    { state: 'hurt', delta: 0.05, advance: false },
    { state: 'hurt', delta: 0.05, advance: true }
  ];

  for (const update of trace) {
    assert.deepEqual(first.update(update), second.update(update));
  }
});

test('sprite adapter applies a mirrored pose without requiring Phaser', () => {
  const rig = loadRig();
  const calls = [];
  const sprite = {
    setPosition(x, y) { calls.push(['position', x, y]); },
    setRotation(value) { calls.push(['rotation', value]); },
    setScale(x, y) { calls.push(['scale', x, y]); },
    setFlipX(value) { calls.push(['flip', value]); }
  };
  const applied = rig.applyPose(sprite, {
    x: 4,
    y: -3,
    rotation: 0.2,
    scaleX: 1.1,
    scaleY: 0.9
  }, {
    x: 100,
    y: 200,
    facing: -1,
    baseScaleX: 0.5,
    baseScaleY: 0.6
  });

  assert.equal(applied, true);
  assert.deepEqual(calls, [
    ['position', 96, 197],
    ['rotation', -0.2],
    ['scale', 0.55, 0.54],
    ['flip', true]
  ]);
});
