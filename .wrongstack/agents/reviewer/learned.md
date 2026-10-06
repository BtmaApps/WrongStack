# Learned instructions for `reviewer`

> Project-specific learning data for the `reviewer` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T15:07:13.527Z; skill=code-review; applied=11; wins=11; skipped=94; skippedWins=94 -->
- **- When a diff swaps a hardcoded backoff expression (e.g. `500 * 2 ** attempt`) for a shared constant like `MCP_CONSTANTS.RECONNECT.BACKOFF_MULTIPLIER`, always read the constant's live literal value in `packages/mcp/src/constants.ts` before classifying it — equality to the removed magic number is what makes it a behavior-preserving refactor instead of a timing regression. - Before flagging a newly suppressed `log.warn` on an error branch, check whether the error's throw site already emits its own structured warn (see `assertSupportedServerProtocolVersion` in `packages/mcp/src/constants.ts`) and whether the original `err` still reaches a higher-level log; otherwise you report an evidence loss that does not exist. - Validate a new `err instanceof SomeErrorClass` early-terminal path by grepping every throw site and confirming each one sits inside the `try` of the reviewed call (`client.connect()`), and that class identity survives intermediate wrappers — an `instanceof` gate on an error that never reaches the catch is an inert fix.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `500 * 2 ** attempt`
  - *How:* `MCP_CONSTANTS.RECONNECT.BACKOFF_MULTIPLIER`
  - *How:* `packages/mcp/src/constants.ts`
  - *How:* `log.warn`
  - *How:* `assertSupportedServerProtocolVersion`
  - *How:* `err`
  - *How:* `err instanceof SomeErrorClass`
  - *How:* `try`
  - *How:* `client.connect()`
  - *How:* `instanceof`

<!-- learned-stamp: category=warning; capturedAt=2026-10-04T17:06:38.106Z; skill=testing; skipped=252; skippedWins=252 -->
- **Always detect Tab-sweep wrap-around by comparing against the FIRST sampled element (element identity or a unique selector path), never by breaking on any repeated `tag:name` key — duplicate labels (unnamed icon buttons, shared visible text) terminate the sweep before the real wrap and silently skip later controls; pair it with a minimum-`stops` assertion, since an informational `stops` count lets a nearly-empty sweep pass.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `tag:name`
  - *How:* `stops`

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T18:21:31.107Z; skill=chimera; applied=1; wins=1; skipped=51; skippedWins=51 -->
- **Always inspect the *splice argument* of a batch-concurrency loop extracted into a new host-module file (e.g. `packages/core/src/goal/phase-task-execution.ts` `pendingTasks.splice(0, host.opts.maxConcurrentTasks)`) against the loop's own termination condition, not only against the producer's `?? N` default — a `0` config value yields an empty batch that never advances the pending set, and because the guard is an already-resolved promise the loop degrades to microtask starvation rather than a visible hang. `satisfies PhaseTaskExecutionHost` on a discarded object literal is only a compile-time drift check, not proof that the returned `this as unknown as PhaseTaskExecutionHost` satisfies the interface; credit it only after confirming the enumerated literal members match the interface one-for-one.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/core/src/goal/phase-task-execution.ts`
  - *How:* `pendingTasks.splice(0, host.opts.maxConcurrentTasks)`
  - *How:* `?? N`
  - *How:* `0`
  - *How:* `satisfies PhaseTaskExecutionHost`
  - *How:* `this as unknown as PhaseTaskExecutionHost`

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T17:59:35.421Z; skill=testing; applied=1; wins=1; skipped=55; skippedWins=55 -->
- **Always read the full `IN_PROJECT_DENIED_PATHS` table in `packages/core/src/storage/config-loader/in-project-policy.ts` (not a truncated grep of `path:` lines) before approving any change that exports it to a consumer that walks dotted paths literally — `listInProjectDeniedPaths()` joined a hand-kept mirror in `packages/cli/src/settings-menu.ts` `filterSafeForProject`, so a wildcard-shaped entry would make the exported list silently inert. When a new allow-list-driven test asserts a stripped field is absent, first confirm the field's top-level parent is present in `PROJECT_SAFE_FIELDS` (`packages/cli/src/settings-menu.ts`), otherwise the assertion passes because the field was never copied rather than because the deny path worked. ```json { "findings": [] } ```**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `IN_PROJECT_DENIED_PATHS`
  - *How:* `packages/core/src/storage/config-loader/in-project-policy.ts`
  - *How:* `path:`
  - *How:* `listInProjectDeniedPaths()`
  - *How:* `packages/cli/src/settings-menu.ts`
  - *How:* `filterSafeForProject`
  - *How:* `PROJECT_SAFE_FIELDS`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=warning; capturedAt=2026-10-04T17:34:05.943Z; applied=6; wins=6; skipped=230; skippedWins=230 -->
- **Always verify `Object.keys()`-based teardown/reset cycles still work when writes switch to `setOwnValue`-style `Object.defineProperty` in `packages/plugins/src/cost-tracker/index.ts` — entries must stay `enumerable` (counted in `Object.keys` for health/teardown stats) and `configurable` (deletable in `teardown`), and closure-local state like `sessionCost.byModel` is never JSON-restored, so `!Object.hasOwn` guards cannot hit own-`undefined` keys.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `Object.keys()`
  - *How:* `setOwnValue`
  - *How:* `Object.defineProperty`
  - *How:* `packages/plugins/src/cost-tracker/index.ts`
  - *How:* `enumerable`
  - *How:* `Object.keys`
  - *How:* `configurable`
  - *How:* `teardown`
  - *How:* `sessionCost.byModel`
  - *How:* `!Object.hasOwn`
  - *How:* `undefined`

<!-- learned-stamp: category=warning; capturedAt=2026-10-04T16:59:43.104Z; skill=testing; applied=1; wins=1; skipped=256; skippedWins=256 -->
- **In browser smoke sweeps that detect wrap-around by a `tag:name` key, never `break` on any repeated key — duplicate labels (unnamed icon buttons, shared visible text) end the audit before the real wrap and silently skip later controls. Break only when the first sampled element repeats, or key stops by unique selector path.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `tag:name`
  - *How:* `break`

<!-- learned-stamp: category=warning; capturedAt=2026-10-04T17:06:38.106Z; skill=testing; skipped=252; skippedWins=252 -->
- **Never test computed style color for the literal keyword `transparent` (e.g. `/transparent/.test(getComputedStyle(el).outlineColor)`) — Chromium serializes it as `rgba(0, 0, 0, 0)`, so the regex is inert; parse and assert alpha instead (e.g. > 0, or ≈ the rule's alpha) when auditing visible focus rings, because hue-only comparisons accept fully transparent rings that carry the token color.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `transparent`
  - *How:* `/transparent/.test(getComputedStyle(el).outlineColor)`
  - *How:* `rgba(0, 0, 0, 0)`

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T17:37:22.935Z; skill=code-review; applied=9; wins=9; skipped=51; skippedWins=51 -->
- **When a diff registers in-flight work for teardown grace (e.g. `trackAudit`/`boundAuditWait` in `packages/cli/src/wiring/dep-watcher.ts`), verify the three load-bearing properties instead of the comments: every promise entering the tracked set is a never-rejecting `then(_,_)` completion (so `Promise.race` cannot reject into `waitUntil`), the bound timer is `unref()`'d, and any tracking promise obtained from a sibling API is called *without* `await` inside the spawn `try` — an awaited tracking call converts a tracking rejection into a dropped successful spawn. Always validate a `cfg?.['enabled'] === true` → `!== false` default-on flip against all three anchors before approving: the producer returns the raw fragment (not `undefined` when disabled), every `cfg['key']` read inside the newly-reachable block gained optional chaining, and every sibling gate reading that fragment flipped identically (`packages/cli/src/wiring/dep-watcher-bridge.ts` is the sibling here). ```json { "findings": [] } ```**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `trackAudit`
  - *How:* `boundAuditWait`
  - *How:* `packages/cli/src/wiring/dep-watcher.ts`
  - *How:* `then(_,_)`
  - *How:* `Promise.race`
  - *How:* `waitUntil`
  - *How:* `unref()`
  - *How:* `await`
  - *How:* `try`
  - *How:* `cfg?.['enabled'] === true`
  - *How:* `!== false`
  - *How:* `undefined`
  - *How:* `cfg['key']`
  - *How:* `packages/cli/src/wiring/dep-watcher-bridge.ts`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T15:25:50.470Z; skill=chimera; applied=1; wins=1; skipped=93; skippedWins=93 -->
- **When a slot/entry field caches a *deterministic* connect verdict (e.g. `protocolVersionRefusal` on `ServerSlot` in `packages/mcp/src/registry-slots.ts`), verify the field is cleared at the START of every attempt — `packages/mcp/src/registry-connect-loop.ts` `attemptConnectSlot` — not only on the failure path. A verdict set once and never re-cleared on success leaks a stale error into later demand-wakes through `ensureConnected` in `packages/mcp/src/registry-server-lifecycle.ts`; check the clearing point before approving any cached-error field.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `protocolVersionRefusal`
  - *How:* `ServerSlot`
  - *How:* `packages/mcp/src/registry-slots.ts`
  - *How:* `packages/mcp/src/registry-connect-loop.ts`
  - *How:* `attemptConnectSlot`
  - *How:* `ensureConnected`
  - *How:* `packages/mcp/src/registry-server-lifecycle.ts`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T16:42:34.614Z; skill=chimera; applied=8; wins=8; skipped=75; skippedWins=75 -->
- **Always check a case-insensitive regex (`/i` flag) against any case-sensitive `String.includes()`/`indexOf()` early-return guard in front of it — the guard makes the `i` flag inert, so the tolerant branch only ever runs on lowercase input. Anchor in `packages/core/src/utils/next-steps.ts`. When a diff converts a `import type { X }` to a mixed `import { type X, VALUE }` on a `@wrongstack/core/*` subpath, confirm the value is added to the barrel's `export {}` (value) block, not the `export type {}` block, and that a second real consumer already imports it — a type-only re-export compiles but throws at runtime. Before crediting a doc comment that claims "every surface strips this token", read each named stripper's actual regex; in `packages/core/src/utils/next-steps.ts`, `<next_?steps\b[^>]*>` does match `<nextsteps-complete/>` because the `\b` sits between `s` and `-`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `/i`
  - *How:* `String.includes()`
  - *How:* `indexOf()`
  - *How:* `i`
  - *How:* `packages/core/src/utils/next-steps.ts`
  - *How:* `import type { X }`
  - *How:* `import { type X, VALUE }`
  - *How:* `@wrongstack/core/*`
  - *How:* `export {}`
  - *How:* `export type {}`
  - *How:* `<next_?steps\b[^>]*>`
  - *How:* `<nextsteps-complete/>`
  - *How:* `\b`
  - *How:* `s`
  - *How:* `-`
  - *How:* `@wrongstack/core`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T13:34:35.916Z; skill=chimera; applied=14; wins=14; skipped=155; skippedWins=155 -->
- **Always diff a new producer→consumer text contract against the *other* file's own guards in the same session: when `packages/core/src/coordination/dep-watcher.ts` emits a field (e.g. `File:`), check that `packages/core/src/coordination/techstack-mailbox-consumer.ts` `acceptManifestCandidate` actually accepts the path form the producer documents (absolute vs project-relative) — a parsing branch gated by a validator that rejects the production input is an inert fix. Verify regex that re-parses a sibling module's output against the *generator's* output space, not the happy-path sample: ranges emitted verbatim by `manifest-deps.ts` `parseRequirementsTxt`/`pep508Entry` contain spaces, which `\S+` captures silently drop, and a partially-filled result can be worse than an empty one when downstream logic reads `length > 0` and then scopes work to "ONLY these". Before crediting a new in-session baseline/delta mechanism, ask which real-world event it names first: a baseline written only inside the change handler is empty for the first (usually only) edit, so the feature is inert on its primary path.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/core/src/coordination/dep-watcher.ts`
  - *How:* `File:`
  - *How:* `packages/core/src/coordination/techstack-mailbox-consumer.ts`
  - *How:* `acceptManifestCandidate`
  - *How:* `manifest-deps.ts`
  - *How:* `parseRequirementsTxt`
  - *How:* `pep508Entry`
  - *How:* `\S+`
  - *How:* `length > 0`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T16:38:43.284Z; skill=chimera; applied=13; wins=13; skipped=254; skippedWins=254 -->
- **Always pair `Object.hasOwn` reads with `Object.defineProperty` writes (not plain assignment) when hardening `Record`-typed board state like `lease.reviews` in `packages/kanban/src/manager/management.ts` — the map may be a JSON-restored plain object, so `??= Object.create(null)` does not replace it and `obj['__proto__'] = x` silently corrupts instead of creating an own property.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `Object.hasOwn`
  - *How:* `Object.defineProperty`
  - *How:* `Record`
  - *How:* `lease.reviews`
  - *How:* `packages/kanban/src/manager/management.ts`
  - *How:* `??= Object.create(null)`
  - *How:* `obj['__proto__'] = x`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T17:40:00.050Z; applied=6; wins=6; skipped=53; skippedWins=53 -->
- **Always pair a teardown-grace registration guarded by an *optional* payload seam (e.g. `session.ended`'s `waitUntil`) with a warn log when work is in flight but the seam is absent — an optional contract plus a silent `return` is how an inert fix hides from live verification. Anchor: `packages/cli/src/wiring/dep-watcher.ts`, `packages/core/src/kernel/events/session-events.ts`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `session.ended`
  - *How:* `waitUntil`
  - *How:* `return`
  - *How:* `packages/cli/src/wiring/dep-watcher.ts`
  - *How:* `packages/core/src/kernel/events/session-events.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T14:49:04.121Z; skill=testing; applied=22; wins=22; skipped=97; skippedWins=97 -->
- **Always pin MCP test fixtures that answer `initialize` to a revision present in `SUPPORTED_PROTOCOL_VERSIONS` (`packages/mcp/src/constants.ts`) — `assertSupportedServerProtocolVersion` throws on any other revision, so an auth-focused fixture carrying a future version (e.g. `'2025-11-25'`) turns every connect-based test in the file into a version-mismatch failure before the behavior under test runs; the deliberate-mismatch case belongs in its own dedicated test. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `initialize`
  - *How:* `SUPPORTED_PROTOCOL_VERSIONS`
  - *How:* `packages/mcp/src/constants.ts`
  - *How:* `assertSupportedServerProtocolVersion`
  - *How:* `'2025-11-25'`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T15:25:50.470Z; applied=5; wins=5; skipped=89; skippedWins=89 -->
- **Always read the live literal of `MCP_CONSTANTS.RECONNECT.BACKOFF_MULTIPLIER` (`packages/mcp/src/constants.ts`) before judging a hardcoded `500 * 2 ** attempt` refactor: the multiplier is `2` (preserving) while `RECONNECT.BASE_DELAY_MS` is `1000` (the across-cycle clock), so the within-cycle retry base must stay a separate `CONNECT_ATTEMPT_BASE_MS` — swapping in `BASE_DELAY_MS` would silently double the per-attempt delay.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `MCP_CONSTANTS.RECONNECT.BACKOFF_MULTIPLIER`
  - *How:* `packages/mcp/src/constants.ts`
  - *How:* `500 * 2 ** attempt`
  - *How:* `2`
  - *How:* `RECONNECT.BASE_DELAY_MS`
  - *How:* `1000`
  - *How:* `CONNECT_ATTEMPT_BASE_MS`
  - *How:* `BASE_DELAY_MS`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T16:36:16.961Z; skill=testing; applied=2; wins=2; skipped=83; skippedWins=83 -->
- **Always resolve a changed *test assertion's expected value* against the live file before judging self-consistency — a review bundle's added-line text can be stale relative to disk (bundle showed `toContain('path')` while `packages/mcp/tests/server.test.ts` on disk has `toContain('target')`), and cross-checking it against the unchanged fixture (`arguments: [{ name: 'target', required: true }]`) is what separates a false finding from an all-clear. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `toContain('path')`
  - *How:* `packages/mcp/tests/server.test.ts`
  - *How:* `toContain('target')`
  - *How:* `arguments: [{ name: 'target', required: true }]`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T15:10:05.154Z; applied=25; wins=25; skipped=77; skippedWins=77 -->
- **Always verify a config-gate flip from `cfg?.['enabled'] === true` to `!== false` (default-on) against three anchors before approving: (1) the producer returns the RAW parsed fragment — not `undefined` when disabled — otherwise the consumer's `!== false` gate silently re-enables after an explicit opt-out (see `setupDepWatcherBridge` returning `{ dwCfg }` in `packages/cli/src/wiring/dep-watcher-bridge.ts` despite its doc comment); (2) every downstream `cfg['key']` read gains optional chaining, since the gate no longer implies the object exists (TypeError on the now-common absent-config path); (3) every sibling gate reading the same fragment flips identically, so absent / explicit-false / truthy behave the same across bridge and consumers (`packages/cli/src/wiring/dep-watcher.ts` vs `dep-watcher-bridge.ts`). ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `cfg?.['enabled'] === true`
  - *How:* `!== false`
  - *How:* `undefined`
  - *How:* `setupDepWatcherBridge`
  - *How:* `{ dwCfg }`
  - *How:* `packages/cli/src/wiring/dep-watcher-bridge.ts`
  - *How:* `cfg['key']`
  - *How:* `packages/cli/src/wiring/dep-watcher.ts`
  - *How:* `dep-watcher-bridge.ts`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T13:38:59.551Z; applied=36; wins=36; skipped=130; skippedWins=130 -->
- **Always verify a new mailbox-field parser against the validator that gates it AND the producer's documented input space: when `dep-watcher.ts` emits raw `entry.path` (documented as absolute from the file-watcher plugin) into `Manifest:`/`File:` fields, `acceptManifestCandidate` in `techstack-mailbox-consumer.ts` rejects absolute paths outright, making the fix inert on its production path. Parse ranges that re-serialize sibling-module output (e.g. `- name@range (section)` lines from `manifest-deps.ts`) with the generator's full output space — PEP 508/requirements.txt ranges contain spaces that `\S+` captures silently drop.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `dep-watcher.ts`
  - *How:* `entry.path`
  - *How:* `Manifest:`
  - *How:* `File:`
  - *How:* `acceptManifestCandidate`
  - *How:* `techstack-mailbox-consumer.ts`
  - *How:* `- name@range (section)`
  - *How:* `manifest-deps.ts`
  - *How:* `\S+`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T15:32:02.407Z; skill=testing; applied=15; wins=15; skipped=75; skippedWins=75 -->
- **Always verify a test-suite change that swaps JSON-RPC error-code assertions for tool-result refusal assertions against the production conversion site and the *message builder* it preserves: check that `packages/mcp/src/server-dispatch.ts` turns `InvalidToolArgumentsError` into `{ content: [{ type: 'text', text: err.message }], isError: true }`, and that every asserted substring (`${error.path}: ${error.message}` entries, `(+N more)` capping from `MAX_REPORTED_SCHEMA_ERRORS`) is produced by the same `err.message` the old error path carried — otherwise the rewrite silently drops assertions instead of retargeting them.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/mcp/src/server-dispatch.ts`
  - *How:* `InvalidToolArgumentsError`
  - *How:* `{ content: [{ type: 'text', text: err.message }], isError: true }`
  - *How:* `${error.path}: ${error.message}`
  - *How:* `(+N more)`
  - *How:* `MAX_REPORTED_SCHEMA_ERRORS`
  - *How:* `err.message`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T16:54:57.487Z; skill=code-review; applied=18; wins=18; skipped=241; skippedWins=241 -->
- **Always verify AbortController supersession guards against `close()` semantics before flagging or approving them: a `close()` that aborts but does not *replace* `this.abortController` (see `packages/mcp/src/transport-sse.ts`) keeps `this.abortController === controller` identity checks valid after close, while stale async paths (`readSSEBody` finally, SSE callbacks) must skip shared cleanup — `streamSignal`, `rejectStreamPending`, state transitions — whenever the identity check fails, or they will clobber the newer connection's state. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `close()`
  - *How:* `this.abortController`
  - *How:* `packages/mcp/src/transport-sse.ts`
  - *How:* `this.abortController === controller`
  - *How:* `readSSEBody`
  - *How:* `streamSignal`
  - *How:* `rejectStreamPending`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T15:24:38.059Z; applied=20; wins=20; skipped=75; skippedWins=75 -->
- **Always verify every throw site of an error class before flagging (or approving) a swap of an `instanceof`-based error-code mapping — when the class's only throw site is already intercepted and converted upstream (e.g. `tools/call` turning `InvalidToolArgumentsError` into an `isError` tool result in `packages/mcp/src/server-dispatch.ts`), the old check in the outer catch was dead code and swapping it changes nothing but the intended path. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `instanceof`
  - *How:* `tools/call`
  - *How:* `InvalidToolArgumentsError`
  - *How:* `isError`
  - *How:* `packages/mcp/src/server-dispatch.ts`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T15:56:23.218Z; applied=10; wins=10; skipped=262; skippedWins=262 -->
- **Before flagging wrapper-instance duplication in `packages/tools/src/builtin.ts` (e.g. `browserTools.map((tool) => browserTierGate(tool))` appearing in `OPTIONAL_TOOLS`, `OFF_ONLY_TOOLS`, and `rawBuiltinTools`): recognize that `builtinTools` already maps every entry to a fresh `{ ...tool, description }` object, so consumers of the tier arrays are necessarily name-based — distinct wrapper instances cannot break identity matching that was already impossible. Always read `packages/core/src/sandbox/browser-rule.ts` for the deny precondition (`mode === 'enforced' && backend === 'container'`) before alleging browser tools are newly blocked under the default `mode: 'off'`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/tools/src/builtin.ts`
  - *How:* `browserTools.map((tool) => browserTierGate(tool))`
  - *How:* `OPTIONAL_TOOLS`
  - *How:* `OFF_ONLY_TOOLS`
  - *How:* `rawBuiltinTools`
  - *How:* `builtinTools`
  - *How:* `{ ...tool, description }`
  - *How:* `packages/core/src/sandbox/browser-rule.ts`
  - *How:* `mode === 'enforced' && backend === 'container'`
  - *How:* `mode: 'off'`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T18:42:03.151Z; skill=code-review; applied=3; wins=3; skipped=201; skippedWins=201 -->
- **In sandbox gates, treat a pass-condition written as `mode === 'off'` (deny anything else) as intentional fail-closed hardening rather than a bug versus the exec wrapper's `mode !== 'enforced'` — check the `SandboxMode` union in `packages/core/src/sandbox/types.ts` and the pinning tests (`packages/core/tests/sandbox/mcp-gate.test.ts`) before flagging the asymmetry. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `mode === 'off'`
  - *How:* `mode !== 'enforced'`
  - *How:* `SandboxMode`
  - *How:* `packages/core/src/sandbox/types.ts`
  - *How:* `packages/core/tests/sandbox/mcp-gate.test.ts`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T14:12:24.638Z; skill=chimera; applied=13; wins=13; skipped=276; skippedWins=276 -->
- **Treat the task bundle's diff hunks as potentially *incomplete*, not just intermediate: this session's hunk for `architecture/core-public-api-snapshot.json` omitted an on-disk line (`"export { createPolicySandboxApprover } from './approver.js';"` at , matching `packages/core/src/sandbox/index.ts:5`). Always read the live file range before filing any finding sourced from a diff hunk, even when the hunk looks current. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `architecture/core-public-api-snapshot.json`
  - *How:* `"export { createPolicySandboxApprover } from './approver.js';"`
  - *How:* `packages/core/src/sandbox/index.ts:5`
  - *How:* `json { "findings": [] }`
  - *How:* `./approver.js`
  - *How:* `packages/core/src/sandbox/index.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T17:32:46.183Z; skill=chimera; applied=9; wins=9; skipped=54; skippedWins=54 -->
- **When a test diff pins teardown-handler ordering or count, resolve every index/length assertion against the live push order in the wiring — distinguishing unconditional pushes (e.g. a session-end unsubscribe pushed right after consumer start in `packages/cli/src/wiring/dep-watcher.ts`) from conditional disposer pushes at the end — because the diff comment describes intent while the counts come from the actual push sites. Likewise, when assertions migrate across an envelope change (JSON-RPC error → tool result), confirm the asserted substring is produced by the unchanged message producer, not the new envelope.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/cli/src/wiring/dep-watcher.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T18:48:07.037Z; skill=chimera; applied=6; wins=6; skipped=194; skippedWins=194 -->
- **When an exported wrap function inserts a new positional parameter before an optional trailing callback (e.g. `wrapMCPTool`'s `sandboxTrust` before `observer`), verify every call site's positional order and the parameter's default semantics: a truthy non-boolean object mis-slotted into `trusted` silently becomes a security-gate bypass (`createSandboxMcpGate({ trusted })` identity-wraps on any truthy value). Check `codebase-incoming-calls` for the function and read each caller's argument positions, not just the primary one.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `wrapMCPTool`
  - *How:* `sandboxTrust`
  - *How:* `observer`
  - *How:* `trusted`
  - *How:* `createSandboxMcpGate({ trusted })`
  - *How:* `codebase-incoming-calls`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T17:16:29.386Z; skill=chimera; applied=1; wins=1; skipped=246; skippedWins=246 -->
- **When reviewing a hardcoded `aria-expanded="true"` on a combobox inside a Radix Dialog, verify mount semantics before flagging: `DialogContent` renders nothing while closed, so the constant is accurate whenever the input exists in the DOM. Always confirm `aria-activedescendant` targets exist by checking that the attribute's index/array pair is the exact same array and ordering passed to the renderer that stamps the option IDs — mismatched arrays (filtering, reordering) create dangling references. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `aria-expanded="true"`
  - *How:* `DialogContent`
  - *How:* `aria-activedescendant`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T19:11:22.245Z; skill=chimera; applied=4; wins=4; skipped=187; skippedWins=187 -->
- **When reviewing win32 quoting in `buildContainerRoute` (`packages/core/src/sandbox/backends/container.ts`), verify before flagging: cmd.exe expands `%VAR%` even inside double quotes but leaves `\"` for the target process's CommandLineToArgvW to strip, and `-v D:\path:/w0` drive-letter-colon specs are accepted by Docker Desktop. For `kind: 'argv'` routes, quote glyphs stay literal in the returned array — check how `wrap.ts` executes `{argv}` (shell-join vs direct spawn) before alleging a quoting bug, since the old code embedded single quotes in the same positions. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `buildContainerRoute`
  - *How:* `packages/core/src/sandbox/backends/container.ts`
  - *How:* `%VAR%`
  - *How:* `\"`
  - *How:* `-v D:\path:/w0`
  - *How:* `kind: 'argv'`
  - *How:* `wrap.ts`
  - *How:* `{argv}`
  - *How:* `json { "findings": [] }`

---
*Last capture: 2026-10-05T18:21:31.107Z · 28 entries*
