import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function repoPath(root, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new TypeError('repository path must be a non-empty string');
  }
  const normalized = relativePath.replaceAll('\\', '/').replace(/^\.\//, '');
  if (/^(?:[a-z]+:|\/)/i.test(normalized)) {
    throw new Error(`repository path must be relative: ${relativePath}`);
  }
  const resolved = path.resolve(root, normalized);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`repository path escapes the root: ${relativePath}`);
  }
  return resolved;
}

export function readJson(root, relativePath) {
  const source = fs.readFileSync(repoPath(root, relativePath), 'utf8');
  const duplicates = duplicateJsonKeys(source);
  if (duplicates.length > 0) throw new SyntaxError(`duplicate JSON key(s): ${duplicates.join(', ')}`);
  return JSON.parse(source);
}

export function duplicateJsonKeys(source) {
  const stack = [];
  let expectingKey = false;
  const duplicates = [];
  for (let cursor = 0; cursor < source.length;) {
    const character = source[cursor];
    if (/\s/.test(character)) { cursor += 1; continue; }
    if (character === '{') {
      stack.push({ type: 'object', keys: new Set() });
      expectingKey = true;
      cursor += 1;
      continue;
    }
    if (character === '[') {
      stack.push({ type: 'array' });
      expectingKey = false;
      cursor += 1;
      continue;
    }
    if (character === '}' || character === ']') {
      stack.pop();
      expectingKey = false;
      cursor += 1;
      continue;
    }
    if (character === ',') {
      expectingKey = stack.at(-1)?.type === 'object';
      cursor += 1;
      continue;
    }
    if (character === ':') {
      expectingKey = false;
      cursor += 1;
      continue;
    }
    if (character === '"') {
      const start = cursor;
      cursor += 1;
      while (cursor < source.length) {
        if (source[cursor] === '\\') cursor += 2;
        else if (source[cursor] === '"') { cursor += 1; break; }
        else cursor += 1;
      }
      if (expectingKey && stack.at(-1)?.type === 'object') {
        const key = JSON.parse(source.slice(start, cursor));
        const keys = stack.at(-1).keys;
        if (keys.has(key)) duplicates.push(key);
        keys.add(key);
        expectingKey = false;
      }
      continue;
    }
    cursor += 1;
  }
  return [...new Set(duplicates)];
}

export function stripUrlSuffix(value) {
  return String(value).split(/[?#]/, 1)[0].replace(/^\.\//, '');
}

export function fileBytes(root, relativePath) {
  return fs.statSync(repoPath(root, stripUrlSuffix(relativePath))).size;
}

export function formatBytes(value) {
  return `${value.toLocaleString('en-US')} B`;
}

export function gitBlobSha1(buffer) {
  return crypto
    .createHash('sha1')
    .update(`blob ${buffer.length}\0`)
    .update(buffer)
    .digest('hex');
}

export function imageDimensions(buffer, label = 'image') {
  if (buffer.length >= 24 && buffer.subarray(1, 4).toString('ascii') === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (
    buffer.length >= 30 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    let cursor = 12;
    while (cursor + 8 <= buffer.length) {
      const fourcc = buffer.subarray(cursor, cursor + 4).toString('ascii');
      const size = buffer.readUInt32LE(cursor + 4);
      const data = cursor + 8;
      if (data + size > buffer.length) break;
      if (fourcc === 'VP8X' && size >= 10) {
        return {
          width: buffer.readUIntLE(data + 4, 3) + 1,
          height: buffer.readUIntLE(data + 7, 3) + 1
        };
      }
      if (fourcc === 'VP8 ' && size >= 10 && buffer[data + 3] === 0x9d && buffer[data + 4] === 0x01 && buffer[data + 5] === 0x2a) {
        return {
          width: buffer.readUInt16LE(data + 6) & 0x3fff,
          height: buffer.readUInt16LE(data + 8) & 0x3fff
        };
      }
      if (fourcc === 'VP8L' && size >= 5 && buffer[data] === 0x2f) {
        const bits = buffer.readUInt32LE(data + 1);
        return {
          width: (bits & 0x3fff) + 1,
          height: ((bits >>> 14) & 0x3fff) + 1
        };
      }
      cursor = data + size + (size % 2);
    }
  }

  throw new Error(`${label} is not a supported PNG or WebP image`);
}

export function collectEntrypointResources(html) {
  const styles = [];
  const scripts = [];
  for (const match of html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
    styles.push(stripUrlSuffix(match[1]));
  }
  for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    scripts.push(stripUrlSuffix(match[1]));
  }
  return { styles, scripts };
}

export function unique(values) {
  return new Set(values).size === values.length;
}

export function isDirectRun(metaUrl) {
  return Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1])).href === metaUrl;
}

export class ValidationReport {
  #errors = [];
  #warnings = [];

  check(condition, message) {
    if (!condition) this.#errors.push(message);
    return Boolean(condition);
  }

  warn(condition, message) {
    if (!condition) this.#warnings.push(message);
    return Boolean(condition);
  }

  capture(label, callback) {
    try {
      return callback();
    } catch (error) {
      this.#errors.push(`${label}: ${error.message}`);
      return undefined;
    }
  }

  finish(label) {
    for (const warning of this.#warnings) console.warn(`WARN ${warning}`);
    if (this.#errors.length > 0) {
      for (const error of this.#errors) console.error(`ERROR ${error}`);
      console.error(`${label}: failed (${this.#errors.length} error(s), ${this.#warnings.length} warning(s))`);
      return false;
    }
    console.log(`${label}: passed (${this.#warnings.length} warning(s))`);
    return true;
  }

  get errors() {
    return [...this.#errors];
  }
}
