import fs from 'node:fs';
import {
  ROOT,
  ValidationReport,
  collectEntrypointResources,
  isDirectRun,
  readJson,
  repoPath,
  stripUrlSuffix,
  unique
} from './lib/validation.mjs';

const SCRIPT_ORDER = [
  ['js/config.js', 'js/save.js'],
  ['js/save.js', 'js/game.js'],
  ['js/skills.js', 'js/game.js'],
  ['js/enemies.js', 'js/game.js'],
  ['js/player.js', 'js/game.js'],
  ['js/dungeon.js', 'js/game.js'],
  ['js/battle-v3-loader.js', 'js/game.js'],
  ['js/game.js', 'js/ui.js'],
  ['js/ui.js', 'js/main.js'],
  ['js/assetManager.js', 'js/main.js'],
  ['js/security.js', 'js/main.js'],
  ['js/main.js', 'js/moguria-final-ui.js']
];
const NON_RUNTIME_SEGMENT = /(?:^|\/)(?:qa|mocks?|sources?|project_sources|screenshots?)(?:\/|$)/i;

export function extractHtmlResources(html) {
  const { styles, scripts } = collectEntrypointResources(html);
  const images = [...html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((match) => stripUrlSuffix(match[1]));
  return { styles, scripts, images };
}

export function validateHtml(root = ROOT) {
  const report = new ValidationReport();
  const state = report.capture('read project-state', () => readJson(root, 'config/project-state.json'));
  if (!state) return report;
  const html = report.capture('read index.html', () => fs.readFileSync(repoPath(root, state.runtime.entrypoint), 'utf8'));
  if (!html) return report;

  const ids = [...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  report.check(unique(ids), `index.html contains duplicate id values: ${duplicateIds.join(', ')}`);

  const resources = extractHtmlResources(html);
  for (const [type, paths] of Object.entries(resources)) {
    for (const resourcePath of paths) {
      report.check(!/^(?:[a-z]+:|\/\/|\/)/i.test(resourcePath), `${type} resource must be repository-relative: ${resourcePath}`);
      report.check(!NON_RUNTIME_SEGMENT.test(resourcePath), `${type} resource points to a QA/mock/source-only path: ${resourcePath}`);
      report.check(fs.existsSync(repoPath(root, resourcePath)), `${type} resource is missing: ${resourcePath}`);
    }
  }

  const scriptPositions = new Map(resources.scripts.map((script, index) => [script, index]));
  for (const [before, after] of SCRIPT_ORDER) {
    report.check(scriptPositions.has(before), `required script is missing: ${before}`);
    report.check(scriptPositions.has(after), `required script is missing: ${after}`);
    if (scriptPositions.has(before) && scriptPositions.has(after)) {
      report.check(scriptPositions.get(before) < scriptPositions.get(after), `${before} must load before ${after}`);
    }
  }

  report.check(resources.styles.length > 0, 'index.html must load at least one stylesheet');
  report.check(resources.scripts.length > 0, 'index.html must load at least one script');
  report.check(resources.images.length > 0, 'index.html must contain runtime image references');
  return report;
}

export function main(root = ROOT) {
  return validateHtml(root).finish('HTML static validation');
}

if (isDirectRun(import.meta.url) && !main()) process.exitCode = 1;
