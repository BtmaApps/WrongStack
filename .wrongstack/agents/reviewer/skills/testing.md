## Web UI Collaboration and Costs

- For a `stateFingerprint` change in `packages/webui-server/src/server/collab/session-registry.ts`, review the entire `packages/webui-server/src/server/collab/` package in the same pass, especially `broadcast-scheduler.ts` and `annotations.ts`. Trace the `stateFingerprint` comparison and `record()` path to confirm meaningful state changes still trigger while unchanged state does not over-trigger.
- For numeric normalization in `packages/webui-server/src/server/usage-cost.ts`, require the cache-price fallback to use `!= null`, not `||` or `??`, so an explicit `0` survives. Reconcile `CostRates` and `TokenUsage` with the four-key `toEqual` assertions in `packages/webui-server/tests/usage-cost.test.ts` and the four-key mock in `packages/webui-server/tests/server-runtime.test.ts`.

## CLI Process Output

- Before treating `expect(res.out).toBe(...)` in `packages/cli/tests/goal-commands-runcmd.test.ts` as decode coverage, compare the expected emitted size with `runCmd`’s `createTailBuffer` in `packages/cli/src/goal-commands.ts`. Only the last `MAX_CMD_OUTPUT` (`200_000`) characters are retained; treat an assertion beyond that cap as truncation coverage rather than a meaningful decode check.
- Return `json { "findings": [] }` only after these project-specific checks leave no defect.
