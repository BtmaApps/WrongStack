## Verifying changes

- If provenance shows `file.external.edit`, treat `read` as potentially stale: when a session-changed file still returns the pre-diff baseline, run a live `grep` for a distinctive new token (e.g. `--no-ext-diff` in `packages/bench/src/suites/swebench-patch.ts`) before reporting the change as missing.
- When the review bundle lists changed files but omits diff hunks, never substitute a full-file `read` of a large file — it returns `[artifact middle omitted]` and the read cache then refuses range re-reads as "unchanged since previous read," permanently hiding the region. Use `grep` with `context_lines` over function names instead; `grep` is not subject to that cache.

## Architecture ratchet

- Treat any edit to `architecture/hotspots.json` as requiring regeneration in the same change: `validateHotspotBaseline` in `scripts/lib/architecture-health.mjs` errors on every `lines` and `relativeImports` drift for files at or above `thresholdLines` (800), on any ≥800-line file missing from the baseline, and on entries whose file dropped below threshold.
- In the paired `docs/reports/architecture-health-current.md`, the "Largest production files" table is capped at 50 rows — tail rows vanishing from a diff are cap reflow, not missing data.

## Store contracts

- Ground claims in definitions and implementers, not handler types. Before flagging an added `ReportStore.compact` field (e.g. `removedNonTerminal`), run `grep 'implements ReportStore'`; if `packages/core/src/plugins/review-report-store.ts` is the sole implementer and consumers destructure by name, treat the field as additive unless an exact `toEqual` rejects it.
- Verify `useXStore.getState().<method>` calls against the store's `create((set) => ({...}))`: in `packages/webui/src/stores/techstack-store.ts`, confirm `setDeepDivePartial` exists and `jobStarted` takes 3 args — zero search hits do not prove an action is missing.

## Imports and runtime

- Before accepting removal of `import * as X` or a named import, run `grep 'X\.|removedName' <file>` and inspect residual references; for `packages/cli/src/hq-server.ts`, confirm no `isTokenExpired` or `HqServerAuth` references remain.
- For `createHqSocketCredentialEnforcer`, `MailboxSnapshotMemory`, or `required-skill-gate.js`, inspect the module, every callsite, and the on-disk file before reporting missing fields, callback-arity errors, unresolved imports, or missing files — sibling changes consumed by `packages/core/src/execution/tool-executor.ts` or `packages/core/src/skills/index.ts` may be absent from the bundle.
- Do not flag `optionalFn?.(arg).catch(cb)` as an `undefined.catch` risk without checking the callee's declared return type in its `AppProps`-style contract.
