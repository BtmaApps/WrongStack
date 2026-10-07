# Dependency Agent Instructions

## Lockfile Verification

- To attribute every `pnpm-lock.yaml` hunk to its source: hash the lockfile, run `pnpm install --frozen-lockfile --lockfile-only`, re-hash. Exit 0 with an unchanged hash means the manifest and lockfile agree, so every remaining diff hunk must map to a `pnpm-workspace.yaml` change (e.g. a new `overrides` entry explains replacement-version hunks plus dependency-link hunks in consumers). This separates intentional security bumps from accidental churn.
- A `scripts`-only change in a `package.json` is lockfile-neutral: lockfiles record dependency specifiers, not scripts. Verify zero `pnpm-lock.yaml` churn by diffing the `<member>:` importer block directly against the manifest instead of re-running the installer.
- Own-version bumps in `packages/*/package.json` should leave `pnpm-lock.yaml` untouched, because importer entries record dependency specifiers, not each package's own version. Investigate any resulting diff.
- For a coordinated version bump, `grep '"version": "<old>"'` across all `**/package.json` and require zero matches — the frozen-lockfile check proves manifest/lockfile agreement but cannot detect a workspace member omitted from the bump.

## pnpm Overrides

- Before calling an override/pinning change done, diff the `overrides:` block pnpm writes into `pnpm-lock.yaml` against `overrides:` in `pnpm-workspace.yaml`, proven with `pnpm install --frozen-lockfile --lockfile-only`. A floor tightened only in the manifest has zero effect until the lockfile regenerates; `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` is the only signal that catches it.
- Also check the resolved version entry in the lockfile: a manifest declaring a higher minimum can still coexist with the vulnerable version resolved below it.
- An `overrides` entry is active protection only if the package also appears in the lockfile as a package entry or importer dependency. A single line that is only the override declaration itself (as happened with `sharp`) is inert vestigial config — it neither fixes the vulnerability nor proves mitigation.

## Exports Subpath Wiring

- A new `exports` subpath in `packages/*/package.json` is incomplete until it appears in the hardcoded `coreEntries`/`toolEntries` arrays in `scripts/build-package.mjs` — the build emits only listed entries, so an unwired subpath passes CI and fails at runtime with `ERR_PACKAGE_PATH_NOT_EXPORTED`, not at build time.
- Confirm a live consumer with `grep '@wrongstack/core/<subpath>'` against `packages/tools/src/`: zero importers means dead weight; a live importer means a shipping break.
- `packages/core/tests/architecture/build-allowlist-freshness.test.ts` does NOT gate manifest/build parity — no test failure will surface a missing entry.

## website/ Dual pnpm/npm Project

- `website/` is both a pnpm workspace member and a standalone npm project deployed via `.github/workflows/pages.yml`. It deliberately omits `vitest` (declared only at the workspace root) so the Pages artifact's `npm ci` tree stays free of test code, and `website/package-lock.json` intentionally contains no `vitest` entry — check the explanatory comment in `.github/workflows/pages.yml` before reporting a missing devDependency as a phantom dep.
- Conversely, any new tooling import must be cross-checked against both the root workspace manifest and `website/package-lock.json`: a config importing `vitest/config` with `environment: 'jsdom'` needs `vitest` and `jsdom` in website's own `devDependencies`, or its standalone `npm ci` tree will have neither.
- A green test run in `website/` proves only that the workspace-root install happens to be present — Node and npm walk up the tree and silently mask missing declarations. Confirm the member owns a toolchain binary by checking `website/node_modules/<pkg>` and `website/node_modules/.bin/<pkg>` exist.
- Keep `website/package.json`, `website/package-lock.json` (both the top-level `version` and `packages[""].version` fields), and the `website` importer in `pnpm-lock.yaml` synchronized.
- Validate both sides: `pnpm install --frozen-lockfile --lockfile-only` for the workspace; a clean `npm ci` in `website/` for the standalone lockfile.

## Registry Cooldowns

- With `minimumReleaseAge` set in `pnpm-workspace.yaml`, a just-published patch is not installable until the cooldown elapses. Before reporting an upgrade as unblocked, query the registry's `time` map and compare publish date against now: a floor bump to the current `latest` passes instantly, but a floor bump to a freshly published patch is blocked.

## Workspace-Link Dependencies

- A `"workspace:*"` dependency added to an existing `packages/*` member changes only the consuming importer section of `pnpm-lock.yaml`, with no package snapshot movement — use that importer-only diff as evidence that no external or transitive package changed.
- Verify the link target exists and its `packages/<name>/package.json` `name` matches the referenced workspace package.
- Search the consuming package for imports of the added specifier to rule out a phantom or speculative dependency.

## Test TypeScript Validation

- Treat `scripts/check-test-typecheck.mjs` as a non-regression ratchet, not proof that test TypeScript is clean. Inspect `architecture/test-typecheck-baseline/*.json`, then run each relevant package's configured TypeScript check against its `tsconfig.test.json` before claiming test TypeScript integrity.