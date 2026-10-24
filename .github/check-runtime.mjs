import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Use the upstream lifecycle calendar, not the newest major release.
const response = await fetch('https://raw.githubusercontent.com/nodejs/Release/main/schedule.json', {
  signal: AbortSignal.timeout(30000),
});
assert(response.ok, `Node release calendar: HTTP ${response.status}`);
const releases = await response.json();
const major = (await readFile('.nvmrc', 'utf8')).trim();
assert.match(major, /^\d+$/, '.nvmrc must select one reviewed Node major');
assert.equal(process.versions.node.split('.')[0], major, 'Runner must match .nvmrc');
const release = releases[`v${major}`];
const now = Date.now();
assert(release?.lts && Date.parse(release.lts) <= now, `Node ${major} is not LTS`);
const daysRemaining = Math.floor((Date.parse(release.end) - now) / 86400000);
assert(daysRemaining > 90, `Node ${major}: ${daysRemaining} days until end of support; plan migration now`);
console.log(JSON.stringify({node: process.versions.node, lts: release.lts, end: release.end, daysRemaining}));
