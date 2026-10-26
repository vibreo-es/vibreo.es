import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const deprecated = Object.entries(lock.packages)
  .filter(([, value]) => value.deprecated)
  .map(([name, value]) => `${name}@${value.version}: ${value.deprecated}`);
assert.equal(deprecated.length, 0, `Deprecated dependencies:\n${deprecated.join('\n')}`);
console.log(`Checked ${Object.keys(lock.packages).length - 1} locked packages: no deprecated dependencies`);
