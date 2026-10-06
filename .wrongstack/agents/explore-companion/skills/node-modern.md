## Scratch and mailbox evidence
- For mailbox probes, follow `.temp_files/dump-l4.mjs`: open `~/.wrongstack/projects/<dir>/_mailbox.sqlite` with `node:sqlite` `DatabaseSync` using `{ readOnly: true }`; query `from_id, to_id, type, data` from `messages`, then parse the JSON string in `data` for `subject` and `body`.
- Confirm ignored `.temp_files/` artifacts by direct `read`; claim ENOENT only after an exact-directory `tree` with `truncated=false`. After a grep timeout, narrow the follow-up to `scripts/` and root `package.json`, and mark full-tree closure unverified.
- Inspect `.temp_files/proof-driven-bug-hunter/<round>/` with `tree` and `run.mjs`; root `vitest.config.ts` excludes `**/.temp_files/**`, so do not assume a shared runner or hardcoded config/CWD. Verify `resolve.alias` from manifests rather than a gitignore-aware `glob` over `node_modules/**`.

## Test discovery
- Corroborate `packages/plugins/tests/*.test.ts` against `packages/plugins/vitest.config.ts` (`include: ['tests/**/*.test.ts']`), root `vitest.config.ts` (`packages/**/tests/**`), `packages/plugins/tsconfig.test.json` (`tests/**/*`, via `pnpm check:test-types`), and `docs/reports/architecture-health-current.json` (`projects`).
- For `@wrongstack/tools` and `@wrongstack/providers`, honor `scripts.test` in `packages/tools/package.json` and `packages/providers/package.json`; use `vitest run --root ../.. packages/tools/tests` and `vitest run --root ../.. packages/providers/tests`, respectively.

## ESM contracts
- Before changing `packages/webui-server/src/server/route-family-dispatcher.ts` or its callers, read `packages/webui-server/tests/host-dispatcher-parity.test.ts`; `balancedBlockAfter` relies on raw `createRouteFamilyDispatcher(` formatting in `message-dispatcher.ts` and `embedded-message-router.ts`.
- For `packages/core/src/types/spec.ts`, close consumers through both `./spec.js` and `@wrongstack/core/types/spec.js`. `packages/core/package.json` exposes only `./types` and `./types/limits`, and `scripts/vitest-core-aliases.mjs` does not establish plain Node ESM support.

## Workspace and scope
- Read membership from `pnpm-workspace.yaml`; distinguish `scripts/bump-version.mjs` version-only writes from manifest readers `scripts/build-portable.mjs`, `scripts/test-affected.mjs` (`SALT_FILES`), and `scripts/release-check-matrix.mjs`.
- Check tracked scope separately with `@playwright/test` `files_with_matches` and `truncated=false` across `package.json`, `pnpm-lock.yaml`, and `e2e/*.spec.ts`; never infer scope from ignored `.temp_files/`.
