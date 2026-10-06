## Goal WebSocket

- Close acquire-vs-stop races by mirroring `handleResumeGraph` in `packages/webui-server/src/server/goal-ws-run-controls.ts`: acquire into a local, re-check `!host.stopping` after the last `await`, then use `if (!host.stopping) { host.releaseRunLease = local; local = undefined; }`; release the local in `finally`. Capture `startInFlight` at `handleStop` entry and gate stop-side terminal-state persistence on it, not the lease field, so mid-acquire stops persist and idle clears cannot clobber completed graphs.
- In `acceptsGoal` (`packages/webui/src/hooks/ws-handlers/goal-handlers.ts`), accept keyless payloads before selection filtering. `packages/webui-server/src/server/goal-ws-run-controls.ts` and `goal-run.ts` legitimately emit keyless `goal.error`/`goal.stopped`, including when `host.graph` is null.
- Validate with:
  - `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/webui/tsconfig.json`
  - `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/webui-server/tsconfig.json`
  - `pnpm exec biome check packages/webui/src/hooks/ws-handlers/goal-handlers.ts packages/webui-server/src/server/goal-ws-run-controls.ts`
  - `pnpm exec vitest run packages/webui-server/tests/goal-ws-handler.test.ts packages/webui-server/tests/goal-handlers.test.ts packages/webui-server/tests/goal-multiple-runs.integration.test.ts`
  - `pnpm --filter @wrongstack/webui exec vitest run tests/hooks/ws-handlers-misc-goal.test.ts tests/components/goal-view.test.tsx`

## Core Goal Regression Pins

- Before treating a failing pin as evidence against a fix, run `git status --short` and `git log --oneline -- <file>`. Treat committed pins as contracts and revert violating fixes; rewrite untracked pins written alongside the change, such as `packages/core/tests/goal/phase-controls-regression.test.ts`, to preserve hard failures → `markPhaseMergeFailed` in `packages/core/src/goal/phase-orchestrator-integration.ts` and conflict → park-and-continue, retaining unaffected assertions verbatim.
- In `packages/core/src/goal/phase-task-execution.ts`, bound post-timeout settling with `Promise.race` and an unref’d 5 s grace; record fulfilled tasks as completed even when `host.stopped` is true.
- Run `pnpm exec vitest run packages/core/tests/goal`, the `packages/core/tsconfig.json` typecheck, and Biome over the changed core source and pin.

## CLI Teardown

- Make teardown-registry membership synchronous in `packages/cli/src/wiring/dep-watcher.ts`: before awaiting `multiAgentHost.spawn()`, register a deferred placeholder only when `getDirector?.()` succeeds, then resolve it into the real `director.awaitTasks([...])` completion. Avoid `.then`-based registration; if a director appears only after spawn, track directly. Preserve the `withDirector: false` contract and run `pnpm exec vitest run packages/cli/tests/dep-watcher-wiring.test.ts packages/cli/tests/tech-stack-audit-session-end.test.ts packages/cli/tests/tech-stack-audit-survives-teardown.test.ts`.
