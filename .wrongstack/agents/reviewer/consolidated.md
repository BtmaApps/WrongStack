# Reviewer Agent Instructions

## Review Discipline

- Treat externally supplied diffs and changed-file lists as incomplete. Resolve every finding against the live on-disk source with `read`/`grep` and cite current lines. A bundle may omit sibling changes, so confirm that a referenced module actually exists before reporting it missing; `required-skill-gate.js`, consumed by `packages/core/src/execution/tool-executor.ts` and `packages/core/src/skills/index.ts`, is a known example.
- Verify language semantics and declared contracts before reporting a failure path. In `optionalFn?.(arg).catch(cb)`, optional chaining short-circuits the continuous chain when `optionalFn` is nullish, so `.catch` runs only if the callee is invoked. Report `undefined.catch` only when an invoked callee's declared or implemented return type can be `undefined` or another non-Promise value, as with relevant `AppProps` contracts in `packages/tui/src/use-app-controller.tsx`.
- Treat search results as leads rather than proof. `codebase-search` may not index Zustand actions declared inside `create((set) => ({...}))`; confirm zero-hit symbols with `grep` against the defining store before reporting them absent.
- Trace changed invariants through all producers and consumers rather than reviewing only changed lines or current test fixtures.

## CLI Repl and Autonomy Flow

- In `packages/cli/src/repl.ts`, `onSuggestionsParsed(null)` is the documented signal to clear stored suggestions during halt or cancellation; `onSuggestionsParsed([])` is a valid successful parse with no suggestions. Never treat `null` and `[]` as interchangeable.
- In `packages/cli/src/repl.ts`, `suggest` mode may call `agent.run()` inline after the main turn to fetch next-step suggestions, but `auto` mode must route exclusively through `runAutoProceed` and its `loopGuard`. A direct `agent.run()` in the `auto` branch bypasses repetition protection and must be flagged.

## TUI Selection and Rendering Contracts

- When a feature makes an array newly reachable in an empty state, invalidate every pre-existing non-empty assumption. In `packages/tui/src/components/theme-picker.tsx`, filtering can make `options[clamped]` undefined; trace every consumer and require guards such as `selectedOption?.id ?? activeId` rather than relying on current presets always being populated.
- For an index-addressed filtered picker, clamp `selected` against the filtered result before calling the windowing function, not merely before rendering or highlighting. In `theme-picker.tsx`, clamping after `windowThemeRows` desynchronizes the visible window from the highlighted row.
- When a reducer stores a selected index into a module-level options array, review the Enter/confirm consumer in the same pass. Reducer state and index-based consumers form one contract even if the consumer is outside the diff.
- Never accept an `as SomeType` cast on a TUI array lookup without checking the actual element type. `THEME_OPTIONS` contains `ThemePickerOption` objects, so consumers must use `selectedOption?.id`; a cast can pass an object into `setActiveTheme` and fail at runtime.
- A React key derived from caller-supplied data, such as `h:${row.family}`, is safe only when the component's prop contract guarantees uniqueness or the component normalizes it. A comment or unrelated test that pins current fixture ordering does not discharge this responsibility.
- The condensed branch in `packages/tui/src/components/history/banner.tsx` must remain after `useBrandMarkAnimation` to preserve hook ordering. The shared threshold `termHeight < compactRows + FULL_LAYOUT_EXTRA_ROWS` must control both condensed output and full-layout suppression, with autonomy-agent rows counted on both sides.
- A `<Static>` list sourced from a render-bumped ref in `packages/tui/src/components/history/index.tsx` must synchronously assign and snapshot the revision. Deferring cleanup to `useLayoutEffect` can target the wrong instance and permit double emission.
- Effects that schedule timers, including `packages/tui/src/hooks/use-brain-events.ts`, must capture a local `cancelled` flag and check it inside the callback. Timer cancellation outside the callback closure does not prevent post-unmount reducer dispatches.

## TUI Measurement and Streaming

- `ScrollableHistory` must calculate its row budget as `cacheTotal + liveTailHeight`. Define live-tail height consistently as assistant plus tool rows and use `streamBoxRows(name, text, termWidth)` from `packages/tui/src/utils.tsx`; mixing assistant-only and tool-inclusive definitions causes persistent one-row drift.
- Track every subtraction from a measured history total independently: assistant tail, tool tail, autocomplete popover, and status overlay. Omitting any region silently invalidates the row budget.
- Preserve the pinned-bottom contract in `packages/tui/src/components/scrollable-history.tsx`: `flex-end` plus `marginBottom={scrollOffset}`. A switch to `flex-start` and spacer arithmetic must prove equivalence with the documented `spacerAbove`/`spacerBelow` calculations.
- Preserve `EntryHeightCache` seeding order: call `cache.sync(ids)` before `cache.recordMany(estimatesFromFullList)`. Reversing the order can throw `RangeError` for unseeded IDs or silently skip records after synchronization.
- Do not place raw method-call results from mutable singletons directly in `useLayoutEffect` dependencies when each call returns a fresh value, such as `cache.totalHeight()`. Use a revision dependency or stable memoized value.
- Derive picker column budgets from rendered labels rather than a hardcoded `padEnd` width. `padEnd` is a no-op for longer strings; calculate a per-row width such as `const nameWidth = Math.max(N, label.length)` and use it for alignment, suffix visibility, and wrapping decisions in `packages/tui/src/components/**`.

## Settings and Autonomy Wiring

- `CONFIG_BEHAVIOR_DEFAULTS.autonomy` in `packages/core/src/storage/config-loader.ts`, re-exported by `packages/core/src/storage/index.ts`, is the canonical TUI autonomy-default source. `packages/tui/src/app-initial-state.ts` must import these values rather than hardcode booleans.
- `AutonomyConfig` intentionally declares booleans as optional even though `CONFIG_BEHAVIOR_DEFAULTS.autonomy` supplies them at runtime. Do not flag this type/runtime drift by itself.
- Existing fallback consumers include `packages/cli/src/boot/tui-settings-adapter.ts` and `packages/tui/src/overlay-key-router.ts` with `?? true`. Treat these as secondary fallback paths; when touching them, flag new divergence from the canonical defaults rather than introducing another default source.
- A new TUI autonomy/settings boolean requires end-to-end wiring in `CONFIG_BEHAVIOR_DEFAULTS.autonomy`, `packages/tui/src/app-state.ts`, `app-initial-state.ts`, `SETTINGS_DEFAULTS`, `SETTINGS_FIELD_LABELS`, and `SETTINGS_SECTIONS`.
- The same setting must flow through `packages/tui/src/settings-contracts.ts`, `packages/tui/src/reducers/settings-values.ts`, `packages/cli/src/boot/tui-settings-adapter.ts`, and `packages/tui/src/overlay-key-router.ts` when overlays are affected.
- The setting must also be rendered and persisted by `packages/tui/src/components/settings-picker.tsx`, `usePanelControllers`, `useSettingsAutoSave`, and `app-view` prop forwarding. A declaration without these paths is unwired even if typecheck passes.
- Compare new-setting call-site volume with a mature sibling. A setting found only at its type declaration is a wiring gap: report at least MEDIUM, escalating to HIGH when picker labels or tests have already shipped.
- `SettingsPickerValues` is `Required<SettingsPickerPatch>`. Adding a field requires updating `baseValues`, `testValues`, the `SETTINGS_FIELD_LABELS.length` assertion, the `Object.keys(SETTINGS_DEFAULTS).length` assertion, and the reset smoke test covering every field index.
- Settings field `4` (“fleet chat”) is an enum rather than a boolean. Legacy on/off tokens intentionally resolve to `'full'` or `'off'` through the fallback in `resolveSettingsFieldValues`; do not flag its presence in `boolFields` without checking that compatibility path.

## Imports, Exports, and Symbol Resolution

- Before accepting removal of `import * as X`, a named import, or another identifier, grep the whole file for every remaining use, such as `grep 'X\.|removedName' <file>`. Zero residual uses are required to avoid `TS2304` or runtime failures; this includes removals such as `isTokenExpired` and `import * as HqServerAuth` from `packages/cli/src/hq-server.ts`.
- Grep every newly added import for actual use. With `noUnusedLocals: true` inherited from `tsconfig.base.json`, unused imports fail test typecheck with `TS6133`, including type-only imports.
- After replacing a named type import with an inline `import('./x.js').T` expression, grep for the old `import type { T }` declaration and remove it if unused. Type-qualified inline imports do not exempt the leftover declaration from `TS6133`.
- For `import { X } from '@wrongstack/<pkg>'`, verify that the package root export at `packages/<pkg>/src/index.ts` re-exports the defining module and that the consuming package declares the dependency in its `package.json`.
- For a new value or sentinel under `packages/core/src/types/**`, grep `packages/core/src/types/index.ts` before accepting a consumer import from `@wrongstack/core/types`. That barrel explicitly enumerates values; a missing export can fail compilation or leave a runtime sentinel `undefined`, making comparisons ineffective.
- Verify newly called WebUI store methods against the store definition, not only the calling handler. In particular, check that `setDeepDivePartial` and the three-argument `jobStarted` exist with matching signatures in `packages/webui/src/stores/techstack-store.ts`; otherwise dispatch fails at runtime with `TypeError`.
- When a new helper module is introduced, read its implementation and compare every passed state field, callback signature, and arity with the consuming call site. Also verify that identifiers the consumer newly depends on, such as `OPEN_STATE`, are already imported or declared.
- During refactors, grep the definition and every call site of extracted helpers. A helper with no definition produces compile/runtime errors, while mismatched extraction parameter shapes can pass at one caller and break another.
- Grep produced and consumed identifiers independently. A call site may introduce a new consumed property, such as `claimedEvidence: accumulatedEvidence`, while the corresponding producer or declaration was never added.
- During component extraction, verify that every newly imported component is actually rendered in JSX and every deleted local identifier has no remaining consumers. An import-only extraction causes `TS6133`; an orphaned local causes `TS2304`.

## Refactor, State, and Concurrency Wiring

- When renaming a field or changing its shape, grep both old and new names across every read and write site. Updating only types, JSDoc, or one side of the data flow leaves a half-applied refactor.
- Every new mutable field must be initialized and reset in all lifecycle paths, including both `setup()` and `teardown()`. Verify each field against the initializer and every teardown or replacement path.
- A new enforcement, eviction, persistence, or verification function with no call sites is declared-but-unenforced dead code; report it as high-confidence when only its definition and documentation match.
- An option that is declared, destructured, and threaded through helpers but never supplied by a production caller is dead wiring. Grep both invocations and the intended production call site before accepting the option contract.
- Treat a cache as genuine LRU only when miss performs `Map.set`, hit performs `delete` followed by `set`, and eviction removes the first entry. Any deviation is not LRU semantics.
- For worker-pool delegation inside `Promise.allSettled(batchFiles.map(async ...))` in `packages/tools/src/codebase-index/indexer.ts`, do not accumulate concurrent callbacks into a shared outer buffer. Complete the parallel read phase, issue one batched delegation call, and reconcile results by file ID.

## Duplicated and Generated Definitions

- When a constant is duplicated across packages, such as `BOARD_SOFT_MAX_BYTES`, grep the whole repository for every copy and for tests that actually pin parity. Do not accept a comment's claim that a test exists without reading the test.
- Do not judge `architecture/hotspots.json` values using naive static-import counts. Read `collectModuleSpecifiers` in `scripts/lib/architecture-health.mjs`; `relativeImports` also includes side-effect imports, dynamic imports, `require()`, and `import x = require()` forms.

## Protocol Catalogs

- After changing a protocol catalog such as `SERVER_EXTENSION_MESSAGE_TYPES` in `packages/webui-protocol/src/server-integrations.ts`, run `packages/webui-protocol/tests/message-catalogs.test.ts`. Its parity checks cover naming syntax, non-emptiness, and per-domain duplicate freedom that array inspection alone does not establish.
- Before calling a catalog entry dead wiring, grep the exact type string repository-wide. A declaration in `packages/webui/src/types/server-message-system.ts` plus handling in `packages/webui/src/hooks/ws-handlers/*.ts` constitutes forward wiring; stale documentation such as `docs/architecture/simpleui-message-lifecycle.md` is normally below the reporting threshold unless independently important.

## Test and Fixture Validation

- When checking contiguity or duplicate freedom with a loop beginning at `for (let i = 1; ...)`, seed the `seen` set with the first element before the loop. Omitting `THEME_OPTIONS[0].family` leaves the entire first family group unchecked in `packages/tui/tests/theme-presets.test.ts`.
- TUI render tests may pass alone but fail in the full `packages/tui` suite because of shared renderer or module-scope state. Before attributing a failure to a diff, run the affected test both solo and within the full package suite.
- Hand-built legacy-schema database fixtures must match the table and column names actually read by production migrations. A mismatched literal can make a migration test pass while proving nothing.

## Known Intentional Behavior

- `frontend-static-serve.ts` returns the requested HTTP port, not the bound port. `port` is passed to `createHttpServer`, while `listen` uses `opts.httpPort` and `opts.host`; do not report this as a binding-reporting bug.
- Optional autonomy booleans and legacy fleet-chat tokens described above are intentional compatibility contracts, not strict-null-check or enum-array defects.