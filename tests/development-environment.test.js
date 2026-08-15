'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function json(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

test('canonical manifests project exactly to current runtime compatibility files', async () => {
  const { projectAnimationManifest, projectAssetManifest } = await import('../scripts/validate-project-state.mjs');
  const state = json('config/project-state.json');
  assert.deepStrictEqual(
    projectAssetManifest(json(state.validation.assetSource), state),
    json(state.validation.assetRuntimeOutput)
  );
  assert.deepStrictEqual(
    projectAnimationManifest(json(state.validation.animationSource)),
    json(state.validation.animationRuntimeOutput)
  );
});

test('completed deployment state fails closed when any release-control field drifts', async () => {
  const { completedDeploymentMismatches } = await import('../scripts/validate-project-state.mjs');
  const target = {
    mode: 'github-actions',
    sourceBranch: 'main',
    publishesOnPush: false,
    trigger: 'workflow_dispatch',
    workflow: '.github/workflows/deploy-pages.yml'
  };
  assert.deepStrictEqual(completedDeploymentMismatches(target, target), []);
  for (const field of Object.keys(target)) {
    const drifted = { ...target, [field]: field === 'publishesOnPush' ? true : `wrong-${field}` };
    assert.deepStrictEqual(completedDeploymentMismatches(drifted, target), [field]);
  }
});

test('service worker remains off and an attempted ON transition detects stale precache files', async () => {
  const { inspectServiceWorker, validateServiceWorker } = await import('../scripts/validate-service-worker.mjs');
  const state = json('config/project-state.json');
  assert.equal(state.runtime.serviceWorker.enabled, false);
  assert.deepStrictEqual(validateServiceWorker(ROOT).errors, []);

  const enabledState = structuredClone(state);
  enabledState.runtime.serviceWorker.enabled = true;
  const config = fs.readFileSync(path.join(ROOT, state.runtime.serviceWorker.configFile), 'utf8')
    .replace('registerServiceWorker: false', 'registerServiceWorker: true');
  const worker = fs.readFileSync(path.join(ROOT, state.runtime.serviceWorker.scriptFile), 'utf8');
  const inspection = inspectServiceWorker(ROOT, enabledState, config, worker);
  assert.equal(inspection.configuredEnabled, true);
  assert.ok(inspection.missing.length > 0, 'the current stale precache list must block an unreviewed ON transition');
  assert.equal(inspection.cacheMatchesVersion, false, 'the stale cache namespace must block an unreviewed ON transition');
});

test('active production assets have unique lifecycle and provenance catalog records', () => {
  const source = json('config/asset-manifest.json');
  const active = source.catalog.filter((record) => record.lifecycle.status === 'active');
  assert.equal(active.length, 87);
  assert.equal(new Set(active.map((record) => record.logicalId)).size, active.length);
  assert.equal(new Set(active.map((record) => record.path)).size, active.length);
  for (const record of active) {
    assert.ok(Object.hasOwn(record, 'sourceMaster'));
    assert.ok(Object.hasOwn(record.provenance, 'approvedDate'));
    assert.equal(record.lifecycle.deprecated, false);
    assert.equal(record.lifecycle.replacement, null);
    assert.equal(record.integrity.strategy, 'git-blob-sha1');
    assert.match(record.integrity.sha256, /^[a-f0-9]{64}$/);
    assert.match(record.transparency.channels, /^s?graya?$|^s?rgba?$|^cmyka?$/i);
    assert.equal(record.transparency.hasAlpha, record.transparency.channels.toLowerCase().endsWith('a'));
  }
});

test('loading feedback uses the approved dedicated child Mogu sheet with aligned manifests and UI motion', () => {
  const state = json('config/project-state.json');
  const source = json('config/asset-manifest.json');
  const runtime = json('assets/manifest.json');
  const animation = json('config/animation-manifest.json');
  assert.equal(state.versions.assetManifest, '3.3.2-loading-child');
  assert.equal(source.runtimeManifest.version, state.versions.assetManifest);
  assert.equal(runtime.version, state.versions.assetManifest);
  assert.equal(source.runtimeManifest.critical.length, 17);
  assert.equal(runtime.critical.length, 17);
  assert.deepStrictEqual(
    source.runtimeManifest.critical.find((record) => record.id === 'home_v2_expedition_mogu'),
    {
      id: 'home_v2_expedition_mogu',
      type: 'image',
      src: 'assets/images/home-v2/expedition_mogu.png'
    }
  );
  assert.deepStrictEqual(
    source.runtimeManifest.critical.find((record) => record.id === 'loading_child_mogu_flight'),
    {
      id: 'loading_child_mogu_flight',
      type: 'image',
      src: 'assets/images/loading/child-mogu-flight.webp'
    }
  );
  assert.deepStrictEqual(runtime.critical, source.runtimeManifest.critical);
  const canonicalAtlas = source.runtimeManifest.packs.find((pack) => pack.id === 'battle-v3')
    .assets.find((asset) => asset.id === 'battle_v3_atlas_manifest');
  const runtimeAtlas = runtime.packs.find((pack) => pack.id === 'battle-v3')
    .assets.find((asset) => asset.id === 'battle_v3_atlas_manifest');
  assert.equal(canonicalAtlas.src, 'assets/images/battle-v3/atlas.json?v=20260814-motion-rig2-1');
  assert.deepStrictEqual(runtimeAtlas, canonicalAtlas, 'warm and foreground atlas requests must share the exact cache URL');
  const expeditionCatalog = source.catalog.find((record) => record.logicalId === 'home_v2_expedition_mogu');
  assert.deepStrictEqual(expeditionCatalog.usage.screens, ['home']);
  assert.deepStrictEqual(expeditionCatalog.usage.states, ['expedition']);
  assert.equal(expeditionCatalog.lifecycle.status, 'active');
  assert.equal(expeditionCatalog.semanticRole, 'home.expedition');

  const loadingCatalog = source.catalog.find((record) => record.logicalId === 'loading_child_mogu_flight');
  assert.deepStrictEqual(loadingCatalog.usage.screens, ['startup-loading', 'adventure-loading']);
  assert.deepStrictEqual(loadingCatalog.usage.states, ['neutral', 'complete']);
  assert.equal(loadingCatalog.lifecycle.status, 'active');
  assert.equal(loadingCatalog.semanticRole, 'loading.progress-companion.neutral+complete');
  assert.deepStrictEqual(loadingCatalog.dimensions, { width: 256, height: 128 });
  assert.equal(loadingCatalog.sourceMasterId, 'battle_v3_companions:frames-0-and-7');
  assert.equal(loadingCatalog.provenance.approvalBasis, 'approved-by-user-preview');
  assert.equal(loadingCatalog.approval.status, 'approved');

  const loadingMotion = animation.uiAnimations.loadingChildMoguFlight;
  assert.equal(loadingMotion.assetId, 'loading_child_mogu_flight');
  assert.deepStrictEqual(loadingMotion.surfaces, ['startup-loading', 'adventure-loading']);
  assert.deepStrictEqual(loadingMotion.spriteSheet.cell, { width: 128, height: 128 });
  assert.equal(loadingMotion.spriteSheet.backgroundSize, '200% 100%');
  assert.deepStrictEqual(loadingMotion.spriteSheet.frames.neutral, {
    index: 0,
    backgroundPosition: '0 0',
    sourceAtlasAssetId: 'battle_v3_companions',
    sourceAtlasFrame: 0
  });
  assert.deepStrictEqual(loadingMotion.spriteSheet.frames.complete, {
    index: 1,
    backgroundPosition: '100% 0',
    sourceAtlasAssetId: 'battle_v3_companions',
    sourceAtlasFrame: 7
  });
  assert.deepStrictEqual(loadingMotion.pivot, { space: 'cell-normalized', x: 0.5, y: 0.78 });
  assert.deepStrictEqual(loadingMotion.visualBounds.union, { x: 7, y: 11, width: 106, height: 97 });
  assert.deepStrictEqual(loadingMotion.visualBounds.frames.neutral, { x: 15, y: 24, width: 98, height: 84 });
  assert.deepStrictEqual(loadingMotion.visualBounds.frames.complete, { x: 7, y: 11, width: 98, height: 92 });
  assert.equal(loadingMotion.noAutoCrop, true);
  assert.equal(loadingMotion.progressMotion.plateau.horizontalDeltaPx, 0);
  assert.equal(loadingMotion.progressMotion.advance.horizontalPositionSource, 'effective-progress-fill-tip');
  assert.equal(loadingMotion.progressMotion.advance.synchronizeWithFill, true);
  assert.equal(loadingMotion.progressMotion.complete.frame, 'complete');
  assert.equal(loadingMotion.reducedMotion.preserveFrameStateChange, true);
  assert.equal(animation.runtimeVersion, 2, 'loading UI motion must not change the battle projection version');
  assert.equal(state.versions.animationManifest, 2);
});

test('root report artifacts ignore rule does not hide nested production artifact art', () => {
  const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  assert.match(ignore, /^\/artifacts\/$/m);
  assert.doesNotMatch(ignore, /^artifacts\/$/m);
});

test('legacy unknown approval is bound to an immutable ID and SHA-256 allowlist', async () => {
  const { isAuthorizedLegacyBackfill } = await import('../scripts/validate-assets.mjs');
  const source = json('config/asset-manifest.json');
  const existing = structuredClone(source.catalog[0]);
  assert.equal(existing.approval.status, 'audit-backfill-unknown');
  assert.equal(isAuthorizedLegacyBackfill(existing, source), true);
  existing.integrity.sha256 = '0'.repeat(64);
  assert.equal(isAuthorizedLegacyBackfill(existing, source), false, 'changed legacy bytes require approval metadata');
  const newUnknown = structuredClone(source.catalog[0]);
  newUnknown.logicalId = 'new_unknown_asset';
  assert.equal(isAuthorizedLegacyBackfill(newUnknown, source), false, 'new assets cannot inherit unknown approval');
});

test('uncataloged runtime references are accepted only at their fixed legacy path and SHA-256', async () => {
  const { runtimeReferencedAssets, validateLegacyUncatalogedReferences } = await import('../scripts/validate-assets.mjs');
  const source = json('config/asset-manifest.json');
  const state = json('config/project-state.json');
  const runtimeReferences = runtimeReferencedAssets(ROOT, source, state);
  assert.equal(runtimeReferences.includes(source.generatedFile), false,
    'the parity-validated generated runtime projection must not be SHA-pinned as legacy media');
  assert.equal(runtimeReferences.includes(source.runtimeManifest.images.ui_refresh_artifacts_violet_engine), true);
  const legacy = source.legacyUncatalogedReferences[0];
  const fixtureSource = {
    catalog: source.catalog,
    legacyUncatalogedReferences: [legacy]
  };
  assert.deepStrictEqual(validateLegacyUncatalogedReferences([legacy.path], fixtureSource, ROOT), []);
  assert.match(
    validateLegacyUncatalogedReferences(['assets/images/new-uncataloged.png'], { ...fixtureSource, legacyUncatalogedReferences: [] }, ROOT)[0],
    /new uncataloged runtime reference is forbidden/
  );
  const wrongHash = { path: legacy.path, sha256: '0'.repeat(64) };
  assert.match(
    validateLegacyUncatalogedReferences([legacy.path], { ...fixtureSource, legacyUncatalogedReferences: [wrongHash] }, ROOT)[0],
    /changed and must be cataloged/
  );
});

test('trusted governance baseline rejects simultaneous legacy allowlist additions and mutations', async () => {
  const {
    resolveGovernanceBaseline,
    validateGovernanceAllowlistEvolution
  } = await import('../scripts/validate-assets.mjs');
  const baseline = {
    catalog: [],
    legacyBackfill: [{ logicalId: 'legacy_one', sha256: '1'.repeat(64) }],
    legacyUncatalogedReferences: [{ path: 'assets/legacy-one.png', sha256: '2'.repeat(64) }]
  };
  const changed = {
    catalog: [],
    legacyBackfill: [
      { logicalId: 'legacy_one', sha256: '3'.repeat(64) },
      { logicalId: 'legacy_two', sha256: '4'.repeat(64) }
    ],
    legacyUncatalogedReferences: [
      { path: 'assets/legacy-one.png', sha256: '5'.repeat(64) },
      { path: 'assets/legacy-two.png', sha256: '6'.repeat(64) }
    ]
  };
  const errors = validateGovernanceAllowlistEvolution(baseline, changed, [
    'assets/legacy-one.png', 'assets/legacy-two.png'
  ]);
  assert.equal(errors.length, 4);
  assert.ok(errors.some((message) => /legacyBackfill cannot add/.test(message)));
  assert.ok(errors.some((message) => /legacyBackfill cannot change/.test(message)));
  assert.ok(errors.some((message) => /legacyUncatalogedReferences cannot add/.test(message)));
  assert.ok(errors.some((message) => /legacyUncatalogedReferences cannot change/.test(message)));
  assert.throws(
    () => resolveGovernanceBaseline(ROOT, '0'.repeat(40)),
    /cannot be resolved to a commit/,
    'an explicit but unavailable CI base SHA must fail closed'
  );
});

test('JSON loader rejects duplicate object keys before JSON.parse can hide them', async () => {
  const { duplicateJsonKeys } = await import('../scripts/lib/validation.mjs');
  assert.deepStrictEqual(duplicateJsonKeys('{"padding":{"top":1,"top":2}}'), ['top']);
  assert.deepStrictEqual(duplicateJsonKeys('{"top":1,"nested":{"top":2}}'), []);
});

test('all animation atlases define non-cropping, logic-authoritative motion contracts', () => {
  const animation = json('config/animation-manifest.json');
  assert.deepStrictEqual(Object.keys(animation.motionProfiles).sort(), Object.keys(animation.atlases).sort());
  for (const [actor, profile] of Object.entries(animation.motionProfiles)) {
    assert.equal(profile.noAutoCrop, true);
    assert.equal(profile.collisionSync.authority, 'MoguriaGame');
    assert.equal(profile.collisionSync.deriveHitboxFromFrame, false);
    assert.equal(profile.reducedMotion.preserveStateChanges, true);
    assert.ok(Array.isArray(profile.eventMarkers));
    const runtimeSemanticStates = new Set([
      ...Object.values(animation.semanticStateMappings[actor]),
      ...animation.semanticDerivedStates[actor].map((record) => record.state)
    ]);
    for (const marker of profile.eventMarkers) {
      assert.ok(runtimeSemanticStates.has(marker.state), `${actor}:${marker.id} must name a runtime semantic state`);
    }
  }
});

test('Pages staging is fixed, idempotent, allowlisted, and refuses unsafe targets', async (t) => {
  const { preparePages } = await import('../scripts/prepare-pages.mjs');
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'moguria-pages-test-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const artifactPaths = [
    'index.html', 'style.css', 'VERSION.txt', 'service-worker.js',
    'assets', 'css', 'data', 'js', 'vendor', '.nojekyll'
  ];
  fs.mkdirSync(path.join(fixture, 'config'), { recursive: true });
  fs.writeFileSync(path.join(fixture, 'config/project-state.json'), JSON.stringify({ deployment: { artifactPaths } }));
  for (const item of ['index.html', 'style.css', 'VERSION.txt', 'service-worker.js', '.nojekyll']) {
    fs.writeFileSync(path.join(fixture, item), item);
  }
  for (const directory of ['assets', 'css', 'data', 'js', 'vendor', 'docs', 'scripts', 'tests', '.github']) {
    fs.mkdirSync(path.join(fixture, directory), { recursive: true });
    fs.writeFileSync(path.join(fixture, directory, 'sample.txt'), directory);
  }

  assert.throws(() => preparePages(fixture, '.'), /dedicated _site/);
  assert.throws(() => preparePages(fixture, 'config'), /dedicated _site/);
  fs.mkdirSync(path.join(fixture, '_site'));
  fs.writeFileSync(path.join(fixture, '_site/user-file.txt'), 'preserve');
  assert.throws(() => preparePages(fixture), /unmarked or unsafe output/);
  assert.equal(fs.readFileSync(path.join(fixture, '_site/user-file.txt'), 'utf8'), 'preserve');

  fs.writeFileSync(path.join(fixture, '_site.moguria-generated'), 'generated by scripts/prepare-pages.mjs\n');
  const first = preparePages(fixture);
  const second = preparePages(fixture);
  assert.deepStrictEqual(second.files, first.files);
  assert.ok(fs.existsSync(path.join(fixture, '_site.moguria-generated')));
  for (const item of artifactPaths) assert.ok(fs.existsSync(path.join(fixture, '_site', item)), `${item} must be staged`);
  for (const excluded of ['docs', 'config', 'scripts', 'tests', '.github']) {
    assert.equal(fs.existsSync(path.join(fixture, '_site', excluded)), false, `${excluded} must not be staged`);
  }

  if (process.platform !== 'win32') {
    fs.rmSync(path.join(fixture, '_site'), { recursive: true, force: true });
    fs.mkdirSync(path.join(fixture, '_site'));
    fs.writeFileSync(path.join(fixture, '_site.moguria-generated'), 'generated by scripts/prepare-pages.mjs\n');
    fs.rmSync(path.join(fixture, 'assets'), { recursive: true });
    fs.symlinkSync(path.join(fixture, 'docs'), path.join(fixture, 'assets'), 'dir');
    assert.throws(() => preparePages(fixture), /symbolic link/);
  }
});
