import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const pm = require('picomatch');
const fork = new URL('../vendor/picomatch/', import.meta.url);
const forkEntry = realpathSync(fileURLToPath(new URL('index.js', fork)));

for (const consumer of ['jest-util', 'jest-haste-map', 'jest-message-util',
  'tinyglobby', '@parcel/watcher', 'micromatch', 'anymatch']) {
  test(`${consumer} loads the CVE-2026-112366 remediation`, () => {
    const consumerRequire = createRequire(require.resolve(consumer));
    assert.equal(realpathSync(consumerRequire.resolve('picomatch')), forkEntry);
  });
}

test('the lockfile contains no registry copies of vulnerable picomatch', () => {
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));
  const copies = Object.entries(lock.packages).filter(([path]) => path.endsWith('/picomatch'));
  assert(copies.length > 0);
  for (const [path, entry] of copies) {
    if (path === 'vendor/picomatch') {
      assert.equal(entry.name, '@vibreo/picomatch');
      assert.equal(entry.version, '4.0.7-vibreo.1');
    } else {
      assert.equal(entry.link, true, path);
      assert.equal(entry.resolved, 'vendor/picomatch', path);
    }
  }
});

test('the vendored source matches its reviewed security manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('security-patch.json', fork)));
  assert.equal(manifest.cve, 'CVE-2026-112366');
  assert.equal(manifest.version, '4.0.7');
  for (const [name, hash] of Object.entries(manifest.patched_sha256)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(name, fork))).digest('hex'), hash, name);
    if (name !== 'lib/parse.js') assert.equal(hash, manifest.original_sha256[name], name);
  }
  assert.notEqual(manifest.patched_sha256['lib/parse.js'], manifest.original_sha256['lib/parse.js']);
});

for (const entry of ['picomatch', 'next/dist/compiled/picomatch']) {
  test(`CVE-2026-112366 nonmatches finish within a hard deadline: ${entry}`, () => {
    const probe = fileURLToPath(new URL('./picomatch-redos-probe.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [probe, require.resolve(entry)], {
      encoding: 'utf8', timeout: 4000,
    });
    assert.equal(result.error, undefined, `matcher exceeded deadline: ${result.error}`);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).checks, 98);
  });
}

test('Next.js embeds the same reviewed sources after a clean installation', () => {
  const manifest = JSON.parse(readFileSync(new URL('security-patch.json', fork)));
  const embedded = new URL('./', pathToFileURL(require.resolve('next/dist/compiled/picomatch')));
  for (const [name, hash] of Object.entries(manifest.patched_sha256)) {
    if (name.endsWith('.js')) {
      assert.equal(createHash('sha256').update(readFileSync(new URL(name, embedded))).digest('hex'), hash, name);
    }
  }
});

test('dangerous repeated wildcards are treated literally, including opt-out and POSIX APIs', () => {
  const posix = require('picomatch/posix');
  for (const pattern of ['+(*a)', '*(*a)', '+(*)', '*(*)', '+(*a|b)', '+(@(*a))']) {
    for (const opts of [{}, { capture: true }, { maxExtglobRecursion: false }]) {
      const regex = pm.makeRe(pattern, opts);
      assert(regex.test(pattern), pattern);
      assert.equal(regex.test('aaa'), false, pattern);
      assert.equal(posix.makeRe(pattern, opts).source, regex.source);
    }
  }
});

test('literal stars, character classes and safe repeated extglobs retain their meaning', () => {
  for (const [input, pattern] of [
    ['***', '+(\\*)'], ['***', '+("*")'], ['***', '+([*])'],
    ['abab', '+(ab)'], ['abcab', '+(ab|c)'], ['aab', '+(*(a)|*(b))'],
  ]) assert.equal(pm.isMatch(input, pattern), true, `${input} / ${pattern}`);
  assert.equal(pm.isMatch('aaac', '+(ab|c)'), false);
  assert.equal(pm.isMatch('src/component.tsx', 'src/**/*.{ts,tsx}'), true);
  assert.equal(pm.isMatch('src/.hidden.tsx', 'src/**/*.{ts,tsx}'), false);
  assert.equal(pm.isMatch('src/a.test.tsx', 'src/!(*.test).tsx'), false);
  assert.equal(pm.isMatch('src/a.tsx', 'src/!(*.test).tsx'), true);
});

test('Jest and the former picomatch 2 consumers preserve public matching APIs', () => {
  const { globsToMatcher } = require('jest-util');
  const match = globsToMatcher(['**/*.{ts,tsx}', '!**/node_modules/**']);
  assert.equal(match('src/app.test.tsx'), true);
  assert.equal(match('node_modules/a/index.ts'), false);
  const micromatch = require('micromatch');
  assert.deepEqual(micromatch(['src/a.ts', 'src/a.tsx', 'src/a.js'], ['src/**/*.{ts,tsx}']), ['src/a.ts', 'src/a.tsx']);
  assert.deepEqual(micromatch.capture('src/*.js', 'src/index.js'), ['index']);
  const anymatch = require('anymatch');
  assert.equal(anymatch(['**/*.tsx', '!**/node_modules/**'], 'src/a.tsx'), true);
  assert.equal(anymatch(['**/*.tsx', '!**/node_modules/**'], 'node_modules/a.tsx'), false);
  assert.equal(pm.scan('src/**/*.tsx').base, 'src');
  assert(pm.parse('src/**/*.tsx').output);
});

test('upstream monitoring reports the repaired CVE and fails on new findings or unavailable service', () => {
  const manifest = JSON.parse(readFileSync(new URL('security-patch.json', fork)));
  const known = { ...manifest.remediated_advisory, severity: 'high' };
  const checker = new URL('./check-picomatch-advisories.mjs', import.meta.url).href;
  for (const [name, response, status, marker] of [
    ['known remediation', { ok: true, body: { picomatch: [known] } }, 0, 'locally-remediated'],
    ['new advisory', { ok: true, body: { picomatch: [{ ...known, url: 'https://example.invalid/new-advisory' }] } }, 1, 'UNREMEDIATED'],
    ['changed scope', { ok: true, body: { picomatch: [{ ...known, vulnerable_versions: '*' }] } }, 1, 'UNREMEDIATED'],
    ['service unavailable', { ok: false, status: 503 }, 1, 'unavailable'],
  ]) {
    const code = `const fixture = ${JSON.stringify(response)};
      globalThis.fetch = async () => ({ ...fixture, json: async () => fixture.body });
      await import(${JSON.stringify(checker)});`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
      encoding: 'utf8', timeout: 4000,
    });
    assert.equal(result.status, status, `${name}: ${result.stderr}`);
    assert((result.stdout + result.stderr).includes(marker), name);
  }
});
