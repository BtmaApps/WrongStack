# Bug-Hunter Agent Instructions

## Review Authority and Fresh-State Checks

- Treat a review’s suggested fix as a hypothesis. Adjudicate findings against the current file, deliberately written tests, and explicit owner policy; never change behavior merely to match a reviewer’s preference.
- Re-read the current on-disk state of every file in a parallel cascade immediately before citing or editing a finding. Parallel workers may already have resolved the issue.
- Read files listed under a review’s “Assumptions / unverified” section before acting. A finding whose proposed fix lives in an uninspected module is especially likely to be stale or incomplete.
- Re-grep an allegedly missing symbol immediately before editing. A read can become stale within seconds during parallel work, and reviewers can mistake a class or method body for a missing declaration.
- Treat a Chimera review’s “Resolved by the parallel worker” block as authoritative for which findings remain open, while still confirming the settled tree.
- If an existing working-tree diff already addresses a finding, preserve it rather than applying a duplicate patch.
- Re-run a failing typecheck or test once before classifying it as a defect; the first failure may be an in-flight peer edit rather than the settled behavior.
- Cross-check claimed ordering and error contracts against pinned repository tests. A deliberate `toEqual` assertion is stronger evidence than a reviewer’s unsupported expectation.
- Execute the flagged test file with `pnpm exec vitest run <file>` before accepting a “broken test” claim. A green run disproves the claim without weakening the test.
- Run the relevant package typecheck before manually tracing static findings. Attribute unrelated package-wide diagnostics by current file and diff rather than patching outside the finding’s scope.
- If code, tests, and comments disagree, report the contradiction and present the viable remediation options. Security-boundary behavior belongs to the file owner and must not be changed unilaterally.

## Parallel Work and Ownership

- When a parallel worker lands a fix mid-session, perform residual reconciliation rather than reimplementing the change. Re-read the files and re-run the package typecheck after the worker’s `session_note` or completion signal.
- After a peer refactor, inspect the settled typecheck for residual issues such as an unused refactored parameter (`TS6133`), stale callers using the old arity (`TS2554`), and import changes introduced by the peer.
- Fix peer-residue issues with the smallest edit that restores the intended contract. Do not duplicate a helper module merely because the original review snapshot proposed one.
- Run `pnpm exec biome check --write <file>` when a peer’s changes create `assist/source/organizeImports` noise, scoping the command to the affected file.
- Treat an on-disk revert of an applied fix as a possible deliberate policy decision. Check fleet pulses and inbound mail for an ownership steer before reapplying it.
- Pinning tests added alongside a revert often indicate that the implementation policy is intentional and only documentation is stale. Re-evaluate the finding against those tests rather than assuming a remediation race.
- Stop editing immediately when an owner explicitly says not to edit the affected files. Leave the owner’s tree untouched and convert the result into a read-only finding through an allowed channel.
- A clean typecheck in the finding’s scope disproves claims such as missing properties or methods. Report diagnostics in peer-modified files separately instead of expanding the remediation.

## Async, Data-Flow, and Deduplication Findings

- Never label `void this.someAsyncFn()` as a race or stale-read bug from the `void` syntax alone. Inspect the full callee body and every awaited dependency before claiming that control can resume before the relevant read.
- An `async` function containing no `await` executes its entire body synchronously before returning. Before reporting fire-and-forget staleness for `loadOffset()` in `packages/telegram/src/poller.ts`, verify both that it is await-free and that `OffsetStore.read()` in `packages/telegram/src/offset-store.ts` performs the synchronous `readFileSync` read used by `acquireAndPoll()`.
- Before claiming a caller bypasses hashing or deduplication, inspect the callee signature and internal key derivation. `rememberUnlocked` in `packages/vector-memory/src/store.ts` accepts only `VectorEntryInput` and derives its SAGE-keyed path from `input.metadata.sageId`, so callers such as `syncFromSage` cannot omit a separate hash argument.
- Evaluate the previous JavaScript expression before accepting claims about `??` fallback behavior. `0 ?? input` evaluates to `0`; nullish coalescing does not treat explicit zero as missing.
- When refactoring a nullish-coalescing chain to `!== undefined`, inspect the `null` case explicitly. If the pinned contract treats both missing and null values as absent, use `value != null` or an equivalent explicit null/undefined check while continuing to honor `0`.
- Verify fallback behavior with `pnpm exec vitest run packages/webui-server/tests/usage-cost.test.ts`; `packages/webui-server/src/server/usage-cost.ts` intentionally treats a real price of `0` as valid while falling back for missing input.
- Classify `n > 0 ? n : 0` versus `n >= 0 ? n : 0` as a no-op for numeric `n`, not a High-severity bug. Report it as naming or contract alignment unless other evidence shows different intended behavior, and run the relevant runtime tests such as `packages/webui-server/tests/server-runtime.test.ts`.
- Before remediating a “child does not accept this JSX prop” finding, grep the exact prop package-wide and inspect sibling hooks and adapters. A partially landed feature may already expose `sharedSearch?` through `useMemoryManagerState` under `packages/webui/src/components/MemoryManager/` without component-level forwarding.
- When consumer support exists only as incomplete scaffolding, stop passing or inventing the prop and leave dormant types or optional hook parameters for the feature owner. A bug-fix pass must not invent missing product UX from fragments of a larger feature.

## Verification and Testing Procedures

- After adding, removing, or renaming a method, grep all affected test files for every old and new method name. Vitest transpiles without type-checking, so a test calling a deleted method can fail only at runtime with `TypeError: X is not a function`.
- When changing a configuration default, grep the entire package test directory for the old literal before replacing it. Distinguish pinned default assertions from explicit override inputs, and update help text and JSDoc in owning sources such as `packages/core/src/plugins/chimera-plugin.ts` and `packages/core/src/plugins/auto-review-plugin.ts`.
- After changing core plugin defaults, run `pnpm exec vitest run packages/core/tests/plugins/auto-review-plugin.test.ts packages/core/tests/plugins/chimera-plugin.test.ts`.
- Use `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/<pkg>/tsconfig.json` for package-level static verification.
- Before treating a consumer-side `TS2305` missing-export error as real, build the exporting workspace package with `pnpm --filter @wrongstack/<pkg> build` and rerun the consumer typecheck. `@wrongstack/*` subpath exports can resolve through git-ignored `dist/*.d.ts`; the repository typecheck script runs `pnpm build && pnpm -r typecheck` for this reason.
- Classify unrelated lint assists as pre-existing only after confirming with `git diff -- <file>` that the current working-tree delta does not touch those lines.
- Verify TUI test-file changes with `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/tui/tsconfig.test.json`. The main `packages/tui/tsconfig.json` includes only `src/**/*` and excludes `tests`, so a successful main-config typecheck does not validate test files or expose diagnostics such as `TS6133` and `TS2883`.
- Do not run WebUI tests from the repository root with `pnpm exec vitest run packages/webui/...`; the root Vitest configuration excludes `packages/webui/**` and reports “No test files found.” Run `pnpm --filter @wrongstack/webui exec vitest run tests/components/<file>` instead.
- For Telegram poller offset changes, run `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/telegram/tsconfig.json` and `pnpm exec vitest run packages/telegram/tests/unit/poller-standby-offset.test.ts`.
- For SAGE mirror deduplication changes, run `pnpm exec vitest run packages/vector-memory/tests/sage-mirror-shared-text.test.ts`.
- Since pnpm 10.x, `--publish-branch` defaults to both `master` and `main`, so publishing from `main` should not fail merely because no branch was specified. Verify the installed pnpm version before changing configuration.
- To isolate pnpm’s branch check from a dirty working tree, create a throwaway repository with an empty workspace configuration and run `pnpm publish --dry-run`.
- For Windows atomic-write tests, mock the `fs.rename` seam, select the Windows retry branch, and inject a transient error such as `EBUSY`. Do not use an open file handle as retry evidence because that behavior is platform-dependent.
- For Kanban verification, resolve the locally installed Vitest or Jest package binary and invoke it through `process.execPath` with `shell: false`. Do not add package-manager fallbacks to the generic verifier command allowlist.
- If an edit tool reports “no match” for text that reads and greps as exact, inspect the target for invisible Unicode characters before changing the surrounding content.

## Security Patterns

- The SAGE-mirror visibility guard in `packages/webui-server/src/server/http-server/vector-memory-handlers.ts` is fail-closed: `!sageId || outcomes?.get(sageId) !== 'visible'` drops the item. A missing resolver, a non-visible outcome, or a resolver error must not expose mirrored content.
- Verify any claimed fail-open/fail-closed contradiction by inspecting the live guard and running `pnpm exec vitest run packages/webui-server/tests/vector-memory-handlers.test.ts`. Older reviews or stale comments containing an `=== 'hidden'` fail-open snapshot are not evidence of current behavior.
- Never flip the fail-closed visibility guard or weaken its pinning tests to satisfy a review bundle. If code and tests agree and documentation is stale, propose or make a comment-only correction when authorized; otherwise report it as an ownership-policy issue.
- Validate the SAGE-mirror area with `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/webui-server/tsconfig.json` and `pnpm exec biome check packages/webui-server/src/server/http-server/vector-memory-handlers.ts`.
- Conservatively block the entire RFC 8215 local-use prefix `64:ff9b:1::/48` in `packages/core/src/utils/ip-guard.ts`. Without the locally configured translation layout, fixed-group IPv4 decoding can expose private destinations through an SSRF bypass.
- Always destructure and honor the `truncated` flag returned by `shellCommandLinesFromInput` in `packages/core/src/security/permission-helpers.ts`, and fail closed on truncated walks as `classifyShellSurfaceInput` does. Silent `.lines` access can permit command smuggling.
- When a retry-receipt cache protects only a subset of request types, gate receipt lookup on the incoming request type before consulting the cache. Otherwise, a recycled `requestId` from another request type can return a stale conflict before inner validation rejects the payload.
- Make reservation best-effort for revocation operations: commit the revocation when possible, but do not let retry-receipt capacity prevent administrators from revoking compromised grants.

## SQLite Schema and Migrations

- Pair every `SCHEMA_VERSION` bump in a file-backed SQLite store with a guarded migration in `applySchema` in `packages/techstack/src/store/schema.ts`; `CREATE TABLE IF NOT EXISTS` cannot evolve an existing table.
- Guard schema changes with the table set from `PRAGMA table_info(<table>)` and the corresponding `ALTER TABLE ... ADD COLUMN` branch, following `ensureCatalogStorageColumns` in `packages/core/src/session-catalog/store-schema.ts`.
- Put legacy-version regression tests in `packages/techstack/tests/store/store-roundtrip.test.ts`, not `sqlite.test.ts`. The latter mocks `node:sqlite` and does not execute the migration SQL.
- Build an upgrade fixture by creating an N-1 database with raw `loadRuntimeDatabaseSync()` DDL in a `mkdtempSync` directory, reopening it through the real store constructor, and asserting that the previously failing write succeeds and the version row advances.
- Use fresh `:memory:` databases only for fresh-install coverage; they do not exercise migrations of existing tables.
- Verify store changes with `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/techstack/tsconfig.json`, `pnpm exec biome check <touched files>`, and `pnpm exec vitest run packages/techstack/tests/store`.

## Data Integrity Invariants

- Require strict `owner_session_id = ?` matching in session-memory merge queries in `packages/sage/src/sqlite-store-remember.ts`. Owned writes must not merge with legacy `owner_session_id IS NULL` rows that session-filtered retrieval deliberately hides.
- Update fingerprint-cache value types, hit and write paths, comparison logic, eviction accounting, observability counters, and setup/teardown resets atomically.
- Update hook-index observability atomically across state initialization, `setup()`, `teardown()`, `duplicate_code_status`, `health()`, and the counter-increment branch.
- Clear labels, generation records, throttle snapshots, stream buffers, history buffers, and tool aggregations together on every subagent-removal path.
- Centralize bounded-expiry scheduling for `packages/core/src/plugins/auto-review-plugin.ts` so `iteration.completed` and `session.ended` apply identical cleanup.
- Register review claims before Chimera’s enabled-state early return. Chimera exclusively owns the shared `review_needed` and `review_complete` listener pair; auto-review must not duplicate the start listener.
- Couple every POSIX `process.kill(-pid, ...)` in `verification-context.ts` to a child spawned with `detached: true`, using one computed boolean for both decisions.
- When a wiring function in `packages/cli/src/wiring/*` registers cleanup on an external `teardownHandlers` array, also return an idempotent `dispose()` that performs the same cleanup. Callers may invoke `dispose()`, drain the array, or both.

## TUI Rendering and Layout

- Calculate condensed banner widths with helpers from `packages/tui/src/terminal-width.ts`, not JavaScript string length; provider, model, and path values can contain multi-column Unicode characters.
- With Ink 7 `<Static>`, submit only unseen, commit-safe batches and track emitted IDs separately. `<Static>` identifies items by index or array length, so resubmitting the full transcript creates duplicates.
- Render each live assistant or tool-stream suffix as a separate fixed-height row and exclude their combined height from cached history totals and entry-space offsets.
- Use `flex-end` only while managed history is pinned. Use `flex-start` for computed scrolled slices; pinned bottom alignment can produce a blank oldest-history viewport.
- Enforce persistent panel visibility at the `AppStatusRegion` mount boundary, using the picker value while settings are open and the persisted value otherwise. Child panels should remain presentation-only.
- Do not compact `replace`, `diff`, or `patch` entries into `ToolGroup`; compact rendering drops structured diff bodies and multi-file summaries.
- Trigger a React revision whenever mutable height-cache measurements change cached totals, or `totalHeight()` and `onMeasure` can remain stuck on render-time estimates.
- Recalculate the bottom region whenever picker or panel heights change, not only on terminal resize.
- Clear `selectionRef` whenever `HistoryScrollController` moves the viewport in `packages/tui/src/components/scrollable-history.tsx`; selection coordinates are viewport-relative and unsafe after new card spans mount.
- Pass every mounted span’s `entryIds` through `toolGroupsByHeadId` to `assembleSelectionText` when copying compact tool groups. Using only the group head omits later members.

## Terminal and Effect Lifecycle

- Call `setTuiActive(true)` immediately before Ink rendering and reset it in the directly paired `finally`. Enabling ownership earlier can suppress renderer output if pre-render setup throws.
- Keep generic `silent` mode independent from exclusive `tuiActive` mode: `silent` suppresses stdout only, while `tuiActive` suppresses both terminal streams.
- Reset mouse terminal-state refs during effect cleanup. React StrictMode replays effects without recreating refs, leaving stale tracking state after `MOUSE_OFF`.

## Streaming and Memory Bounds

- Treat provider bridge live refs such as `streamingTextRef`, `pendingDeltaRef`, individual stream segments, and segment-array count as one bounded display and recovery tail.
- Reconstruct retained history from canonical provider-response blocks, never from truncated live-stream segments.
- Enforce TUI memory limits per payload as well as per collection. Newest-item exemptions can otherwise allow one tool output, file, paste, or diff to bypass entry and count budgets.
- Implement asynchronous pollers as completion-driven or single-flight. Clearing a `setInterval` prevents future polls but does not cancel already-overlapping requests.

## Compaction and Summary Caches

- In compaction tests, include the current user message because `Agent.run` appends it before context-window preflight compaction.
- Inject a private `CompactionSummaryCache` into `IntelligentCompactor` tests unless shared-cache behavior is the explicit subject under test.
- Cover cache reuse across separate compactor instances and across repeated `compact()` calls on one instance.
- Clear the process-wide summary-cache singleton in `beforeEach`.
- Trim generated summaries before cache-admission checks reject empty or fallback-placeholder results.

## Project Conventions

- Import `SubcommandHandler` and `SubcommandDeps` from `packages/cli/src/subcommands/contracts.ts`, not `packages/cli/src/subcommands/index.ts`; the aggregator pulls handlers into the frozen `ARCH-CYCLE-TYPE-03` strongly connected component.
- Treat `CONFIG_BEHAVIOR_DEFAULTS` as the public `Config` shape where `autonomy` is optional. Strict consumers must narrow it or use optional chaining even if the current concrete default supplies a value.
- Treat open todos as the authoritative auto-submit source. Submit synthesized continuation prompts directly instead of persisting them as reusable next-step suggestions.
- Require a path-like filename with an extension and a spaced Markdown separator in the form `file:line — description` when parsing findings in `packages/core/src/plugins/review-finding-parser.ts`; unspaced hyphens can truncate hyphenated repository paths.
- Validate reviewer citations against the supplied changed-file inventory rather than filesystem existence, and preserve uncited or unparseable findings as actionable.
- Use `foldBlockIntoConversation` in `packages/core/src/core/agent-loop.ts` for all runtime-injected context, including btw, session, mailbox, steer, pulse, and coach blocks.
- Recalibrate token-anchor bookkeeping around runtime-injected context with `clearEvaluatedMailboxBlocks`. Treat claims that folding corrupts user input or calibration as false positives unless a failing test shows that recalibration is missing.

## Reporting

- Report only findings reproducible against the settled on-disk tree and pinned tests.
- Distinguish behavioral defects, contract inconsistencies, stale documentation, and review false positives.
- Base severity on demonstrated impact; behaviorally equivalent rewrites are not High-severity bugs.
- Include the decisive source path, test or typecheck command, expected behavior, and observed behavior.
- When ownership policy or an edit restriction prevents remediation, leave the tree untouched and provide a concise read-only finding through the permitted channel.