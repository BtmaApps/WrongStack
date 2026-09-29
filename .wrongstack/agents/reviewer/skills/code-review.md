## Diff verification

- Treat `read` as potentially stale when provenance contains `file.external.edit`. If a session-changed file still shows the pre-diff baseline, do not report it missing until a live `grep` confirms a distinctive new token, such as `--no-ext-diff` in `packages/bench/src/suites/swebench-patch.ts`.
- If the review bundle lists changed files but omits diff hunks, do not substitute a full-file `read` for a large file: `[artifact middle omitted]` and the read cache can permanently hide the region. Use `grep` with `context_lines` around relevant function names instead; it bypasses that cache.

## Architecture ratchet

- Treat every edit to `architecture/hotspots.json` as requiring same-change regeneration. Validate it against `validateHotspotBaseline` in `scripts/lib/architecture-health.mjs`: reject any `lines` or `relativeImports` drift for files at or above `thresholdLines` (800), any ≥800-line file absent from the baseline, and any baseline entry now below 800.
- When reviewing `docs/reports/architecture-health-current.md`, do not infer missing tail data from vanished rows in “Largest production files”; its 50-row cap can reflow.

## Store contracts

- Ground claims in definitions and implementers, not handler types or zero-hit searches. Before flagging an added `ReportStore.compact` field such as `removedNonTerminal`, run `grep 'implements ReportStore'`; if `packages/core/src/plugins/review-report-store.ts` is the sole implementer and consumers use named destructuring, treat the field as additive unless an exact `toEqual` rejects it.
- Compare `useXStore.getState().<method>` with `create((set) => ({...}))`. In `packages/webui/src/stores/techstack-store.ts`, verify `setDeepDivePartial` exists and `jobStarted` takes 3 args; zero `codebase-search` hits do not prove an action is missing.

## Imports and runtime

- Before accepting removal of `import * as X` or a named import, run `grep 'X\.|removedName' <file>` and inspect residual references. For `packages/cli/src/hq-server.ts`, confirm removal leaves no `isTokenExpired` or `HqServerAuth` references.
- For `createHqSocketCredentialEnforcer`, `MailboxSnapshotMemory`, or `required-skill-gate.js`, inspect the module, every callsite, and the on-disk file before reporting missing fields, callback-arity errors, unresolved imports, or missing files; bundles may omit sibling changes consumed by `packages/core/src/execution/tool-executor.ts` or `packages/core/src/skills/index.ts`.
- Do not flag `optionalFn?.(arg).catch(cb)` as an `undefined.catch` risk without first checking the callee’s declared return type in its `AppProps`-style contract.

- When a `read` of a session-changed file returns the pre-diff baseline but the review bundle's provenance shows `file.external.edit`, do not report the change as missing — verify with a live `grep` for a distinctive new token (e.g. a newly added flag like `--no-ext-diff` in `packages/bench/src/suites/swebench-patch.ts`) before concluding; reads can serve stale snapshots after concurrent external edits. (anchors: `read`, `file.external.edit`, `grep`, `--no-ext-diff`, `packages/bench/src/suites/swebench-patch.ts`) [applied 3×, 3 ok]
- When a review bundle lists changed files but omits the diff hunks, do not substitute a full-file `read` for the missing diff in large files — `read` returns `[artifact middle omitted]` and the read cache then refuses range re-reads as "unchanged since previous read," permanently hiding the changed region. Use `grep` with `context_lines` over function names in the file instead; `grep` is not subject to the read cache, so it is the reliable fallback for reaching a specific region of an already-read file. (anchors: `read`, `[artifact middle omitted]`, `grep`, `context_lines`) [applied 1×, 1 ok]
- Treat any edit to `architecture/hotspots.json` as a ratchet that must be regenerated in the same change: `validateHotspotBaseline` in `scripts/lib/architecture-health.mjs` errors on *every* `lines` and `relativeImports` drift for files at or above `thresholdLines` (800), on any ≥800-line file missing from the baseline, and on baseline entries whose file dropped below the threshold. When reviewing the paired `docs/reports/architecture-health-current.md`, remember its "Largest production files" table is a fixed 50-row cap, so tail rows disappearing from a diff is cap reflow, not missing data. Files examined: `architecture/hotspots.json`, `docs/reports/architecture-health-current.md`, `scripts/lib/architecture-health.mjs` (anchors: `architecture/hotspots.json`, `validateHotspotBaseline`, `scripts/lib/architecture-health.mjs`, `lines`, `relativeImports`, `thresholdLines`, `docs/reports/architecture-health-current.md`)

---
*Distilled 2026-09-29T19:07:29.563Z · 3 new directives*
