# Learned instructions for `bug-hunter`

> Project-specific learning data for the `bug-hunter` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-18T09:37:28.574Z; skill=bug-hunter; skipped=6; skippedWins=6 -->
- **Always adjudicate `.name`-keyed error catches in `packages/cli/src` against the error class constructor and the repo's esbuild chunk-duplication hazard before flagging them as fragile — in this repo the name comparison is the hardened pattern and `instanceof` on cross-chunk workspace-imported error classes (`@wrongstack/core/*`) is the fragile variant. Anchors: `packages/cli/src/fleet/host-shadow-pass.ts` (name-keyed swallow of `FleetSpawnBudgetError`, class stamps `name` in `packages/core/src/coordination/director/director-errors.ts`), `packages/cli/src/wiring/proxy-probe.ts` (documented chunk-duplication), `packages/cli/src/goal-host.ts` (`instanceof GoalRunLeaseBusyError` — degrade-tolerant). Verify fire-and-forget containment by grepping repo-wide for the method name plus `.catch(`, and cite `packages/cli/tests/fleet/shadow-pass-unhandled.test.ts` as the regression-test pattern for unhandled-rejection probes.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.name`
  - *How:* `packages/cli/src`
  - *How:* `instanceof`
  - *How:* `@wrongstack/core/*`
  - *How:* `packages/cli/src/fleet/host-shadow-pass.ts`
  - *How:* `FleetSpawnBudgetError`
  - *How:* `name`
  - *How:* `packages/core/src/coordination/director/director-errors.ts`
  - *How:* `packages/cli/src/wiring/proxy-probe.ts`
  - *How:* `packages/cli/src/goal-host.ts`
  - *How:* `instanceof GoalRunLeaseBusyError`
  - *How:* `.catch(`
  - *How:* `packages/cli/tests/fleet/shadow-pass-unhandled.test.ts`
  - *How:* `@wrongstack/core`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-19T07:41:28.007Z; skipped=5; skippedWins=5 -->
- **Always trace the synchronous `tool.confirm_resolved` emission path before accepting or rejecting double-emit claims in `packages/core/src/hq/approval-bridge.ts` — resolvers emit that event synchronously (documented at the `grantExpiries` map), the `offResolved` listener announces unconditionally even when `pending` is already deleted, so any new announce site must dedupe via a bus-announced id flag rather than removing either path. Treat a lone `packages/core/src/storage/todos-checkpoint.ts` TS2454 in `packages/core` typecheck output as pre-existing out-of-scope noise and verify it with `git status` on the exact path before letting it fail a review gate.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `tool.confirm_resolved`
  - *How:* `packages/core/src/hq/approval-bridge.ts`
  - *How:* `grantExpiries`
  - *How:* `offResolved`
  - *How:* `pending`
  - *How:* `packages/core/src/storage/todos-checkpoint.ts`
  - *How:* `packages/core`
  - *How:* `git status`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-19T10:54:05.353Z; skill=typescript-strict; skipped=4; skippedWins=4 -->
- **Always adjudicate Node-daemon TDZ-closure claims (`closure over a later-declared let`) by checking whether any *synchronous* path can invoke the closure during module evaluation — event-loop callbacks (`net` server `'connection'`, timers, IPC) cannot interleave with synchronous module-body execution. In `packages/sage/src/project-server.ts`, the forward-lazy-closure pattern (`createSlowOperationReporter(() => ({ pendingRequests, clients: clients.size }))` and the `createHygieneRunner` `isBusy` lambda) is intentional and startup-safe; a construct-time TDZ would crash every daemon start and fail `packages/sage/tests/project-server-maintenance.test.ts`. ```json { "verification_evidence": { "typecheck": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/sage/tsconfig.json", "exitCode": 0 }, "lint": { "command": "bunx biome check packages/sage/src/memory-text.ts", "exitCode": 0 }, "tests": { "command": "bunx vitest run packages/sage/tests/store-helpers.test.ts", "exitCode": 0 } } } ```**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `closure over a later-declared let`
  - *How:* `net`
  - *How:* `'connection'`
  - *How:* `packages/sage/src/project-server.ts`
  - *How:* `createSlowOperationReporter(() => ({ pendingRequests, clients: clients.size }))`
  - *How:* `createHygieneRunner`
  - *How:* `isBusy`
  - *How:* `packages/sage/tests/project-server-maintenance.test.ts`
  - *How:* `packages/sage/tsconfig.json`
  - *How:* `packages/sage/src/memory-text.ts`
  - *How:* `packages/sage/tests/store-helpers.test.ts`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-18T00:07:18.271Z; skipped=8; skippedWins=8 -->
- **Always check markdown-renderer link components for URL-scheme validation (`javascript:` hrefs) before declaring a React UI XSS-clean — absence of `dangerouslySetInnerHTML` is not sufficient; VibeUI's `markdown-content.tsx` ArtifactLink renders agent-controlled hrefs verbatim while `provider-manager.tsx` already ships a `safeLoginUrl` allowlist pattern to reuse.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `javascript:`
  - *How:* `dangerouslySetInnerHTML`
  - *How:* `markdown-content.tsx`
  - *How:* `provider-manager.tsx`
  - *How:* `safeLoginUrl`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-18T00:38:09.992Z; skill=typescript-strict; skipped=7; skippedWins=7 -->
- **Always re-read co-modified vibeui files immediately before editing — `packages/vibeui/src/lib/use-session.ts` was rewritten by a peer mid-hunt (guarded `edit` refused with external-modification), turning confirmed findings into already-fixed ones; report externally-fixed findings as resolved with live line anchors instead of re-applying fixes. Adjudicate Chimera "file shape" claims (one-liner, missing EOF newline) with byte-level checks (`[System.IO.File]::ReadAllBytes(...)` last bytes) rather than rendered diffs — snapshots of actively co-modified trees are routinely stale. ```json { "verification_evidence": { "typecheck": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/vibeui/tsconfig.json", "exitCode": 0 }, "lint": { "command": "bunx biome check packages/vibeui/src/lib/use-session.ts", "exitCode": 0 }, "tests": { "command": "bunx vitest run packages/vibeui/tests/session.test.ts", "exitCode": 0 } } } ```**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `packages/vibeui/src/lib/use-session.ts`
  - *How:* `edit`
  - *How:* `[System.IO.File]::ReadAllBytes(...)`
  - *How:* `packages/vibeui/tsconfig.json`
  - *How:* `packages/vibeui/tests/session.test.ts`

---
*Last capture: 2026-10-19T10:54:05.353Z · 5 entries*
