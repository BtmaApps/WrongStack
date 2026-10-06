## Co-modified adjudication

- Before changing a flagged file, make one live read and run the flagged covering test first. A pass against assertions just read as broken proves peer drift: reread, cite live lines, and do not patch. Then run `node node_modules/typescript/bin/tsc --noEmit --pretty false -p <package>/tsconfig.json`; a clean production typecheck over the flagged scope is decisive.
- Keep out-of-diff diagnostics separate: report exact `file:line` and rerun after peer work settles. For example, `packages/cli/src/goal-host.ts` references a `PhaseGraph` field absent from `packages/core/src/goal/types.ts`; do not let a failing `packages/cli/tsconfig.json` contaminate clean `packages/core/tsconfig.json` or `packages/runtime/tsconfig.json` results. Before calling deleted assertions lost coverage, search sibling tests; the MCP mismatch warn-and-throw contract is in `packages/mcp/tests/protocol-version-negotiation.test.ts`, not `packages/mcp/tests/authorization.test.ts`.

## Goal run controls

- Before restoring a “dropped” condition in `packages/webui-server/src/server/goal-ws-run-controls.ts`, falsify it by subsumption and write ordering: `(stopping && runPromise)` is covered by bare `runPromise`; `handleStop` sets `runStatus='stopped'` synchronously before clearing `runPromise`; therefore `startInFlight || runPromise || runStatus∈{running,paused}` remains closed.
- In `handleResumeGraph`, load the graph and throw on a missing id before `acquireGoalRunLease`/`acquireRunLease`; never let a bad id briefly hold the legacy lease or surface as `GoalRunLeaseBusyError`.
- When terminal persistence is gated by `host.releaseRunLease || wasStarting`, do not update `graph.runState` through an ungated parallel path.

## Contract pins

- Run the covering suite immediately after a cascade fix. Before changing a contradictory pin, use `git status --short` (`??`) and `git log --oneline -5 -- <test file>`; `??` with empty history identifies a coauthored stale pin.
- For `packages/core/tests/goal/phase-merge-verdict.test.ts`, preserve non-conflicting fixtures and add the contract for `packages/core/src/goal/phase-orchestrator-integration.ts`: `ok:false + conflict:true` keeps the phase `completed` and sets `integrationStatus: 'needs_review'` per `setIntegrationMetadata` in `packages/core/src/goal/phase-orchestrator-queries.ts`.
- Verify with `pnpm exec vitest run packages/core/tests/goal`, `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/core/tsconfig.json`, and `pnpm exec biome check --write packages/core/tests/goal/phase-merge-verdict.test.ts`.

## Focused verification

- After run-control changes, run `pnpm exec vitest run packages/webui-server/tests/goal-ws-handler.test.ts packages/webui-server/tests/goal-multiple-runs.integration.test.ts`, `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/webui-server/tsconfig.json`, and `pnpm exec biome check packages/webui-server/src/server/goal-ws-run-controls.ts`.
