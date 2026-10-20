# Reviewer Agent Instructions

## Evidence and Review Coverage

- Review current on-disk source, not only handed-off diffs or snippets. External edits may have added or superseded relevant code. Resolve every finding to a live `file:line` citation.
- Before reviewing claimed work, prove it exists with `git status -- <target paths>` and `rg` for feature identifiers. If target changes are absent, request changes; reserve “needs verification” for present but unchecked code.
- Trace changed contracts end to end: producers, validators, consumers, production wiring, persistence or replay paths, and tests. Mock-only behavior does not prove production correctness.
- Search the owning package’s `tests/` directory for every newly exported symbol before reporting missing regression coverage. Tests may exist outside the changed-file bundle; inspect their expectations against the implementation.
- Do not trust a truncated `grep` rendering. If `count=N` exceeds visible matches or conflicts with a direct read, use explicit `offset`/`limit` reads or inspect saved output under `C:\Users\ersin\.wrongstack\tool-output\`. Trust the direct source read for boundary operators and exact semantics.
- Check missing modules and imports by explicit path; an empty brace-expansion `glob` is inconclusive.
- Treat comments, docs, tests, and nearby code as leads, not proof. Confirm reachable runtime behavior.
- Use `{"findings": []}` only when no defect is confirmed and review coverage is complete. If coverage is incomplete, identify unread anchors and report partial completion.

## Dependency and Contract Checks

- For new WebSocket routes, verify the server handler under `packages/webui-server/src/server/`, the client action in `packages/webui/src/lib/ws-client-actions.ts`, and every new i18n key in all seven locale files, including `src/i18n/locales/tr/activity.json`.
- Validate new WS payloads against every server-validator branch and confirm replies preserve required fields such as `requestId` and `success`.
- For new required configuration keys, grep for a stable sibling key to locate old fixtures and consumers; searching only for the new key misses omissions. Recount source literals behind length assertions.
- Treat `pnpm-workspace.yaml` `overrides:` as authoritative. Root `package.json` overrides are not pnpm configuration. Check new version floors against `minimumReleaseAge` and exclusions.
- Attribute lockfile references to importer blocks, not nearby lines.
- For `@wrongstack/core/*` imports, verify `packages/core/package.json` exports and source barrels, distinguishing runtime values from type-only exports.
- Before removing exports, read complete multiline imports repo-wide. Before deleting `architecture/test-only-exports.json` entries, search for static imports of the symbol.
- When positional parameters are inserted before optional callbacks, inspect every call site for silently shifted arguments.

## Runtime, Data, and Control Flow

- Enumerate every discriminated-union variant before approving fall-through or exhaustive switches.
- Remember that `value ?? fallback` preserves `''` and `NaN`; normalize invalid producer values explicitly. Validate negative numbers before using `slice` or SQL `LIMIT`.
- Clamp environment-derived timer delays to `2_147_483_647` after finite/minimum validation; larger Node delays may fire almost immediately.
- Validate parser rewrites and generated text against the consuming grammar, including quoting, comments, spacing, bracket depth, and path rules.
- Search event literals across types, production writers, loaders, replay logic, and summary folds. Legacy-load and replay branches must not double-apply events.
- For telemetry at resource admission, verify it fires once on the first attempt, only after successful spawn, and degrades when the hook is absent. The delegation pattern is `dir.onSpawnRouted?.(...)` inside `handoffCount === 0` in `packages/core/src/coordination/delegation/run-delegation.ts`.
- In never-throw wrappers, contain observer callback failures inside notification code.
- Before alleging lost error logging, enumerate throw sites, catch boundaries, and upstream warnings.

## Lifecycle and Concurrency

- Reset cached deterministic verdicts at the beginning of each attempt so retry state cannot leak.
- Normalize teardown promises to never reject before `Promise.race`, and unref grace timers.
- Check `AbortController` identity together with `close()` behavior; superseded callbacks must not mutate shared signals or cleanup state.
- Validate batch width and progress guarantees; `splice(0, 0)` creates non-progressing empty batches.
- State-owning refactors must release all related resources on settle, cancel, and timeout: target, lock, timer, and held fallback.
- `Object.defineProperty` values must be enumerable if iterated and configurable if removed. `Object.hasOwn` remains true when an own value is `undefined`.
- Bound methods returning `this` can return the original object and bypass wrapper overrides.

## SQL and Graph Reviews

- When replacing per-target SQL with a broad scan plus `targets.has(...)`, verify self-exclusion is preserved in memory, untouched rows are not rewritten, and broadened JSON predicates are safe for scalar values. Review `packages/sage/src/sqlite-store-graph-helpers.ts` directly.
- For chunked BFS degree caps in `packages/sage/src/sqlite-store-graph-traverse.ts`, ensure each row from `WHERE from_node IN (…) OR to_node IN (…)` is attributed to exactly one frontier node, using a deterministic precedence such as `from` first.

## UI, CSS, and Browser Behavior

- Resolve CSS `@import` paths and every referenced custom property against disk. In VibeUI, typography/corner tokens belong in `packages/vibeui/src/app/design-tokens.css`; color/surface tokens may remain theme-scoped in `packages/vibeui/src/app/globals.css`. Undefined variables can silently invalidate `font-size` or `border-radius`.
- For utility-to-class refactors, verify each class exists and modifier classes are paired with their required base class on the same element.
- Before flagging deleted container styling, inspect replacement component rules. Shared selectors such as `.code-panel pre` may now provide `max-height` and `overflow`.
- Verify browser-smoke hooks reach the DOM. In `packages/webui`, `useConfigStore.setPalette` does not itself set `<html data-palette>`; trace `ThemeProvider`, `applyPalette`, and direct attribute/class mutations.
- For delayed infinite SVG stroke animations, retain hidden pre-animation state with `animation-fill-mode: backwards`; otherwise delayed strokes can flash fully drawn after cancellation or re-entry. Check `.oxog-mark` in `website/src/index.css` and `OxogMark`.
- Canvas tests must verify CSS token values are nonempty before assigning `ctx.fillStyle`; invalid assignments silently preserve the previous color.
- Tab-sweep tests should detect wrap-around by element identity, not label, and include enough stops to reject an empty sweep. `aria-activedescendant` must follow rendered option order.

## Tests and Tooling

- Regression tests must distinguish intended failure from setup failure, exercise production wiring, and derive expectations from live fixtures and execution order.
- Under `bun --bun vitest` on Windows, avoid inline `node -e` argument assertions; write a temporary `.cjs` script and inspect `process.argv.slice(2)`.
- Node builtin mocks must match production import shape, provide every accessed member, and emit awaited events. Inspect unmocked branches for early returns and throws.
- In browser smoke tests, strict message counts require validating the application’s socket topology and broadcast loops. A `page.clock.install()` is safe only if later steps do not require real app timers.
- For gitignore negation, evaluate excluded ancestors against the complete rule list and preserve explicit directory re-inclusion.
- Resolve documentation links against actual headings; GitHub anchors remove punctuation such as `&`, `/`, `+`, and em dashes and replace spaces with hyphens.