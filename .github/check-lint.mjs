import assert from 'node:assert/strict';
import { ESLint } from 'eslint';

assert(Number(ESLint.version.split('.')[0]) >= 10, 'ESLint 9 is end-of-life');
const eslint = new ESLint();
const options = { filePath: 'src/components/LintCompatibilityProbe.tsx' };
const [valid] = await eslint.lintText(`
import { useState } from 'react';
export default function Example() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
`, options);
assert.equal(valid.messages.length, 0, JSON.stringify(valid.messages));

// Keep the legacy plugin bridge covered until upstream supports ESLint 10.
const [invalid] = await eslint.lintText(`
import { useState } from 'react';
export default function Example({ enabled }: { enabled: boolean }) {
  if (enabled) { useState(0); }
  return <><img src="/example.png" />{[1, 2].map(value => <span>{value}</span>)}</>;
}
`, options);
assert(!invalid.messages.some(message => message.fatal), JSON.stringify(invalid.messages));
const rules = new Set(invalid.messages.map(message => message.ruleId));
for (const rule of ['react/jsx-key', 'jsx-a11y/alt-text', 'react-hooks/rules-of-hooks', '@next/next/no-img-element']) {
  assert(rules.has(rule), `Lint compatibility lost ${rule}: ${JSON.stringify(invalid.messages)}`);
}
const [anonymousExport] = await eslint.lintText('export default {};', options);
assert(anonymousExport.messages.some(message => message.ruleId === 'import/no-anonymous-default-export'));
console.log(`ESLint ${ESLint.version}: Next, React, accessibility, Hooks and imports checks verified`);
