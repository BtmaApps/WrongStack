## Scratch and mailbox evidence
- For mailbox probes, inspect `~/.wrongstack/projects/<dir>/_mailbox.sqlite`, table `messages`, columns `from_id, to_id, type, data`; parse `data` JSON for `subject` and `body`, using `node:sqlite` `DatabaseSync` with `{ readOnly: true }` as in `.temp_files/dump-l4.mjs`.
- In ignored `.temp_files/`, establish existence with direct `read`; claim ENOENT only after exact-directory `tree` with `truncated=false`. After grep timeout, narrow to `scripts/` and root `package.json`; label full-tree closure unverified.
- Treat `.temp_files/proof-driven-bug-hunter/<round>/` as noncollected because root `vitest.config.ts` `test.exclude` is `'**/.temp_files/**'`; `tree` the directory and read `run.mjs` for hardcoded config/CWD; assume no shared runner. Verify `resolve.alias` by direct manifest reads; do not rely on gitignore-aware `glob` for `node_modules/**`.

## Test discovery
- Corroborate `packages/plugins/tests/*.test.ts` with `packages/plugins/vitest.config.ts` (`include: ['tests/**/*.test.ts']`), root `vitest.config.ts` (`packages/**/tests/**`), `packages/plugins/tsconfig.test.json` (`tests/**/*`) behind `pnpm check:test-types`, and `docs/reports/architecture-health-current.json` `projects`.
- For `@wrongstack/tools` and `@wrongstack/providers`, use root `vitest.config.ts`; read `scripts.test` in `packages/tools/package.json` and `packages/providers/package.json` for `vitest run --root ../.. packages/tools/tests` and `vitest run --root ../.. packages/providers/tests`.

## ESM contracts
- Before editing `packages/webui-server/src/server/route-family-dispatcher.ts` or callers, read `packages/webui-server/tests/host-dispatcher-parity.test.ts`; `balancedBlockAfter` depends on raw `createRouteFamilyDispatcher(` options formatting in `message-dispatcher.ts` and `embedded-message-router.ts`.
- For `packages/core/src/types/spec.ts`, close consumers via both `from './spec.js'` and `@wrongstack/core/types/spec.js`; `packages/core/package.json` `exports` only `./types` and `./types/limits`, and `scripts/vitest-core-aliases.mjs` does not prove plain Node ESM support.

## Workspace and scope
- Read membership from `pnpm-workspace.yaml`, not root `workspaces`; distinguish `scripts/bump-version.mjs` version-only writes from manifest readers `scripts/build-portable.mjs`, `scripts/test-affected.mjs` (`SALT_FILES`), and `scripts/release-check-matrix.mjs`.
- Validate tracked scope separately with `@playwright/test` against `package.json`, `pnpm-lock.yaml`, and `e2e/*.spec.ts` using `files_with_matches` and `truncated=false`; never infer tracked-scope validity from ignored `.temp_files/`.
