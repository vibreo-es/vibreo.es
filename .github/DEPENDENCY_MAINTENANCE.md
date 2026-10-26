# Dependency maintenance

Dependabot alerts are enabled in repository settings. Renovate prepares update PRs;
automatic merging is disabled both here and in GitHub repository settings.

- Routine updates and lockfile refreshes: Mondays, 03:00–07:59 Europe/Madrid.
- Vulnerability fixes bypass that schedule and require review and passing CI.
- Daily CI reruns audits and tests even if the repository has not changed.
- Node stays on the reviewed 24 LTS branch. The upstream lifecycle check fails
  90 days before support ends. A major runtime migration needs a reviewed change
  to `.nvmrc`, `package.json` where present, CI and the Renovate policy together.
- Actions stay pinned to commit digests and receive version-update PRs.
- Review the CI results before merging. Private-repository branch protection
  may require a paid GitHub plan; a green check alone does not enforce this rule.
- Repository updates do not install tools or restart processes on the scraper Mac.
  The separate local production audit checks installed runtimes and actual delivery.

Use workflow_dispatch to repeat the daily checks. Scheduled checks and production
probes are read-only and do not publish data, modify cloud settings or deploy code.

## ESLint 10 compatibility

ESLint 9 reached end-of-life on 2026-08-06. The project uses ESLint 10 with the official `@eslint/compat` wrapper around the Next.js presets. The scoped `eslint` peer overrides for `eslint-plugin-react`, `eslint-plugin-jsx-a11y` and `eslint-plugin-import` let npm resolve that tested bridge without `--force` or `--legacy-peer-deps`. No lint rules are removed. `npm run lint` also checks valid TSX and deliberate React, accessibility, Hooks and Next.js violations. Remove each override and the wrapper once the upstream plugins declare native ESLint 10 support.

References: https://eslint.org/version-support/ and https://eslint.org/docs/latest/use/migrate-to-10.0.0

The `babel-plugin-istanbul > test-exclude` override uses maintained `test-exclude` 8 and `glob` 13 instead of deprecated `glob` 10. The complete Jest coverage run verifies instrumentation and thresholds. Remove this override when Istanbul updates its direct range.
