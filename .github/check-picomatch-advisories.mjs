import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// npm audit cannot inspect private fork identities. Continue auditing the exact
// upstream base too, and fail on any advisory without a verified local remedy.
const base = new URL('../vendor/picomatch/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('security-patch.json', base), 'utf8'));
for (const [name, expected] of Object.entries(manifest.patched_sha256)) {
  const actual = createHash('sha256').update(await readFile(new URL(name, base))).digest('hex');
  assert.equal(actual, expected, `${name}: security patch changed; review required`);
}
const response = await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ picomatch: [manifest.version] }),
  signal: AbortSignal.timeout(30000),
});
assert(response.ok, `Upstream advisory check unavailable: HTTP ${response.status}`);
const body = await response.json();
assert(body && typeof body === 'object' && !Array.isArray(body), 'Invalid advisory response');
const advisories = body.picomatch ?? [];
assert(Array.isArray(advisories), 'Invalid picomatch advisory list');
let unremediated = 0;
for (const advisory of advisories) {
  const remediated = advisory.url === manifest.advisory
    && advisory.title === manifest.remediated_advisory.title
    && advisory.vulnerable_versions === manifest.remediated_advisory.vulnerable_versions
    && manifest.cve === 'CVE-2026-112366'
    && manifest.patched_sha256['lib/parse.js'] !== manifest.original_sha256['lib/parse.js'];
  console.log(JSON.stringify({
    package: 'picomatch', upstreamVersion: manifest.version,
    advisory: advisory.url, severity: advisory.severity,
    status: remediated ? 'locally-remediated-see-vendor/picomatch/SECURITY.md' : 'UNREMEDIATED',
  }));
  if (!remediated) unremediated++;
}
assert.equal(unremediated, 0, 'New upstream vulnerability: review the local fork before proceeding');
console.log(`Checked ${advisories.length} upstream picomatch advisories; full npm audit remains required`);
