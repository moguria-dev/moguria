'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const json = relativePath => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
const STORY_ASSET_IDS = [
  'story_ch01_bg_return_hall',
  'story_ch01_bg_fragment_chamber',
  'story_ch01_bg_archive',
  'story_ch01_return_light',
  'story_ch01_damaged_fragment',
  'story_ch01_community_lamp',
  'story_ch01_return_ledger',
  'story_ch01_current_mogu_pose_atlas',
  'story_ch01_young_mogu_pose_atlas',
  'story_ch01_star_guardian_candidate_pose_atlas',
  'story_ch01_star_companion_pose_atlas'
];
const STORY_PACKS = {
  'story-ch01-core': ['story_ch01_animation_manifest', 'story_ch01_return_light'],
  'story-ch01-return-hall': [
    'story_ch01_bg_return_hall',
    'story_ch01_young_mogu_pose_atlas',
    'story_ch01_star_guardian_candidate_pose_atlas'
  ],
  'story-ch01-fragment-chamber': [
    'story_ch01_bg_fragment_chamber',
    'story_ch01_damaged_fragment',
    'story_ch01_community_lamp',
    'story_ch01_current_mogu_pose_atlas',
    'story_ch01_star_companion_pose_atlas'
  ],
  'story-ch01-archive': [
    'story_ch01_bg_archive',
    'story_ch01_return_ledger'
  ]
};

test('Chapter 01 assets are approved, hash-bound, lazy-packed, and absent from startup critical', async () => {
  const { gitBlobSha1, imageDimensions } = await import('../scripts/lib/validation.mjs');
  const { projectAssetManifest } = await import('../scripts/validate-project-state.mjs');
  const state = json('config/project-state.json');
  const source = json('config/asset-manifest.json');
  const runtime = json('assets/manifest.json');

  assert.equal(state.versions.assetManifest, '3.4.0-story-ch01');
  assert.equal(source.runtimeManifest.version, state.versions.assetManifest);
  assert.deepStrictEqual(runtime, projectAssetManifest(source, state));
  assert.equal(source.runtimeManifest.critical.length, 17);
  assert.ok(STORY_ASSET_IDS.every(id => !source.runtimeManifest.critical.some(entry => entry.id === id)));

  const catalog = new Map(source.catalog.map(record => [record.logicalId, record]));
  for (const id of STORY_ASSET_IDS) {
    const record = catalog.get(id);
    assert.ok(record, `missing catalog record ${id}`);
    assert.equal(record.lifecycle.status, 'active');
    assert.equal(record.lifecycle.deprecated, false);
    assert.equal(record.approval.status, 'approved');
    assert.equal(record.approval.approvedAt, '2026-08-16');
    assert.equal(record.provenance.approvedDate, '2026-08-16');
    assert.equal(record.sourceMaster, null, 'source masters must remain outside the runtime repository');
    assert.equal(source.runtimeManifest.images[id], record.path);
    const bytes = fs.readFileSync(path.join(ROOT, record.path));
    assert.equal(gitBlobSha1(bytes), record.integrity.value);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), record.integrity.sha256);
    assert.deepStrictEqual(imageDimensions(bytes, record.path), record.dimensions);
  }

  const packed = [];
  for (const [packId, expectedIds] of Object.entries(STORY_PACKS)) {
    const pack = source.runtimeManifest.packs.find(entry => entry.id === packId);
    assert.ok(pack, `missing pack ${packId}`);
    assert.deepStrictEqual(pack.assets.map(asset => asset.id), expectedIds);
    packed.push(...pack.assets.map(asset => asset.id).filter(id => STORY_ASSET_IDS.includes(id)));
  }
  assert.deepStrictEqual(new Set(packed), new Set(STORY_ASSET_IDS));
});

test('the canonical Chapter 01 animation namespace projects exactly to its separate runtime JSON', async () => {
  const { projectStoryAnimationManifest } = await import('../scripts/validate-project-state.mjs');
  const state = json('config/project-state.json');
  const source = json('config/animation-manifest.json');
  const runtime = json('assets/animations/story-ch01.json');

  assert.equal(state.validation.animationRuntimeOutput, 'assets/images/battle-v3/atlas.json');
  assert.equal(state.validation.storyAnimationRuntimeOutput, 'assets/animations/story-ch01.json');
  assert.equal(source.runtimeVersion, 2, 'Battle projection version must remain unchanged');
  assert.equal(source.storyRuntimeVersion, 1);
  assert.equal(source.storyGeneratedFile, state.validation.storyAnimationRuntimeOutput);
  assert.deepStrictEqual(runtime, projectStoryAnimationManifest(source));
  assert.deepStrictEqual(Object.keys(source.poseAtlases).sort(), [
    'currentMogu', 'starCompanion', 'starGuardianCandidate', 'youngMogu'
  ]);
  assert.deepStrictEqual(Object.keys(source.storyAnimations).sort(), [
    'fragmentConsumeStumble', 'ledgerBrokenPulse', 'returnLightFlicker', 'reverseCrackRescue'
  ]);

  for (const atlas of Object.values(source.poseAtlases)) {
    assert.equal(atlas.noAutoCrop, true);
    assert.equal(atlas.width, atlas.columns * atlas.cell.width);
    assert.equal(atlas.height, atlas.rows * atlas.cell.height);
    const frames = [...Object.values(atlas.states), ...(atlas.emptyFrames || [])];
    assert.equal(new Set(frames).size, frames.length);
    assert.equal(frames.length, atlas.columns * atlas.rows);
    for (const bounds of Object.values(atlas.visualBounds.frames)) {
      const margins = [
        bounds.x,
        bounds.y,
        atlas.cell.width - bounds.x - bounds.width,
        atlas.cell.height - bounds.y - bounds.height
      ];
      assert.ok(Math.min(...margins) >= 12);
    }
  }
  assert.equal(source.poseAtlases.starGuardianCandidate.lifecycle, 'approved-production');
  const guardianRecord = json('config/asset-manifest.json').catalog
    .find(record => record.logicalId === 'story_ch01_star_guardian_candidate_pose_atlas');
  assert.equal(guardianRecord.semanticRole, 'story.chapter-01.star-guardian.rescue');
  assert.equal(Object.hasOwn(guardianRecord, 'candidateReason'), false);
});

test('Chapter 01 marker order preserves the approved causality and ambiguity contracts', () => {
  const { storyAnimations: animations } = json('config/animation-manifest.json');
  const markerMap = animation => new Map(animation.eventMarkers.map(marker => [marker.id, marker]));

  const light = animations.returnLightFlicker;
  assert.equal(light.loop, true);
  assert.equal(light.phases.filter(phase => phase.id === 'weaken-once').length, 1);
  assert.ok(light.phases.some(phase => phase.id === 'minimum-not-off'));

  const rescue = animations.reverseCrackRescue;
  const rescueMarkers = markerMap(rescue);
  assert.ok(rescueMarkers.get('reverse_begin').atMs < rescueMarkers.get('crack_begin').atMs);
  assert.ok(rescueMarkers.get('crack_begin').atMs < rescueMarkers.get('mogu_caught').atMs);
  assert.ok(rescueMarkers.get('mogu_caught').atMs < rescueMarkers.get('guardian_commit').atMs);
  assert.ok(rescueMarkers.get('guardian_commit').atMs < rescueMarkers.get('guardian_contact').atMs);
  assert.equal(rescue.assetIds.includes('story_ch01_star_companion_pose_atlas'), false);

  const fragment = animations.fragmentConsumeStumble;
  const fragmentMarkers = markerMap(fragment);
  assert.equal(fragment.interaction.type, 'deliberate-hold-no-time-limit-no-failure');
  assert.equal(fragment.interaction.qte, false);
  assert.equal(fragment.interaction.choiceBranch, false);
  assert.equal(
    fragment.nominalDurationMsAtEarliestCommit,
    fragment.preCommitLogicalTimeMs + fragment.interaction.requiredHoldMs + fragment.nominalDurationMsAfterHoldConfirmed
  );
  assert.ok(fragmentMarkers.get('community_light_restored').atMs < fragmentMarkers.get('body_interference').atMs);
  assert.ok(fragmentMarkers.get('body_interference').atMs < fragmentMarkers.get('stumble').atMs);

  const ledger = animations.ledgerBrokenPulse;
  const ledgerMarkers = markerMap(ledger);
  assert.equal(ledger.exactGapDurationMs, 320);
  assert.equal(ledgerMarkers.get('gap_end').atMs - ledgerMarkers.get('gap_begin').atMs, 320);

  for (const animation of Object.values(animations)) {
    assert.ok(animation.reducedMotion);
    for (const marker of animation.eventMarkers || []) assert.equal(marker.oneShot, true);
    assert.equal(animation.lifecycle.pause, 'freeze-animation-clock-vfx-and-hold-timer');
    assert.equal(animation.lifecycle.resume, 'continue-from-frozen-time-without-catch-up');
    assert.equal(animation.lifecycle.markerGuarantee, 'each-one-shot-marker-fires-at-most-once-per-run');
  }
});

test('every story animation asset reference resolves to exactly one approved story pack entry', () => {
  const assets = json('config/asset-manifest.json');
  const animations = json('config/animation-manifest.json').storyAnimations;
  const catalogIds = new Set(assets.catalog.map(record => record.logicalId));
  const packedIds = new Set(
    assets.runtimeManifest.packs
      .filter(pack => pack.id.startsWith('story-ch01-'))
      .flatMap(pack => pack.assets.map(entry => entry.id))
  );
  for (const animation of Object.values(animations)) {
    for (const assetId of animation.assetIds) {
      assert.ok(catalogIds.has(assetId), `${animation.animationId} catalog reference ${assetId}`);
      assert.ok(packedIds.has(assetId), `${animation.animationId} pack reference ${assetId}`);
    }
  }
});
