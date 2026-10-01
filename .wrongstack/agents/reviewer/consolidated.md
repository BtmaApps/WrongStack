# Reviewer Agent Instructions

## Review Evidence and Coverage

- Treat diffs, changed-file lists, and artifact bundles as incomplete or stale. Confirm every finding and any all-clear against current on-disk source with `read`/`grep`, and cite live `file:line`. If a changed import names an omitted sibling, `glob` its directory and read it; report a missing module only when absent on disk.
- If a read conflicts with a distinctive new token, verify it with live `grep`. Before filing `TS6133`, `noUnusedParameters`, or a signature finding, reread the current declaration and changed function. Searches and green tests are leads, not proof.
- Never file a Medium+ finding without reading its exact line. If `[artifact middle omitted]` hides a changed region, reread bounded ranges or use contextual `grep`; do not issue an all-clear. Name uncovered `file:line` ranges and set `completion: "partial"`; use `{"findings": []}` when no defect is confirmed, not to imply complete coverage.

## Finding Validation

- Trace changed invariants through every producer, consumer, lifecycle path, and exact-equality assertion. Reviewing only changed lines or current fixtures is insufficient.
- Thread fields and options end to end—declaration, handler, production consumer, and tests—and grep the exact flag in the real store or call site. Mock-only tests cannot prove live wiring. Fields sourced solely from trusted host configuration, rather than HTTP or WebSocket input, are additive wiring rather than a new request attack surface.
- Verify every branch initializes values used later, mutable state is reset, and rename or shape changes leave no old reads or writes. Match extracted helpers to call-site signatures. Before flagging a store return field, grep `implements <Interface>`; optional additive fields are normally safe unless exact object assertions or required destructuring make them incompatible.
- Check language semantics before filing. In `optionalFn?.(arg).catch(cb)`, optional chaining short-circuits the chain; `.catch` is unsafe only when an invoked callee returns a non-Promise.
- Normalize model or API limits before `slice` or SQL `LIMIT`: reject `NaN`, `Infinity`, negatives, and out-of-range integers. `slice(0, -n)` drops the last `n` items, and `x ?? default` does not catch `NaN`. Resolve `clampLimit` by import and live definition: `packages/webui-server/src/server/ws-validation-common.ts` has `(value, def, max)` with minimum 1, while `packages/core/src/chronicle/metrics-schema.ts` has `(limit, fallback)` with a 10,000 cap.
- Resolve `computeStableJsonHash` and `computeTextHash` to `packages/bench/src/fingerprint.ts` before judging path safety; `shortHash` is 12-character SHA-256 hex, so its suffix is separator-free when appended to `slug()` output.

## Settings and Preferences

- Validate numeric preferences in the serve, seed, and broadcast paths—not only in `prefs.update`. `packages/webui-server/src/server/context-meta.ts` seeds numbers with only a type check, so hand-edited fractional, zero, or excessive values can reach `packages/simpleui/src/settings-panel.tsx`; an out-of-range `tgPollIntervalSec` may make its `<select>` display the first option. Ensure `presetOptions` applies `Number.isInteger` and its floor guard and never re-offers invalid stored values; pair this with allowed keys in `pref-helpers.ts` and required defaults in `prefs-model.ts`.
- SimpleUI toggles must update the model, defaults, parser, shallow equality, catalog, row binding, and `BOOLEAN_PREF_KEYS` in `packages/webui-server/src/server/ws-payload-preferences.ts`; the server rejects unlisted update keys.
- `CONFIG_BEHAVIOR_DEFAULTS.autonomy` in `packages/core/src/storage/config-loader.ts` is the canonical TUI autonomy-default source. A setting must flow through TUI state, contracts, reducers, the CLI settings adapter, overlays, persistence, and `app-view`. `LiveSettingsInput` also requires hydration from `cfg.features` and persistence back to `feats`; update picker fixtures, field counts, reset coverage, labels, and sections.

## Locale Resources

- For placeholder parity, inspect every result of `glob packages/webui/src/i18n/locales/*/settings.json`. Do not grep with `"[^"]*\{\{token\}\}"`: JSON-escaped quotes inside values break `[^"]*`. Search the key and placeholder independently, or use `[^}]*` on the placeholder side, and verify each locale has the identical key and token contract.

## TUI Contracts

- Treat every newly reachable filtered array as potentially empty. Guard selected values, clamp indices before windowing, and never cast an array lookup to a member type when the array contains objects. Selection reducers, index consumers, and caller-supplied React keys must agree on synchronization, element type, and uniqueness.
- Preserve React hook order, snapshot render-bumped revisions before effects, and check cancellation inside timer callbacks. Do not put fresh values such as `cache.totalHeight()` directly in effect dependencies; use a revision or stable memo.
- Account for every subtraction from measured history totals, including assistant and tool tails, autocomplete popovers, and status overlays. Preserve `EntryHeightCache` seeding with `cache.sync(ids)` before `cache.recordMany(...)`, and derive picker widths from rendered labels because `padEnd` does not truncate.

## Tests and Generated Definitions

- A literal assertion guards behavior only when it matches exact live syntax and that occurrence reaches the runtime path. Verify build arguments reach the actual spawn and feature switches read live state. For cross-package source pins, prove the new regex matches the exact literal and the old regex does not; both matching is vacuous, while neither matching guards nothing.
- Respect implementation caps in exact-output tests. `runCmd` in `packages/cli/src/goal-commands.ts` retains only the last `MAX_CMD_OUTPUT` (`200_000`) characters through `createTailBuffer`.
- After changing protocol catalogs, run their catalog tests and grep exact type strings repository-wide before calling an entry dead. Declaration plus forward-handler wiring is sufficient even when documentation is stale.

## Project Contracts

- In `packages/tools/src/project-kit/**`, `assertKitId`/`KIT_ID` and `kitPath` in `catalog.ts` centralize name, traversal, separator, and symlink validation. Flag escape only when a new caller bypasses them.
- Additions to `KitProcessResult` or `KitRunRecord` must remain optional unless all existing literals are updated. A parent timestamp on the `failure` branch while `resultReceived` remains false is intentional.
- For `packages/webui/src/types/sage.ts`, compare both directions with `packages/sage/src/memory-model.ts`; `kind: string`, closed `SageKind`, and optional canonical `sources` are deliberate safe widenings.
- `loadGitignoreMatcher(root)` in `packages/tools/src/codebase-index/gitignore.ts` reads only the root `.gitignore`, supports last-match-wins negation and trailing-slash rules, and has no nested-file or `.git` requirement.
- Treat `architecture/hotspots.json` as a regenerated ratchet. `validateHotspotBaseline` in `scripts/lib/architecture-health.mjs` checks drift for files at or above `thresholdLines: 800`; the 50-row report cap can legitimately reflow the tail.
- In `packages/plugins/src/semver-bump/index.ts`, the `commitError` early exit is correct because it is assigned only on failure; warning tests must preserve the exact commit-then-tag failure order and literals.
- Chunked security scanners must overlap by at least the maximum pattern length or deduplicate by absolute offset; a one-character overlap can miss boundary matches.
- In `packages/cli/src/repl.ts`, `onSuggestionsParsed(null)` clears suggestions while `onSuggestionsParsed([])` is a successful empty parse. In `auto` mode, use `runAutoProceed` and its `loopGuard`, not a direct `agent.run()` bypass.