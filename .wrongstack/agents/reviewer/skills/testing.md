## Web UI collaboration & cost tests (`packages/webui-server`)

- On any `stateFingerprint` diff in `packages/webui-server/src/server/collab/session-registry.ts`, read the entire `collab/` package in the same pass. Trace the `stateFingerprint` compare and `record()` path in `broadcast-scheduler.ts` and check the invariants in `annotations.ts`; the verdict depends on confirming the scheduler still detects a real state change and does not over-trigger on unchanged state.
- On numeric normalization in `packages/webui-server/src/server/usage-cost.ts`, require the cache-price fallback to use `!= null`, never `||` or `??`, so an explicit `0` price survives. Reconcile the declared `CostRates`/`TokenUsage` field count against both four-key enumerations: the `toEqual` assertions in `packages/webui-server/tests/usage-cost.test.ts` and the mock in `packages/webui-server/tests/server-runtime.test.ts` — any field added or removed must update both.

## CLI captured-output tests (`packages/cli`)

- Before crediting `expect(res.out).toBe(...)` in `packages/cli/tests/goal-commands-runcmd.test.ts` as decode-path coverage, compare the expected string size to the tail cap: `runCmd` retains only the last `MAX_CMD_OUTPUT` (`200_000`) chars via `createTailBuffer` in `packages/cli/src/goal-commands.ts`. An assertion spanning more than the cap is truncation coverage at best, vacuously failing at worst — flag it, don't wave it through.

## Output

- Emit `json { "findings": [] }` only after the checks above leave no defect; any hit goes into `findings` instead.
