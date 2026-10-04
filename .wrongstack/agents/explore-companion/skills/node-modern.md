## Evidence — apply first

- Split repo-wide zero validation by scope for ignored-dir files. Use a body token only for explicit-path, ignored-scope control; validate tracked scope separately with `@playwright/test` against `package.json`, `pnpm-lock.yaml`, and `e2e/*.spec.ts`, using `files_with_matches` and `truncated=false`. Never infer tracked-scope validity from the ignored-file control.
- In gitignored `.temp_files/`, establish existence with direct `read`; claim ENOENT only after exact-directory `tree` with `truncated=false`. After a repo-wide `grep` timeout, narrow to `scripts/` and root `package.json`; label full-tree closure unverified.

## Collection and gates

- For `packages/plugins/tests/*.test.ts`, inspect both `packages/plugins/vitest.config.ts` (`include: ['tests/**/*.test.ts']`) and root `vitest.config.ts` (`packages/**/tests/**`), plus `packages/plugins/tsconfig.test.json` (`tests/**/*`) behind `pnpm check:test-types`. Corroborate project membership in `docs/reports/architecture-health-current.json`’s `projects` array.
- For `@wrongstack/tools` and `@wrongstack/providers`, use root `vitest.config.ts`, not nonexistent package configs. Read `scripts.test` in `packages/tools/package.json` or `packages/providers/package.json`: respectively, `vitest run --root ../.. packages/tools/tests` and `vitest run --root ../.. packages/providers/tests`.
- For `.temp_files/proof-driven-bug-hunter/<round>/`, `tree` the directory and read its config before predicting invocation; no shared runner exists. Root `test.exclude` is `'**/.temp_files/**'`, so ordinary explicit-path runs do not collect these tests. Read `run.mjs` when present for its hardcoded config path and CWD. Verify `resolve.alias` targets through direct manifest reads; gitignore-aware `glob` can falsely return zero for `node_modules/**`.

## Source contracts and ESM

- Before editing `packages/webui-server/src/server/route-family-dispatcher.ts` or callers, read `packages/webui-server/tests/host-dispatcher-parity.test.ts`. Its `balancedBlockAfter` extraction depends on raw `createRouteFamilyDispatcher(` options formatting in `message-dispatcher.ts` and `embedded-message-router.ts`; formatting-only edits can fail it.
- Close consumers of `packages/core/src/types/spec.ts` using both `from './spec.js'` and `@wrongstack/core/types/spec.js`. Check `packages/core/package.json`’s `exports`: with only `./types` and `./types/limits`, package-specifier resolution through `scripts/vitest-core-aliases.mjs` does not establish plain Node ESM support. Report the exposure anomaly.

## Workspace

- Read membership from `pnpm-workspace.yaml`, not root `workspaces`. Distinguish `scripts/bump-version.mjs`’s version-only writes from manifest-content readers: `scripts/build-portable.mjs`, `scripts/test-affected.mjs` (`SALT_FILES`), and `scripts/release-check-matrix.mjs`.
