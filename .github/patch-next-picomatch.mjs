import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const source = new URL('../vendor/picomatch/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('security-patch.json', source), 'utf8'));
const next = require('next/package.json');
assert.equal(next.version, manifest.next_bundled_copy.next_version,
  'Next.js changed: review its embedded picomatch before updating this patch');
const entry = require.resolve('next/dist/compiled/picomatch');
const target = new URL('./', pathToFileURL(entry));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const current = sha(await readFile(entry));
assert([manifest.next_bundled_copy.original_index_sha256,
  manifest.patched_sha256['index.js']].includes(current),
  'Unexpected Next.js picomatch source: refusing to overwrite it');

// Verify every source before writing any target. Keep a self-contained copy
// inside Next so production file tracing never depends on a development symlink.
const files = [];
for (const [name, expected] of Object.entries(manifest.patched_sha256)) {
  if (!name.endsWith('.js')) continue;
  const content = await readFile(new URL(name, source));
  assert.equal(sha(content), expected, `Unreviewed local picomatch source: ${name}`);
  files.push([name, content]);
}
for (const [name, content] of files) {
  const destination = new URL(name, target);
  await mkdir(dirname(fileURLToPath(destination)), { recursive: true });
  await writeFile(destination, content);
}
console.log(`Next.js ${next.version}: applied verified CVE-2026-112366 patch to embedded picomatch`);
