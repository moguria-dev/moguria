import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ROOT,
  ValidationReport,
  collectEntrypointResources,
  fileBytes,
  formatBytes,
  gitBlobSha1,
  imageDimensions,
  isDirectRun,
  duplicateJsonKeys,
  readJson,
  repoPath,
  stripUrlSuffix,
  unique
} from './lib/validation.mjs';

const REQUIRED_CATALOG_FIELDS = [
  'logicalId', 'category', 'semanticRole', 'path', 'type', 'format', 'usage',
  'lifecycle', 'version', 'dimensions', 'minDisplay', 'transparency', 'padding',
  'sourceMaster', 'sourceMasterId', 'provenance', 'approval', 'integrity'
];
const REQUIRED_MOTION_FIELDS = [
  'pivot', 'origin', 'facing', 'noAutoCrop', 'transitions', 'interrupts',
  'eventMarkers', 'collisionSync', 'fallback', 'reducedMotion'
];
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

function hasOwn(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function imageMagickChannels(filePath) {
  for (const command of ['magick', 'identify']) {
    const args = command === 'magick' ? ['identify', '-format', '%[channels]', filePath] : ['-format', '%[channels]', filePath];
    const result = spawnSync(command, args, { encoding: 'utf8' });
    if (!result.error && result.status === 0) return result.stdout.trim();
  }
  throw new Error('ImageMagick identify is unavailable');
}

function allRuntimeEntries(manifest) {
  return [
    ...(manifest.critical || []),
    ...(manifest.lazy || []),
    ...(manifest.packs || []).flatMap((pack) => pack.assets || [])
  ];
}

export function isAuthorizedLegacyBackfill(record, source) {
  return (source.legacyBackfill || []).some((entry) => (
    entry.logicalId === record.logicalId &&
    entry.sha256 === record.integrity?.sha256
  ));
}

function isApprovedCatalogRecord(record) {
  return Boolean(
    record?.approval?.status === 'approved' &&
    typeof record.approval.approvedAt === 'string' &&
    !Number.isNaN(Date.parse(record.approval.approvedAt)) &&
    typeof record.sourceMasterId === 'string' &&
    record.sourceMasterId.length > 0 &&
    typeof record.provenance?.method === 'string' &&
    record.provenance.method.length > 0 &&
    typeof record.provenance?.source === 'string' &&
    record.provenance.source.length > 0 &&
    record.provenance.source !== 'unknown'
  );
}

function git(root, args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8' });
}

function resolveCommit(root, revision, label) {
  const result = git(root, ['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`]);
  if (result.error || result.status !== 0) {
    throw new Error(`${label} cannot be resolved to a commit: ${revision}`);
  }
  const sha = result.stdout.trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error(`${label} did not resolve to a full commit SHA`);
  return sha;
}

function showGitFile(root, commitSha, relativePath) {
  const result = git(root, ['show', `${commitSha}:${relativePath}`]);
  if (!result.error && result.status === 0) return result.stdout;
  const tree = git(root, ['ls-tree', '--name-only', commitSha, '--', relativePath]);
  if (!tree.error && tree.status === 0 && tree.stdout.trim() === '') return null;
  throw new Error(`git show failed for ${commitSha}:${relativePath}`);
}

export function resolveGovernanceBaseline(root = ROOT, explicitSha = process.env.MOGURIA_GOVERNANCE_BASE_SHA || '') {
  const requested = explicitSha.trim();
  if (requested) {
    if (!/^[a-f0-9]{40}$/i.test(requested)) {
      throw new Error('MOGURIA_GOVERNANCE_BASE_SHA must be an explicit 40-character commit SHA');
    }
    return { sha: resolveCommit(root, requested.toLowerCase(), 'explicit governance baseline'), mode: 'explicit' };
  }

  const head = resolveCommit(root, 'HEAD', 'local HEAD');
  const manifestPath = 'config/asset-manifest.json';
  if (showGitFile(root, head, manifestPath) === null) return { sha: head, mode: 'local-bootstrap-head' };

  const diff = git(root, ['diff', '--quiet', 'HEAD', '--', manifestPath]);
  if (diff.error || ![0, 1].includes(diff.status)) throw new Error('cannot inspect local asset manifest changes');
  if (diff.status === 1) return { sha: head, mode: 'local-worktree-base' };

  const parent = git(root, ['rev-parse', '--verify', '--end-of-options', 'HEAD^{commit}^']);
  if (!parent.error && parent.status === 0 && /^[a-f0-9]{40}\s*$/.test(parent.stdout)) {
    return { sha: parent.stdout.trim(), mode: 'local-parent-base' };
  }
  return { sha: head, mode: 'local-root-base' };
}

export function readGovernanceBaseline(root, manifestPath, explicitSha = process.env.MOGURIA_GOVERNANCE_BASE_SHA || '') {
  const baseline = resolveGovernanceBaseline(root, explicitSha);
  const source = showGitFile(root, baseline.sha, manifestPath);
  if (source === null) {
    const history = git(root, ['log', '--format=%H', baseline.sha, '--', manifestPath]);
    if (history.error || history.status !== 0) throw new Error('cannot inspect asset governance history');
    if (history.stdout.trim()) {
      throw new Error(`governance baseline ${baseline.sha} is missing a previously established ${manifestPath}`);
    }
    return { ...baseline, source: null, bootstrap: true };
  }
  const duplicates = duplicateJsonKeys(source);
  if (duplicates.length > 0) throw new Error(`governance baseline has duplicate JSON key(s): ${duplicates.join(', ')}`);
  return { ...baseline, source: JSON.parse(source), bootstrap: false };
}

export function validateGovernanceAllowlistEvolution(baseline, current, currentReferencedPaths = []) {
  const errors = [];
  const referenced = new Set(currentReferencedPaths);
  const currentCatalogById = new Map((current.catalog || []).map((record) => [record.logicalId, record]));
  const currentCatalogByPath = new Map((current.catalog || []).map((record) => [record.path, record]));

  const compare = ({ field, key, graduationRecord, retiredPath }) => {
    const baselineEntries = baseline[field] || [];
    const currentEntries = current[field] || [];
    const baselineByKey = new Map(baselineEntries.map((entry) => [entry[key], entry]));
    const currentByKey = new Map(currentEntries.map((entry) => [entry[key], entry]));

    for (const entry of currentEntries) {
      const original = baselineByKey.get(entry[key]);
      if (!original) {
        errors.push(`${field} cannot add a new trusted entry: ${entry[key]}`);
      } else if (original.sha256 !== entry.sha256) {
        errors.push(`${field} cannot change a trusted SHA-256: ${entry[key]}`);
      }
    }

    for (const original of baselineEntries) {
      if (currentByKey.has(original[key])) continue;
      const record = graduationRecord(original);
      if (isApprovedCatalogRecord(record)) continue;
      const oldPath = retiredPath(original);
      if (!record && oldPath && !referenced.has(oldPath)) continue;
      errors.push(`${field} can be removed only after approved catalog graduation or reference retirement: ${original[key]}`);
    }
  };

  compare({
    field: 'legacyBackfill',
    key: 'logicalId',
    graduationRecord: (entry) => currentCatalogById.get(entry.logicalId),
    retiredPath: (entry) => (baseline.catalog || []).find((record) => record.logicalId === entry.logicalId)?.path
  });
  compare({
    field: 'legacyUncatalogedReferences',
    key: 'path',
    graduationRecord: (entry) => currentCatalogByPath.get(entry.path),
    retiredPath: (entry) => entry.path
  });
  return errors;
}

function walkFiles(rootDirectory) {
  const files = [];
  const stack = [rootDirectory];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else files.push(absolute);
    }
  }
  return files;
}

export function validateLegacyUncatalogedReferences(referencedPaths, source, root) {
  const catalogPaths = new Set((source.catalog || []).map((record) => record.path));
  const allowlist = source.legacyUncatalogedReferences || [];
  const allowlistByPath = new Map(allowlist.map((entry) => [entry.path, entry.sha256]));
  const errors = [];
  if (!unique(allowlist.map((entry) => entry.path))) errors.push('legacy uncataloged reference paths must be unique');
  for (const referencedPath of referencedPaths) {
    if (catalogPaths.has(referencedPath)) continue;
    const expected = allowlistByPath.get(referencedPath);
    if (!expected) {
      errors.push(`new uncataloged runtime reference is forbidden: ${referencedPath}`);
      continue;
    }
    const absolute = repoPath(root, referencedPath);
    if (!fs.existsSync(absolute)) errors.push(`legacy uncataloged runtime reference is missing: ${referencedPath}`);
    else if (crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex') !== expected) {
      errors.push(`legacy uncataloged runtime reference changed and must be cataloged: ${referencedPath}`);
    }
  }
  for (const entry of allowlist) {
    if (!referencedPaths.includes(entry.path)) errors.push(`stale legacy uncataloged allowlist entry: ${entry.path}`);
    if (!/^[a-f0-9]{64}$/.test(entry.sha256 || '')) errors.push(`invalid legacy uncataloged SHA-256: ${entry.path}`);
  }
  return errors;
}

export function runtimeReferencedAssets(root, source, state) {
  const referenced = new Set();
  const generatedFile = stripUrlSuffix(source.generatedFile || '');
  const storyGeneratedFile = stripUrlSuffix(state.validation.storyAnimationRuntimeOutput || '');
  const scanFiles = [state.runtime.entrypoint, 'style.css'];
  for (const directory of ['css', 'js']) {
    const base = repoPath(root, directory);
    for (const absolute of walkFiles(base)) {
      if (/\.(?:css|js)$/.test(absolute)) scanFiles.push(path.relative(root, absolute));
    }
  }
  for (const relative of scanFiles) {
    const text = fs.readFileSync(repoPath(root, relative), 'utf8');
    for (const match of text.matchAll(/assets\/[a-zA-Z0-9_./-]+\.(?:json|png|svg|webp)(?:[?#][^'"\s)]+)?/g)) {
      const assetPath = stripUrlSuffix(match[0]);
      // The generated runtime projection is governed by exact source-to-output
      // parity, not by the immutable legacy-media allowlist. Treating this JSON
      // output as a media asset makes every legitimate manifest update fail on
      // its previous SHA-256.
      if (assetPath !== generatedFile && assetPath !== storyGeneratedFile) referenced.add(assetPath);
    }
  }
  for (const entry of allRuntimeEntries(source.runtimeManifest || {})) {
    const assetPath = stripUrlSuffix(entry.src);
    if (assetPath !== generatedFile && assetPath !== storyGeneratedFile) referenced.add(assetPath);
  }
  return [...referenced].sort();
}

function findUnreferencedAssets(root, source, state) {
  const extensions = new Set(source.inventoryPolicy?.discoverExtensions || []);
  const assetRoot = repoPath(root, source.inventoryPolicy?.assetRoot || 'assets');
  const assets = walkFiles(assetRoot)
    .map((absolute) => path.relative(root, absolute).replaceAll(path.sep, '/'))
    .filter((relative) => extensions.has(path.posix.extname(relative)));
  const referenced = new Set();
  const scanFiles = [state.runtime.entrypoint, 'style.css'];
  for (const directory of ['css', 'js']) {
    const base = repoPath(root, directory);
    if (fs.existsSync(base)) {
      for (const absolute of walkFiles(base)) {
        if (/\.(?:css|js|json|html)$/.test(absolute)) scanFiles.push(path.relative(root, absolute));
      }
    }
  }
  for (const relative of [...new Set(scanFiles)]) {
    const text = fs.readFileSync(repoPath(root, relative), 'utf8');
    for (const match of text.matchAll(/assets\/[a-zA-Z0-9_./-]+\.(?:json|png|svg|webp)(?:[?#][^'"\s)]+)?/g)) {
      referenced.add(stripUrlSuffix(match[0]));
    }
  }
  for (const record of source.catalog || []) referenced.add(record.path);
  for (const entry of allRuntimeEntries(source.runtimeManifest || {})) referenced.add(stripUrlSuffix(entry.src));
  for (const assetPath of Object.values(source.runtimeManifest?.images || {})) referenced.add(stripUrlSuffix(assetPath));
  const animation = readJson(root, state.validation.animationSource);
  for (const record of [...Object.values(animation.atlases || {}), ...Object.values(animation.backgrounds || {})]) referenced.add(record.image);
  for (const profile of Object.values(animation.motionProfiles || {})) referenced.add(profile.fallback?.missingAsset);
  return assets.filter((asset) => !referenced.has(asset)).sort();
}

function validateCatalog(root, source, report) {
  const catalog = source.catalog || [];
  const backfill = source.legacyBackfill || [];
  report.check(Array.isArray(catalog) && catalog.length > 0, 'asset catalog must not be empty');
  report.check(Array.isArray(backfill), 'legacyBackfill must be an array');
  report.check(unique(backfill.map((entry) => entry.logicalId)), 'legacyBackfill logicalId values must be unique');
  for (const entry of backfill) {
    report.check(typeof entry.logicalId === 'string' && entry.logicalId.length > 0, 'legacyBackfill logicalId is required');
    report.check(/^[a-f0-9]{64}$/.test(entry.sha256 || ''), `legacyBackfill ${entry.logicalId} sha256 is invalid`);
  }
  const ids = catalog.map((record) => record.logicalId);
  const paths = catalog.map((record) => record.path);
  report.check(unique(ids), 'asset catalog logicalId values must be unique');
  report.check(unique(paths), 'asset catalog paths must be unique');

  for (const record of catalog) {
    const label = record.logicalId || '<missing logicalId>';
    for (const field of REQUIRED_CATALOG_FIELDS) {
      report.check(hasOwn(record, field), `catalog ${label} is missing ${field}`);
    }
    report.check(typeof record.logicalId === 'string' && /^[a-z0-9_]+$/.test(record.logicalId), `${label} has an invalid logicalId`);
    report.check(record.type === 'image', `${label} type must be image`);
    report.check(typeof record.category === 'string' && record.category.length > 0, `${label} category is required`);
    report.check(typeof record.semanticRole === 'string' && record.semanticRole.length > 0, `${label} semanticRole is required`);
    report.check(record.format === path.posix.extname(record.path).slice(1).toLowerCase(), `${label} format differs from path`);
    report.check(Array.isArray(record.usage?.screens) && record.usage.screens.length > 0, `${label} usage.screens is required`);
    report.check(Array.isArray(record.usage?.states) && record.usage.states.length > 0, `${label} usage.states is required`);
    report.check(['active', 'deprecated', 'planned'].includes(record.lifecycle?.status), `${label} lifecycle.status is invalid`);
    report.check(typeof record.lifecycle?.deprecated === 'boolean', `${label} lifecycle.deprecated must be boolean`);
    report.check(hasOwn(record.lifecycle || {}, 'replacement'), `${label} lifecycle.replacement is required (null is allowed)`);
    report.check(typeof record.version?.cacheToken === 'string' && record.version.cacheToken.length > 0, `${label} version.cacheToken is required`);
    report.check(Number.isInteger(record.dimensions?.width) && record.dimensions.width > 0, `${label} dimensions.width is invalid`);
    report.check(Number.isInteger(record.dimensions?.height) && record.dimensions.height > 0, `${label} dimensions.height is invalid`);
    report.check(Number.isInteger(record.minDisplay?.width) && record.minDisplay.width > 0, `${label} minDisplay.width is invalid`);
    report.check(Number.isInteger(record.minDisplay?.height) && record.minDisplay.height > 0, `${label} minDisplay.height is invalid`);
    report.check(record.minDisplay?.unit === 'css-px', `${label} minDisplay.unit must be css-px`);
    report.check(hasOwn(record, 'sourceMaster'), `${label} sourceMaster is required (null is allowed)`);
    report.check(hasOwn(record, 'sourceMasterId'), `${label} sourceMasterId is required (null is allowed for audited legacy assets)`);
    report.check(typeof record.provenance?.method === 'string' && record.provenance.method.length > 0, `${label} provenance.method is required`);
    report.check(hasOwn(record.provenance || {}, 'source'), `${label} provenance.source is required`);
    report.check(hasOwn(record.provenance || {}, 'approvedDate'), `${label} provenance.approvedDate is required (null is allowed)`);
    report.check(['approved', 'audit-backfill-unknown'].includes(record.approval?.status), `${label} approval.status is invalid`);
    report.check(hasOwn(record.approval || {}, 'approvedAt'), `${label} approval.approvedAt is required`);
    const isBackfill = record.approval?.status === 'audit-backfill-unknown';
    if (isBackfill) {
      report.check(isAuthorizedLegacyBackfill(record, source),
        `${label} unknown approval is allowed only at its fixed legacyBackfill SHA-256`);
      report.check(record.approval.approvedAt === null && record.sourceMasterId === null,
        `${label} audit backfill must preserve unknown approval/master as null`);
    } else {
      report.check(typeof record.approval.approvedAt === 'string' && !Number.isNaN(Date.parse(record.approval.approvedAt)),
        `${label} approved asset requires a valid approvedAt date`);
      report.check(typeof record.sourceMasterId === 'string' && record.sourceMasterId.length > 0,
        `${label} approved asset requires sourceMasterId`);
      report.check(record.provenance.source !== 'unknown', `${label} approved asset requires durable provenance`);
    }
    report.check(record.integrity?.strategy === 'git-blob-sha1', `${label} integrity.strategy must be git-blob-sha1`);
    report.check(/^[a-f0-9]{40}$/.test(record.integrity?.value || ''), `${label} integrity.value must be a Git blob SHA-1`);
    report.check(/^[a-f0-9]{64}$/.test(record.integrity?.sha256 || ''), `${label} integrity.sha256 must be SHA-256`);
    report.check(record.transparency?.status === 'verified-imagemagick', `${label} transparency must be verified by ImageMagick`);
    report.check(typeof record.transparency?.hasAlpha === 'boolean', `${label} transparency.hasAlpha must be boolean`);
    report.check(typeof record.transparency?.channels === 'string' && record.transparency.channels.length > 0, `${label} transparency.channels is required`);
    report.check(record.padding?.status === 'unverified', `${label} legacy padding status must remain explicit and unverified`);
    for (const side of ['top', 'right', 'bottom', 'left']) report.check(hasOwn(record.padding || {}, side), `${label} padding.${side} is required`);

    const fullPath = report.capture(`resolve catalog path ${label}`, () => repoPath(root, record.path));
    if (!fullPath || !report.check(fs.existsSync(fullPath), `${label} file is missing: ${record.path}`)) continue;
    const bytes = fs.readFileSync(fullPath);
    const dimensions = report.capture(`read dimensions for ${label}`, () => imageDimensions(bytes, record.path));
    if (dimensions) {
      report.check(dimensions.width === record.dimensions.width && dimensions.height === record.dimensions.height,
        `${label} declared ${record.dimensions.width}x${record.dimensions.height}, actual ${dimensions.width}x${dimensions.height}`);
    }
    report.check(gitBlobSha1(bytes) === record.integrity.value, `${label} Git blob SHA-1 is stale`);
    report.check(crypto.createHash('sha256').update(bytes).digest('hex') === record.integrity.sha256, `${label} SHA-256 is stale`);
    const channels = report.capture(`measure transparency for ${label}`, () => imageMagickChannels(fullPath));
    if (channels) {
      report.check(channels === record.transparency.channels, `${label} ImageMagick channels differ from manifest`);
      report.check(channels.toLowerCase().endsWith('a') === record.transparency.hasAlpha, `${label} alpha metadata differs from ImageMagick`);
    }
  }
  for (const entry of backfill) {
    report.check(catalog.some((record) => record.logicalId === entry.logicalId), `legacyBackfill references missing catalog id: ${entry.logicalId}`);
  }

  const activePaths = new Set(catalog.filter((record) => record.lifecycle?.status === 'active').map((record) => record.path));
  const runtime = source.runtimeManifest || {};
  const governedPaths = [
    ...(runtime.critical || []).filter((entry) => entry.type === 'image').map((entry) => stripUrlSuffix(entry.src)),
    ...(runtime.packs || []).flatMap((pack) => pack.assets || []).filter((entry) => entry.type === 'image').map((entry) => stripUrlSuffix(entry.src))
  ];
  const skillRoot = repoPath(root, 'assets/images/skill-icons');
  if (fs.existsSync(skillRoot)) {
    for (const filename of fs.readdirSync(skillRoot).filter((name) => name.endsWith('.webp')).sort()) {
      governedPaths.push(`assets/images/skill-icons/${filename}`);
    }
  }
  for (const assetPath of governedPaths) {
    report.check(activePaths.has(assetPath), `active runtime asset lacks a lifecycle catalog record: ${assetPath}`);
  }
}

function validateStoryAssetPacks(source, state, report) {
  const catalogById = new Map((source.catalog || []).map((record) => [record.logicalId, record]));
  const runtime = source.runtimeManifest || {};
  const storyIds = new Set(STORY_ASSET_IDS);
  const criticalIds = new Set((runtime.critical || []).map((entry) => entry.id));
  const lazyIds = new Set((runtime.lazy || []).map((entry) => entry.id));
  report.check((runtime.critical || []).length === 17, 'story assets must keep the startup critical set at 17 entries');
  report.check(STORY_ASSET_IDS.every((id) => !criticalIds.has(id) && !lazyIds.has(id)),
    'story images must remain scene-pack-only and outside critical/lazy');

  for (const id of STORY_ASSET_IDS) {
    const record = catalogById.get(id);
    report.check(Boolean(record), `story asset lacks a catalog record: ${id}`);
    if (!record) continue;
    report.check(record.lifecycle?.status === 'active' && record.lifecycle?.deprecated === false,
      `${id} must be active and non-deprecated`);
    report.check(record.approval?.status === 'approved' && record.approval?.approvedAt === '2026-08-16',
      `${id} must record the 2026-08-16 production approval`);
    report.check(record.provenance?.approvedDate === '2026-08-16',
      `${id} provenance must record the 2026-08-16 approval`);
    report.check(runtime.images?.[id] === record.path, `${id} runtime image projection differs from catalog`);
  }

  const packedStoryIds = [];
  for (const [packId, expectedIds] of Object.entries(STORY_PACKS)) {
    const pack = (runtime.packs || []).find((entry) => entry.id === packId);
    report.check(Boolean(pack), `story runtime pack is missing: ${packId}`);
    if (!pack) continue;
    const actualIds = (pack.assets || []).map((entry) => entry.id);
    report.check(JSON.stringify(actualIds) === JSON.stringify(expectedIds),
      `${packId} asset order or membership differs from the approved projection`);
    packedStoryIds.push(...actualIds.filter((id) => storyIds.has(id)));
  }
  report.check(unique(packedStoryIds) && packedStoryIds.length === STORY_ASSET_IDS.length,
    'every story image must occur exactly once across the four story packs');

  const core = (runtime.packs || []).find((pack) => pack.id === 'story-ch01-core');
  const storyManifest = core?.assets?.find((entry) => entry.id === 'story_ch01_animation_manifest');
  report.check(storyManifest?.type === 'json', 'story animation runtime projection must be JSON in story-ch01-core');
  report.check(stripUrlSuffix(storyManifest?.src || '') === state.validation.storyAnimationRuntimeOutput,
    'story animation runtime path differs from project-state');
}

function validateStoryAnimation(root, projectState, assetSource, source, report) {
  const runtime = report.capture('read runtime story animation manifest', () => (
    readJson(root, projectState.validation.storyAnimationRuntimeOutput)
  ));
  report.check(source.storyGeneratedFile === projectState.validation.storyAnimationRuntimeOutput,
    'canonical storyGeneratedFile differs from project-state');
  report.check(source.storyRuntimeVersion === projectState.versions.storyAnimationManifest,
    'canonical storyRuntimeVersion differs from project-state');
  report.check(source.storyRenderContract?.renderer === 'canvas-2d-keypose-atlas-with-continuous-rig',
    'story renderer contract must use Canvas 2D key poses with a continuous rig');
  report.check(source.storyRenderContract?.battlePhaserDependency === false,
    'story renderer contract must remain independent from Battle Phaser');
  report.check(source.storyRenderContract?.loadPolicy === 'scene-specific-lazy-packs; no new critical assets',
    'story renderer must retain the scene-specific lazy-pack policy');

  if (runtime) {
    const projected = {
      version: source.storyRuntimeVersion,
      renderContract: source.storyRenderContract,
      poseAtlases: source.poseAtlases,
      storyAnimations: source.storyAnimations
    };
    report.check(JSON.stringify(runtime) === JSON.stringify(projected),
      'story animation runtime projection differs from the canonical story contract');
  }

  const catalogById = new Map((assetSource.catalog || []).map((record) => [record.logicalId, record]));
  const poseAtlases = source.poseAtlases || {};
  report.check(Object.keys(poseAtlases).length === 4, 'Chapter 01 must define four fixed-cell pose atlases');
  for (const [atlasName, atlas] of Object.entries(poseAtlases)) {
    const label = `story pose atlas ${atlasName}`;
    const record = catalogById.get(atlas.assetId);
    report.check(Boolean(record), `${label} references an unknown assetId: ${atlas.assetId}`);
    if (record) {
      report.check(record.lifecycle?.status === 'active' && record.approval?.status === 'approved',
        `${label} must reference an active approved asset`);
      report.check(record.dimensions?.width === atlas.width && record.dimensions?.height === atlas.height,
        `${label} dimensions differ from the Asset Manifest`);
      report.check(record.minDisplay?.width === atlas.minimumDisplaySizeCssPx &&
        record.minDisplay?.height === atlas.minimumDisplaySizeCssPx,
      `${label} minimum display size differs from the Asset Manifest`);
    }
    report.check(atlas.noAutoCrop === true, `${label} must prohibit automatic cropping`);
    report.check(atlas.frameOrder === 'row-major' && atlas.cellOrigin === 'top-left',
      `${label} grid ordering is invalid`);
    report.check(atlas.scaleBasis === 'cell-height', `${label} scaleBasis must be cell-height`);
    report.check(atlas.width === atlas.columns * atlas.cell?.width && atlas.height === atlas.rows * atlas.cell?.height,
      `${label} dimensions do not match its fixed-cell grid`);
    report.check(atlas.pivot?.space === 'cell-normalized' &&
      Number.isFinite(atlas.pivot?.x) && atlas.pivot.x >= 0 && atlas.pivot.x <= 1 &&
      Number.isFinite(atlas.pivot?.y) && atlas.pivot.y >= 0 && atlas.pivot.y <= 1,
    `${label} pivot must be normalized inside the fixed cell`);

    const frameLimit = atlas.columns * atlas.rows;
    const occupiedFrames = Object.values(atlas.states || {});
    const emptyFrames = atlas.emptyFrames || [];
    report.check(unique([...occupiedFrames, ...emptyFrames]), `${label} frame indices must be unique`);
    report.check([...occupiedFrames, ...emptyFrames].every((frame) => (
      Number.isInteger(frame) && frame >= 0 && frame < frameLimit
    )), `${label} has an out-of-bounds frame`);
    report.check(occupiedFrames.length + emptyFrames.length === frameLimit,
      `${label} must explicitly account for every fixed cell`);

    const boundsByState = atlas.visualBounds?.frames || {};
    report.check(atlas.visualBounds?.space === 'cell-px', `${label} visualBounds must use cell-px`);
    report.check(JSON.stringify(Object.keys(boundsByState).sort()) === JSON.stringify(Object.keys(atlas.states || {}).sort()),
      `${label} must record visual bounds for every occupied state`);
    for (const [stateName, bounds] of Object.entries(boundsByState)) {
      const right = atlas.cell.width - (bounds.x + bounds.width);
      const bottom = atlas.cell.height - (bounds.y + bounds.height);
      report.check(bounds.width > 0 && bounds.height > 0 && bounds.x >= 0 && bounds.y >= 0 && right >= 0 && bottom >= 0,
        `${label}.${stateName} visual bounds leave the fixed cell`);
      report.check(Math.min(bounds.x, bounds.y, right, bottom) >= 12,
        `${label}.${stateName} transparent guard band is below 12px`);
    }
  }

  const resolvePose = (poseReference, markerLabel) => {
    const [atlasName, stateName, extra] = String(poseReference || '').split('.');
    report.check(Boolean(atlasName && stateName && !extra), `${markerLabel} has an invalid pose reference`);
    const atlas = poseAtlases[atlasName];
    report.check(Boolean(atlas), `${markerLabel} references unknown pose atlas ${atlasName}`);
    if (atlas) report.check(hasOwn(atlas.states || {}, stateName), `${markerLabel} references unknown state ${poseReference}`);
  };

  const animations = source.storyAnimations || {};
  report.check(Object.keys(animations).length === 4, 'Chapter 01 must define four story animations');
  report.check(unique(Object.values(animations).map((animation) => animation.animationId)),
    'story animationId values must be unique');
  const lifecycleFields = [
    'pause', 'resume', 'documentHidden', 'offscreen', 'sceneExit',
    'reentry', 'duplicateStart', 'markerGuarantee'
  ];
  for (const [animationName, animation] of Object.entries(animations)) {
    const label = `story animation ${animationName}`;
    report.check(typeof animation.animationId === 'string' && animation.animationId.startsWith('story-ch01.'),
      `${label} animationId is invalid`);
    report.check(typeof animation.actorId === 'string' && animation.actorId.length > 0, `${label} actorId is required`);
    report.check(typeof animation.loop === 'boolean', `${label} loop must be boolean`);
    report.check(Array.isArray(animation.assetIds) && animation.assetIds.length > 0, `${label} assetIds are required`);
    for (const assetId of animation.assetIds || []) {
      const record = catalogById.get(assetId);
      report.check(Boolean(record), `${label} references unknown asset ${assetId}`);
      if (record) report.check(record.lifecycle?.status === 'active' && record.approval?.status === 'approved',
        `${label} references a non-active or unapproved asset ${assetId}`);
    }
    for (const field of lifecycleFields) report.check(typeof animation.lifecycle?.[field] === 'string', `${label} lifecycle.${field} is required`);
    report.check(Boolean(animation.reducedMotion), `${label} reducedMotion contract is required`);
    report.check(Array.isArray(animation.canonAssertions?.mustRead) && animation.canonAssertions.mustRead.length > 0,
      `${label} canonAssertions.mustRead is required`);
    report.check(Array.isArray(animation.canonAssertions?.mustNotRead) && animation.canonAssertions.mustNotRead.length > 0,
      `${label} canonAssertions.mustNotRead is required`);

    const markers = animation.eventMarkers || [];
    const markerIds = markers.map((marker) => marker.id);
    report.check(unique(markerIds), `${label} event marker IDs must be unique`);
    for (const marker of markers) {
      report.check(marker.oneShot === true, `${label}.${marker.id} must be one-shot`);
      report.check(Number.isFinite(marker.atMs) && marker.atMs >= 0, `${label}.${marker.id} time is invalid`);
      if (marker.pose) resolvePose(marker.pose, `${label}.${marker.id}`);
      for (const pose of marker.poses || []) resolvePose(pose, `${label}.${marker.id}`);
    }
    const markerById = new Map(markers.map((marker) => [marker.id, marker]));
    let prior = -1;
    for (const markerId of animation.requiredOrder || []) {
      const marker = markerById.get(markerId);
      report.check(Boolean(marker), `${label} requiredOrder references unknown marker ${markerId}`);
      if (!marker) continue;
      report.check(marker.atMs > prior, `${label} requiredOrder is not strictly chronological at ${markerId}`);
      prior = marker.atMs;
    }
  }

  const returnLight = animations.returnLightFlicker;
  const phases = returnLight?.phases || [];
  report.check(returnLight?.loop === true && returnLight?.durationMs === 5400,
    'Return Light must remain a 5400ms loop');
  report.check(phases.filter((phase) => phase.id === 'weaken-once').length === 1,
    'Return Light must contain exactly one irregular weakening phase');
  report.check(phases.some((phase) => phase.id === 'minimum-not-off'),
    'Return Light must declare the never-off minimum phase');
  report.check(phases.every((phase, index) => index === 0 || phase.startMs > phases[index - 1].startMs),
    'Return Light phases must be strictly chronological');

  const rescue = animations.reverseCrackRescue;
  const rescueMarkers = new Map((rescue?.eventMarkers || []).map((marker) => [marker.id, marker.atMs]));
  report.check(rescue?.loop === false, 'reverse/crack/rescue must be one-shot');
  report.check(rescueMarkers.get('reverse_begin') < rescueMarkers.get('crack_begin') &&
    rescueMarkers.get('crack_begin') < rescueMarkers.get('mogu_caught'),
  'reverse must begin before the crack and before Young Mogu is caught');
  report.check(!(rescue?.assetIds || []).includes('story_ch01_star_companion_pose_atlas'),
    'the Star Companion must not appear in the past rescue scene');

  const fragment = animations.fragmentConsumeStumble;
  const fragmentMarkers = new Map((fragment?.eventMarkers || []).map((marker) => [marker.id, marker]));
  report.check(fragment?.interaction?.type === 'deliberate-hold-no-time-limit-no-failure' &&
    fragment.interaction.qte === false && fragment.interaction.choiceBranch === false,
  'fragment interaction must remain a deliberate hold with no QTE, timeout, failure, or branch');
  report.check(fragment?.nominalDurationMsAtEarliestCommit ===
    fragment?.preCommitLogicalTimeMs + fragment?.interaction?.requiredHoldMs + fragment?.nominalDurationMsAfterHoldConfirmed,
  'fragment earliest duration must equal pre-commit + required hold + post-commit duration');
  report.check(fragmentMarkers.get('community_light_restored')?.atMs < fragmentMarkers.get('body_interference')?.atMs &&
    fragmentMarkers.get('body_interference')?.atMs < fragmentMarkers.get('stumble')?.atMs,
  'community light must restore before body interference and stumble');

  const ledger = animations.ledgerBrokenPulse;
  const ledgerMarkers = new Map((ledger?.eventMarkers || []).map((marker) => [marker.id, marker.atMs]));
  report.check(ledger?.loop === false && ledger?.exactGapDurationMs === 320,
    'ledger broken pulse must be a one-shot with an exact 320ms gap');
  report.check(ledgerMarkers.get('gap_end') - ledgerMarkers.get('gap_begin') === ledger?.exactGapDurationMs,
    'ledger gap markers differ from exactGapDurationMs');
}

function validateAnimation(root, projectState, assetSource, report) {
  const source = readJson(root, projectState.validation.animationSource);
  report.check(source.runtimeContract?.implementationStatus === 'audited-backfill',
    'animation runtime contract must disclose its audited-backfill status');
  report.check(source.runtimeContract?.runtimeConsumed === false,
    'animation metadata must not claim to be runtime-consumed before renderer integration');
  report.check(source.runtimeContract?.paritySource === 'schema-projection-and-renderer-behavior-tests',
    'animation parity source is required');
  report.check(source.runtimeContract?.parityLimit === 'does-not-deep-compare-hardcoded-DEFAULT_LAYOUTS',
    'animation parity limit must disclose that DEFAULT_LAYOUTS is not deep-compared');
  const profileNames = Object.keys(source.motionProfiles || {});
  report.check(unique(profileNames), 'motion profile names must be unique');
  for (const atlasName of Object.keys(source.atlases || {})) {
    const profile = source.motionProfiles?.[atlasName];
    report.check(Boolean(profile), `atlas ${atlasName} lacks a motion profile`);
    if (!profile) continue;
    for (const field of REQUIRED_MOTION_FIELDS) report.check(hasOwn(profile, field), `motion profile ${atlasName} is missing ${field}`);
    report.check(profile.noAutoCrop === true, `motion profile ${atlasName} must prohibit automatic cropping`);
    report.check(['left', 'right'].includes(profile.facing?.default), `motion profile ${atlasName} facing.default is invalid`);
    report.check(profile.facing?.mirrorAxis === 'x', `motion profile ${atlasName} facing.mirrorAxis must be x`);
    report.check(Array.isArray(profile.transitions?.allowed) && profile.transitions.allowed.length > 0, `motion profile ${atlasName} transitions.allowed is required`);
    report.check(Array.isArray(profile.interrupts?.priority) && profile.interrupts.priority.length > 0, `motion profile ${atlasName} interrupts.priority is required`);
    report.check(Array.isArray(profile.eventMarkers), `motion profile ${atlasName} eventMarkers must be an array`);
    const runtimeSemanticStates = new Set([
      ...Object.values(source.semanticStateMappings?.[atlasName] || {}),
      ...(source.semanticDerivedStates?.[atlasName] || []).map((record) => record.state)
    ]);
    const knownStates = new Set();
    const collectStates = (value) => {
      for (const [key, child] of Object.entries(value || {})) {
        if (Array.isArray(child)) knownStates.add(key);
        else if (child && typeof child === 'object') collectStates(child);
      }
    };
    collectStates(source.atlases[atlasName].states);
    for (const transition of profile.transitions?.allowed || []) {
      const [from, to] = transition.split('->');
      report.check(Boolean(from && to), `motion profile ${atlasName} has invalid transition ${transition}`);
      report.check(from === '*' || knownStates.has(from) || ['hurt', 'skill', 'telegraph', 'recover', 'enraged', 'burst', 'slam', 'windup'].includes(from),
        `motion profile ${atlasName} transition source is unknown: ${from}`);
      report.check(knownStates.has(to) || ['hurt', 'skill', 'telegraph', 'recover', 'enraged', 'burst', 'slam', 'windup'].includes(to),
        `motion profile ${atlasName} transition target is unknown: ${to}`);
    }
    const markerIds = new Set();
    for (const marker of profile.eventMarkers || []) {
      report.check(typeof marker.id === 'string' && marker.id.length > 0, `motion profile ${atlasName} event marker id is required`);
      report.check(!markerIds.has(marker.id), `motion profile ${atlasName} has duplicate marker ${marker.id}`);
      markerIds.add(marker.id);
      report.check(runtimeSemanticStates.has(marker.state),
        `motion profile ${atlasName} marker ${marker.id} state is not a runtime semantic state: ${marker.state}`);
      report.check(Number.isFinite(marker.normalizedTime) && marker.normalizedTime >= 0 && marker.normalizedTime <= 1,
        `motion profile ${atlasName} marker ${marker.id} time must be between 0 and 1`);
    }
    for (const interruptMarker of profile.interrupts?.uninterruptibleAfterMarker || []) {
      report.check(markerIds.has(interruptMarker), `motion profile ${atlasName} interrupt marker does not exist: ${interruptMarker}`);
    }
    report.check(profile.collisionSync?.authority === 'MoguriaGame', `motion profile ${atlasName} collision authority must be MoguriaGame`);
    report.check(profile.collisionSync?.deriveHitboxFromFrame === false, `motion profile ${atlasName} must not derive hitboxes from art`);
    report.check(typeof profile.fallback?.missingAsset === 'string', `motion profile ${atlasName} fallback asset is required`);
    report.check(fs.existsSync(repoPath(root, profile.fallback.missingAsset)), `motion profile ${atlasName} fallback is missing`);
    report.check(profile.reducedMotion?.preserveStateChanges === true, `motion profile ${atlasName} reduced motion must preserve semantic states`);
  }
  report.check(profileNames.length === Object.keys(source.atlases || {}).length, 'motion profiles and atlases must have a one-to-one mapping');

  for (const [atlasName, atlas] of Object.entries(source.atlases || {})) {
    report.check(atlas.animationId === `battle-v3.${atlasName}`, `atlas ${atlasName} animationId is invalid`);
    report.check(atlas.actorId === atlasName, `atlas ${atlasName} actorId is invalid`);
    report.check(typeof atlas.renderMode === 'string' && atlas.renderMode.length > 0, `atlas ${atlasName} renderMode is required`);
    report.check(atlas.scaleBasis === 'cell-height', `atlas ${atlasName} scaleBasis must be cell-height`);
    report.check(atlas.visualBounds?.space === 'cell-normalized', `atlas ${atlasName} visualBounds must be cell-normalized`);
    report.check(Object.keys(atlas.timing || {}).length > 0, `atlas ${atlasName} timing is required`);
    const mappings = source.semanticStateMappings?.[atlasName] || {};
    const sourceStates = new Set();
    const collectSourceStates = (value) => {
      for (const [stateName, frames] of Object.entries(value || {})) {
        if (Array.isArray(frames)) sourceStates.add(stateName);
        else collectSourceStates(frames);
      }
    };
    collectSourceStates(atlas.states);
    report.check(Object.keys(mappings).length === sourceStates.size, `atlas ${atlasName} must map every canonical source state exactly once`);
    for (const sourceState of sourceStates) {
      report.check(typeof mappings[sourceState] === 'string' && mappings[sourceState].length > 0,
        `atlas ${atlasName} lacks semantic mapping for ${sourceState}`);
    }
    const derivedStates = source.semanticDerivedStates?.[atlasName] || [];
    for (const derived of derivedStates) {
      report.check(typeof derived.state === 'string' && derived.state.length > 0, `atlas ${atlasName} derived semantic state is invalid`);
      report.check(Array.isArray(derived.composition) && derived.composition.length > 0,
        `atlas ${atlasName} derived state ${derived.state} composition is required`);
      report.check(derived.composition.every((stateName) => sourceStates.has(stateName)),
        `atlas ${atlasName} derived state ${derived.state} references an unknown canonical state`);
    }
    const runtimeStates = new Set([...Object.values(mappings), ...derivedStates.map((record) => record.state)]);
    report.check(Object.keys(atlas.timing).every((stateName) => runtimeStates.has(stateName)),
      `atlas ${atlasName} timing contains an unmapped runtime semantic state`);
    report.check([...runtimeStates].every((stateName) => hasOwn(atlas.timing, stateName)),
      `atlas ${atlasName} timing must cover every mapped runtime semantic state`);
    for (const [stateName, timing] of Object.entries(atlas.timing || {})) {
      report.check(Number.isFinite(timing.fps) && timing.fps > 0, `atlas ${atlasName} timing.${stateName}.fps is invalid`);
      report.check(typeof timing.loop === 'boolean', `atlas ${atlasName} timing.${stateName}.loop must be boolean`);
      report.check(Number.isFinite(timing.holdMs) && timing.holdMs >= 0, `atlas ${atlasName} timing.${stateName}.holdMs is invalid`);
    }
    const frameLimit = atlas.columns * atlas.rows;
    const validateFrames = (value, keyPath = 'states') => {
      for (const [stateName, frames] of Object.entries(value || {})) {
        if (Array.isArray(frames)) {
          report.check(frames.length > 0, `atlas ${atlasName} ${keyPath}.${stateName} must contain frames`);
          report.check(frames.every((frame) => Number.isInteger(frame) && frame >= 0 && frame < frameLimit),
            `atlas ${atlasName} ${keyPath}.${stateName} has an out-of-bounds frame`);
        } else validateFrames(frames, `${keyPath}.${stateName}`);
      }
    };
    validateFrames(atlas.states);
    const buffer = fs.readFileSync(repoPath(root, atlas.image));
    const actual = imageDimensions(buffer, atlas.image);
    report.check(actual.width === atlas.width && actual.height === atlas.height, `atlas ${atlasName} dimensions are stale`);
    report.check(atlas.width === atlas.columns * atlas.cell.width, `atlas ${atlasName} width does not match its grid`);
    report.check(atlas.height === atlas.rows * atlas.cell.height, `atlas ${atlasName} height does not match its grid`);
  }
  for (const [backgroundName, background] of Object.entries(source.backgrounds || {})) {
    const actual = imageDimensions(fs.readFileSync(repoPath(root, background.image)), background.image);
    report.check(actual.width === background.width && actual.height === background.height, `background ${backgroundName} dimensions are stale`);
  }
  validateStoryAnimation(root, projectState, assetSource, source, report);
}

export function validateAssets(root = ROOT) {
  const report = new ValidationReport();
  const state = report.capture('read project-state', () => readJson(root, 'config/project-state.json'));
  if (!state) return report;
  const source = report.capture('read canonical asset manifest', () => readJson(root, state.validation.assetSource));
  const runtime = report.capture('read runtime asset manifest', () => readJson(root, state.validation.assetRuntimeOutput));
  if (!source || !runtime) return report;

  validateCatalog(root, source, report);
  validateStoryAssetPacks(source, state, report);
  const referencedPaths = report.capture('discover runtime asset references', () => runtimeReferencedAssets(root, source, state)) || [];
  const governance = report.capture('resolve trusted asset governance baseline', () => (
    readGovernanceBaseline(root, state.validation.assetSource)
  ));
  if (governance?.bootstrap) {
    console.log(`Asset governance bootstrap: ${governance.sha} has no prior canonical manifest`);
  } else if (governance) {
    for (const error of validateGovernanceAllowlistEvolution(governance.source, source, referencedPaths)) report.check(false, error);
    console.log(`Asset governance baseline: ${governance.sha} (${governance.mode})`);
  }
  for (const error of validateLegacyUncatalogedReferences(referencedPaths, source, root)) report.check(false, error);
  report.capture('validate animation metadata', () => validateAnimation(root, state, source, report));
  const unreferenced = report.capture('scan unreferenced assets', () => findUnreferencedAssets(root, source, state)) || [];
  if (state.validation.unreferencedAssetPolicy === 'error') {
    report.check(unreferenced.length === 0, `${unreferenced.length} unreferenced asset(s): ${unreferenced.slice(0, 12).join(', ')}`);
  } else if (state.validation.unreferencedAssetPolicy === 'warn') {
    report.warn(unreferenced.length === 0, `${unreferenced.length} unreferenced asset candidate(s); review before deletion: ${unreferenced.slice(0, 12).join(', ')}`);
  }

  const entries = allRuntimeEntries(runtime);
  const ids = entries.map((entry) => entry.id);
  report.check(unique(ids), 'runtime asset ids must be globally unique');
  for (const entry of entries) {
    const assetPath = stripUrlSuffix(entry.src);
    report.check(fs.existsSync(repoPath(root, assetPath)), `runtime asset is missing: ${assetPath}`);
  }

  const criticalImages = (runtime.critical || []).filter((entry) => entry.type === 'image');
  const criticalTransfer = criticalImages.reduce((total, entry) => total + fileBytes(root, entry.src), 0);
  const criticalDecoded = criticalImages.reduce((total, entry) => {
    const dimensions = imageDimensions(fs.readFileSync(repoPath(root, stripUrlSuffix(entry.src))), entry.src);
    return total + dimensions.width * dimensions.height * 4;
  }, 0);
  report.check(criticalTransfer <= state.performanceBudgets.criticalTransferBytes,
    `critical transfer ${formatBytes(criticalTransfer)} exceeds ${formatBytes(state.performanceBudgets.criticalTransferBytes)}`);
  report.check(criticalDecoded <= state.performanceBudgets.criticalDecodedBytes,
    `critical decoded size ${formatBytes(criticalDecoded)} exceeds ${formatBytes(state.performanceBudgets.criticalDecodedBytes)}`);

  const battlePack = (runtime.packs || []).find((pack) => pack.id === 'battle-v3');
  report.check(Boolean(battlePack), 'battle-v3 runtime pack is required');
  if (battlePack) {
    const battleTransfer = battlePack.assets.reduce((total, entry) => total + fileBytes(root, entry.src), 0);
    report.check(battleTransfer <= state.performanceBudgets.battlePackTransferBytes,
      `battle pack ${formatBytes(battleTransfer)} exceeds ${formatBytes(state.performanceBudgets.battlePackTransferBytes)}`);
  }

  const storyPacks = (runtime.packs || []).filter((pack) => pack.id.startsWith('story-ch01-'));
  report.check(storyPacks.length === 4, 'Chapter 1 must keep four scene-specific story packs');
  const storyTransfer = storyPacks.reduce((total, pack) => total
    + (pack.assets || []).reduce((packTotal, entry) => packTotal + fileBytes(root, entry.src), 0), 0);
  report.check(storyTransfer <= state.performanceBudgets.storyPackTransferBytes,
    `Chapter 1 story packs ${formatBytes(storyTransfer)} exceed ${formatBytes(state.performanceBudgets.storyPackTransferBytes)}`);

  for (const entry of entries) {
    const size = fileBytes(root, entry.src);
    report.check(size <= state.performanceBudgets.singleRuntimeAssetBytes,
      `${stripUrlSuffix(entry.src)} is ${formatBytes(size)}, above the single-asset budget`);
  }

  const html = fs.readFileSync(repoPath(root, state.runtime.entrypoint), 'utf8');
  const initial = collectEntrypointResources(html);
  const stylesheetBytes = initial.styles.reduce((total, item) => total + fileBytes(root, item), 0);
  const scriptBytes = initial.scripts.reduce((total, item) => total + fileBytes(root, item), 0);
  const dynamicBytes = state.validation.dynamicBattleScripts.reduce((total, item) => total + fileBytes(root, item), 0);
  const dynamicStoryBytes = state.validation.dynamicStoryScripts.reduce((total, item) => total + fileBytes(root, item), 0);
  report.check(stylesheetBytes <= state.performanceBudgets.initialStylesheetBytes,
    `initial stylesheets ${formatBytes(stylesheetBytes)} exceed ${formatBytes(state.performanceBudgets.initialStylesheetBytes)}`);
  report.check(scriptBytes <= state.performanceBudgets.initialScriptBytes,
    `initial scripts ${formatBytes(scriptBytes)} exceed ${formatBytes(state.performanceBudgets.initialScriptBytes)}`);
  report.check(dynamicBytes <= state.performanceBudgets.dynamicBattleScriptBytes,
    `dynamic battle scripts ${formatBytes(dynamicBytes)} exceed ${formatBytes(state.performanceBudgets.dynamicBattleScriptBytes)}`);
  report.check(dynamicStoryBytes <= state.performanceBudgets.dynamicStoryScriptBytes,
    `dynamic story scripts ${formatBytes(dynamicStoryBytes)} exceed ${formatBytes(state.performanceBudgets.dynamicStoryScriptBytes)}`);

  console.log(`Asset budgets: critical=${formatBytes(criticalTransfer)} transfer/${formatBytes(criticalDecoded)} decoded; styles=${formatBytes(stylesheetBytes)}; scripts=${formatBytes(scriptBytes)}; battle-js=${formatBytes(dynamicBytes)}; story=${formatBytes(storyTransfer)}; story-js=${formatBytes(dynamicStoryBytes)}`);
  return report;
}

export function main(root = ROOT) {
  return validateAssets(root).finish('asset validation');
}

if (isDirectRun(import.meta.url) && !main()) process.exitCode = 1;
