## Scratch evidence
- For mailbox probes, anchor scratch harnesses at `~/.wrongstack/projects/<dir>/_mailbox.sqlite`; inspect `messages` with `from_id, to_id, type, data`, parse `data` for `subject` and `body`, using `node:sqlite` `DatabaseSync` with `{ readOnly: true }`, following `.temp_files/dump-l4.mjs`.
- In ignored `.temp_files/`, establish existence with direct `read`; claim ENOENT only after exact-directory `tree` with `truncated=false`. After grep timeout, narrow to `scripts/` and root `package.json`; label full-tree closure unverified.

## Test collection
- Corroborate `packages/plugins/tests/*.test.ts` with `packages/plugins/vitest.config.ts` (`include: ['tests/**/*.test.ts']`), root `vitest.config.ts` (`packages/**/tests/**`), `packages/plugins/tsconfig.test.json` (`tests/**/*`) behind `pnpm check:test-types`, and `docs/reports/architecture-health-current.json` `projects`.
- For `@wrongstack/tools` and `@wrongstack/providers`, use root `vitest.config.ts`; read `scripts.test` in `packages/tools/package.json` and `packages/providers/package.json` for `vitest run --root ../.. packages/tools/tests` and `vitest run --root ../.. packages/providers/tests`.
- Treat `.temp_files/proof-driven-bug-hunter/<round>/` as noncollected by ordinary runs because root `test.exclude` is `'**/.temp_files/**'`; `tree` the directory and read `run.mjs` when present for hardcoded config/CWD before predicting invocation, with no shared runner assumed. Verify `resolve.alias` through direct manifest reads; gitignore-aware `glob` can falsely return zero for `node_modules/**`.

## ESM contracts
- Before editing `packages/webui-server/src/server/route-family-dispatcher.ts` or callers, read `packages/webui-server/tests/host-dispatcher-parity.test.ts`; `balancedBlockAfter` depends on raw `createRouteFamilyDispatcher(` options formatting in `message-dispatcher.ts` and `embedded-message-router.ts`.
- For `packages/core/src/types/spec.ts`, close consumers via both `from './spec.js'` and `@wrongstack/core/types/spec.js`; `packages/core/package.json` `exports` only `./types` and `./types/limits`, and `scripts/vitest-core-aliases.mjs` does not prove plain Node ESM support.

## Workspace and scope
- Read membership from `pnpm-workspace.yaml`, not root `workspaces`; distinguish `scripts/bump-version.mjs` version-only writes from manifest readers `scripts/build-portable.mjs`, `scripts/test-affected.mjs` (`SALT_FILES`), and `scripts/release-check-matrix.mjs`.
- Validate tracked scope separately with `@playwright/test` against `package.json`, `pnpm-lock.yaml`, and `e2e/*.spec.ts`, using `files_with_matches` and `truncated=false`; never infer tracked-scope validity from ignored-file control.

## Retired
- Do not assume `packages/governance/src/index.ts` is uniformly named-re-export; grep the module stem and read the export form (`protocol-decoder.js` uses `export * from './protocol-decoder.js'` at `index.ts:33`). Establish consumers with repo-root `files_with_matches`; close truncated content grep before reporting zero external importers.
