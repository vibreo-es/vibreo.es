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

// Exercise the old minimatch interfaces inside the plugins, not just their load.
const globRules = new ESLint({ overrideConfig: { rules: {
  'import/no-internal-modules': ['error', { forbid: ['react/*'] }],
  'react/forbid-component-props': ['error', { forbid: [
    { propName: 'style', disallowedForPatterns: ['Bad*'] },
  ] }],
  'jsx-a11y/label-has-associated-control': ['error', {
    controlComponents: ['Custom*'], assert: 'nesting',
  }],
} } });
const [globInvalid] = await globRules.lintText(`
import 'react/private';
const BadButton = 'button';
const OtherInput = 'input';
export function Example() {
  return <><BadButton style={{}} /><label>Name <OtherInput /></label></>;
}
`, options);
for (const rule of ['import/no-internal-modules', 'react/forbid-component-props', 'jsx-a11y/label-has-associated-control']) {
  assert(globInvalid.messages.some(message => message.ruleId === rule), `${rule}: ${JSON.stringify(globInvalid.messages)}`);
}
const [globValid] = await globRules.lintText(`
import { Fragment } from 'react';
const GoodButton = 'button';
const CustomInput = 'input';
export function Example() {
  return <Fragment><GoodButton style={{}} /><label>Name <CustomInput /></label></Fragment>;
}
`, options);
assert.equal(globValid.messages.length, 0, JSON.stringify(globValid.messages));
console.log(`ESLint ${ESLint.version}: Next, React, accessibility, Hooks and imports checks verified`);
