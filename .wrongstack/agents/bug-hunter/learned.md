# Learned instructions for `bug-hunter`

> Project-specific learning data for the `bug-hunter` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T19:51:09.300Z; skill=typescript-strict; applied=4; wins=4 -->
- **- Always falsify guard-coverage findings by subsumption and write ordering before restoring "dropped" conditions: in `packages/webui-server/src/server/goal-ws-run-controls.ts`, `(stopping && runPromise)` is subsumed by the bare `runPromise` check, and `handleStop` sets `runStatus='stopped'` synchronously before clearing `runPromise`, so no stop/start interleaving escapes the `startInFlight || runPromise || runStatus∈{running,paused}` guard. - Order cheap existence validation before lease/lock acquisition in resume flows like `handleResumeGraph`: load the graph, throw on missing id, then call `acquireGoalRunLease`/`acquireRunLease` — a bad id must never briefly hold the legacy lease or mask not-found as `GoalRunLeaseBusyError`. - When a terminal-state persistence is deliberately gated (e.g. `host.releaseRunLease || wasStarting` in `handleStop`), never leave a parallel *ungated* in-memory mutation of the same field (`graph.runState`) — it desyncs memory from disk exactly when the gate was added to prevent clobbering. ```json { "verification_evidence": { "typecheck": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/webui-server/tsconfig.json", "exitCode": 0 }, "lint": { "command": "pnpm exec biome check packages/webui-server/src/server/goal-ws-run-controls.ts", "exitCode": 0 }, "tests": { "command": "pnpm exec vitest run packages/webui-server/tests/goal-ws-handler.test.ts packages/webui-server/tests/goal-multiple-runs.integration.test.ts", "exitCode": 0 } } } ```**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/webui-server/src/server/goal-ws-run-controls.ts`
  - *How:* `(stopping && runPromise)`
  - *How:* `runPromise`
  - *How:* `handleStop`
  - *How:* `runStatus='stopped'`
  - *How:* `startInFlight || runPromise || runStatus∈{running,paused}`
  - *How:* `handleResumeGraph`
  - *How:* `acquireGoalRunLease`
  - *How:* `acquireRunLease`
  - *How:* `GoalRunLeaseBusyError`
  - *How:* `host.releaseRunLease || wasStarting`
  - *How:* `graph.runState`
  - *How:* `packages/webui-server/tsconfig.json`
  - *How:* `packages/webui-server/tests/goal-ws-handler.test.ts`
  - *How:* `packages/webui-server/tests/goal-multiple-runs.integration.test.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T18:33:07.591Z; skill=bug-hunter; applied=6; wins=6; skipped=3; skippedWins=3 -->
- **Adjudicate stale-event race findings against the stop handler's synchronous prefix: in `packages/cli/src/goal-host.ts` `onGoalStop`, `runState = 'stopped'` and `stopped.unsubscribe()` both run before the first `await`, so post-stop bus events cannot reach `onDone`/`onFailed` — and a reviewer claiming stop "no longer unsubscribes" read a stale snapshot, so re-read the live file before accepting any of their adjacent findings. Never inherit a reviewer's line citations through a truncated read: if the artifact omitted the cited region, report the finding unverified instead of editing; for goal-run workspace findings, first read `prepareGoalWorkspace` in `packages/core/src/goal/` and check `await isGitWorkTree(runRoot)` gating at `packages/webui-server/src/server/goal-run.ts` before guarding. ```json { "verification_evidence": { "git-status": { "command": "git status -- packages/cli/src/goal-host.ts packages/core/src/goal/phase-orchestrator.ts packages/core/src/goal/types.ts packages/webui-server/src/server/goal-run.ts packages/webui/src/components/GoalView.tsx packages/webui/src/stores/goal-run-store.ts", "exitCode": 0 } } } ```**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/cli/src/goal-host.ts`
  - *How:* `onGoalStop`
  - *How:* `runState = 'stopped'`
  - *How:* `stopped.unsubscribe()`
  - *How:* `await`
  - *How:* `onDone`
  - *How:* `onFailed`
  - *How:* `prepareGoalWorkspace`
  - *How:* `packages/core/src/goal/`
  - *How:* `await isGitWorkTree(runRoot)`
  - *How:* `packages/webui-server/src/server/goal-run.ts`
  - *How:* `packages/core/src/goal/phase-orchestrator.ts`
  - *How:* `packages/core/src/goal/types.ts`
  - *How:* `packages/webui/src/components/GoalView.tsx`
  - *How:* `packages/webui/src/stores/goal-run-store.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T18:43:48.083Z; skill=typescript-strict; applied=2; wins=2; skipped=6; skippedWins=6 -->
- **Always adjudicate duplicate-identifier / compile-failure review claims with a single live read of the flagged file plus `node node_modules/typescript/bin/tsc --noEmit --pretty false -p <package>/tsconfig.json` before touching anything — a clean production typecheck over the flagged scope is decisive falsification, and reviewers' self-contradictory prose ("the original block is gone") is a strong false-positive signal. On a co-modified tree, typecheck errors at coordinates outside the review's changed-file list (e.g. `packages/cli/src/goal-host.ts` referencing a `PhaseGraph` field that does not exist in `packages/core/src/goal/types.ts`) are peer in-flight work: report with exact file:line, never absorb into your own verification verdict. ```json { "verification_evidence": { "typecheck": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/core/tsconfig.json", "exitCode": 0 }, "typecheck_runtime": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/runtime/tsconfig.json", "exitCode": 0 }, "typecheck_cli": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/cli/tsconfig.json", "exitCode": 1, "note": "Pre-existing peer in-flight failure in packages/cli/src/goal-host.ts:349,397 (leaseScope not on PhaseGraph) — outside the reviewed diff; no edits were made by this pass" }, "lint": { "command": "pnpm exec biome check packages/core/src/goal/types.ts packages/cli/src/fleet/host-subagent-factory.ts packages/core/src/goal/phase-orchestrator.ts packages/core/src/goal/phase-store.ts packages/runtime/src/project-permission-policy.ts packages/core/src/security/directory-permission-policy.ts", "exitCode": 1, "note": "4 format/import-sort diagnostics in peer-owned goal files (content drifted mid-run from concurrent edits); no formatter writes applied" }, "tests": { "command": "pnpm exec vitest run packages/core/tests/goal", "exitCode": 0, "note": "15 files, 148/148 tests passed" } } } ```**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `node node_modules/typescript/bin/tsc --noEmit --pretty false -p <package>/tsconfig.json`
  - *How:* `packages/cli/src/goal-host.ts`
  - *How:* `PhaseGraph`
  - *How:* `packages/core/src/goal/types.ts`
  - *How:* `packages/core/tsconfig.json`
  - *How:* `packages/runtime/tsconfig.json`
  - *How:* `packages/cli/tsconfig.json`
  - *How:* `packages/cli/src/fleet/host-subagent-factory.ts`
  - *How:* `packages/core/src/goal/phase-orchestrator.ts`
  - *How:* `packages/core/src/goal/phase-store.ts`
  - *How:* `packages/runtime/src/project-permission-policy.ts`
  - *How:* `packages/core/src/security/directory-permission-policy.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T19:47:34.045Z; skill=testing; applied=5; wins=5 -->
- **Close acquire-vs-stop races by mirroring the local-lease pattern already used in `handleResumeGraph` in `packages/webui-server/src/server/goal-ws-run-controls.ts`: acquire into a local, transfer to the host field only when `!host.stopping`, and release the local in the finally — and gate stop-side terminal-state persistence on `startInFlight` captured at `handleStop` entry, not on the lease field, so a stop landing mid-acquire still persists while idle clears don't clobber completed graphs. ```json { "verification_evidence": { "typecheck": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/webui/tsconfig.json", "exitCode": 0 }, "typecheck_server": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/webui-server/tsconfig.json", "exitCode": 0 }, "lint": { "command": "pnpm exec biome check packages/webui/src/hooks/ws-handlers/goal-handlers.ts packages/webui-server/src/server/goal-ws-run-controls.ts", "exitCode": 0 }, "tests": { "command": "pnpm exec vitest run packages/webui-server/tests/goal-ws-handler.test.ts packages/webui-server/tests/goal-handlers.test.ts packages/webui-server/tests/goal-multiple-runs.integration.test.ts", "exitCode": 0 }, "tests_client": { "command": "pnpm --filter @wrongstack/webui exec vitest run tests/hooks/ws-handlers-misc-goal.test.ts tests/components/goal-view.test.tsx", "exitCode": 0 } } } ```**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `handleResumeGraph`
  - *How:* `packages/webui-server/src/server/goal-ws-run-controls.ts`
  - *How:* `!host.stopping`
  - *How:* `startInFlight`
  - *How:* `handleStop`
  - *How:* `packages/webui/tsconfig.json`
  - *How:* `packages/webui-server/tsconfig.json`
  - *How:* `packages/webui/src/hooks/ws-handlers/goal-handlers.ts`
  - *How:* `packages/webui-server/tests/goal-ws-handler.test.ts`
  - *How:* `packages/webui-server/tests/goal-handlers.test.ts`
  - *How:* `packages/webui-server/tests/goal-multiple-runs.integration.test.ts`
  - *How:* `tests/hooks/ws-handlers-misc-goal.test.ts`
  - *How:* `tests/components/goal-view.test.tsx`
  - *How:* `@wrongstack/webui`

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T18:58:24.600Z; skill=testing; applied=1; wins=1; skipped=5; skippedWins=5 -->
- **Never treat a failing post-fix test as evidence the fix is wrong until `git status --short` and `git log --oneline -- <file>` have established whether the test is a committed repository contract or an untracked pin authored with the change under review — committed pins outrank reviewer expectations and warrant reverting the fix; untracked pins are stale and get rewritten to pin both the preserved behavior (hard failures → `markPhaseMergeFailed` in `packages/core/src/goal/phase-orchestrator-integration.ts`) and the restored contract (conflict → park-and-continue), keeping original assertions for unaffected fixtures verbatim. ```json { "verification_evidence": { "typecheck": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/core/tsconfig.json", "exitCode": 0 }, "lint": { "command": "pnpm exec biome check packages/core/src/goal/phase-orchestrator-integration.ts packages/core/tests/goal/phase-merge-verdict.test.ts", "exitCode": 0 }, "tests": { "command": "pnpm exec vitest run packages/core/tests/goal", "exitCode": 0 } } } ```**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `git status --short`
  - *How:* `git log --oneline -- <file>`
  - *How:* `markPhaseMergeFailed`
  - *How:* `packages/core/src/goal/phase-orchestrator-integration.ts`
  - *How:* `packages/core/tsconfig.json`
  - *How:* `packages/core/tests/goal/phase-merge-verdict.test.ts`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T18:20:12.776Z; skill=testing; applied=3; wins=3; skipped=7; skippedWins=7 -->
- **Always check whether pinning tests are untracked (`git status --short`) before treating them as repository contracts during a review-cascade fix — untracked tests written alongside the change under review (e.g. `packages/core/tests/goal/phase-controls-regression.test.ts`) are stale pins to update with the source, not evidence of intentional policy. In `packages/core/src/goal/phase-task-execution.ts`, keep the post-timeout settle wait bounded (`Promise.race` with an unref'd 5 s grace — there is no lease mechanism backing an unbounded wait) and record fulfilled tasks as completed even when `host.stopped` is true; verify with `pnpm exec vitest run packages/core/tests/goal`. ```json { "verification_evidence": { "typecheck": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/core/tsconfig.json", "exitCode": 0 }, "lint": { "command": "pnpm exec biome check packages/core/src/goal/phase-task-execution.ts packages/core/tests/goal/phase-controls-regression.test.ts", "exitCode": 0 }, "tests": { "command": "pnpm exec vitest run packages/core/tests/goal", "exitCode": 0 } } } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `git status --short`
  - *How:* `packages/core/tests/goal/phase-controls-regression.test.ts`
  - *How:* `packages/core/src/goal/phase-task-execution.ts`
  - *How:* `Promise.race`
  - *How:* `host.stopped`
  - *How:* `pnpm exec vitest run packages/core/tests/goal`
  - *How:* `packages/core/tsconfig.json`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T18:58:24.600Z; skill=typescript-strict; applied=1; wins=1; skipped=5; skippedWins=5 -->
- **Always run the covering suite immediately after a review-cascade fix, and when a test pins the behavior you just corrected, decide contract-vs-stale-pin from git provenance before reverting: `git status --short` (untracked `??`) plus `git log --oneline -5 -- <test file>` (empty history) proves the pin was written alongside the change under review and is a stale pin to update with the source — as with `packages/core/tests/goal/phase-merge-verdict.test.ts` for the goal merge-verdict guard in `packages/core/src/goal/phase-orchestrator-integration.ts`. When updating such a pin, preserve the non-conflicting fixtures' assertions verbatim and add a dedicated case pinning the documented contract (unresolved conflict `ok:false + conflict:true` → phase stays `completed`, `integrationStatus: 'needs_review'` per `setIntegrationMetadata` in `packages/core/src/goal/phase-orchestrator-queries.ts`), then verify with `pnpm exec vitest run packages/core/tests/goal`, `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/core/tsconfig.json`, and `pnpm exec biome check --write <test file>` for residual formatting.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `git status --short`
  - *How:* `??`
  - *How:* `git log --oneline -5 -- <test file>`
  - *How:* `packages/core/tests/goal/phase-merge-verdict.test.ts`
  - *How:* `packages/core/src/goal/phase-orchestrator-integration.ts`
  - *How:* `ok:false + conflict:true`
  - *How:* `completed`
  - *How:* `integrationStatus: 'needs_review'`
  - *How:* `setIntegrationMetadata`
  - *How:* `packages/core/src/goal/phase-orchestrator-queries.ts`
  - *How:* `pnpm exec vitest run packages/core/tests/goal`
  - *How:* `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/core/tsconfig.json`
  - *How:* `pnpm exec biome check --write <test file>`
  - *How:* `packages/core/tsconfig.json`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T19:47:34.045Z; skill=testing; applied=5; wins=5 -->
- **When a client-side routing gate like `acceptsGoal` in `packages/webui/src/hooks/ws-handlers/goal-handlers.ts` filters ws payloads by a key, treat payloads with NO routing key as broadcast-scope and accept them before the selection check — server producers in `packages/webui-server/src/server/goal-ws-run-controls.ts` and `goal-run.ts` legitimately emit keyless `goal.error`/`goal.stopped` (and `host.graph` can be null, leaving no id to stamp), so keyless ≠ misrouted.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `acceptsGoal`
  - *How:* `packages/webui/src/hooks/ws-handlers/goal-handlers.ts`
  - *How:* `packages/webui-server/src/server/goal-ws-run-controls.ts`
  - *How:* `goal-run.ts`
  - *How:* `goal.error`
  - *How:* `goal.stopped`
  - *How:* `host.graph`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T19:56:12.236Z; skill=testing; applied=3; wins=3 -->
- **When mirroring a guarded lease handoff (`if (!host.stopping) { host.releaseRunLease = local; local = undefined; }`), place the re-check immediately before the handoff — after the *last* await — not merely after acquisition; any setup awaits between acquire and handoff reopen the stranding window because the release helper (`releaseActiveRunLease` in `packages/webui-server/src/server/goal-ws-handler.ts`) can only release what has already been handed to `host.releaseRunLease`. Verify the closed window with `pnpm exec vitest run packages/webui-server/tests/goal-ws-handler.test.ts packages/webui-server/tests/goal-multiple-runs.integration.test.ts`. ```json { "verification_evidence": { "typecheck": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/webui-server/tsconfig.json", "exitCode": 0 }, "lint": { "command": "pnpm exec biome check packages/webui-server/src/server/goal-ws-run-controls.ts", "exitCode": 0 }, "tests": { "command": "pnpm exec vitest run packages/webui-server/tests/goal-ws-handler.test.ts packages/webui-server/tests/goal-multiple-runs.integration.test.ts", "exitCode": 0 } } } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `if (!host.stopping) { host.releaseRunLease = local; local = undefined; }`
  - *How:* `releaseActiveRunLease`
  - *How:* `packages/webui-server/src/server/goal-ws-handler.ts`
  - *How:* `host.releaseRunLease`
  - *How:* `packages/webui-server/tests/goal-ws-handler.test.ts`
  - *How:* `packages/webui-server/tests/goal-multiple-runs.integration.test.ts`
  - *How:* `packages/webui-server/tsconfig.json`
  - *How:* `packages/webui-server/src/server/goal-ws-run-controls.ts`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-05T17:33:47.860Z; skill=testing; applied=2; wins=2; skipped=10; skippedWins=10 -->
- **Always make teardown-registry membership synchronous when a synchronous event listener gates on it: in `packages/cli/src/wiring/dep-watcher.ts`, register a deferred placeholder into the tracked set before awaiting `multiAgentHost.spawn()`, then resolve it into (adopt) the real `director.awaitTasks([...])` completion — a `.then`-based registration leaves the set empty for the whole pending-spawn window. Before choosing *unconditional* placeholder registration, run the covering degradation tests (`pnpm exec vitest run packages/cli/tests/tech-stack-audit-session-end.test.ts`): pinned contracts like "no director → register nothing" (`withDirector: false` harness) require gating the placeholder on `getDirector?.()` at queue time and tracking directly if a director appears only after spawn. ```json { "verification_evidence": { "typecheck": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/cli/tsconfig.json", "exitCode": 0 }, "lint": { "command": "pnpm exec biome check packages/cli/src/wiring/dep-watcher.ts", "exitCode": 0 }, "tests": { "command": "pnpm exec vitest run packages/cli/tests/dep-watcher-wiring.test.ts packages/cli/tests/tech-stack-audit-session-end.test.ts packages/cli/tests/tech-stack-audit-survives-teardown.test.ts", "exitCode": 0 } } } ```**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `packages/cli/src/wiring/dep-watcher.ts`
  - *How:* `multiAgentHost.spawn()`
  - *How:* `director.awaitTasks([...])`
  - *How:* `.then`
  - *How:* `pnpm exec vitest run packages/cli/tests/tech-stack-audit-session-end.test.ts`
  - *How:* `withDirector: false`
  - *How:* `getDirector?.()`
  - *How:* `packages/cli/tests/tech-stack-audit-session-end.test.ts`
  - *How:* `packages/cli/tsconfig.json`
  - *How:* `packages/cli/tests/dep-watcher-wiring.test.ts`
  - *How:* `packages/cli/tests/tech-stack-audit-survives-teardown.test.ts`

---
*Last capture: 2026-10-05T19:56:12.236Z · 10 entries*
