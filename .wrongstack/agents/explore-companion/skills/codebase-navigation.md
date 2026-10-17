## Test Surfaces

- Map test files in order: repo-wide filename grep; collection through BOTH `packages/<pkg>/vitest.config.ts` `include` and root `vitest.config.ts` (`packages/**/tests/**/*.test.{ts,tsx}`); then edit gates in `packages/<pkg>/package.json` (`test`, `typecheck:tests`), coverage `thresholds`, and `architecture/test-typecheck-baseline/packages-<pkg>.json`. Do not use `codebase-incoming-calls`/`impact-analysis` to establish consumers of exportless tests.
- For `packages/kanban/src/verification/*`, pair module-path grep with `codebase-incoming-calls` on each export and a glob of `packages/kanban/tests/verification/`. Trace behavioral seams through `command-security.ts` (`validateCommand`) and `verification-context.ts` (`VerificationContext.runCommand`): `desktop-vitest-command.test.ts` exercises `desktop-vitest-command.js` without importing it.

## Consumer Closure

- For `packages/kanban/src/server/client.ts`, pair `codebase-incoming-calls` with repo-wide greps for `getKanbanServerConnection`, `closeKanbanServerConnections`, and `isKanbanServerAvailable`. `server/client(\.js)?["']` misses `./client.js` imports in `kanban-store.ts`, `remote-storage.ts`, and `kanban-supervisor-bridge.ts`; single-line import regexes miss multiline barrel imports.
- Check the exact specifier `from '@wrongstack/kanban';` AND subpaths `/test-support`, `/manager/lifecycle`, `/contract-graph`, `/queue-anomalies`. These bypass `packages/kanban/src/index.ts`; barrel edits do not reach them.
- For `packages/tui/src/cell-selection.ts`, grep every exported symbol repo-wide: `selectionText`, `selectedRuns`, `mountedTextRuns`, `screenOrigin`. Neither `cell-selection(\.js)?["']` nor indexed callers alone closes consumers; the index has missed `screenOrigin`. Report an otherwise-unimported consumer hook, such as `useComposerPointer` in `packages/tui/src/hooks/use-composer-pointer.ts`, as a dead-code signal, not closure.
- Resolve `packages/tui/src/components/settings-picker-model.ts` through its star re-exports using `codebase-search`: `SETTINGS_FIELD_COUNT` belongs to `settings-picker-constants.ts`; `resolveSettingsFieldValue` to `settings-picker-resolver.ts`. Check direct model-path imports and `architecture/test-only-exports.json`.

## Unindexed and Build Surfaces

- Map `.temp_files/<round>/vitest.config.ts` with direct `read`, `tree`, and repo-wide round-name grep, not incoming edges: root excludes `**/.temp_files/**`. Trace `...base`, plugin `load`/`resolveId`, and cwd-relative `include`/`setupFiles` without `test.root`. Run `glob packages/<pkg>/vitest.config.*`: a stale `.js` twin can satisfy a `.js` import instead of TypeScript.
- Trace `apps/desktop` through `scripts/build-package.mjs` `entries` and `apps/desktop/package.json` `"main"`, not import counts. For preload consumers, grep the `contextBridge.exposeInMainWorld` name (`wrongstackDesktop`) and inspect `runtime-manager-paths.ts`; classify architecture reports and `.wrongstack/atlas/*` as metadata.
