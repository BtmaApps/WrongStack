## Result Submission

- Populate `submit_result` with `summary`, `findings`, and `suggested_next_steps` as separate JSON string arguments; never combine them inside one stringified object.
- If validation rejects fields that appear to be present, stop after the first rejection and inspect the actual emitted JSON shape with a minimal diagnostic. Do not retry an unchanged payload.

## Verification Integrity

- Claim executed verification only when the relevant command was actually run successfully. A static diagnosis is not a reproduction or test result.
- If `bash`, `exec`, `test`, or `typecheck` is unavailable, explicitly report the capability denial and hand off the exact command needed for verification. Never add a forced-exit mask or other override merely to make an unrun command appear to pass.

## Vitest Mock Typing

- Explicitly annotate a hoisted Vitest mock factory’s return type when later calls to `mockReturnValue` or `mockResolvedValue` provide a richer value; otherwise, Vitest’s inferred factory type can cause TS2345 or TS2322 errors.
- Use `vi.fn((): any => null)` rather than `vi.fn(() => null)` for a synchronous nullable mock.
- Use `vi.fn(async (): Promise<any> => null)` rather than `vi.fn(async () => null)` for a single-value async mock.
- Use `vi.fn(async (): Promise<any[]> => [])` rather than `vi.fn(async () => [])` for an async array mock; the unannotated form infers `never[]`.
- This pattern is especially relevant to the slash-command tests in `packages/cli/tests/kanban-slash-coverage.test.ts` and `packages/cli/tests/memory-slash-coverage.test.ts`.

## WebUI Kanban Test Isolation

- In every `packages/webui-server` test whose import graph reaches `@wrongstack/kanban`, mock it with `vi.mock('@wrongstack/kanban', …)`.
- The mock should minimally stub `bridgeKanbanSupervisor`, `getServerKanbanStore`, and `recordTaskFileActivity`. Copy the factory shape from `packages/webui-server/tests/kanban-daemon-subscriber.test.ts`.
- Do not rely on per-test `dispose()` to isolate this dependency. The real client in `packages/kanban/src/server/client.ts` can spawn a detached daemon and retain a referenced named-pipe socket in a process-wide cache, causing `vitest run` to hang even after every test passes.
- Passing `context.projectRoot` into `setupEvents` can trigger this path. If mocking is impossible, use `WRONGSTACK_KANBAN_SERVER=0` as the runtime kill-switch.

## Vitest Hang Diagnosis

- When `vitest run` hangs after all tests pass, inspect the test file’s static import graph for resources that outlive per-test `dispose()`, especially module-level connection caches and fire-and-forget asynchronous connects.
- Check for connects that race synchronous disposal: teardown may set a disposed flag while an in-flight connection succeeds, returns early, and leaves a socket cached.
- Before blaming Vitest configuration or shared teardown, run sibling test files individually and confirm whether they exit normally. Use that comparison to distinguish file-local handle leaks from harness-wide causes.

## Test-Side Type-Drift Verification

- Do not determine success from raw `tsc -p <pkg>/tsconfig.test.json` output; it includes accepted baseline diagnostics unrelated to the current change.
- Run `node scripts/check-test-typecheck.mjs --report-only --json` and inspect only the baseline-compared `newDiagnostics` array.
- Filter `newDiagnostics` by the `file` prefix or paths touched by the current task. Leave raw `tsc` diagnostics absent from `newDiagnostics` untouched as baseline noise.