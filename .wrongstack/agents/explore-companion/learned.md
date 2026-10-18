# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-18T18:17:48.105Z; skill=codebase-navigation; applied=2; wins=2; skipped=90; skippedWins=90 -->
- **Always close consumer analysis for `packages/sage/src/sqlite-store-counters.ts`-style counter modules by grepping both exported symbol names repo-wide, not just the `./sqlite-store-counters.js` specifier — references live in comments (`store-helpers.ts`, `sqlite-store-schema.ts`), archived design docs (`docs/archive/plans/sage-phase4-design.md`, `docs/archive/reports/research/sage-memory-investigation.md`), and test headers (`packages/sage/tests/store-helpers-counter-merge.test.ts`), while the only real importer is `sqlite-memory-mutations.ts` via `recordInjection`/`recordUse` wrapped in `runCounterMutation`. Preserve the documented invariant that counters never advance `updated_at` (B1/H6) when advising edits here.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/sage/src/sqlite-store-counters.ts`
  - *How:* `./sqlite-store-counters.js`
  - *How:* `store-helpers.ts`
  - *How:* `sqlite-store-schema.ts`
  - *How:* `docs/archive/plans/sage-phase4-design.md`
  - *How:* `docs/archive/reports/research/sage-memory-investigation.md`
  - *How:* `packages/sage/tests/store-helpers-counter-merge.test.ts`
  - *How:* `sqlite-memory-mutations.ts`
  - *How:* `recordInjection`
  - *How:* `recordUse`
  - *How:* `runCounterMutation`
  - *How:* `updated_at`

<!-- learned-stamp: category=warning; capturedAt=2026-10-18T18:29:59.878Z; skill=codebase-navigation; applied=1; wins=1; skipped=75; skippedWins=75 -->
- **Close callers of TUI app-hook modules (`packages/tui/src/hooks/*`) by grepping the exported symbol name **and its returned product names** repo-wide — the app.tsx decomposition threads hook products (e.g. `runEternalLoopRef`/`runParallelLoopRef` from `use-autonomy-drivers.ts`) through the `use-app-environment.ts` facade and re-aliases them as `S['refs']['eternalLoop']`/`parallelLoop` spine keys in `use-app-pipeline-builders.ts`, so downstream consumers (`submit-controller.ts`, `submit-slash-command.ts`) never import the producing hook and a module-specifier grep alone shows only one importer while the real blast radius spans 5+ files.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/tui/src/hooks/*`
  - *How:* `runEternalLoopRef`
  - *How:* `runParallelLoopRef`
  - *How:* `use-autonomy-drivers.ts`
  - *How:* `use-app-environment.ts`
  - *How:* `S['refs']['eternalLoop']`
  - *How:* `parallelLoop`
  - *How:* `use-app-pipeline-builders.ts`
  - *How:* `submit-controller.ts`
  - *How:* `submit-slash-command.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-10-18T18:00:14.730Z; skill=codebase-navigation; applied=98; wins=98; skipped=15; skippedWins=15 -->
- **Close consumer analysis for `packages/core/src/coordination/mailbox-*` modules by grepping exported symbol names AND the `@wrongstack/core/coordination` subpath specifier — `packages/cli` files (e.g. `hq-server/mailbox-gateway-manager.ts`) import these names via the `mailbox-exports.ts` barrel re-export through that subpath, which a module-specifier grep on the source file alone never sees. Always check `architecture/core-public-api-snapshot.json` separately for each symbol (0 hits = package-internal, no snapshot gate) before predicting blast radius.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/core/src/coordination/mailbox-*`
  - *How:* `@wrongstack/core/coordination`
  - *How:* `packages/cli`
  - *How:* `hq-server/mailbox-gateway-manager.ts`
  - *How:* `mailbox-exports.ts`
  - *How:* `architecture/core-public-api-snapshot.json`
  - *How:* `@wrongstack/core`

<!-- learned-stamp: category=warning; capturedAt=2026-10-18T17:34:58.646Z; skill=codebase-navigation; applied=6; wins=6; skipped=139; skippedWins=139 -->
- **Treat the per-row `expected` booleans in any `.temp_files/proof-driven-bug-hunter/<round>/proof.ts` case matrix as the round's RED/GREEN contract — never flip them (or drop the trailing `process.exit(failed ? 1 : 0)`) to force a pass; map such files with `read` + `tree` + path-scoped grep only, since `codebase-*` and Vitest both exclude `.temp_files/**`, making zero index hits expected rather than informative.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `expected`
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/proof.ts`
  - *How:* `process.exit(failed ? 1 : 0)`
  - *How:* `read`
  - *How:* `tree`
  - *How:* `codebase-*`
  - *How:* `.temp_files/**`

<!-- learned-stamp: category=warning; capturedAt=2026-10-18T17:31:19.012Z; skill=codebase-navigation; applied=10; wins=10; skipped=139; skippedWins=139 -->
- **When mapping edit risk for an existing Vitest test file, always grep `architecture/test-skip-budget.json` for the file's path before advising on changes — conditional blocks (`describe.runIf` / `it.skipIf`) are ratcheted per file+kind+fingerprint, so moving or adding conditional-skip blocks in a test like `packages/tools/tests/exec-kill-guard.test.ts` fails the architecture gate even when the test itself still passes. Also flag any `beforeEach`/`afterEach` pairing that mutates process globals (e.g. `process.execPath`) as a leak hazard into sibling tests in the same worker.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `architecture/test-skip-budget.json`
  - *How:* `describe.runIf`
  - *How:* `it.skipIf`
  - *How:* `packages/tools/tests/exec-kill-guard.test.ts`
  - *How:* `beforeEach`
  - *How:* `afterEach`
  - *How:* `process.execPath`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-18T18:11:07.903Z; applied=2; wins=2; skipped=101; skippedWins=101 -->
- **Always attribute "Empty response from <provider>/<model>…" errors to the local mint site `ensureUsableModelResponse()` in `packages/core/src/core/fallback-model-selection.ts` — the ": the run was aborted" suffix variant (status 499, `kind: 'unknown'`, `retryable: false`) means the run's AbortSignal was already aborted and is deliberately non-fallback-eligible via `FALLBACK_WORTHY_BY_KIND` in `packages/core/src/types/provider-errors.ts`; the "; trying the next configured model" variant (503, `overloaded`) is the genuine-empty-response path that rotates the chain. Distinguish these core-minted messages from `WrongForge:`-prefixed errors, whose body text originates in the external service reached via `packages/cli/src/fleet/wrongforge-client.ts`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `ensureUsableModelResponse()`
  - *How:* `packages/core/src/core/fallback-model-selection.ts`
  - *How:* `kind: 'unknown'`
  - *How:* `retryable: false`
  - *How:* `FALLBACK_WORTHY_BY_KIND`
  - *How:* `packages/core/src/types/provider-errors.ts`
  - *How:* `overloaded`
  - *How:* `WrongForge:`
  - *How:* `packages/cli/src/fleet/wrongforge-client.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-18T18:30:31.474Z; skill=codebase-navigation; applied=64; wins=64; skipped=11; skippedWins=11 -->
- **Always close consumer analysis for `packages/cli/src/cli-main-helpers.ts` with a repo-wide grep of the bare module name (all hits land in `packages/cli`) — despite the filename, `cli-main.ts` is **not** an importer; production consumers are only `src/wiring/*` plus `cli-infrastructure.ts`, plus two `vi.mock` shape couplings in `tests/cli-infrastructure.test.ts` and `tests/zero-statement-cli-modules.test.ts`. Treat `governanceRuntimeEnabled`, `governedHandle`, and `WRONGSTACK_GOVERNANCE_ENV` as test-only exports, `bootstrapCliGovernance` as production-reachable only through `setupCliGovernance` within the same file, and expect a parallel duplicate of `WRONGSTACK_GOVERNANCE_ENV` in `packages/webui-server/src/server/governance-runtime.ts`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/cli/src/cli-main-helpers.ts`
  - *How:* `packages/cli`
  - *How:* `cli-main.ts`
  - *How:* `src/wiring/*`
  - *How:* `cli-infrastructure.ts`
  - *How:* `vi.mock`
  - *How:* `tests/cli-infrastructure.test.ts`
  - *How:* `tests/zero-statement-cli-modules.test.ts`
  - *How:* `governanceRuntimeEnabled`
  - *How:* `governedHandle`
  - *How:* `WRONGSTACK_GOVERNANCE_ENV`
  - *How:* `bootstrapCliGovernance`
  - *How:* `setupCliGovernance`
  - *How:* `packages/webui-server/src/server/governance-runtime.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-18T18:39:50.035Z; skill=codebase-navigation; applied=3; wins=3; skipped=57; skippedWins=57 -->
- **Always close consumer analysis for `packages/cli/src/wiring/vector-memory-setup.ts` with a repo-wide grep of the exported symbol names (`setupVectorMemory`, `DEFAULT_VECTOR_WEIGHT`, `VectorMemoryTuning`) in addition to the module specifier — `setupVectorMemory` near-collides with webui-server's `setupVectorMemoryMirror` (`packages/webui-server/src/server/start-webui-vector.ts`), `DEFAULT_VECTOR_WEIGHT = 0.3` is independently re-declared in `packages/sage/src/retrieval/vector-augment.ts` and `packages/vector-memory/src/sage-fusion.ts`, and `packages/cli/tests/wiring-teardown-registrar.test.ts` enforces the module's LIFO teardown ordering contract with zero import link.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/cli/src/wiring/vector-memory-setup.ts`
  - *How:* `setupVectorMemory`
  - *How:* `DEFAULT_VECTOR_WEIGHT`
  - *How:* `VectorMemoryTuning`
  - *How:* `setupVectorMemoryMirror`
  - *How:* `packages/webui-server/src/server/start-webui-vector.ts`
  - *How:* `DEFAULT_VECTOR_WEIGHT = 0.3`
  - *How:* `packages/sage/src/retrieval/vector-augment.ts`
  - *How:* `packages/vector-memory/src/sage-fusion.ts`
  - *How:* `packages/cli/tests/wiring-teardown-registrar.test.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-18T18:43:11.024Z; skill=codebase-navigation; applied=52; wins=52; skipped=6; skippedWins=6 -->
- **Always disambiguate `session-registry` before reporting consumers in `packages/cli` — three unrelated modules share the filename: `packages/cli/src/wiring/session-registry.ts` (`setupSessionRegistry`), `packages/core/src/session-catalog/session-registry.ts` (`SessionRegistry`, re-exported incl. as `LegacySessionRegistry` from `packages/core/src/storage/index.ts`), and `packages/webui-server/src/server/collab/session-registry.ts` (`CollabSessionRegistry`). Close the CLI module's consumers with `wiring/session-registry(\.js)?` specifier + `setupSessionRegistry`/`SessionIdentityTarget` symbol greps, and treat `packages/webui-server/src/server/standalone-session-identity.ts`'s same-name `SessionIdentityTarget` as a separate twin, not a consumer.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `session-registry`
  - *How:* `packages/cli`
  - *How:* `packages/cli/src/wiring/session-registry.ts`
  - *How:* `setupSessionRegistry`
  - *How:* `packages/core/src/session-catalog/session-registry.ts`
  - *How:* `SessionRegistry`
  - *How:* `LegacySessionRegistry`
  - *How:* `packages/core/src/storage/index.ts`
  - *How:* `packages/webui-server/src/server/collab/session-registry.ts`
  - *How:* `CollabSessionRegistry`
  - *How:* `wiring/session-registry(\.js)?`
  - *How:* `SessionIdentityTarget`
  - *How:* `packages/webui-server/src/server/standalone-session-identity.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-18T18:26:48.559Z; skill=codebase-navigation; applied=33; wins=33; skipped=48; skippedWins=48 -->
- **Always disambiguate the three same-name `boot.ts` modules before reporting consumers of `packages/cli/src/boot.ts` — `packages/core/src/boot.ts` (`bootConfig`, `flagsToConfigPatch`, `assertProjectRootOutsideStateDir`, `cleanupStaleProjects`) and `packages/webui-server/src/server/boot.ts` (`bootConfig`, `patchConfig`) all match a bare `/boot.js` module-specifier grep. Close real consumers with a package-scoped specifier grep (`packages/cli/src/**` for `['"][^'']*\bboot(\.js)?["']`), and treat any `codebase-incoming-calls` hits on symbol `boot` as noise when the caller file lacks that import — `packages/cli/src/cli-main.ts` declares a local `const boot = await bootCliRuntime(...)` that collides by name.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `boot.ts`
  - *How:* `packages/cli/src/boot.ts`
  - *How:* `packages/core/src/boot.ts`
  - *How:* `bootConfig`
  - *How:* `flagsToConfigPatch`
  - *How:* `assertProjectRootOutsideStateDir`
  - *How:* `cleanupStaleProjects`
  - *How:* `packages/webui-server/src/server/boot.ts`
  - *How:* `patchConfig`
  - *How:* `/boot.js`
  - *How:* `packages/cli/src/**`
  - *How:* `['"][^'']*\bboot(\.js)?["']`
  - *How:* `codebase-incoming-calls`
  - *How:* `boot`
  - *How:* `packages/cli/src/cli-main.ts`
  - *How:* `const boot = await bootCliRuntime(...)`

<!-- learned-stamp: category=convention; capturedAt=2026-10-18T17:51:49.024Z; skill=codebase-navigation; applied=4; wins=4; skipped=119; skippedWins=119 -->
- **Always scope caller analysis for `unreadCount` in mailbox code: it is a highly collision-prone name (`packages/webui-hq/src/domain/mailbox-grouping.ts` fields, `packages/cli/src/hq-server/snapshot.ts`, `packages/telegram/src/index.ts` locals). Close real consumers via the import specifier `sqlite-mailbox-query(\.js)?` and the `delegateUnreadCount`/`delegateQuery` aliases in `packages/core/src/coordination/sqlite-mailbox.ts`, then follow `.unreadCount(` calls on Mailbox-typed objects (e.g. `packages/mailbox-mcp/src/adapter.ts`, `packages/cli/src/fleet/host-acp.ts`).**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `unreadCount`
  - *How:* `packages/webui-hq/src/domain/mailbox-grouping.ts`
  - *How:* `packages/cli/src/hq-server/snapshot.ts`
  - *How:* `packages/telegram/src/index.ts`
  - *How:* `sqlite-mailbox-query(\.js)?`
  - *How:* `delegateUnreadCount`
  - *How:* `delegateQuery`
  - *How:* `packages/core/src/coordination/sqlite-mailbox.ts`
  - *How:* `.unreadCount(`
  - *How:* `packages/mailbox-mcp/src/adapter.ts`
  - *How:* `packages/cli/src/fleet/host-acp.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-18T17:26:02.172Z; skill=codebase-navigation; applied=43; wins=43; skipped=112; skippedWins=112 -->
- **For `packages/core/src/coordination/mailbox-*` modules, module-specifier grep finds only the `mailbox-types.ts` facade — always grep the exported symbol names (`acceptMailboxMessageForSession`, `MailboxSessionAffinityContext`) to enumerate real consumers, since all coordination consumers import via the facade. Suffix-colliding pairs like `acceptMailboxMessageForSession`/`...Sync` need a separate exact grep before declaring a variant caller-free. Check `architecture/core-public-api-snapshot.json` (grep the symbol names) to decide whether a `packages/core` export is package-internal or public.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/core/src/coordination/mailbox-*`
  - *How:* `mailbox-types.ts`
  - *How:* `acceptMailboxMessageForSession`
  - *How:* `MailboxSessionAffinityContext`
  - *How:* `...Sync`
  - *How:* `architecture/core-public-api-snapshot.json`
  - *How:* `packages/core`

<!-- learned-stamp: category=convention; capturedAt=2026-10-18T17:24:58.098Z; applied=18; wins=18; skipped=139; skippedWins=139 -->
- **Treat `packages/tools/src/exec-arg-validation.ts` as a paired-table contract: `BLOCKED_OPTION_NAMES` (name-based, covers `--opt value`) supplements the `=`-anchored `BLOCKED_ARG_PATTERNS`, and in-file comments tie it to `_danger-detect.ts`'s `git-exec` advisory list — any edit to one git/find entry must check the other two spellings/layers, and `packages/tools/tests/exec-autonomy.test.ts` is the regression gate to run (`packages/tools` scripts: `vitest run --root ../.. packages/tools/tests`).**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/tools/src/exec-arg-validation.ts`
  - *How:* `BLOCKED_OPTION_NAMES`
  - *How:* `--opt value`
  - *How:* `=`
  - *How:* `BLOCKED_ARG_PATTERNS`
  - *How:* `_danger-detect.ts`
  - *How:* `git-exec`
  - *How:* `packages/tools/tests/exec-autonomy.test.ts`
  - *How:* `packages/tools`
  - *How:* `vitest run --root ../.. packages/tools/tests`

<!-- learned-stamp: category=convention; capturedAt=2026-10-18T18:03:21.383Z; skill=codebase-navigation; applied=25; wins=25; skipped=83; skippedWins=83 -->
- **When an error message is prefixed `WrongForge: `, locate the wrapper at `packages/cli/src/wrongforge-leader/wrongforge-leader-provider.ts` (`providerError()`, plus `fleet/wrongforge-runner.ts` `subagentError('bridge_failed', ...)` for delegated tasks) — the text *after* the prefix is produced by the external WrongForge service (`http://127.0.0.1:8787`, reached via `resolveWrongForgeEndpoint`/`wrongForgeConfigured` in `packages/cli/src/fleet/wrongforge-client.ts`), so a zero-hit repo grep for that body text is expected evidence of upstream ownership, not a missing string. Treat `context_overflow` from any provider as non-fallback-eligible in this repo (compaction-owned), per `packages/core` fallback kind-gating tests.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `WrongForge:`
  - *How:* `packages/cli/src/wrongforge-leader/wrongforge-leader-provider.ts`
  - *How:* `providerError()`
  - *How:* `fleet/wrongforge-runner.ts`
  - *How:* `subagentError('bridge_failed', ...)`
  - *How:* `http://127.0.0.1:8787`
  - *How:* `resolveWrongForgeEndpoint`
  - *How:* `wrongForgeConfigured`
  - *How:* `packages/cli/src/fleet/wrongforge-client.ts`
  - *How:* `context_overflow`
  - *How:* `packages/core`

<!-- learned-stamp: category=convention; capturedAt=2026-10-18T17:44:39.927Z; skill=codebase-navigation; applied=18; wins=18; skipped=118; skippedWins=118 -->
- **When mapping blast radius for `packages/core/src/coordination/mailbox-codec-validators.ts`, close consumers via the `mailbox-codecs.js` module specifier (the sole facade) rather than the file's own specifier — and grep `architecture/core-public-api-snapshot.json` for `MailboxValidationError` (0 hits = package-internal, no public-API gate) before predicting snapshot impact.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/core/src/coordination/mailbox-codec-validators.ts`
  - *How:* `mailbox-codecs.js`
  - *How:* `architecture/core-public-api-snapshot.json`
  - *How:* `MailboxValidationError`

<!-- learned-stamp: category=convention; capturedAt=2026-10-18T17:57:59.599Z; skill=codebase-navigation; applied=6; wins=6; skipped=111; skippedWins=111 -->
- **When mapping blast radius for `packages/webui-server/src/server/kanban-*.ts` modules, always grep for cross-package source-pin tests that read the file's raw text — e.g. `packages/webui/tests/lib/kanban-board-active.test.ts` `readFileSync`-es `packages/webui-server/src/server/kanban-route-pagination.ts` and asserts its `isActive` shape matches the client twin `packages/webui/src/lib/kanban-board-active.ts`, so logic edits there fail a test in another package with zero import links. Also close consumers of these modules via the `kanban-routes.js` barrel (`server/index.ts` re-exports `KanbanBoardPage`/`paginateKanbanBoards` as package public API) — module-specifier greps on the paginated file alone undercount real importers.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/webui-server/src/server/kanban-*.ts`
  - *How:* `packages/webui/tests/lib/kanban-board-active.test.ts`
  - *How:* `readFileSync`
  - *How:* `packages/webui-server/src/server/kanban-route-pagination.ts`
  - *How:* `isActive`
  - *How:* `packages/webui/src/lib/kanban-board-active.ts`
  - *How:* `kanban-routes.js`
  - *How:* `server/index.ts`
  - *How:* `KanbanBoardPage`
  - *How:* `paginateKanbanBoards`

<!-- learned-stamp: category=convention; capturedAt=2026-10-18T18:07:05.902Z; skill=typescript-strict; applied=5; wins=5; skipped=100; skippedWins=100 -->
- **When tracing an error prefixed `WrongForge: `, check **both** mint sites in `packages/cli/src/wrongforge-leader/wrongforge-leader-provider.ts`: `taskError()` renders failed task records as `` `${code}: ${message}` `` and special-cases `context_overflow` → status 413 / kind `context_overflow`, while `providerError()` wraps direct `WfHttpError` calls where a generic 400 becomes kind `invalid_request`. Always attribute the text *after* the prefix to the external service at `WRONGFORGE_URL` (default `http://127.0.0.1:8787`, resolved by `resolveWrongForgeEndpoint` in `packages/cli/src/fleet/wrongforge-client.ts`) — expect zero repo-grep hits for it, and treat `context_overflow` as compaction-owned and non-fallback-eligible (`docs/agents.md` recovery-layer rules).**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `WrongForge:`
  - *How:* `packages/cli/src/wrongforge-leader/wrongforge-leader-provider.ts`
  - *How:* `taskError()`
  - *How:* `and special-cases`
  - *How:* `→ status 413 / kind`
  - *How:* `, while`
  - *How:* `wraps direct`
  - *How:* `calls where a generic 400 becomes kind`
  - *How:* `. Always attribute the text *after* the prefix to the external service at`
  - *How:* `(default`
  - *How:* `, resolved by`
  - *How:* `in`
  - *How:* `) — expect zero repo-grep hits for it, and treat`
  - *How:* `as compaction-owned and non-fallback-eligible (`
  - *How:* `packages/cli/src/fleet/wrongforge-client.ts`
  - *How:* `docs/agents.md`

---
*Last capture: 2026-10-18T18:43:11.024Z · 17 entries*
