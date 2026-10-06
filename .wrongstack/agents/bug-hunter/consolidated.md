# Bug-Hunter Agent Instructions

## Adjudication Standard

- Treat every review finding, proposed patch, and retraction as a hypothesis. Validate it against the literal live source, complete producer-to-consumer flow, covering tests, relevant git history, and explicit owner policy before editing.
- Immediately before citing or changing a file, reread it and inspect `git status --short -- <path>` plus `git diff -- <path>`; include untracked and unstaged work. Preserve changes that already resolve the finding, and finish only residual cleanup in a partially applied refactor.
- Never inherit a reviewer’s line citation through a truncated or stale read. If the cited region was not inspected, mark the claim unverified; if the live file already handles it, report it resolved rather than patching duplicate logic.
- Falsify missing-module, missing-export, duplicate-identifier, and undeclared-identifier claims with a package-wide symbol search, every relevant import/declaration, and a package typecheck. A clean typecheck is decisive for that compile claim and checked scope, not for runtime behavior.
- Respect explicit ownership. If edits are prohibited, provide live read-only evidence and stop; do not change peer-owned diagnostics merely to make the local command green.

## Concurrent Work

- After any “file was modified externally” notification, stop editing from the stale snapshot, reread the file, and re-anchor replacements to the current contents. Preserve settled peer bodies verbatim.
- On a co-modified tree, report diagnostics outside the reviewed changed-file list separately with exact coordinates. Do not absorb peer failures into the local verdict.
- Changing test counts, diagnostics, or failures during verification indicates an unstable snapshot. Check exact paths with `git status --short`, let peers settle, then rerun and verify the final tree for stale imports, call arity, unused parameters, and formatting.

## Tests and Verification

- Run `pnpm exec vitest run <flagged files>` from the repository root before accepting deterministic broken-test claims, then rerun the covering suite immediately after a fix. Discover coverage with both `.test.ts` and `.test.tsx` searches.
- Establish test provenance with `git status --short` and `git log --oneline -5 -- <test file>`. Committed pins and explicit owner policy outrank reviewer expectations; an untracked `??` test with no history is a co-authored stale pin. When updating it, preserve unaffected assertions verbatim and add a dedicated regression for the restored contract.
- Run `node node_modules/typescript/bin/tsc --noEmit --pretty false -p <package>/tsconfig.json`; use `packages/core/tsconfig.test.json` for core test typing. Keep clean-scope evidence distinct from unrelated runtime behavior.
- Use `pnpm exec biome check <file>` for scoped linting and `pnpm exec biome check --write <file>` only for necessary formatting. Investigate the earliest diagnostic in parse-error cascades; later errors may be fallout. Never pass an arbitrary arrow-function predicate to Vitest 5 `toThrow`; use `toThrow(/pattern/)` or explicit `try`/`catch` assertions.

## Race and State-Transition Checks

- Before reporting a guard hole, test semantic subsumption and write ordering, then construct a counterexample using actual suspension points. An async call is not asynchronous merely because it returns a promise, and a function with no `await` runs synchronously through its body.
- In resume/start flows, validate cheap existence conditions before acquiring leases: load the graph and reject a missing id before `acquireGoalRunLease` or `acquireRunLease`, so invalid input cannot briefly hold a lease or mask not-found as `GoalRunLeaseBusyError`.
- Acquire a run lease into a local variable, recheck `!host.stopping` immediately after the last await and directly before assigning `host.releaseRunLease`, then clear the local and release it in `finally`. `releaseActiveRunLease` cannot release a lease that was never handed off.
- In `handleStop`, capture `startInFlight` at entry and use it to gate terminal-state persistence rather than consulting the lease field. When persistence is deliberately gated, do not retain an ungated parallel mutation such as `graph.runState`, which can desynchronize memory from disk.
- Any synchronous listener gated by teardown-registry membership requires synchronous registration. In `packages/cli/src/wiring/dep-watcher.ts`, insert a deferred placeholder before awaiting `multiAgentHost.spawn()`, then adopt the real `director.awaitTasks([...])` completion; gate the placeholder on `getDirector?.()` at queue time and track directly if a director appears only after spawn.

## Project-Specific Contracts

- When adjudicating goal stop-event races, verify the live synchronous prefix of `onGoalStop` in `packages/cli/src/goal-host.ts`: `runState = 'stopped'` and `stopped.unsubscribe()` occur before the first `await`, preventing later events from reaching `onDone` or `onFailed`. For workspace findings, inspect `prepareGoalWorkspace` under `packages/core/src/goal/` and the `await isGitWorkTree(runRoot)` gate in `packages/webui-server/src/server/goal-run.ts` before proposing another guard.
- In `acceptsGoal` at `packages/webui/src/hooks/ws-handlers/goal-handlers.ts`, accept keyless payloads before applying goal-id selection. Keyless `goal.error` and `goal.stopped` events are valid broadcasts, including when `host.graph` is null.
- Distinguish goal merge outcomes: hard failures call `markPhaseMergeFailed`, while an unresolved conflict (`ok: false`, `conflict: true`) parks and continues with phase `completed` and `integrationStatus: 'needs_review'` through `setIntegrationMetadata` in `packages/core/src/goal/phase-orchestrator-queries.ts`.
- In `packages/core/src/goal/phase-task-execution.ts`, bound post-timeout settlement with `Promise.race` and an unref’d five-second grace period; no lease mechanism supports an unbounded wait. Record fulfilled tasks as completed even when `host.stopped` is true. Verify with `pnpm exec vitest run packages/core/tests/goal`.
- A `Tool` gate in `packages/core/src/sandbox/wrap.ts` must fail closed in both `execute` and `executeStream`. Resolve policy per call with `resolveSandboxConfigForAgent(ctx?.agentId)` so tightened per-agent overrides are honored.
- Preserve mutate-then-`appendHistory` ordering and the fresh under-lock read around `generateSuggestions` in `packages/requirement-intake/src/service.ts`; an outside-callback pre-`await` read reintroduces phantom-history TOCTOU.
- Before accepting an MCP registry slot diagnostic, verify `attemptConnectSlot` clears `slot.protocolVersionRefusal` before suspension, post-generation writes are blocked by `!isCurrent() || state === 'disconnected'`, and `stop()` increments the generation before clearing `connecting`.
- Reentrant cleanup in `packages/plugin-sdk/src/runtime/h1-state.ts` must track released callback identities in a `Set`, remove stale slots on `break`, and test exact invocation counts. Proxy delegation in `packages/vector-memory/src/sage-port-wrapper.ts` must preserve fluent returns with `result === target ? delegated : result`.
- Inspect `packages/core/src/kernel/events/*.ts` before declaring an event field missing. Lease fencing in `packages/kanban/src/manager/lifecycle/definition-of-done.ts` must compare against live `task.assignment`, not the report’s own lease.
- Validate transformed fixtures against equivalently transformed expectations. UTF-8 byte-bound truncation in `packages/core/src/chronicle/tool-adapter.ts` must remove dangling lead and continuation bytes while preserving decoded validity and the byte budget.