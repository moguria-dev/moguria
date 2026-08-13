import fs from 'node:fs';
import {
  ROOT,
  ValidationReport,
  isDirectRun,
  readJson,
  repoPath,
  stripUrlSuffix,
  unique
} from './lib/validation.mjs';

export function parseServiceWorker(source) {
  const cacheMatch = source.match(/\bconst\s+CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
  const assetsMatch = source.match(/\bconst\s+CORE_ASSETS\s*=\s*(\[[\s\S]*?\]);/);
  if (!cacheMatch) throw new Error('CACHE_NAME string constant was not found');
  if (!assetsMatch) throw new Error('CORE_ASSETS array was not found');
  let assets;
  try {
    assets = JSON.parse(assetsMatch[1]);
  } catch (error) {
    throw new Error(`CORE_ASSETS must be a JSON-compatible string array: ${error.message}`);
  }
  if (!Array.isArray(assets) || assets.some((item) => typeof item !== 'string')) {
    throw new Error('CORE_ASSETS must contain only strings');
  }
  return { cacheName: cacheMatch[1], assets };
}

export function inspectServiceWorker(root, state, configSource, workerSource) {
  const configuredMatch = configSource.match(/\bregisterServiceWorker\s*:\s*(true|false)\b/);
  if (!configuredMatch) throw new Error('registerServiceWorker boolean was not found in js/config.js');
  const configuredEnabled = configuredMatch[1] === 'true';
  const worker = parseServiceWorker(workerSource);
  const missing = worker.assets.filter((item) => {
    const normalized = stripUrlSuffix(item).replace(/^\//, '');
    if (normalized === '' || normalized === '.') return false;
    return !fs.existsSync(repoPath(root, normalized));
  });
  return {
    configuredEnabled,
    declaredEnabled: state.runtime.serviceWorker.enabled,
    cacheName: worker.cacheName,
    assets: worker.assets,
    missing,
    duplicates: worker.assets.filter((item, index) => worker.assets.indexOf(item) !== index),
    cacheMatchesVersion: worker.cacheName.includes(state.versions.application)
  };
}

export function validateServiceWorker(root = ROOT) {
  const report = new ValidationReport();
  const state = report.capture('read project-state', () => readJson(root, 'config/project-state.json'));
  if (!state) return report;
  const configSource = report.capture('read service worker config', () => fs.readFileSync(repoPath(root, state.runtime.serviceWorker.configFile), 'utf8'));
  const workerSource = report.capture('read service worker script', () => fs.readFileSync(repoPath(root, state.runtime.serviceWorker.scriptFile), 'utf8'));
  if (!configSource || !workerSource) return report;
  const result = report.capture('inspect service worker', () => inspectServiceWorker(root, state, configSource, workerSource));
  if (!result) return report;

  report.check(result.configuredEnabled === result.declaredEnabled,
    'js/config.js and project-state disagree about service worker enablement');
  if (!result.declaredEnabled) {
    console.log(`Service worker is intentionally OFF; ${result.missing.length} stale precache path(s) are quarantined until an explicit ON migration.`);
    return report;
  }

  report.check(unique(result.assets), `CORE_ASSETS contains duplicate paths: ${result.duplicates.join(', ')}`);
  report.check(result.missing.length === 0, `CORE_ASSETS contains missing paths: ${result.missing.join(', ')}`);
  report.check(result.cacheMatchesVersion, `CACHE_NAME ${result.cacheName} must contain application version ${state.versions.application}`);
  for (const required of ['./', './index.html', './assets/manifest.json']) {
    report.check(result.assets.includes(required), `enabled service worker CORE_ASSETS must include ${required}`);
  }
  return report;
}

export function main(root = ROOT) {
  return validateServiceWorker(root).finish('service-worker validation');
}

if (isDirectRun(import.meta.url) && !main()) process.exitCode = 1;
