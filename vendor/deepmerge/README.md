# Temporary deepmerge security fork for Jest

This private, repository-local package replaces only `jest-config > deepmerge`.
It is a local remediation, **not an official upstream release**.
The direct development dependency anchors npm's relative file resolution at the
repository root; the override points to that same reviewed copy.

## Provenance and change

- Base: the self-contained `dist/cjs.js` distributed in npm `deepmerge@4.3.1`.
  Original SHA-256: `2e5160f84a1141bd927264afe4d15766f1e6cf07daef182b37ff53fea121de7d`.
- Original tarball: https://registry.npmjs.org/deepmerge/-/deepmerge-4.3.1.tgz
- Advisory: https://github.com/advisories/GHSA-gcqx-w48m-w2h4
  (`CVE-2026-93753`). No patched version was published as of 2026-10-28.
- Reviewed correction: https://github.com/TehShrike/deepmerge/pull/274,
  commit `c5ad573121574db1c625b0aabcc6114ed7df6c5a`. That PR was closed without
  merging. Its small key guard is applied here to the distributed CommonJS build.
- The original MIT license is preserved in `LICENSE`.

The only code change rejects `__proto__` by name in **both** the target-copy and
source-merge loops, before reading or assigning it. Previously the guard depended
on the target's shape and could invoke the prototype setter on the returned object.
All other keys, array behaviour, custom mergers and cloning retain upstream logic.

## Verification and removal

`npm run test:dependency-security` exercises the actual dependency loaded by Jest:
null-prototype targets, null/primitive placeholders, poisoned target keys, arrays,
legitimate configuration merging, and Jest's own `mergeConfig`. Daily CI runs this
before the unchanged `npm audit`, then runs the full application suite and build.

This fork has a separate package identity, so npm advisories for `deepmerge` do
not assess its code. The regression tests and review of this small delta are
therefore required; a clean audit alone is not evidence of remediation.

Review upstream `deepmerge` releases and Jest's dependency changes during dependency
maintenance. Once an upstream fix or a secure Jest replacement is available, remove
the `deepmerge` development dependency and override, regenerate the lockfile,
remove this directory, its ESLint ignore and the
local-path assertion, and rerun the security regressions and full CI. Do not disable
the audit, add an advisory exception or downgrade Jest to resolve this warning.
