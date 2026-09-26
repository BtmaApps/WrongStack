# Bug-Hunter Agent Instructions

## Parallel Work and Chimera Reviews

- After any parallel fix pass, re-read the current on-disk state of every file in the cascade before citing or reporting a finding. Concurrent Chimera workers (bug-hunter, security-scanner) frequently resolve the same findings mid-session; citing pre-fix content produces false positives.
- Read the files a review lists under "Assumptions / unverified" as not-read **first**, before dispatching or applying any fix. Findings whose suggested fix lives in a module the reviewer never opened — e.g. a hook a refactor moved logic into — are high-probability false positives already resolved on disk. Never patch text that a fresh read shows absent.
- The remediation race window can fall inside a single agent turn: a `read` showing a symbol absent can be stale seconds later. When a finding names a missing export, re-grep the exact symbol in the target file immediately before editing; reviewers also misread class bodies into ghost "absent method" findings.
- Falsify "half-applied extraction" reports before editing: run the package typecheck and grep the flagged file for the deleted identifiers. Parallel workers routinely complete the wiring mid-session, and a pre-fix snapshot produces false "critical" findings.
- A clean typecheck for the flagged file is decisive even when the package exits 1 on an unrelated peer-modified file — report that failure separately with its `file:line` instead of patching it.
- Re-run a failing verification once before treating it as a defect: a first-run red typecheck or test can be a parallel worker's in-flight edit rather than a bug; the settled tree passes.
- Cross-check any claimed ordering or semantics against the repo's own pinned tests before accepting a Chimera claim — a pinned `toEqual` assertion on log/queue ordering is authoritative over a reviewer's stated expectation such as "should be newest-first."
- Adjudicate a "broken test" finding by executing the flagged test file (`pnpm exec vitest run <file>`) before reading the production branch it cites — a green run instantly falsifies the reviewer's claim about the error-text contract and prevents weakening a passing test's assertions.
- Falsify claimed "hard type errors" with a zero-cost typecheck before tracing them manually: `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/<pkg>/tsconfig.json` exiting 0 instantly disproves any `TS2339 Property does not exist` claim. Pair the typecheck with the targeted vitest file when the false-positive classification depends on runtime behavior. For `TS2305` on cross-package imports, rebuild the exporter's dist first (see Verification and Testing Procedures).
- Treat the `Resolved by the parallel worker` block in a Chimera review as authoritative for which findings remain open versus already fixed.
- If an existing on-disk diff already addresses a finding, preserve that work rather than applying a duplicate patch.

## Verification and Testing Procedures

- After any refactor that adds, removes, or renames a method, grep the session's test files for every affected method name. Vitest transpiles with esbuild (no type-checking), so a test calling a deleted method fails at runtime with `TypeError: X is not a function` — a red suite is the only signal.
- When changing a config default, grep the entire package's test directory for the old literal value — full-object `toEqual` default assertions pin the old default in more files than a reviewer cites. Before a `replace_all`, grep the exact literal to confirm none of the hits are explicit override inputs rather than pinned defaults. Pair the sweep with every operator-facing restatement of the default (help strings and JSDoc in the owning sources, e.g. `packages/core/src/plugins/chimera-plugin.ts` and `packages/core/src/plugins/auto-review-plugin.ts`), then verify with `pnpm exec vitest run packages/core/tests/plugins/auto-review-plugin.test.ts packages/core/tests/plugins/chimera-plugin.test.ts`.
- Before treating a per-package `tsc -p packages/<consumer>/tsconfig.json` failure of `TS2305` (module has no exported member) on a cross-package import as real, rebuild the exporting workspace package (`pnpm --filter @wrongstack/<pkg> build`) and re-run. `@wrongstack/*` packages resolve subpaths via `package.json` `exports` to git-ignored `dist/*.d.ts`, so a stale dist produces a phantom missing-export error the source disproves; the root `typecheck` script is `pnpm build && pnpm -r typecheck` for this reason.
- When a peer's fix introduces `assist/source/organizeImports` noise in the same block, apply `pnpm exec biome check --write <file>` scoped to that file rather than hand-reordering imports. Classify any other lint assists as pre-existing only after confirming with `git diff -- <file>` that the working-tree delta does not touch those lines.
- Since pnpm 10.x, `--publish-branch` defaults to both `master` and `main`, so publishing from `main` passes without explicit config. Verify against the installed pnpm version and official docs before concluding a local `pnpm publish` will fail. To isolate the branch check from a dirty working tree, use a throwaway git repo with `pnpm-workspace.yaml` containing `packages: []` and run `pnpm publish --dry-run`.
- For Windows atomic-write tests, mock the `fs.rename` seam, select the Windows retry branch, and inject a transient error (e.g., `EBUSY`). Do not hold an open file handle as retry evidence — its behavior is platform-dependent.
- For Kanban verification, resolve locally installed Vitest or Jest package bin entries and invoke them through `process.execPath` with `shell: false`. Do not add package-manager fallbacks to the generic verifier command allowlist.
- When the `edit` tool reports "no match" for an `old_string` that `read`/`grep` show verbatim, suspect invisible Unicode characters in the target file.

## SQLite Schema and Migrations

- Pair every `SCHEMA_VERSION` bump on a file-backed SQLite store with a guarded migration in `applySchema` (`packages/techstack/src/store/schema.ts`); `CREATE TABLE IF NOT EXISTS` cannot evolve an existing table. Use the `PRAGMA table_info(<table>)` set-membership guard plus `ALTER TABLE ... ADD COLUMN` pattern from `ensureCatalogStorageColumns` in `packages/core/src/session-catalog/store-schema.ts`.
- Place legacy-version regression tests in `packages/techstack/tests/store/store-roundtrip.test.ts`, never `sqlite.test.ts` — the latter mocks `node:sqlite` and executes no SQL, so migration bugs are invisible to it.
- Fixture shape that actually exercises an upgrade: build the N-1 database with raw `loadRuntimeDatabaseSync()` DDL at a `mkdtempSync` path (version row = the old `SCHEMA_VERSION`), reopen it through the real store constructor, then assert the previously-throwing writer no longer throws and the version row advanced. Fresh `:memory:` fixtures only cover the fresh-install branch.
- Verify store changes with `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/techstack/tsconfig.json`, `pnpm exec biome check <touched files>`, and `pnpm exec vitest run packages/techstack/tests/store`.

## Data Integrity Invariants

- **Session-memory merge queries** (`packages/sage/src/sqlite-store-remember.ts`): always require strict `owner_session_id = ?` matching. Never let owned writes merge with `owner_session_id IS NULL` legacy rows — session-filtered retrieval deliberately hides those rows, and adoption silently changes their ownership semantics.
- **Fingerprint-cache refactors:** update the cache value type, hit path, write path, comparison path, eviction accounting, observability counters, and setup/teardown resets as one atomic change.
- **Hook-index observability:** update atomically across state initialization, `setup()`, `teardown()`, `duplicate_code_status`, `health()`, and the counter-increment branch.
- **Subagent removal:** every removal path must clear labels, generation records, throttle snapshots, stream buffers, history buffers, and tool aggregations together.
- **Auto-review concurrency** (`packages/core/src/plugins/auto-review-plugin.ts`): centralize bounded-expiry scheduling so both `iteration.completed` and `session.ended` paths apply identical cleanup.
- **Review-claim bookkeeping:** register before Chimera's enabled-state early return. Chimera exclusively owns the shared `review_needed`/`review_complete` listener pair; auto-review must not duplicate the start listener.
- **Process-group termination** (`verification-context.ts`): couple any POSIX `process.kill(-pid, ...)` to a child spawned with `detached: true` using one computed boolean that controls both spawning and termination.
- **CLI wiring teardown** (`packages/cli/src/wiring/*`): when a wiring function registers cleanup on an external `teardownHandlers` array, fold the same cleanup into its own returned `dispose()` behind an idempotence flag. Callers may drain the array, call `dispose()`, or both, and early-return branches that omit `dispose()` leave tracer/exporter handles unowned.

## Security Patterns

- **NAT64 SSRF bypass:** conservatively block the entire RFC 8215 local-use prefix `64:ff9b:1::/48` in `packages/core/src/utils/ip-guard.ts`. Without the locally configured translation layout, fixed-group IPv4 decoding is unsafe and can permit private destinations through SSRF checks.
- **Truncated shell-input walks:** always destructure and honor the `truncated` flag from `shellCommandLinesFromInput` in `packages/core/src/security/permission-helpers.ts` and fail closed (block/warn) on truncated walks, mirroring `classifyShellSurfaceInput`. Silent `.lines` access is a confirmed fail-open command-smuggling vector.
- **Retry-receipt cache gating:** when a receipt/cache idempotency contract only protects a subset of request types, gate the receipt lookup on the incoming request's type field before consulting the cache. Without the gate, a recycled `requestId` across request types returns a stale conflict error before the inner decoder can reject the malformed payload.
- **Revocation in retry-receipt caches:** make reservation best-effort for revocation-style operations (commit if available, skip caching if not). Gating revocation on retry-receipt capacity lets a busy admin DoS their own ability to revoke compromised grants — a security boundary that dwarfs the value of idempotency replay.

## TUI Rendering and Layout

- Calculate condensed banner widths using helpers from `packages/tui/src/terminal-width.ts`, not JavaScript string length — provider, model, and path values may contain multi-column Unicode characters.
- With Ink 7 `<Static>`, submit only unseen, commit-safe batches and track emitted IDs separately. `<Static>` identifies items by array length/index, so resubmitting the full transcript causes duplicates.
- Model each live assistant or tool-stream suffix as a separate fixed-height row; exclude their combined height from cached history totals and entry-space offsets.
- Use `flex-end` only while managed history is pinned; use `flex-start` for computed scrolled slices. Forcing `flex-end` while scrolled produces a blank oldest-history viewport.
- Enforce persistent panel visibility at the `AppStatusRegion` mount boundary (picker value while settings are open, persisted value otherwise). Child panels must remain presentation-only.
- Do not compact `replace`, `diff`, or `patch` entries into `ToolGroup` — the compact renderer preserves only one-line metadata and discards structured diff bodies and multi-file summaries.
- Trigger a React revision whenever mutable height-cache measurements change cached totals; otherwise `totalHeight()` and `onMeasure` remain stuck on render-time estimates.
- Recalculate the bottom region when picker or panel heights change, not only on terminal resize.
- In `packages/tui/src/components/scrollable-history.tsx`, always clear `selectionRef` whenever `HistoryScrollController` moves the viewport — selection coordinates are viewport-relative and become unsafe against newly mounted card spans. When copying compact tool groups, pass every mounted span's `entryIds` through `toolGroupsByHeadId` to `assembleSelectionText`; using only the group head silently omits later members.

## Terminal and Effect Lifecycle

- Enable terminal ownership via `setTuiActive(true)` immediately before Ink rendering and reset it in the directly paired `finally`. Enabling it earlier suppresses renderer output if pre-render setup throws.
- Keep generic `silent` mode independent from exclusive `tuiActive` mode: `silent` suppresses stdout only; `tuiActive` suppresses both terminal streams.
- Reset mouse terminal-state refs during effect cleanup. React StrictMode replays effects without recreating refs, leaving stale tracking state after `MOUSE_OFF`.

## Streaming and Memory Bounds

- Treat provider bridge live refs (`streamingTextRef`, `pendingDeltaRef`, each stream segment, and segment-array count) as bounded display/recovery tails, not canonical response storage. Bind them together so retention paths cannot diverge.
- Reconstruct retained history from canonical provider-response blocks, never from truncated live-stream segments.
- Enforce TUI memory limits per payload as well as per collection. A newest-item exemption in history or preview stores allows one tool output, file, paste, or diff to defeat entry/count budgets.
- Implement async pollers as completion-driven or single-flight. Clearing a `setInterval` prevents future polls but does not cancel already-overlapping requests.

## Compaction and Summary Caches

- In compaction tests, account for the current user message: `Agent.run` appends it before the context-window preflight compaction pipeline runs.
- Inject a private `CompactionSummaryCache` into `IntelligentCompactor` tests unless shared-cache behavior is the explicit subject under test.
- Cover cache reuse both across compactor instances and across repeated `compact()` calls on a single instance.
- Clear the process-wide summary-cache singleton in `beforeEach`.
- Trim generated summaries before cache-admission checks reject empty or fallback-placeholder results.

## Project Conventions

- Import `SubcommandHandler` and `SubcommandDeps` from `packages/cli/src/subcommands/contracts.ts`, not `packages/cli/src/subcommands/index.ts`. The aggregator pulls handlers into the frozen `ARCH-CYCLE-TYPE-03` strongly connected component.
- Treat `CONFIG_BEHAVIOR_DEFAULTS` as the public `Config` shape, where `autonomy` is optional. Strict consumers must narrow it or use optional chaining even when the concrete default currently supplies a value.
- Treat open todos as the authoritative auto-submit source. Submit synthesized continuation prompts directly; do not persist them as reusable next-step suggestions.
- In `packages/core/src/plugins/review-finding-parser.ts`, require a path-like filename with an extension and a spaced Markdown separator (`file:line — description`) when parsing review findings. Accepting unspaced hyphens truncates hyphenated repository paths. Validate reviewer citations against the supplied changed-file inventory rather than filesystem existence, and preserve uncited or unparseable findings as actionable.
- In `packages/core/src/core/agent-loop.ts`, `foldBlockIntoConversation` is the sanctioned pattern for all runtime-injected context (btw/session/mailbox/steer/pulse/coach); token-anchor bookkeeping is invalidated and recalibrated around it via `clearEvaluatedMailboxBlocks`. Treat "folding mutates user input and corrupts calibration" findings as false positives unless a failing test shows the recalibration path missing.