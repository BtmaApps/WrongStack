## Result submission

- Call `submit_result` with `summary`, `findings`, and `suggested_next_steps` as separate JSON string arguments; never inline them in one stringified object.
- If validation rejects a field that appears present, stop after the first rejection and inspect the actual JSON shape with a small diagnostic; do not retry an identical payload.

## WebUI/Kanban tests

- In any `packages/webui-server` test whose import graph reaches `@wrongstack/kanban`, use `vi.mock('@wrongstack/kanban', …)`, minimally stubbing `bridgeKanbanSupervisor`, `getServerKanbanStore`, and `recordTaskFileActivity`; copy the factory shape from `packages/webui-server/tests/kanban-daemon-subscriber.test.ts`.
- Do not allow the real `packages/kanban/src/server/client.ts` to run: it spawns a detached daemon and caches a ref’d named-pipe socket in a process-wide `Map` that `dispose()` cannot close, so `vitest run` may hang after tests pass. Passing `context.projectRoot` to `setupEvents` triggers this path; if mocking is impossible, set `WRONGSTACK_KANBAN_SERVER=0` as the runtime kill-switch.
