# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-09-29T18:40:28.149Z; skill=codebase-navigation; applied=1; wins=1; skipped=14; skippedWins=14 -->
- **Never treat `@wrongstack/webui` as an importable library when mapping consumers: repo-wide `from '@wrongstack/webui'` is zero, and its exports map (`.` → `dist/index.js`, `./types`) is consumed for the dist **location**, not symbols. Establish its dependents with a package.json dependency grep (`"@wrongstack/webui":` finds exactly `apps/desktop/package.json` and `packages/cli/package.json`) plus exact-text searches for `require.resolve('@wrongstack/webui')` — the desktop site is `apps/desktop/src/main/runtime-manager-paths.ts` (static assets dir) and the CLI site is `packages/cli/src/webui-server/node-pty-loader.ts` (loads `node-pty` via webui's `optionalDependencies`). Call graphs and source-import greps alone will report no consumers.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `@wrongstack/webui`
  - *How:* `from '@wrongstack/webui'`
  - *How:* `.`
  - *How:* `dist/index.js`
  - *How:* `./types`
  - *How:* `"@wrongstack/webui":`
  - *How:* `apps/desktop/package.json`
  - *How:* `packages/cli/package.json`
  - *How:* `require.resolve('@wrongstack/webui')`
  - *How:* `apps/desktop/src/main/runtime-manager-paths.ts`
  - *How:* `packages/cli/src/webui-server/node-pty-loader.ts`
  - *How:* `node-pty`
  - *How:* `optionalDependencies`

<!-- learned-stamp: category=warning; capturedAt=2026-09-29T18:52:37.488Z; skill=node-modern; applied=3; wins=3; skipped=3; skippedWins=3 -->
- **Route WebUI test-file probes through the two-project split in `packages/webui/vitest.config.ts`: `tests/server/**` runs in the `server-node` project (node env — needed because the `@wrongstack/governance` import graph hits `node:sqlite`, which vite's jsdom bundler rejects on Linux CI), while all other suites — including `tests/components/**` — run in `browser-jsdom` (jsdom, globals, 30s timeouts, setupFiles `tests/setup/i18n-deferred.ts`). Inline projects do not inherit root `resolve`/`ssr`, so the config repeats alias blocks that force `@wrongstack/*` source resolution; cite the project name when telling the leader how a suite executes.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/webui/vitest.config.ts`
  - *How:* `tests/server/**`
  - *How:* `server-node`
  - *How:* `@wrongstack/governance`
  - *How:* `node:sqlite`
  - *How:* `tests/components/**`
  - *How:* `browser-jsdom`
  - *How:* `tests/setup/i18n-deferred.ts`
  - *How:* `resolve`
  - *How:* `ssr`
  - *How:* `@wrongstack/*`

<!-- learned-stamp: category=warning; capturedAt=2026-09-29T18:29:03.133Z; applied=6; wins=6; skipped=24; skippedWins=24 -->
- **When mapping consumers of a `packages/kanban` module, never assume `manager.ts`'s `export * from './manager/<mod>.js'` makes symbols package-public: `packages/kanban/src/index.ts` uses an explicit named re-export list that silently drops symbols (e.g. `manager/presence.ts` exports 5, only 2 reach `@wrongstack/kanban`). Prove public/private per symbol with a case-sensitive exact-file grep on `packages/kanban/src/index.ts` — a `[Pp]resence` pattern misses all-caps names like `DEFAULT_KANBAN_PRESENCE_TTL_MS`.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/kanban`
  - *How:* `manager.ts`
  - *How:* `export * from './manager/<mod>.js'`
  - *How:* `packages/kanban/src/index.ts`
  - *How:* `manager/presence.ts`
  - *How:* `@wrongstack/kanban`
  - *How:* `[Pp]resence`
  - *How:* `DEFAULT_KANBAN_PRESENCE_TTL_MS`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-09-29T18:29:22.126Z; applied=1; wins=1; skipped=28; skippedWins=28 -->
- **Always treat `docs/plans/*-contract.md` files as textual contracts, not modules: probe dependents with an exact filename-stem grep (e.g. `unified-sage-search` scoped repo-wide), then read only the comment blocks that cite the doc path — production policy comments and "contract under test" test headers are the durable anchors. For `packages/sage/src/service-contract.ts` and `packages/sage/src/sqlite-store-search.ts`, the WebUI discovery invariant `excludeSessionScoped` is documented in both and cross-referenced to `docs/plans/unified-sage-search-backend-contract.md`; edits to one must be mirrored in the other plus `packages/sage/tests/unified-search-cursor.test.ts`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `docs/plans/*-contract.md`
  - *How:* `unified-sage-search`
  - *How:* `packages/sage/src/service-contract.ts`
  - *How:* `packages/sage/src/sqlite-store-search.ts`
  - *How:* `excludeSessionScoped`
  - *How:* `docs/plans/unified-sage-search-backend-contract.md`
  - *How:* `packages/sage/tests/unified-search-cursor.test.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-09-29T18:58:49.004Z; skill=codebase-navigation; skipped=3; skippedWins=3 -->
- **Determine whether a `.temp_files/commit-msg-*.txt` scratch draft is pending or already consumed by reading `.git/COMMIT_EDITMSG` directly — it holds the message of the last commit made via `-m`, `-F`, or editor, so a subject mismatch proves the draft targets a future commit. Always state that edits to gitignored scratch drafts are invisible to `git diff HEAD` and that read-based findings reflect post-edit state only when no baseline exists.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/commit-msg-*.txt`
  - *How:* `.git/COMMIT_EDITMSG`
  - *How:* `-m`
  - *How:* `-F`
  - *How:* `git diff HEAD`

<!-- learned-stamp: category=convention; capturedAt=2026-09-29T18:22:16.601Z; applied=12; wins=12; skipped=23; skippedWins=23 -->
- **Disambiguate `workflow-state` specifiers by package root before reporting importers: `packages/kanban/src/workflow-state.ts` is the IPC facade exporting `read/write/list/deleteKanbanWorkflowState`, while `packages/governance/src/workflow-state.ts` is a separate module exporting the `WorkflowState` type and `WORKFLOW_STATES` const. A repo-wide grep for `from ['"]\./workflow-state(\.js)?['"]` hits both packages' files; resolve the relative specifier from each importer's directory or you will report governance files as kanban consumers. Kanban's file has exactly one direct importer — its barrel `packages/kanban/src/index.ts` — so consumer proof there requires grepping the four exported function names, not the module specifier.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `workflow-state`
  - *How:* `packages/kanban/src/workflow-state.ts`
  - *How:* `read/write/list/deleteKanbanWorkflowState`
  - *How:* `packages/governance/src/workflow-state.ts`
  - *How:* `WorkflowState`
  - *How:* `WORKFLOW_STATES`
  - *How:* `from ['"]\./workflow-state(\.js)?['"]`
  - *How:* `packages/kanban/src/index.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-09-29T18:59:25.057Z; skill=codebase-navigation; applied=1; wins=1; skipped=1; skippedWins=1 -->
- **For blast-radius probes on `packages/webui` test files, answer in four fixed steps: (1) read the test in full and list pinned anchors plus strict-stub coupling (per-test `fetch` stubs that throw on unexpected requests, partial `vi.mock` factories whose named exports must match every hook symbol the component uses); (2) cite the project routing from `packages/webui/vitest.config.ts` (`tests/server/**` → `server-node`, everything else incl. `tests/components/**` → `browser-jsdom` with `tests/setup/i18n-deferred.ts`) and report the `coverage.thresholds` block verbatim — it is an aggregate `perFile: false` ratchet, so deleted assertions in any suite can move the package gate, and `packages/webui/TESTING.md` mirrors the numbers; (3) prove "nothing references this test" with a filename-stem grep plus a `tests/**/__snapshots__/<stem>*` glob, noting rg is non-evidence in gitignored dirs; (4) identify sibling coverage by grepping the component-under-test name scoped to `packages/webui/tests` — one scoped grep beats a call graph for test files. Always flag that a read reflects the live working tree when a peer may have edited the file.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/webui`
  - *How:* `fetch`
  - *How:* `vi.mock`
  - *How:* `packages/webui/vitest.config.ts`
  - *How:* `tests/server/**`
  - *How:* `server-node`
  - *How:* `tests/components/**`
  - *How:* `browser-jsdom`
  - *How:* `tests/setup/i18n-deferred.ts`
  - *How:* `coverage.thresholds`
  - *How:* `perFile: false`
  - *How:* `packages/webui/TESTING.md`
  - *How:* `tests/**/__snapshots__/<stem>*`
  - *How:* `packages/webui/tests`

<!-- learned-stamp: category=convention; capturedAt=2026-09-29T19:11:26.677Z; skill=codebase-navigation -->
- **In `packages/webui` component tests, `waitFor` and `act` must be imported explicitly from `@testing-library/react` — vitest `globals: true` covers only vitest APIs (`beforeEach`, `describe`, …), the sole setup file `packages/webui/tests/setup/i18n-deferred.ts` injects no globals, and no ambient `.d.ts` under `packages/webui` declares them. When auditing a `tests/components/**` file the leader edited blind, diff its first import line against the Testing Library APIs its body calls before trusting anything else in the file.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/webui`
  - *How:* `waitFor`
  - *How:* `act`
  - *How:* `@testing-library/react`
  - *How:* `globals: true`
  - *How:* `beforeEach`
  - *How:* `describe`
  - *How:* `packages/webui/tests/setup/i18n-deferred.ts`
  - *How:* `.d.ts`
  - *How:* `tests/components/**`

---
*Last capture: 2026-09-29T19:11:26.677Z · 8 entries*
