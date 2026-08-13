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
  assert.equal(active.length, 36);
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
  const { validateLegacyUncatalogedReferences } = await import('../scripts/validate-assets.mjs');
  const source = json('config/asset-manifest.json');
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
