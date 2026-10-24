# Reviewer Agent Instructions

## Scope and Evidence

- Review only the assigned target files/diff and their direct callers; do not expand into unrequested repository-wide audits. Return once the assigned surface is verified.
- Resolve behavior from current on-disk source, not only diff snapshots or snippets; cite live `file:line` locations. Confirm scope with `git status -- <target paths>` and `rg` for feature identifiers.
- If expected changes are absent, request changes; reserve “needs verification” for present but unchecked code. Trace changed contracts through producers, validators, consumers, production wiring, persistence/replay paths, and tests.
- Treat comments, docs, and tests as leads, not proof of reachable runtime behavior. Report no findings only with complete coverage; otherwise identify unread anchors and partial coverage.

## Dependency and Contract Checks

- For moved or retargeted imports, verify each target with an explicit path or nonempty `glob`; check package `exports` and build entry maps. For the core extraction, confirm `packages/agent-catalog/src/**` before accepting `@wrongstack/agent-catalog` or deep test imports.
- For re-export shims, resolve every symbol in `export { … } from '@scope/pkg/subpath'` against the new source and diff the moved body with the deleted implementation. Dropped symbols break deep-path importers; additions to `packages/primitives/package.json` must also appear in the build entry map.
- When helpers move to a sibling, preserve the original public export surface: search consumers for every moved symbol and confirm the source re-exports it. Keep back-references such as `packages/vibeui/src/lib/session-agents.ts` as `import type`, not runtime imports, to avoid ESM cycles; retain private helpers still used and remove dead imports.
- For new WebSocket routes, inspect the handler under `packages/webui-server/src/server/`, client action in `packages/webui/src/lib/ws-client-actions.ts`, and every new i18n key in all locales, including `src/i18n/locales/tr/activity.json`. Validate payload branches and required replies such as `requestId` and `success`.
- For new required configuration keys, locate fixtures through a stable sibling key and recount source literals behind length assertions. Inspect positional call sites when optional arguments could shift.
- Before removing exports, search complete multiline imports repo-wide. Before deleting `architecture/test-only-exports.json` entries, search static imports of the symbol. Resolve `@wrongstack/core/*` against `packages/core/package.json` exports and source barrels, distinguishing runtime values from type-only exports.
- Treat `pnpm-workspace.yaml` `overrides:` as authoritative; root `package.json` overrides are not pnpm configuration. Check version floors against `minimumReleaseAge` and exclusions, and attribute lockfile references to importer blocks.

## Project-Specific Contracts

- In `packages/core/src/models/default-modes.ts`, `DEFAULT_MODES` entries with `prompt: ''` are lazy file-backed accessors. `Object.defineProperty` fills ids in `LAZY_MODE_PROMPT_IDS`; `.prompt` resolves through `modePrompt(id)` to `packages/core/instructions/modes/<id>.md`. Do not flag the empty literal before checking the loop after the array.
- In `packages/cli/src/fleet/host-memory-companion.ts`, map timers before comparing deadlines: `withinIoBudget` uses `ioTimeoutMs ?? 30_000`; `spawnBounded` startup uses `Math.min(config.timeoutMs ?? 60_000, 60_000)`; probe watchdog/task use constrained `workerConfig.timeoutMs`. `constrainMemoryCompanion` in `packages/cli/src/fleet/memory-companion-policy.ts` honors each positive-finite budget independently, falls back per key to `DEFAULT_MEMORY_COMPANION_BUDGET` (3000/8000/1_000_000/20/1_800_000), and is idempotent.
- For BOM stripping, require the explicit source escape `/^\uFEFF/`; never paste an invisible U+FEFF character. Verify the actual codepoint with `rg` and an explicit Unicode escape before trusting security-sensitive paths such as `packages/core/src/security/secret-vault.ts`.

## Runtime, Data, and Control Flow

- Enumerate every discriminated-union variant before accepting fall-through or exhaustive switches. Remember `value ?? fallback` preserves `''` and `NaN`; normalize invalid producer values and reject negative numbers before `slice` or SQL `LIMIT`.
- Clamp environment-derived timer delays to `2_147_483_647` after finite/minimum validation; larger Node delays may fire almost immediately. Validate parser rewrites and generated text against the consuming grammar, including quoting, comments, spacing, bracket depth, and path rules.
- Search event literals across types, production writers, loaders, replay logic, and summary folds; legacy-load and replay branches must not double-apply events. Contain observer failures inside notification code in never-throw wrappers. Before alleging lost logging, enumerate throw sites, catch boundaries, and upstream warnings.

## Lifecycle and Concurrency

- Reset cached deterministic verdicts at the start of each attempt. Normalize teardown promises to never reject before `Promise.race`, and unref grace timers.
- Check `AbortController` identity with `close()` behavior; superseded callbacks must not mutate shared signals or cleanup state. Validate batch width and progress; `splice(0, 0)` creates non-progressing empty batches.
- State-owning refactors must release targets, locks, timers, and held fallbacks on settle, cancel, and timeout. Make `Object.defineProperty` values enumerable when iterated and configurable when removed; `Object.hasOwn` remains true for an own `undefined`. Bound methods returning `this` can bypass wrapper overrides.

## UI, CSS, and Browser Behavior

- Resolve CSS `@import` paths and custom properties against disk. In VibeUI, typography/corner tokens belong in `packages/vibeui/src/app/design-tokens.css`; color/surface tokens may remain theme-scoped in `packages/vibeui/src/app/globals.css`. Undefined variables can invalidate `font-size` or `border-radius`.
- For utility-to-class refactors, verify each class and modifier/base pairing. Before flagging deleted container styling, inspect replacement component rules; shared selectors such as `.code-panel pre` may provide `max-height` and `overflow`.
- Verify browser-smoke hooks reach the DOM: `useConfigStore.setPalette` does not itself set `<html data-palette>` in `packages/webui`; trace `ThemeProvider`, `applyPalette`, and direct mutations. For delayed infinite SVG strokes, retain hidden pre-animation state with `animation-fill-mode: backwards`; check `.oxog-mark` in `website/src/index.css` and `OxogMark`.
- Canvas tests must reject empty CSS token values before assigning `ctx.fillStyle`. Tab sweeps should detect wrap-around by element identity, not label, and include enough stops to reject an empty sweep; `aria-activedescendant` must follow rendered option order.
- When changing a `position: fixed` overlay to `position: absolute` in a `position: relative` container, verify the container has `z-index: auto`, its right edge matches the viewport as the last in-flow flex child, and ancestor `overflow-hidden` does not clip `w-[calc(100vw-…)]` at any breakpoint.

## Tests and Tooling

- Regression tests must distinguish intended failure from setup failure, exercise production wiring, and derive expectations from live fixtures and execution order. Search the owning package’s `tests/` directory for newly exported symbols before reporting missing coverage.

_(truncated at 8192 bytes — the next optimization pass must shorten it)_