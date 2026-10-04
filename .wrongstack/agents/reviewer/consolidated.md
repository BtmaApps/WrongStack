# Reviewer Agent Instructions

## Review Evidence and Coverage

- Treat diffs, changed-file lists, and artifact bundles as incomplete or stale. Confirm every finding and any all-clear against current on-disk source with `read`/`grep`, and cite live `file:line`. If a changed import names an omitted sibling, `glob` its directory and read it; report a missing module only when absent on disk.
- Never file a Medium+ finding without reading its exact line. If `[artifact middle omitted]` hides a changed region, reread bounded ranges or use contextual `grep`; do not issue an all-clear. Name uncovered `file:line` ranges and set `completion: "partial"`; use `{"findings": []}` when no defect is confirmed, not to imply complete coverage.

## Finding Validation

- Trace changed invariants through every producer, consumer, lifecycle path, and exact-equality assertion. Thread fields end to end — declaration, handler, production consumer, and tests — and grep the exact flag in the real store or call site. Mock-only tests cannot prove live wiring.
- When a diff extracts functions into a new sibling module and re-exports them, verify the sibling exists on disk and exports the exact re-exported names before treating any call site as broken — a missing or mis-named export is a package-wide compile break the diff will not show.
- When reviewing a new `export *` line in a package barrel, verify the target module exists AND no two `export *` sources export the same symbol name — an ambiguous name is a package-wide compile break.
- Never treat a `glob` result of 0 files as a missing module when the pattern used brace expansion (e.g. `packages/webui-protocol/src/{a,b}.ts`) — many glob backends do not expand braces, so the miss is inconclusive. Re-probe with one explicit path per call.
- When a diff swaps an allowlist entry from one file path to another, verify both sides before approving: grep `child_process` in the removed path (a missing import means the `IMPORTS_CHILD_PROCESS` filter in `packages/tools/tests/architecture/shell-true-parity.test.ts` drops its `shell:` lines, so removal is safe), and confirm the added path exists and contains a non-inert `shell:` value (the allowlist uses `endsWith`, so a dead entry masks nothing while a missing one turns the gate red).
- Verify every branch initializes values used later, mutable state is reset, and rename or shape changes leave no old reads or writes. Check language semantics before filing. In `optionalFn?.(arg).catch(cb)`, optional chaining short-circuits; `.catch` is unsafe only when an invoked callee returns a non-Promise.
- Normalize model or API limits before `slice` or SQL `LIMIT`: reject `NaN`, `Infinity`, negatives, and out-of-range integers. `slice(0, -n)` drops the last `n` items, and `x ?? default` does not catch `NaN`. `clampLimit` signatures differ: `packages/webui-server/src/server/ws-validation-common.ts` uses `(value, def, max)` with minimum 1; `packages/core/src/chronicle/metrics-schema.ts` uses `(limit, fallback)` with a 10,000 cap.
- `shortHash` in `packages/bench/src/fingerprint.ts` is 12-character SHA-256 hex; its suffix is separator-free when appended to `slug()` output.

## Documentation Diffs

- `glob` each target of a removed documentation index row before calling it link rot — removal is correct when the file or directory no longer exists on disk. Equally, resolve every newly added relative link and heading anchor (e.g. `docs/foo.md#heading` against the live `##` heading) before declaring a docs diff clean.

## Test Claims vs. Live Behavior

- Verify tests claiming "without global env changes" against the live env-layering mechanism. In `packages/providers/src/native-catalog.ts`, `endpointEnv` is a per-provider spread copy of `process.env` plus profile-scoped overrides — a copy, not a mutation — so isolation tests pass via real per-closure isolation. Any regression to writing `process.env` or to env-fallback precedence breaks a concrete `toContain` assertion.
- Verify changed responsive-split test expectations by recomputing the slot arithmetic from the live constants: `calculateDesktopActivityCapacity` derives slots from `COMPACT_/FULL_RESERVED_PX` and `_SLOT_PX`, and `splitDesktopActivityBarItems` gives remaining slots to the first N of the on-disk `VIEWS` order — so inserting a view shifts which ids appear in `visibleViewIds` without any capacity change.
- Verify vitest `exclude` "allowlist" claims against the on-disk `vitest.config.ts`. Exclusion lists are additive with no negative glob, so the allowlist works only if the broad entry (e.g. `packages/webui/**`) was actually *removed*. Read the live file around the `exclude:` block before concluding the subtree excludes are dead code.
- When a chronicle test asserts `String(attributes.<field>).length < N`, verify what `capPreview` in `packages/core/src/chronicle/tool-adapter.ts` actually returns: the truncated branch returns `{preview, truncated, totalBytes}`, so `String()` collapses it to `"[object Object]"` and the assertion is unconditional. Prefer asserting the object shape or `attributes.<field>.preview.length`. Require the same test to assert a pre-truncation-derived field such as `fileStats` from `file-tool-stats.ts` — that field is the only thing proving stats are computed from the full output before `capPreview`.
- A literal assertion guards behavior only when it matches exact live syntax and that occurrence reaches the runtime path. For cross-package source pins, prove the new regex matches the exact literal and the old regex does not; both matching is vacuous, while neither matching guards nothing.
- Resolve `DESIGN_STACKS` in `packages/core/src/types/design-kit.ts` before crediting a design-kit-loader test regex — the skipped-kit reason interpolates `DESIGN_STACKS.join(', ')`, so both the membership and the order of the regex's trailing list must match the literal array.

## Settings and Preferences

- Validate numeric preferences in the serve, seed, and broadcast paths, not only in `prefs.update`. `packages/webui-server/src/server/context-meta.ts` seeds numbers with only a type check, so out-of-range values can reach `packages/simpleui/src/settings-panel.tsx`. Ensure `presetOptions` applies `Number.isInteger` and its floor guard, and never re-offers invalid stored values.
- SimpleUI toggles must update the model, defaults, parser, shallow equality, catalog, row binding, and `BOOLEAN_PREF_KEYS` in `packages/webui-server/src/server/ws-payload-preferences.ts`; the server rejects unlisted update keys.
- `CONFIG_BEHAVIOR_DEFAULTS.autonomy` in `packages/core/src/storage/config-loader.ts` is the canonical TUI autonomy-default source. A setting must flow through TUI state, contracts, reducers, the CLI settings adapter, overlays, persistence, and `app-view`. `LiveSettingsInput` also requires hydration from `cfg.features` and persistence back to `feats`.

## TUI Contracts

- Treat every newly reachable filtered array as potentially empty. Guard selected values, clamp indices before windowing, and never cast an array lookup to a member type when the array contains objects. Selection reducers, index consumers, and caller-supplied React keys must agree on synchronization, element type, and uniqueness.
- Preserve React hook order, snapshot render-bumped revisions before effects, and check cancellation inside timer callbacks. Do not put fresh values such as `cache.totalHeight()` directly in effect dependencies; use a revision or stable memo.
- Account for every subtraction from measured history totals. Preserve `EntryHeightCache` seeding with `cache.sync(ids)` before `cache.recordMany(...)`, and derive picker widths from rendered labels because `padEnd` does not truncate.

## Design Tool

_(truncated at 8192 bytes — the next optimization pass must shorten it)_