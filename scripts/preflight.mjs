import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, readJson, repoPath } from './lib/validation.mjs';

function run(label, command, args, root) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
}

function commandAvailable(command, args = ['-version']) {
  const result = spawnSync(command, args, { stdio: 'ignore' });
  return !result.error && result.status === 0;
}

function sourceFiles(root) {
  const files = ['service-worker.js'];
  for (const directory of ['js', 'scripts']) {
    const base = repoPath(root, directory);
    const stack = [base];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(absolute);
        else if (/\.(?:js|mjs)$/.test(entry.name)) files.push(path.relative(root, absolute));
      }
    }
  }
  return files.sort();
}

export function main(root = ROOT) {
  const state = readJson(root, 'config/project-state.json');
  if (state.validation.requireImageMagickForPreflight && !commandAvailable('magick') && !commandAvailable('identify')) {
    throw new Error('ImageMagick is required because the skill-icon visual regression tests use it');
  }

  const validators = [
    ['project-state', 'scripts/validate-project-state.mjs'],
    ['assets and animation', 'scripts/validate-assets.mjs'],
    ['HTML static structure', 'scripts/validate-html.mjs'],
    ['service worker policy', 'scripts/validate-service-worker.mjs']
  ];
  for (const [label, script] of validators) run(label, process.execPath, [script], root);
  for (const file of sourceFiles(root)) run(`syntax ${file}`, process.execPath, ['--check', file], root);
  run('complete Node test suite', process.execPath, ['--test'], root);
  console.log('\nPreflight passed. No deployment or GitHub mutation was performed.');
  return true;
}

try {
  main();
} catch (error) {
  console.error(`\nPreflight failed: ${error.message}`);
  process.exitCode = 1;
}
