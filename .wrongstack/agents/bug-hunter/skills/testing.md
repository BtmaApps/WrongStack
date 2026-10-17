## Core Review Checks

- Before patching Chimera recursion or missing-guard claims, run `git status --short -- <path>` and read the live cited lines in `packages/core/src/goal/mission-refinement.ts`; reviewer snapshots may lag co-modified files. Check whether `notify` already calls `opts?.onError?.(...)` and whether post-await checks cover both `opts?.signal?.aborted` and `timer.signal.aborted`. Run `pnpm exec vitest run packages/core/tests/goal/mission-refinement.test.ts`; report already-resolved findings rather than duplicating logic.
- For module-identity claims in `packages/core/tests/coordination/single-instance-mailbox.test.ts`, inspect `packages/core/src/coordination/single-instance-mailbox.ts`: `import * as fsp` with `fsp.readFile` property reads uses the builtin ESM namespace that `module.syncBuiltinESMExports()` updates from CJS mutations. Require an executed counterexample before rejecting this patching mechanism. Verify that missing the patch would fail `rejects.toMatchObject({ code: 'EBUSY' })` with “resolved instead of rejected.”
- Check pin provenance with `git status --short` and `git log --oneline -- <file>` before interpreting failures. Preserve committed contracts; do not assume an untracked regression pin defines intended behavior.
- Run `pnpm exec vitest run packages/core/tests/goal`, typecheck with `packages/core/tsconfig.json`, and run Biome over changed core sources and tests.

## Goal WebSocket

- Exercise acquire-vs-stop races in `packages/webui-server/src/server/goal-ws-run-controls.ts`: verify post-await stopping checks, local-lease cleanup, and stop persistence based on entry-time `startInFlight`. Verify that `acceptsGoal` in `packages/webui/src/hooks/ws-handlers/goal-handlers.ts` accepts keyless `goal.error`/`goal.stopped`, including without a graph.
- Run:
  - `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/webui/tsconfig.json`
  - `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/webui-server/tsconfig.json`
  - `pnpm exec biome check packages/webui/src/hooks/ws-handlers/goal-handlers.ts packages/webui-server/src/server/goal-ws-run-controls.ts`
  - `pnpm exec vitest run packages/webui-server/tests/goal-ws-handler.test.ts packages/webui-server/tests/goal-handlers.test.ts packages/webui-server/tests/goal-multiple-runs.integration.test.ts`
  - `pnpm --filter @wrongstack/webui exec vitest run tests/hooks/ws-handlers-misc-goal.test.ts tests/components/goal-view.test.tsx`

## CLI Teardown

- In `packages/cli/src/wiring/dep-watcher.ts`, test synchronous teardown registration before `multiAgentHost.spawn()` awaits, late director availability, and `withDirector: false`; `.then`-based registration can miss teardown.
- Run `pnpm exec vitest run packages/cli/tests/dep-watcher-wiring.test.ts packages/cli/tests/tech-stack-audit-session-end.test.ts packages/cli/tests/tech-stack-audit-survives-teardown.test.ts`.
