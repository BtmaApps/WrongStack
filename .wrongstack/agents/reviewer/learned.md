# Learned instructions for `reviewer`

> Project-specific learning data for the `reviewer` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-04T17:06:38.106Z; skill=testing; skipped=69; skippedWins=69 -->
- **Always detect Tab-sweep wrap-around by comparing against the FIRST sampled element (element identity or a unique selector path), never by breaking on any repeated `tag:name` key — duplicate labels (unnamed icon buttons, shared visible text) terminate the sweep before the real wrap and silently skip later controls; pair it with a minimum-`stops` assertion, since an informational `stops` count lets a nearly-empty sweep pass.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `tag:name`
  - *How:* `stops`

<!-- learned-stamp: category=warning; capturedAt=2026-10-04T17:34:05.943Z; applied=4; wins=4; skipped=49; skippedWins=49 -->
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

<!-- learned-stamp: category=warning; capturedAt=2026-10-04T16:59:43.104Z; skill=testing; applied=1; wins=1; skipped=73; skippedWins=73 -->
- **In browser smoke sweeps that detect wrap-around by a `tag:name` key, never `break` on any repeated key — duplicate labels (unnamed icon buttons, shared visible text) end the audit before the real wrap and silently skip later controls. Break only when the first sampled element repeats, or key stops by unique selector path.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `tag:name`
  - *How:* `break`

<!-- learned-stamp: category=warning; capturedAt=2026-10-04T17:06:38.106Z; skill=testing; skipped=69; skippedWins=69 -->
- **Never test computed style color for the literal keyword `transparent` (e.g. `/transparent/.test(getComputedStyle(el).outlineColor)`) — Chromium serializes it as `rgba(0, 0, 0, 0)`, so the regex is inert; parse and assert alpha instead (e.g. > 0, or ≈ the rule's alpha) when auditing visible focus rings, because hue-only comparisons accept fully transparent rings that carry the token color.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `transparent`
  - *How:* `/transparent/.test(getComputedStyle(el).outlineColor)`
  - *How:* `rgba(0, 0, 0, 0)`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T16:38:43.284Z; skill=chimera; applied=12; wins=12; skipped=72; skippedWins=72 -->
- **Always pair `Object.hasOwn` reads with `Object.defineProperty` writes (not plain assignment) when hardening `Record`-typed board state like `lease.reviews` in `packages/kanban/src/manager/management.ts` — the map may be a JSON-restored plain object, so `??= Object.create(null)` does not replace it and `obj['__proto__'] = x` silently corrupts instead of creating an own property.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `Object.hasOwn`
  - *How:* `Object.defineProperty`
  - *How:* `Record`
  - *How:* `lease.reviews`
  - *How:* `packages/kanban/src/manager/management.ts`
  - *How:* `??= Object.create(null)`
  - *How:* `obj['__proto__'] = x`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T16:54:57.487Z; skill=code-review; applied=2; wins=2; skipped=74; skippedWins=74 -->
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

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T15:56:23.218Z; applied=10; wins=10; skipped=79; skippedWins=79 -->
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

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T18:42:03.151Z; skill=code-review; applied=3; wins=3; skipped=18; skippedWins=18 -->
- **In sandbox gates, treat a pass-condition written as `mode === 'off'` (deny anything else) as intentional fail-closed hardening rather than a bug versus the exec wrapper's `mode !== 'enforced'` — check the `SandboxMode` union in `packages/core/src/sandbox/types.ts` and the pinning tests (`packages/core/tests/sandbox/mcp-gate.test.ts`) before flagging the asymmetry. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `mode === 'off'`
  - *How:* `mode !== 'enforced'`
  - *How:* `SandboxMode`
  - *How:* `packages/core/src/sandbox/types.ts`
  - *How:* `packages/core/tests/sandbox/mcp-gate.test.ts`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T14:12:24.638Z; skill=chimera; applied=13; wins=13; skipped=93; skippedWins=93 -->
- **Treat the task bundle's diff hunks as potentially *incomplete*, not just intermediate: this session's hunk for `architecture/core-public-api-snapshot.json` omitted an on-disk line (`"export { createPolicySandboxApprover } from './approver.js';"` at , matching `packages/core/src/sandbox/index.ts:5`). Always read the live file range before filing any finding sourced from a diff hunk, even when the hunk looks current. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `architecture/core-public-api-snapshot.json`
  - *How:* `"export { createPolicySandboxApprover } from './approver.js';"`
  - *How:* `packages/core/src/sandbox/index.ts:5`
  - *How:* `json { "findings": [] }`
  - *How:* `./approver.js`
  - *How:* `packages/core/src/sandbox/index.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T18:48:07.037Z; skill=chimera; applied=6; wins=6; skipped=11; skippedWins=11 -->
- **When an exported wrap function inserts a new positional parameter before an optional trailing callback (e.g. `wrapMCPTool`'s `sandboxTrust` before `observer`), verify every call site's positional order and the parameter's default semantics: a truthy non-boolean object mis-slotted into `trusted` silently becomes a security-gate bypass (`createSandboxMcpGate({ trusted })` identity-wraps on any truthy value). Check `codebase-incoming-calls` for the function and read each caller's argument positions, not just the primary one.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `wrapMCPTool`
  - *How:* `sandboxTrust`
  - *How:* `observer`
  - *How:* `trusted`
  - *How:* `createSandboxMcpGate({ trusted })`
  - *How:* `codebase-incoming-calls`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T17:16:29.386Z; skill=chimera; applied=1; wins=1; skipped=63; skippedWins=63 -->
- **When reviewing a hardcoded `aria-expanded="true"` on a combobox inside a Radix Dialog, verify mount semantics before flagging: `DialogContent` renders nothing while closed, so the constant is accurate whenever the input exists in the DOM. Always confirm `aria-activedescendant` targets exist by checking that the attribute's index/array pair is the exact same array and ordering passed to the renderer that stamps the option IDs — mismatched arrays (filtering, reordering) create dangling references. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `aria-expanded="true"`
  - *How:* `DialogContent`
  - *How:* `aria-activedescendant`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T17:55:17.097Z; skill=chimera; skipped=41; skippedWins=41 -->
- **When reviewing a new early-fire callback added to a boot/init function, always map it against the caller's existing `finally`-based cleanup before flagging double-invocation or missed paths — in `packages/cli/src/cli-entry-main.ts`, the pre-existing `startupOutput.stop()` in both the else-branch and `finally` already guarantees idempotent multi-stop, so the only real question is which launch paths bypass the menu guard. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `finally`
  - *How:* `packages/cli/src/cli-entry-main.ts`
  - *How:* `startupOutput.stop()`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T17:13:50.253Z; skill=chimera; applied=1; wins=1; skipped=65; skippedWins=65 -->
- **When reviewing reentrancy guards in `packages/plugins/src/runtime/host-state.ts`, always verify that `remove()` deletes the `hosts` map entry **before** calling `state.abort.abort()` — the `reset()` guard (`hosts.get(api)` after `remove`) is only correct under that ordering; reordering abort-first would make the guard return the dead state and double-run unregister/dispose in listeners. `T extends HostState` guarantees mapped states are truthy objects, so `if (reentrant)` narrowing is safe. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/plugins/src/runtime/host-state.ts`
  - *How:* `remove()`
  - *How:* `hosts`
  - *How:* `state.abort.abort()`
  - *How:* `reset()`
  - *How:* `hosts.get(api)`
  - *How:* `remove`
  - *How:* `T extends HostState`
  - *How:* `if (reentrant)`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T19:11:22.245Z; skill=chimera; applied=4; wins=4; skipped=4; skippedWins=4 -->
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

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T17:42:39.062Z; skill=code-review; skipped=46; skippedWins=46 -->
- **When verifying a docs-only revision whose citations are the load-bearing claims, read the changed file's full live range in the first batch instead of relying on log recovery: the tool-output log of a read whose middle collapsed can collapse the same middle again, costing an extra round before naming uncovered ranges and setting `completion: "partial"`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `completion: "partial"`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-04T15:52:42.856Z; skill=chimera; applied=13; wins=13; skipped=79; skippedWins=79 -->
- **When a session adds a rollback (`previous` restore) around a stateful send, verify the saved value is a fresh array reference captured before any rebuild — in-place mutation makes the rollback a no-op. Check `packages/client/src/client.ts` `subscribe()` as the pattern. Always validate new spec-doc claims (config paths, symbol names) against the sibling files changed in the same session — e.g. `tools.sandbox.image` must match both the denial table in `packages/core/src/storage/config-loader/in-project-policy.ts` and the consuming backend's error string — before accepting the doc as consistent.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `previous`
  - *How:* `packages/client/src/client.ts`
  - *How:* `subscribe()`
  - *How:* `tools.sandbox.image`
  - *How:* `packages/core/src/storage/config-loader/in-project-policy.ts`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-04T19:21:29.400Z; skill=chimera; applied=1; wins=1; skipped=3; skippedWins=3 -->
- **When a store newly wraps index mutations in `withFileLock` from `@wrongstack/core/utils`, verify the import actually resolves through the `packages/core/src/utils/atomic-write.ts` re-export (check `packages/core/package.json` `exports["./utils"]`), and confirm atomicWrite-inside-lock matches the established pattern in `packages/core/src/goal/phase-store.ts` and `packages/core/src/typesafe/settings.ts` before flagging Windows-rename or lock-residue hazards — the lock is a sidecar artifact and the combination is already covered by `packages/core/tests/utils/atomic-write.test.ts`.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `withFileLock`
  - *How:* `@wrongstack/core/utils`
  - *How:* `packages/core/src/utils/atomic-write.ts`
  - *How:* `packages/core/package.json`
  - *How:* `exports["./utils"]`
  - *How:* `packages/core/src/goal/phase-store.ts`
  - *How:* `packages/core/src/typesafe/settings.ts`
  - *How:* `packages/core/tests/utils/atomic-write.test.ts`
  - *How:* `@wrongstack/core`

---
*Last capture: 2026-10-04T19:21:29.400Z · 17 entries*
