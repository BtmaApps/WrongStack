## Goal run controls

- Before restoring a “dropped” guard in `packages/webui-server/src/server/goal-ws-run-controls.ts`, falsify it by subsumption and write ordering: `(stopping && runPromise)` is covered by bare `runPromise`; `handleStop` sets `runStatus='stopped'` synchronously before clearing `runPromise`, so `startInFlight || runPromise || runStatus∈{running,paused}` remains closed.
- In `handleResumeGraph`, load the graph and throw on a missing id before `acquireGoalRunLease`/`acquireRunLease`; never let an invalid id hold the legacy lease or surface as `GoalRunLeaseBusyError`.
- When terminal persistence is gated by `host.releaseRunLease || wasStarting`, never mutate `graph.runState` through an ungated parallel path.
- After run-control changes, run `pnpm exec vitest run packages/webui-server/tests/goal-ws-handler.test.ts packages/webui-server/tests/goal-multiple-runs.integration.test.ts`, `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/webui-server/tsconfig.json`, and `pnpm exec biome check packages/webui-server/src/server/goal-ws-run-controls.ts`.

## Co-modified adjudication

- Before acting on a duplicate-identifier or compile-failure claim, read the flagged file live and run `node node_modules/typescript/bin/tsc --noEmit --pretty false -p <package>/tsconfig.json` without editing. A clean production typecheck over the flagged scope is decisive; reread current assertions and treat contradictory prose such as “the original block is gone” as a likely false positive.
- Keep out-of-diff diagnostics separate: report exact `file:line` and rerun after peer work settles. For example, `packages/cli/src/goal-host.ts` referencing `leaseScope` absent from `PhaseGraph` in `packages/core/src/goal/types.ts` must not contaminate clean `packages/core/tsconfig.json` or `packages/runtime/tsconfig.json` results.

## Contract pins

- Run the covering suite immediately after a review-cascade fix. Before reverting a contradictory pin, inspect `git status --short` (`??`) and `git log --oneline -5 -- <test file>`; `??` with empty history identifies a coauthored stale pin.
- For `packages/core/tests/goal/phase-merge-verdict.test.ts`, preserve non-conflicting fixtures and pin `packages/core/src/goal/phase-orchestrator-integration.ts`: unresolved conflict `ok:false + conflict:true` keeps the phase `completed` and sets `integrationStatus: 'needs_review'` per `setIntegrationMetadata` in `packages/core/src/goal/phase-orchestrator-queries.ts`.
- Verify with `pnpm exec vitest run packages/core/tests/goal`, `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/core/tsconfig.json`, and `pnpm exec biome check --write <test file>`.
