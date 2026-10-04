# Learned instructions for `critic`

> Project-specific learning data for the `critic` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-08-28T11:33:25.739Z; skipped=5; skippedWins=5 -->
- **- When adding a field to a core event the WebUI relays, remember `packages/webui-server/src/server/setup-events.ts` rebuilds `provider.status_changed` WS payloads field-by-field (~) instead of spreading the event — a new event field (e.g. `stateExpiresAt`) must be added to that relay explicitly or the client never receives it, silently turning client-side handling into dead code. - `ProviderModelStatusTracker.restoreSnapshot()` (`packages/core/src/coordination/provider-status-tracker.ts`) unconditionally overwrites any existing in-memory pair state, so the CLI wiring 30s cross-sync (`packages…**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/webui-server/src/server/setup-events.ts`
  - *How:* `provider.status_changed`
  - *How:* `stateExpiresAt`
  - *How:* `ProviderModelStatusTracker.restoreSnapshot()`
  - *How:* `packages/core/src/coordination/provider-status-tracker.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-07-26T11:03:18.094Z; skipped=5; skippedWins=5 -->
- **Always interpret `depends_on` edges consumed by `TaskTracker` as `dependency → dependent`: `addDependency(depId, taskId)` stores `depId → taskId`, and `getBlockers(taskId)` reads edges whose `to` is `taskId`. Do not assume older SDD execution helpers use the same convention.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `depends_on`
  - *How:* `TaskTracker`
  - *How:* `dependency → dependent`
  - *How:* `addDependency(depId, taskId)`
  - *How:* `depId → taskId`
  - *How:* `getBlockers(taskId)`
  - *How:* `to`
  - *How:* `taskId`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-07-26T15:29:27.097Z; skipped=5; skippedWins=5 -->
- **Always route Kanban task status, assignment status, managed lifecycle, recovery, and board projection through one canonical command reducer; adding another surface-specific mutation path creates state-machine drift that reconciliation can only mask. Capture verification baselines when an execution attempt starts and bind all evidence to the attempt ID, fencing epoch, task specification revision, and output tree; a snapshot captured when completion verification begins cannot prove the worker's file scope.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.

<!-- learned-stamp: category=convention; capturedAt=2026-09-05T11:12:30.721Z; applied=2; wins=2; skipped=3; skippedWins=3 -->
- **Always verify coverage-exclusion justifications by grepping test imports of the excluded files — in `packages/plug-lsp/src/auto-doc/*-parser.ts` the comment "tested via integration" (`vitest.config.ts`, `packages/plug-lsp/vitest.config.ts`) is false: zero `*.test.*` files import those parsers. Exclusion comments rot exactly like test-count comments; treat both as claims to check, not facts.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/plug-lsp/src/auto-doc/*-parser.ts`
  - *How:* `vitest.config.ts`
  - *How:* `packages/plug-lsp/vitest.config.ts`
  - *How:* `*.test.*`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-04T17:57:41.491Z -->
- **Always enumerate a component's full `useWebSocket()`/`@/i18n` destructure and import surface with grep before writing render tests in `packages/webui` — `vi.mock('@/hooks/useWebSocket')` or `vi.mock('@/i18n')` factories that replace the whole module silently leave `updatePrefs`/`switchAutonomy` (SessionPanel.tsx) or `{ i18n }` bindings undefined for every module in the import graph; prefer `vi.importActual` spread when the subtree is large. Accessible-name assertions work without jest-dom (not in `packages/webui/vitest.config.ts` setupFiles): use `getByRole('textbox', { name })` which computes names from `aria-label`, plus explicit `getAttribute` checks; `commandPalette` is an inline en namespace (`src/i18n/index.ts`) while `activity`/`settings` load async via `tests/setup/i18n-deferred.ts`.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `useWebSocket()`
  - *How:* `@/i18n`
  - *How:* `packages/webui`
  - *How:* `vi.mock('@/hooks/useWebSocket')`
  - *How:* `vi.mock('@/i18n')`
  - *How:* `updatePrefs`
  - *How:* `switchAutonomy`
  - *How:* `{ i18n }`
  - *How:* `vi.importActual`
  - *How:* `packages/webui/vitest.config.ts`
  - *How:* `getByRole('textbox', { name })`
  - *How:* `aria-label`
  - *How:* `getAttribute`
  - *How:* `commandPalette`
  - *How:* `src/i18n/index.ts`
  - *How:* `activity`
  - *How:* `settings`
  - *How:* `tests/setup/i18n-deferred.ts`

---
*Last capture: 2026-10-04T17:57:41.491Z · 5 entries*
