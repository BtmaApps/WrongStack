# Dependency Agent Instructions

## Lockfile Verification

- In the Bun workspace, use `bun install --frozen-lockfile --dry-run` (exit 0 = agreement) as the read-only manifest/lockfile check that mirrors what CI runs (`bun install --frozen-lockfile --ignore-scripts` in `.github/workflows/*.yml`). Do not treat a stale pre-migration `pnpm-lock.yaml` as authoritative unless CI installs with it.
- A `scripts`-only change in a `package.json` is lockfile-neutral: lockfiles record dependency specifiers, not scripts. Verify zero `bun.lock` churn by diffing the `<member>` importer block directly against the manifest instead of re-running the installer.
- Own-version bumps in `packages/*/package.json` should leave `bun.lock` untouched, because importer entries record dependency specifiers, not each package's own version. Investigate any resulting diff.
- For a coordinated version bump, `grep '"version": "<old>"'` across all `**/package.json` and require zero matches — the frozen-lockfile check proves manifest/lockfile agreement but cannot detect a workspace member omitted from the bump.

## Workspace Overrides

- Before calling an override/pinning change done, diff the `overrides:` block in `bun.lock` against `overrides:` in the root `package.json` (and `pnpm-workspace.yaml` if read by `scripts/audit-dependencies.mjs`), proven with `bun install --frozen-lockfile --dry-run`. A floor tightened only in the manifest has zero effect until the lockfile regenerates.
- Also check the resolved version entry in `bun.lock`: a manifest declaring a higher minimum can still coexist with the vulnerable version resolved below it.
- An `overrides` entry is active protection only if the package also appears in the lockfile as a package entry or importer dependency. A single line that is only the override declaration itself (as happened with `sharp`) is inert vestigial config — it neither fixes the vulnerability nor proves mitigation.

## Exports Subpath Wiring

- A new `exports` subpath in `packages/*/package.json` is incomplete until it appears in the hardcoded `coreEntries`/`toolEntries` arrays in `scripts/build-package.mjs` — the build emits only listed entries, so an unwired subpath passes CI and fails at runtime with `ERR_PACKAGE_PATH_NOT_EXPORTED`, not at build time.
- Confirm a live consumer with `grep '@wrongstack/core/<subpath>'` against `packages/tools/src/`: zero importers means dead weight; a live importer means a shipping break.
- `packages/core/tests/architecture/build-allowlist-freshness.test.ts` does NOT gate manifest/build parity — no test failure will surface a missing entry.

## website/ Standalone Lockfile Sync

- `website/` is both a workspace member and a standalone project deployed via `.github/workflows/pages.yml`. It deliberately omits `vitest` (declared only at the workspace root) so the Pages artifact's `npm ci` tree stays free of test code, and `website/package-lock.json` intentionally contains no `vitest` entry — check the explanatory comment in `.github/workflows/pages.yml` before reporting a missing devDependency as a phantom dep.
- Conversely, any new tooling import must be cross-checked against both the root workspace manifest and `website/package-lock.json`: a config importing `vitest/config` with `environment: 'jsdom'` needs `vitest` and `jsdom` in website's own `devDependencies`, or its standalone `npm ci` tree will have neither.
- A green test run in `website/` proves only that the workspace-root install happens to be present — Node and npm walk up the tree and silently mask missing declarations. Confirm the member owns a toolchain binary by checking `website/node_modules/<pkg>` and `website/node_modules/.bin/<pkg>` exist.
- Keep `website/package.json`, `website/package-lock.json` (both the top-level `version` and `packages[""].version` fields), and the `website` importer in `bun.lock` synchronized.
- Validate both sides: `bun install --frozen-lockfile --dry-run` for the workspace; a clean `npm ci` in `website/` for the standalone lockfile.

## Registry Cooldowns

- With `minimumReleaseAge` configured, a just-published patch (<24h old) is not installable until the cooldown elapses. Before reporting an upgrade as unblocked or blaming `minimumReleaseAge` for downgrades, query the registry's `time` map (`npm view <pkg> time --json`) and compare publish date against now.

## Workspace-Link Dependencies

- A `"workspace:*"` dependency added to an existing `packages/*` member changes only the consuming importer section of `bun.lock`, with no external package snapshot movement — use that importer-only diff as evidence that no external or transitive package changed.
- Verify the link target exists and its `packages/<name>/package.json` `name` matches the referenced workspace package.
- Search the consuming package for imports of the added specifier to rule out a phantom or speculative dependency.

## Test TypeScript Validation

- Treat `scripts/check-test-typecheck.mjs` as a non-regression ratchet, not proof that test TypeScript is clean. Inspect `architecture/test-typecheck-baseline/*.json`, then run each relevant package's configured TypeScript check against its `tsconfig.test.json` before claiming test TypeScript integrity.