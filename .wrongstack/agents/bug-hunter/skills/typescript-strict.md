## Live-tree adjudication

- Before a cascade fix on a co-modified tree, inspect the exact path across adjudication using `exec`: `git diff --stat`, then `git diff -U0 -- <path>`; repeat before editing. Treat a guarded-edit no-match as “re-anchor to live text,” never “retry unchanged.”
- Adjudicate duplicate-identifier, compile-failure, and missing-field claims against live source before editing. Run `node node_modules/typescript/bin/tsc --noEmit --pretty false -p <pkg>/tsconfig.json` and covering tests; clean results close false positives such as `packages/webui-hq/src/data/local-prefs.ts:hideIdle`. Keep out-of-diff diagnostics separate, with exact `file:line`.
- For mismatched-quote claims, distrust a rendered `read` of the trailing delimiter: inspect `(Get-Content <path>)[n][-30..-1] -join ''` and typecheck. Use guarded `edit`, not PowerShell `String.Replace` with double-quoted backticks.

## Verification

- Use `bunx vitest run …`, `bunx biome …`, and the Node typecheck above. Avoid `pnpm exec`, including stale `packages/tui` notes: `packageManager` pins Bun, causing `Unsupported package manager specification (bun@1.4.3)`.
- After run-control changes, run `bunx vitest run packages/webui-server/tests/goal-ws-handler.test.ts packages/webui-server/tests/goal-multiple-runs.integration.test.ts`, typecheck `packages/webui-server/tsconfig.json`, and run `bunx biome check packages/webui-server/src/server/goal-ws-run-controls.ts`.

## Behavioral contracts

- Before restoring guards in `packages/webui-server/src/server/goal-ws-run-controls.ts`, check subsumption and ordering: bare `runPromise` covers `(stopping && runPromise)`; `handleStop` sets `runStatus='stopped'` before clearing `runPromise`.
- In `handleResumeGraph`, load and reject missing graph ids before `acquireGoalRunLease`/`acquireRunLease`; invalid ids must not acquire legacy leases or surface as `GoalRunLeaseBusyError`.
- When persistence is gated by `host.releaseRunLease || wasStarting`, avoid ungated parallel mutations of `graph.runState`.
- Before changing `packages/tui/src/app-view.tsx` for alleged optimistic-setting flicker, check dependency semantics: `useEffect` keyed on `liveSettings?.selectionMode` cannot clear `localSelectionMode` until that dependency changes.
- Preserve the unresolved-conflict contract in `packages/core/tests/goal/phase-merge-verdict.test.ts`: `ok:false + conflict:true` leaves the phase `completed` with `integrationStatus: 'needs_review'`. Check `packages/core/src/goal/phase-orchestrator-integration.ts` and `setIntegrationMetadata` in `packages/core/src/goal/phase-orchestrator-queries.ts`; verify with `bunx vitest run packages/core/tests/goal` and typecheck `packages/core/tsconfig.json`.
