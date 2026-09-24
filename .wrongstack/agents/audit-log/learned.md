# Learned instructions for `audit-log`

> Project-specific learning data for the `audit-log` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-09-24T07:07:33.954Z; skill=audit-log -->
- **Always audit WebUI scroll bugs against the view-registry contract in `packages/webui/src/components/view-registry.ts`: the standard `wrapperClassName` (`flex-1 min-h-0 min-w-0 overflow-hidden`) is a **block** box under `overflow-hidden` ancestors, so every registered view root must carry `h-full` (not rely on `flex-1`) plus its own scroll container. Check each responsive `flex-col`-below-breakpoint variant for `shrink-0` panes with intrinsic height — they go unbounded and collapse `flex-1 min-h-0` siblings (ChimeraReviewsView journal, RepositoryHistoryView metadata).**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/webui/src/components/view-registry.ts`
  - *How:* `wrapperClassName`
  - *How:* `flex-1 min-h-0 min-w-0 overflow-hidden`
  - *How:* `overflow-hidden`
  - *How:* `h-full`
  - *How:* `flex-1`
  - *How:* `flex-col`
  - *How:* `shrink-0`
  - *How:* `flex-1 min-h-0`

<!-- learned-stamp: category=convention; capturedAt=2026-09-12T16:26:06.529Z; skipped=1; skippedWins=1 -->
- **When adding a TUI panel that delegates to `requestModelPick`, test both the key-controller handoff in `packages/tui/tests/picker-keys.test.ts` and model-picker/modal coexistence in the rendered view—generic `pick` requests intentionally keep the caller panel state open.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `requestModelPick`
  - *How:* `packages/tui/tests/picker-keys.test.ts`
  - *How:* `pick`

---
*Last capture: 2026-09-24T07:07:33.954Z · 2 entries*
