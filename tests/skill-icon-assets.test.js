'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const ICON_ROOT = path.join(ROOT, 'assets/images/skill-icons');
const FAMILIES = Object.freeze([
  'poison', 'blast', 'combat', 'guard', 'move',
  'star', 'summon', 'support', 'upgrade', 'fusion'
]);

function loadSkillDefinitions() {
  const context = { console, Math };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'js/skills.js'), 'utf8'),
    context,
    { filename: 'js/skills.js' }
  );
  const skills = context.MoguriaSkills;
  return {
    api: skills,
    definitions: [...skills.skills, ...skills.fusions]
  };
}

function parseWebpHeader(filePath) {
  const bytes = fs.readFileSync(filePath);
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', `${filePath} must be RIFF`);
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', `${filePath} must be WebP`);
  let cursor = 12;
  while (cursor + 8 <= bytes.length) {
    const fourcc = bytes.subarray(cursor, cursor + 4).toString('latin1');
    const size = bytes.readUInt32LE(cursor + 4);
    const dataOffset = cursor + 8;
    if (fourcc === 'VP8X') {
      assert.ok(size >= 10, `${filePath} has an invalid VP8X chunk`);
      return {
        width: bytes.readUIntLE(dataOffset + 4, 3) + 1,
        height: bytes.readUIntLE(dataOffset + 7, 3) + 1,
        hasAlpha: (bytes[dataOffset] & 0x10) !== 0
      };
    }
    cursor = dataOffset + size + (size % 2);
  }
  assert.fail(`${filePath} must use an extended WebP header with alpha metadata`);
}

function commandExists(command) {
  return spawnSync(command, ['-version'], { stdio: 'ignore' }).status === 0;
}

const CONVERT = commandExists('magick') ? 'magick' : commandExists('convert') ? 'convert' : null;

function rgbaForCell(filePath, cell, size) {
  const x = cell % 2 ? 256 : 0;
  const y = cell > 1 ? 256 : 0;
  const args = [];
  if (CONVERT === 'magick') args.push('convert');
  args.push(
    filePath,
    '-crop', `256x256+${x}+${y}`,
    '+repage',
    '-resize', `${size}x${size}!`,
    '-colorspace', 'sRGB',
    '-depth', '8',
    '-alpha', 'on',
    'rgba:-'
  );
  return execFileSync(CONVERT, args, { maxBuffer: 8 * 1024 * 1024 });
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] || 0;
}

function inspectRgba(bytes, size) {
  assert.equal(bytes.length, size * size * 4);
  const visible = [];
  const luminance = [];
  const colorFingerprint = [];
  const grayscaleFingerprint = [];
  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;
  for (let pixel = 0; pixel < size * size; pixel += 1) {
    const offset = pixel * 4;
    const alpha = bytes[offset + 3];
    const red = bytes[offset];
    const green = bytes[offset + 1];
    const blue = bytes[offset + 2];
    const visibleAlpha = alpha < 16 ? 0 : alpha;
    const premultipliedRed = Math.round(red * visibleAlpha / 255);
    const premultipliedGreen = Math.round(green * visibleAlpha / 255);
    const premultipliedBlue = Math.round(blue * visibleAlpha / 255);
    const gray = Math.round(red * .2126 + green * .7152 + blue * .0722);
    const premultipliedGray = Math.round(gray * visibleAlpha / 255);
    colorFingerprint.push(
      premultipliedRed >> 4,
      premultipliedGreen >> 4,
      premultipliedBlue >> 4,
      visibleAlpha >> 4
    );
    grayscaleFingerprint.push(premultipliedGray >> 4, visibleAlpha >> 4);
    if (alpha < 24) continue;
    const x = pixel % size;
    const y = Math.floor(pixel / size);
    visible.push(pixel);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    if (alpha >= 80) {
      luminance.push(gray);
    }
  }
  return {
    visible,
    visibleRatio: visible.length / (size * size),
    bounds: maxX < 0 ? null : {
      width: maxX - minX + 1,
      height: maxY - minY + 1
    },
    grayscaleRange: luminance.length
      ? percentile(luminance, .9) - percentile(luminance, .1)
      : 0,
    color: crypto.createHash('sha256').update(Buffer.from(colorFingerprint)).digest('hex'),
    grayscale: crypto.createHash('sha256').update(Buffer.from(grayscaleFingerprint)).digest('hex'),
    silhouette: crypto
      .createHash('sha256')
      .update(Buffer.from(Array.from({ length: size * size }, (_, pixel) => (
        bytes[pixel * 4 + 3] >= 48 ? 1 : 0
      ))))
      .digest('hex')
  };
}

test('all 40 skill definitions own a unique cell in ten production atlases', () => {
  const { api, definitions } = loadSkillDefinitions();
  assert.equal(api.skills.length, 36);
  assert.equal(api.fusions.length, 4);
  assert.equal(definitions.length, 40);

  const cells = new Map();
  for (const definition of definitions) {
    const visual = api.iconVisualForSkill(definition.id);
    assert.ok(FAMILIES.includes(visual.family), `${definition.id} has unknown family ${visual.family}`);
    assert.ok(Number.isInteger(visual.cell) && visual.cell >= 0 && visual.cell <= 3);
    assert.equal(
      visual.atlas,
      `assets/images/skill-icons/skill-atlas-${visual.family}.webp`
    );
    const key = `${visual.family}:${visual.cell}`;
    assert.equal(cells.has(key), false, `${definition.id} reuses ${key} from ${cells.get(key)}`);
    cells.set(key, definition.id);
  }
  assert.equal(cells.size, 40);
  assert.deepEqual(new Set([...cells.keys()].map(key => key.split(':')[0])), new Set(FAMILIES));
});

test('production skill atlases are exactly 512px square extended WebPs with alpha', () => {
  const expectedFiles = FAMILIES.map(family => `skill-atlas-${family}.webp`).sort();
  const actualFiles = fs.readdirSync(ICON_ROOT)
    .filter(name => /^skill-atlas-[a-z-]+\.webp$/.test(name))
    .sort();
  assert.deepEqual(actualFiles, expectedFiles);

  for (const filename of expectedFiles) {
    const metadata = parseWebpHeader(path.join(ICON_ROOT, filename));
    assert.deepEqual(
      metadata,
      { width: 512, height: 512, hasAlpha: true },
      `${filename} must remain a 512x512 alpha atlas`
    );
  }
});

test('battle CSS resolves every atlas family from the stylesheet for Safari', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/moguria-battle-refinement.css'), 'utf8');
  for (const family of FAMILIES) {
    assert.match(css, new RegExp(`data-skill-atlas=["']${family}["']`));
    assert.match(css, new RegExp(`skill-atlas-${family}\\.webp`));
  }
});

test('every atlas cell remains legible at 34px and 26px in color, grayscale, and silhouette', {
  skip: !CONVERT && 'ImageMagick is not available for pixel-level icon QA'
}, () => {
  const { api, definitions } = loadSkillDefinitions();
  const silhouettes = new Map();
  const colors = new Map();
  const grayscales = new Map();

  for (const definition of definitions) {
    const visual = api.iconVisualForSkill(definition.id);
    const atlasPath = path.join(ROOT, visual.atlas);

    const source = inspectRgba(rgbaForCell(atlasPath, visual.cell, 256), 256);
    assert.ok(source.bounds, `${definition.id} is fully transparent`);
    assert.ok(
      Math.max(source.bounds.width, source.bounds.height) >= 128,
      `${definition.id} is too small in its source cell`
    );
    assert.ok(
      Math.min(source.bounds.width, source.bounds.height) >= 56,
      `${definition.id} is too thin in its source cell`
    );
    assert.ok(source.bounds.width <= 250 && source.bounds.height <= 250, `${definition.id} touches its cell edge`);
    assert.ok(source.visibleRatio >= .06 && source.visibleRatio <= .78, `${definition.id} has an unsafe source fill ratio`);

    for (const size of [34, 26]) {
      const sample = inspectRgba(rgbaForCell(atlasPath, visual.cell, size), size);
      assert.ok(sample.visibleRatio >= .055, `${definition.id} disappears at ${size}px`);
      assert.ok(sample.visibleRatio <= .82, `${definition.id} loses padding at ${size}px`);
      assert.ok(sample.grayscaleRange >= 18, `${definition.id} loses grayscale contrast at ${size}px`);
      if (size === 26) {
        assert.equal(
          colors.has(sample.color),
          false,
          `${definition.id} duplicates the 26px color image of ${colors.get(sample.color)}`
        );
        assert.equal(
          grayscales.has(sample.grayscale),
          false,
          `${definition.id} duplicates the 26px grayscale image of ${grayscales.get(sample.grayscale)}`
        );
        assert.equal(
          silhouettes.has(sample.silhouette),
          false,
          `${definition.id} shares a 26px silhouette with ${silhouettes.get(sample.silhouette)}`
        );
        colors.set(sample.color, definition.id);
        grayscales.set(sample.grayscale, definition.id);
        silhouettes.set(sample.silhouette, definition.id);
      }
    }
  }
  assert.equal(colors.size, 40);
  assert.equal(grayscales.size, 40);
  assert.equal(silhouettes.size, 40);
});
