## Core Review Checks

- Check pin provenance with `git status --short` and `git log --oneline -- <file>` before interpreting failures. Preserve committed contracts; do not assume an untracked regression pin defines intended behavior.
- Run `bun --bun run vitest run packages/core/tests/goal`, typecheck with `packages/core/tsconfig.json`, and run Biome over changed core sources and tests.

## Goal WebSocket

- Exercise acquire-vs-stop races in `packages/webui-server/src/server/goal-ws-run-controls.ts`: verify post-await stopping checks, local-lease cleanup, and stop persistence based on entry-time `startInFlight`. Verify that `acceptsGoal` in `packages/webui/src/hooks/ws-handlers/goal-handlers.ts` accepts keyless `goal.error`/`goal.stopped`, including without a graph.
- Run:
  - `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/webui/tsconfig.json`
  - `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/webui-server/tsconfig.json`
  - `bunx biome check packages/webui/src/hooks/ws-handlers/goal-handlers.ts packages/webui-server/src/server/goal-ws-run-controls.ts`
  - `bun --bun run vitest run packages/webui-server/tests/goal-ws-handler.test.ts packages/webui-server/tests/goal-handlers.test.ts packages/webui-server/tests/goal-multiple-runs.integration.test.ts`
  - `bun --bun run vitest run packages/webui/tests/hooks/ws-handlers-misc-goal.test.ts packages/webui/tests/components/goal-view.test.tsx`

## CLI Teardown

- In `packages/cli/src/wiring/dep-watcher.ts`, test synchronous teardown registration before `multiAgentHost.spawn()` awaits, late director availability, and `withDirector: false`; `.then`-based registration can miss teardown.
- Run `bun --bun run vitest run packages/cli/tests/dep-watcher-wiring.test.ts packages/cli/tests/tech-stack-audit-session-end.test.ts packages/cli/tests/tech-stack-audit-survives-teardown.test.ts`.
