import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const jestRequire = createRequire(require.resolve('jest-config'));
// Exercise the dependency Jest actually loads, including after a clean npm ci.
const merge = jestRequire('deepmerge');
const { mergeConfig } = require('jest-config');
const malicious = () => JSON.parse('{"__proto__":{"isAdmin":true},"valid":42}');

function assertSafe(value) {
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal(value.isAdmin, undefined);
  assert.equal(Object.hasOwn(value, '__proto__'), false);
  assert.equal(Object.prototype.isAdmin, undefined);
}

test('Jest resolves the reviewed local security fork', () => {
  assert.equal(realpathSync(jestRequire.resolve('deepmerge')),
    realpathSync(fileURLToPath(new URL('../vendor/deepmerge/index.cjs', import.meta.url))));
});

test('rejects source __proto__ with a null-prototype target', () => {
  const target = Object.assign(Object.create(null), { debug: false });
  const result = merge(target, malicious());
  assertSafe(result);
  assert.equal(result.debug, false);
  assert.equal(result.valid, 42);
});

for (const placeholder of [null, undefined, false, 0, '']) {
  test(`rejects nested __proto__ with ${String(placeholder)} placeholder`, () => {
    const result = merge({ session: placeholder }, { session: malicious() });
    assertSafe(result.session);
    assert.equal(result.session.valid, 42);
  });
}

test('rejects target own __proto__ during cloning', () => {
  const result = merge(malicious(), { verbose: true });
  assertSafe(result);
  assert.deepEqual(result, { valid: 42, verbose: true });
});

test('rejects __proto__ when both inputs have an own key', () => {
  assertSafe(merge(malicious(), malicious()));
});

test('rejects __proto__ in cloned array elements', () => {
  const result = merge({ list: [] }, { list: [malicious()] });
  assertSafe(result.list[0]);
  assert.equal(result.list[0].valid, 42);
});

test('preserves nested merging, array concatenation, symbols and input immutability', () => {
  const symbol = Symbol('setting');
  const defaults = { globals: { a: 1 }, setupFiles: ['first.js'], [symbol]: { a: 1 } };
  const overrides = { globals: { b: 2 }, setupFiles: ['second.js'], [symbol]: { b: 2 } };
  const result = merge.all([defaults, overrides]);
  assert.deepEqual(result, {
    globals: { a: 1, b: 2 }, setupFiles: ['first.js', 'second.js'], [symbol]: { a: 1, b: 2 },
  });
  result.globals.a = 99;
  result.setupFiles.push('third.js');
  assert.equal(defaults.globals.a, 1);
  assert.deepEqual(defaults.setupFiles, ['first.js']);
});

test('preserves custom array and key merge options', () => {
  assert.deepEqual(merge({ list: [1] }, { list: [2] }, {
    arrayMerge: (_target, source) => source,
  }), { list: [2] });
  assert.deepEqual(merge({ settings: { a: 1 } }, { settings: { b: 2 } }, {
    customMerge: key => key === 'settings' ? (_target, source) => source : undefined,
  }), { settings: { b: 2 } });
});

test('Jest configuration merging rejects the exploit and preserves valid globals', () => {
  const result = mergeConfig({ globals: { session: null, existing: true } }, {
    globals: { session: malicious(), added: true },
  });
  assertSafe(result.globals.session);
  assert.equal(result.globals.session.valid, 42);
  assert.equal(result.globals.existing, true);
  assert.equal(result.globals.added, true);
});
