# Legacy ESLint minimatch export

The current React, import and accessibility ESLint plugins require minimatch as
a function. Modern minimatch exports that function as `minimatch` instead.
This adapter delegates calls to the official function and exposes its helpers and
`Minimatch` constructor. The import plugin also uses `makeRe(pattern).test(path)`;
that limited interface delegates to `new Minimatch(pattern).match(path)` because
minimatch 11 no longer emits regular expressions. It is not a general RegExp
replacement. No matching algorithm or security patch is copied here.

The lockfile uses official minimatch 11.0.3, fixing
[CVE-2026-118764](https://github.com/advisories/GHSA-g3hv-75wg-m249).
The dependency remains visible to the full npm audit.

Only the three legacy plugins use this adapter. ESLint, TypeScript tooling,
Jest and coverage tools use the official package directly. The scoped Node 24
resolution hook in `.github/register-eslint-minimatch.mjs` is registered by the
ESLint configuration before loading the presets. It changes neither npm packages
nor production code. Remove each plugin from the hook when it adopts the modern
interface; remove this directory and the hook when no legacy consumer remains.
Run the security, lint and full coverage checks after changing that resolution.
