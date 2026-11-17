// Run in a disposable child: a regression must fail the test, not freeze CI.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pm = require(process.argv[2]);
const patterns = [
  '+(*a)', '*(*a)', '+(*)b', '*(*)b', '+(a*)b', '*(a*)b',
  '+(*a|b)', '*(*a|b)', '+(@(*a))', '+({*a,b})', '+([ab]*)',
  '+(**/a)b', 'x+(*a)y', '+(*a)+(*b)',
];
const options = [
  {}, { capture: true }, { fastpaths: false }, { bash: true },
  { windows: true }, { dot: true }, { maxExtglobRecursion: false },
];
let checks = 0;
for (const pattern of patterns) {
  for (const opts of options) {
    const regex = pm.makeRe(pattern, opts);
    assert.equal(regex.test('a'.repeat(256) + '!'), false, pattern);
    checks++;
  }
}
console.log(JSON.stringify({ checks }));
