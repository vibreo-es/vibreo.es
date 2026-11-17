# Temporary picomatch security fork

This is a private local remediation of **CVE-2026-112366 / GHSA-fc5q-39xc-vjpf**,
not an official picomatch release. Upstream's newest npm release remains 4.0.7
and the advisory lists no patched version as of 2026-11-17.

Source: https://registry.npmjs.org/picomatch/-/picomatch-4.0.7.tgz
Advisory: https://github.com/advisories/GHSA-fc5q-39xc-vjpf
The npm tarball's SHA-512 integrity was verified before extraction. Original and
patched file hashes are recorded in `security-patch.json`; the MIT license and
upstream README are preserved. Only `lib/parse.js` changes executable code.

## Correction and compatibility

At extglob close, inspect the already-parsed body tokens before emitting a `+`
or `*` repetition. An active star/globstar wildcard inside that body would nest
unbounded quantifiers, including the formerly missed single-branch patterns
`+(*a)` and `+(*)`. Route these groups through upstream's existing literalization
path. The check does not depend on `maxExtglobRecursion`; disabling that option
cannot restore the vulnerable expressions. Escaped stars, quoted stars and
character classes are distinct tokens, so their literal meaning is preserved.
Inner groups already made literal have cleared outputs and are not mistaken for
active wildcards. Existing safe character-class optimizations remain available.

This deliberately changes matching for repeated extglobs containing wildcard
stars: they are treated literally instead of compiled to dangerous regexes.
Ordinary globs, safe repetitions and negative extglobs retain upstream behavior.
It is a targeted remediation, not a claim that arbitrary regexes/globs are safe.

Compatibility check: of 1,983 upstream tests, 1,979 pass unchanged. Four test cases
expect the dangerous repeated-wildcard behavior now deliberately rejected (in
`extglobs.js`, `options.maxExtglobRecursion.js` and `special-characters.js`). These
are documented compatibility differences, not silently skipped tests.

One root file dependency and its override replace all picomatch copies, including
the former v2 copies used by anymatch/micromatch. The security tests exercise all
seven consumers' actual resolution and their public interfaces after `npm ci`.

Next.js 16.4.6 also embeds an independently bundled, vulnerable copy that npm's
dependency graph does not enumerate. `postinstall` and `prebuild` apply the same
reviewed sources to that copy. The installer verifies the exact Next version and
original bundle hash (or the already-patched entry hash), and verifies every
source before writing. Unknown Next versions/bundles fail for review. The copy is
self-contained inside Next for production file tracing; no runtime dependency
on the root development symlink is introduced. CI probes and hashes this actual
embedded copy too. A future Next upgrade requires reviewing/removing this step.

## Verification and maintenance

`npm run test:dependency-security` includes the CVE reproducers with a hard child
process deadline, option combinations, supported matching semantics, installed
consumer resolution, absence of registry copies and source-manifest integrity.
The original 4.0.7 blocks on the reproducer; this patch must complete it.

The private `@vibreo/picomatch` identity means npm does not assess this fork using
upstream's package advisories. **A clean audit alone is not proof of remediation.**
Keep these source and regression checks, the unmodified full `npm audit`, and
upstream advisory monitoring. No audit exclusion or advisory dismissal is added.
CI additionally runs `.github/check-picomatch-advisories.mjs` against the original
4.0.7 npm advisory data, prints this CVE as locally remediated, and fails on any
other advisory or unavailable advisory service. This keeps the fork's upstream
security findings visible despite its distinct package identity.
When upstream publishes a fix, review it and replace this fork with that release,
remove the override/local dependency, regenerate the lockfile, and rerun the CVE
regressions, consumer checks, full application tests and production checks.
