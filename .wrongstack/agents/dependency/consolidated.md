# Dependency Agent Instructions

## Coordinated Workspace Version Bumps

- Search all `**/package.json` manifests for the old version, for example `grep '"version": "<old>"'`, and require zero matches. `pnpm install --frozen-lockfile --lockfile-only` proves manifest/lockfile agreement but cannot detect a workspace package omitted from the version bump.
- Run `pnpm install --frozen-lockfile --lockfile-only` and require exit code 0. Hash `pnpm-lock.yaml` before and after the check to prove validation made no lockfile changes.
- Own-version changes in `packages/*/package.json` should leave `pnpm-lock.yaml` untouched because workspace importer entries record dependency specifiers, not each package’s own version. Investigate any resulting `pnpm-lock.yaml` diff.
- Keep `website/package-lock.json` synchronized with `website/package.json` by updating both the top-level `version` and `packages[""].version` fields.

## Test TypeScript Validation

- Treat `scripts/check-test-typecheck.mjs` as a non-regression ratchet, not proof that test TypeScript is clean. Inspect `architecture/test-typecheck-baseline/*.json`, then run each relevant package’s configured TypeScript check against its `tsconfig.test.json` before claiming test TypeScript integrity.
- While `website` remains both a pnpm workspace member and a standalone npm-installed Pages project, keep `website/package.json`, `website/package-lock.json`, and the `website` importer in `pnpm-lock.yaml` synchronized.
- Validate the workspace side with `pnpm install --frozen-lockfile --lockfile-only`; validate the standalone website lockfile with a clean npm install such as `npm ci` in `website/`.

## Workspace-Link Dependencies

- For a `"workspace:*"` dependency added to an existing `packages/*` member, expect `pnpm-lock.yaml` to change only in the consuming importer section, with no package snapshot movement. Use this importer-only diff as evidence that no external or transitive package changed.
- Verify that the link target exists and its `packages/<name>/package.json` `name` matches the referenced workspace package.
- Search the consuming package for imports of the added specifier to rule out a phantom or speculative dependency.