# Reviewer Agent Instructions

## Review Evidence and Coverage

- Treat diffs and changed-file lists as incomplete, potentially stale evidence. Resolve every finding against live on-disk source with `read`/`grep` and cite current `file:line`; bundles may omit siblings or capture a pre-`file.external.edit` snapshot.
- If an added import references a module omitted from the bundle, `glob` its directory and read the sibling. Report a missing module only when it is absent on disk.
- When a read conflicts with a distinctive new token, verify the token with live `grep`. Before filing `TS6133`, `noUnusedParameters`, or a similar signature finding, re-read the changed function’s current definition and cite the live line.
- If `[artifact middle omitted]` hides a changed region, do not issue an all-clear. Reissue fresh `offset`/`limit` ranges, such as `offset=1 limit=250` followed by `offset=251`; if the read cache prevents range recovery, use `grep` with `context_lines`.
- Never file a Medium+ finding without a line actually read during the review. Treat search results and green tests as leads, not proof.
- If coverage remains incomplete, name the uncovered `file:line` ranges and set `completion: "partial"`; use `{"findings": []}` when no defect is confirmed rather than implying a clean full review.

## Finding Validation

- Trace changed invariants through every producer, consumer, lifecycle path, and exact-equality assertion. Reviewing only changed lines or current fixtures is insufficient.
- Thread new options and fields end to end: declaration, handler, production consumer, and tests. A mocked-store test cannot distinguish a live option from dead wiring; `grep` the exact flag in the store implementation before judging it.
- Verify every branch initializes values used by later code. A field-mapped array declared only inside a feature-specific branch can cause a TDZ `ReferenceError` on other paths.
- During renames and shape changes, grep both old and new names across all reads and writes. Ensure new mutable state is initialized and reset and that extracted helpers are called with matching signatures.
- Verify language semantics before reporting a failure path. In `optionalFn?.(arg).catch(cb)`, optional chaining short-circuits the continuous chain; only an invoked callee returning a non-Promise can make `.catch` invalid.
- Before flagging an added store return field, grep `implements <Interface>`. Optional additive fields are generally safe unless exact whole-object assertions or required destructuring impose a stricter contract.

## Project Contracts

- In `packages/tools/src/project-kit/**`, `assertKitId`/`KIT_ID` and `kitPath` in `catalog.ts` centralize name, traversal, separator, and symlink validation. Do not report path traversal or symlink escape unless a new caller bypasses these guards.
- Additions to `KitProcessResult` or `KitRunRecord` must remain optional (`?: T | undefined`) unless all existing literals are updated. A parent timestamp on the `failure` branch while `resultReceived` remains `false` is intentional: the record represents a terminal IPC message, not necessarily a result.
- For changes to `packages/webui/src/types/sage.ts`, compare fields in both directions with `packages/sage/src/memory-model.ts`. `kind: string` versus the closed `SageKind` union and optional canonical `sources` are deliberate safe widenings, not drift.
- `loadGitignoreMatcher(root)` in `packages/tools/src/codebase-index/gitignore.ts` reads only the root `.gitignore`, without nested files or a `.git` requirement. It supports last-match-wins `!` negation and trailing-slash directory rules; verify the enumerator’s `require_git` behavior before claiming parity with ripgrep.
- Treat edits to `architecture/hotspots.json` as a ratchet that must be regenerated in the same change. `validateHotspotBaseline` in `scripts/lib/architecture-health.mjs` checks every drift for files at or above `thresholdLines: 800`; the 50-row cap in `docs/reports/architecture-health-current.md` can legitimately reflow the report tail.
- In `packages/plugins/src/semver-bump/index.ts`, the `commitError` early-exit guard is correct because that variable is assigned only on failure. Tests asserting warnings must preserve the exact `commit failed: …` then `tag failed: …` order and literals.
- Security scanners that replace whole-input matching with chunked scanning must overlap by at least the maximum pattern length or deduplicate by absolute offset; a one-character overlap can miss matches crossing chunk boundaries.
- In `packages/cli/src/repl.ts`, `onSuggestionsParsed(null)` clears suggestions, while `onSuggestionsParsed([])` is a successful empty parse. In `auto` mode, route progression only through `runAutoProceed` and its `loopGuard`; a direct `agent.run()` bypasses repetition protection.

## TUI Contracts

- Treat every newly reachable filtered array as potentially empty. Guard selected values, clamp indices before calling windowing functions, and never cast an array lookup to a member type when the array actually contains objects.
- Selection reducers, index-based consumers, and caller-supplied React keys form part of the same contract. Verify index synchronization, element type, and uniqueness guarantees rather than relying on current fixture ordering.
- Preserve React hook order, synchronously snapshot render-bumped revisions before effects, and check a local cancellation flag inside timer callbacks to prevent stale or post-unmount updates.
- Account for every subtraction from a measured history total, including assistant tails, tool tails, autocomplete popovers, and status overlays. Preserve `EntryHeightCache` seeding with `cache.sync(ids)` before `cache.recordMany(...)`.
- Do not place fresh results such as `cache.totalHeight()` directly in effect dependencies; use a revision or stable memoized value. Derive picker widths from rendered labels because `padEnd` does not truncate longer strings.

## Settings and Defaults

- `CONFIG_BEHAVIOR_DEFAULTS.autonomy` in `packages/core/src/storage/config-loader.ts` is the canonical TUI autonomy-default source. A new setting must flow through `packages/tui/src/app-state.ts`, `app-initial-state.ts`, settings contracts/reducers, `packages/cli/src/boot/tui-settings-adapter.ts`, overlay routing, picker rendering, persistence, and `app-view` forwarding.
- Adding a setting also requires updating `SettingsPickerValues` fixtures, field-count assertions, reset coverage, labels, and sections. Optional `AutonomyConfig` booleans and legacy fleet-chat enum tokens are intentional compatibility behavior.
- `LiveSettingsInput` additions require both hydration from `cfg.features` and persistence back to `feats` in `packages/cli/src/boot/tui-settings-adapter.ts`; a declaration with only one mapping is dead wiring.
- SimpleUI preference toggles must update the model/default/parser, shallow equality, catalog, row binding, and `BOOLEAN_PREF_KEYS` in `packages/webui-server/src/server/ws-payload-preferences.ts`; the server rejects unlisted `prefs.update` keys.
- For changed defaults, inspect the actual resolver and production consumer. A host enablement flip must agree with `HOST_PLUGIN_AUDIT_ENTRIES` and `resolvePluginEnablement`; declarations and historical comments are not authoritative.

## Tests and Generated Definitions

- A literal assertion guards behavior only when the test matches exact syntax and the live source occurrence reaches the relevant runtime path. Verify build arguments reach `run('bun', args)` or spawn, and feature switches are read through closures over live state rather than captured construction values.
- Exact output assertions must respect implementation caps. `runCmd` in `packages/cli/src/goal-commands.ts` retains only the last `MAX_CMD_OUTPUT` (`200_000`) characters through `createTailBuffer`.
- After changing protocol catalogs, run their catalog tests and grep exact type strings repository-wide before calling an entry dead. Declaration plus forward handler wiring is sufficient even if documentation is stale.

_(truncated at 8192 bytes — the next optimization pass must shorten it)_