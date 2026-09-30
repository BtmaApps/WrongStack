## `packages/webui-server` — collab and cost

- For a `stateFingerprint` change in `packages/webui-server/src/server/collab/session-registry.ts`, read all of `collab/` in the same pass, including the `stateFingerprint` comparison and `record()` in `broadcast-scheduler.ts` and the invariants in `annotations.ts`. Confirm the scheduler detects real state changes without over-triggering on unchanged state.
- For numeric normalization in `packages/webui-server/src/server/usage-cost.ts`, require the cache-price fallback to use `!= null`, not `||` or `??`, so an explicit `0` is preserved. Check the declared `CostRates`/`TokenUsage` fields against the exact four-key `toEqual` assertions in `packages/webui-server/tests/usage-cost.test.ts` and the four-key mock in `packages/webui-server/tests/server-runtime.test.ts`; flag any enumeration mismatch.

## `packages/cli` — captured output

- Before treating `expect(res.out).toBe(...)` in `packages/cli/tests/goal-commands-runcmd.test.ts` as decode-path coverage, compare the expected output size with `runCmd`’s tail behavior: `createTailBuffer` in `packages/cli/src/goal-commands.ts` retains only the last `MAX_CMD_OUTPUT` (`200_000`) characters. Do not credit an assertion whose source output exceeds that cap unless it explicitly validates the retained tail.

## Verdicts

- Emit `json { "findings": [] }` only when these checks reveal no defect; otherwise put concrete defects in `findings`.
