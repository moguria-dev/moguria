import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, ValidationReport, isDirectRun, readJson, repoPath } from './lib/validation.mjs';

const RULES_SHA256 = '9950741898d91396543bc6f76653e1ec39d42c9a9f6418e39d8f04232288d817';
const ACTION_PINS = {
  checkout: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
  setupNode: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0',
  configurePages: 'actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6.0.0',
  uploadPages: 'actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5.0.0',
  deployPages: 'actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128 # v5.0.0'
};

export function projectAnimationManifest(source) {
  const projectImages = (records) => Object.fromEntries(Object.entries(records).map(([id, record]) => {
    const {
      animationId,
      actorId,
      renderMode,
      visualBounds,
      scaleBasis,
      timing,
      ...runtimeRecord
    } = record;
    return [id, {
      ...runtimeRecord,
      image: path.posix.basename(record.image)
    }];
  }));
  return {
    version: source.runtimeVersion,
    cellOrigin: source.cellOrigin,
    frameOrder: source.frameOrder,
    atlases: projectImages(source.atlases),
    backgrounds: projectImages(source.backgrounds)
  };
}

export function projectStoryAnimationManifest(source) {
  return {
    version: source.storyRuntimeVersion,
    renderContract: structuredClone(source.storyRenderContract),
    poseAtlases: structuredClone(source.poseAtlases),
    storyAnimations: structuredClone(source.storyAnimations)
  };
}

export function projectAssetManifest(source, projectState) {
  const runtime = structuredClone(source.runtimeManifest);
  const budgetBytes = projectState.performanceBudgets.criticalTransferBytes;
  runtime.policy = {
    criticalBudgetMB: budgetBytes / (1024 * 1024),
    ...runtime.policy
  };
  return runtime;
}

const COMPLETED_DEPLOYMENT_FIELDS = [
  'mode',
  'sourceBranch',
  'publishesOnPush',
  'trigger',
  'workflow'
];

export function completedDeploymentMismatches(current = {}, target = {}) {
  return COMPLETED_DEPLOYMENT_FIELDS.filter((field) => current[field] !== target[field]);
}

export function validateProjectState(root = ROOT) {
  const report = new ValidationReport();
  const state = report.capture('read config/project-state.json', () => readJson(root, 'config/project-state.json'));
  if (!state) return report;

  report.check(state.schemaVersion === 1, 'project-state schemaVersion must be 1');
  for (const jsonFile of [
    'package.json', 'data/skills.json', 'config/project-state.json',
    'config/asset-manifest.json', 'config/animation-manifest.json',
    'assets/manifest.json', 'assets/images/battle-v3/atlas.json',
    'assets/animations/story-ch01.json'
  ]) {
    report.capture(`validate unique JSON keys in ${jsonFile}`, () => readJson(root, jsonFile));
  }
  report.check(state.project?.repository === 'moguria-dev/moguria', 'project repository must be moguria-dev/moguria');
  report.check(state.project?.publicUrl === 'https://moguria-dev.github.io/moguria/', 'public URL must match GitHub Pages');
  report.check(state.canonicalRules?.id === 'moguria-development-rules', 'canonical rules id is out of sync');
  report.check(state.canonicalRules?.version === '3.0.0', 'canonical rules version is out of sync');
  report.check(state.canonicalRules?.effectiveDate === '2026-08-14', 'canonical rules effective date is out of sync');
  report.check(state.canonicalRules?.sha256 === RULES_SHA256, 'canonical rules SHA-256 is out of sync');
  report.check(state.branches?.default === 'main', 'default branch must be main');
  report.check(state.branches?.release === 'main', 'release branch must be main');
  report.check(state.branches?.development === state.branches?.release,
    'trunk-based development integration branch must equal release branch');
  report.check(state.branches?.legacyPagesBranch?.automaticMergeAllowed === false, 'legacy Pages branch must prohibit automatic merge');
  report.check(state.branches?.legacyDivergence?.automaticMergeAllowed === false, 'legacy divergent branch must prohibit automatic merge');
  report.check(['planned', 'complete'].includes(state.deployment?.migrationStatus), 'deployment migrationStatus must be planned or complete');
  if (state.deployment?.migrationStatus === 'planned') {
    report.check(state.deployment.current?.mode === 'legacy-branch', 'planned migration current mode must remain legacy-branch');
    report.check(state.deployment.current?.sourceBranch === state.branches.legacyPagesBranch?.branch,
      'planned migration current source must equal legacyPagesBranch');
    report.check(state.deployment.current?.publishesOnPush === true, 'legacy Pages source must truthfully record automatic publication');
  } else {
    for (const field of completedDeploymentMismatches(state.deployment.current, state.deployment.target)) {
      report.check(false, `completed migration current ${field} must equal target ${field}`);
    }
  }
  report.check(state.deployment?.target?.mode === 'github-actions', 'target deployment must use GitHub Actions');
  report.check(state.deployment?.target?.sourceBranch === state.branches.release, 'target deployment must use the release branch');
  report.check(state.deployment?.target?.publishesOnPush === false && state.deployment.target.trigger === 'workflow_dispatch',
    'target deployment must be manual only');
  report.check(state.deployment?.target?.workflow === '.github/workflows/deploy-pages.yml',
    'target deployment must use the approved Pages workflow');

  const requiredVersions = [
    'display', 'application', 'saveSchema', 'assetManifest',
    'animationManifest', 'storyAnimationManifest'
  ];
  for (const key of requiredVersions) report.check(state.versions?.[key] !== undefined, `versions.${key} is required`);
  for (const [key, value] of Object.entries(state.performanceBudgets || {})) {
    report.check(Number.isInteger(value) && value > 0, `performanceBudgets.${key} must be a positive integer`);
  }
  const expectedBudgetKeys = [
    'criticalTransferBytes', 'criticalDecodedBytes', 'battlePackTransferBytes',
    'storyPackTransferBytes',
    'singleRuntimeAssetBytes', 'initialStylesheetBytes', 'initialScriptBytes',
    'dynamicBattleScriptBytes', 'dynamicStoryScriptBytes'
  ];
  for (const key of expectedBudgetKeys) report.check(key in (state.performanceBudgets || {}), `performanceBudgets.${key} is required`);

  const expectedCommands = {
    project: 'npm run validate:project',
    assets: 'npm run validate:assets',
    serviceWorker: 'npm run validate:service-worker',
    html: 'npm run validate:html',
    tests: 'node --test',
    browser: 'npm run qa:browser',
    preflight: 'npm run ci'
  };
  for (const [key, value] of Object.entries(expectedCommands)) {
    report.check(state.validation?.commands?.[key] === value, `validation.commands.${key} must be ${value}`);
  }

  for (const required of state.validation?.requiredFiles || []) {
    report.check(fs.existsSync(repoPath(root, required)), `required file is missing: ${required}`);
  }
  for (const testFile of state.validation?.existingTestFiles || []) {
    report.check(fs.existsSync(repoPath(root, testFile)), `declared existing test is missing: ${testFile}`);
  }

  const nvmVersion = report.capture('read .nvmrc', () => fs.readFileSync(repoPath(root, '.nvmrc'), 'utf8').trim());
  const packageJson = report.capture('read package.json', () => readJson(root, 'package.json'));
  const packageLock = report.capture('read package-lock.json', () => readJson(root, 'package-lock.json'));
  report.check(nvmVersion === state.runtime?.nodeVersion, '.nvmrc must equal runtime.nodeVersion');
  report.check(packageJson?.engines?.node === state.runtime?.nodeVersion, 'package engines.node must equal the pinned Node version');
  report.check(process.version.slice(1) === state.runtime?.nodeVersion, `running Node ${process.version.slice(1)} must equal ${state.runtime?.nodeVersion}`);

  const configText = report.capture('read js/config.js', () => fs.readFileSync(repoPath(root, 'js/config.js'), 'utf8')) || '';
  const saveText = report.capture('read js/save.js', () => fs.readFileSync(repoPath(root, 'js/save.js'), 'utf8')) || '';
  const indexText = report.capture('read index.html', () => fs.readFileSync(repoPath(root, 'index.html'), 'utf8')) || '';
  const versionText = report.capture('read VERSION.txt', () => fs.readFileSync(repoPath(root, 'VERSION.txt'), 'utf8')) || '';
  const ciWorkflow = report.capture('read CI workflow', () => fs.readFileSync(repoPath(root, '.github/workflows/ci.yml'), 'utf8')) || '';
  const deployWorkflow = report.capture('read Pages workflow', () => fs.readFileSync(repoPath(root, state.deployment.target.workflow), 'utf8')) || '';
  report.check(configText.includes(`version: '${state.versions.application}'`), 'js/config.js application version differs from project-state');
  report.check(packageJson?.version === state.versions.display, 'package.json version differs from project-state display version');
  report.check(packageLock?.version === state.versions.display
    && packageLock?.packages?.['']?.version === state.versions.display,
    'package-lock.json root version differs from project-state display version');
  report.check(configText.includes(`saveVersion: ${state.versions.saveSchema}`), 'js/config.js save version differs from project-state');
  report.check(saveText.includes(`const SAVE_VERSION = ${state.versions.saveSchema};`), 'js/save.js save version differs from project-state');
  report.check(indexText.includes(`<title>Moguria v${state.versions.display}</title>`), 'index title display version differs from project-state');
  report.check(versionText.startsWith(`Moguria v${state.versions.display}`), 'VERSION.txt display version differs from project-state');
  report.check(configText.includes(`criticalBudgetMB: ${state.performanceBudgets.criticalTransferBytes / (1024 * 1024)}`),
    'js/config.js critical budget differs from project-state');
  report.check(configText.includes(`registerServiceWorker: ${state.runtime.serviceWorker.enabled}`),
    'js/config.js service worker flag differs from project-state');

  for (const workflow of [ciWorkflow, deployWorkflow]) {
    report.check(workflow.includes(ACTION_PINS.checkout), 'workflow checkout action must use the approved full SHA pin');
    report.check(workflow.includes(ACTION_PINS.setupNode), 'workflow setup-node action must use the approved full SHA pin');
    report.check(workflow.includes('package-manager-cache: false'), 'setup-node must explicitly disable package-manager cache');
    const usesLines = workflow.split('\n').filter((line) => /^\s*uses:/.test(line));
    for (const line of usesLines) report.check(/@[a-f0-9]{40}(?:\s+#\s+v\d[^\s]*)?\s*$/.test(line), `action is not pinned to a full commit SHA: ${line.trim()}`);
  }
  report.check((ciWorkflow.match(/^\s{4}runs-on: ubuntu-24\.04$/gm) || []).length === 1,
    'CI must use the pinned ubuntu-24.04 runner');
  report.check((deployWorkflow.match(/^\s{4}runs-on: ubuntu-24\.04$/gm) || []).length === 2,
    'both Pages jobs must use the pinned ubuntu-24.04 runner');
  report.check((ciWorkflow.match(/^\s{10}fetch-depth: 0$/gm) || []).length >= 1,
    'CI checkout must fetch full history for governance validation');
  report.check((deployWorkflow.match(/^\s{10}fetch-depth: 0$/gm) || []).length >= 2,
    'both Pages checkouts must fetch full history');
  report.check(ciWorkflow.includes("MOGURIA_GOVERNANCE_BASE_SHA: ${{ github.event.pull_request.base.sha || github.event.before || '' }}"),
    'CI must pass the trusted event base SHA to asset governance validation');
  report.check(/^on:\n\s{2}workflow_dispatch:\s*$/m.test(deployWorkflow), 'Pages deployment must expose workflow_dispatch');
  report.check(!/^\s{2}(?:push|pull_request):/m.test(deployWorkflow), 'Pages deployment must not run on push or pull_request');
  report.check((deployWorkflow.match(/github\.ref == 'refs\/heads\/main'/g) || []).length >= 2, 'both Pages jobs must reject non-main refs');
  report.check(/^permissions: \{\}$/m.test(deployWorkflow), 'Pages workflow top-level permissions must be empty');
  report.check((deployWorkflow.match(/^\s{6}contents: read$/gm) || []).length >= 2,
    'both Pages jobs must declare contents:read at job level');
  report.check(/^\s{6}pages: write$/m.test(deployWorkflow) && /^\s{6}id-token: write$/m.test(deployWorkflow),
    'Pages deploy job permissions are incomplete');
  report.check(deployWorkflow.includes(ACTION_PINS.configurePages), 'configure-pages must use the approved full SHA pin');
  report.check(deployWorkflow.includes(ACTION_PINS.uploadPages), 'upload-pages-artifact must use the approved full SHA pin');
  report.check(deployWorkflow.includes(ACTION_PINS.deployPages), 'deploy-pages must use the approved full SHA pin');
  report.check(deployWorkflow.includes('run: npm run prepare:pages') && deployWorkflow.includes('path: _site'),
    'Pages workflow must stage and upload the runtime-only _site artifact');
  report.check(deployWorkflow.includes('git rev-parse --verify HEAD^') && deployWorkflow.includes('MOGURIA_GOVERNANCE_BASE_SHA='),
    'manual Pages preflight must resolve a trusted parent-commit governance baseline');
  report.check(deployWorkflow.includes('name: github-pages') && deployWorkflow.includes('url: ${{ steps.deployment.outputs.page_url }}'),
    'Pages deployment environment URL is missing');

  const assetSource = report.capture('read canonical asset manifest', () => readJson(root, state.validation.assetSource));
  const assetRuntime = report.capture('read runtime asset manifest', () => readJson(root, state.validation.assetRuntimeOutput));
  if (assetSource && assetRuntime) {
    report.check(assetSource.generatedFile === state.validation.assetRuntimeOutput, 'asset generatedFile differs from project-state');
    report.check(assetSource.budgetSource === 'config/project-state.json#/performanceBudgets', 'asset budgetSource must point to project-state');
    report.check(assetSource.runtimeManifest?.version === state.versions.assetManifest, 'asset manifest version differs from project-state');
    report.capture('compare asset runtime projection', () => assert.deepStrictEqual(assetRuntime, projectAssetManifest(assetSource, state)));
  }

  const animationSource = report.capture('read canonical animation manifest', () => readJson(root, state.validation.animationSource));
  const animationRuntime = report.capture('read runtime animation manifest', () => readJson(root, state.validation.animationRuntimeOutput));
  if (animationSource && animationRuntime) {
    report.check(animationSource.generatedFile === state.validation.animationRuntimeOutput, 'animation generatedFile differs from project-state');
    report.check(animationSource.runtimeVersion === state.versions.animationManifest, 'animation manifest version differs from project-state');
    report.capture('compare animation runtime projection', () => assert.deepStrictEqual(animationRuntime, projectAnimationManifest(animationSource)));
  }

  const storyAnimationRuntime = report.capture('read runtime story animation manifest', () => (
    readJson(root, state.validation.storyAnimationRuntimeOutput)
  ));
  if (animationSource && storyAnimationRuntime) {
    report.check(animationSource.storyGeneratedFile === state.validation.storyAnimationRuntimeOutput,
      'story animation generatedFile differs from project-state');
    report.check(animationSource.storyRuntimeVersion === state.versions.storyAnimationManifest,
      'story animation manifest version differs from project-state');
    report.capture('compare story animation runtime projection', () => (
      assert.deepStrictEqual(storyAnimationRuntime, projectStoryAnimationManifest(animationSource))
    ));
  }

  report.check(state.generated?.assetManifest === state.validation?.assetRuntimeOutput, 'generated.assetManifest must name the asset compatibility output');
  report.check(state.generated?.animationManifest === state.validation?.animationRuntimeOutput, 'generated.animationManifest must name the animation compatibility output');
  report.check(state.generated?.storyAnimationManifest === state.validation?.storyAnimationRuntimeOutput,
    'generated.storyAnimationManifest must name the story animation compatibility output');
  return report;
}

export function main(root = ROOT) {
  return validateProjectState(root).finish('project-state validation');
}

if (isDirectRun(import.meta.url) && !main()) process.exitCode = 1;
