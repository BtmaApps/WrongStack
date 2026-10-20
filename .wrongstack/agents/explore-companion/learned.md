# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-20T09:39:07.270Z; skill=codebase-navigation; skipped=7; skippedWins=7 -->
- **When probing TUI card-frame modules, treat `react-wrap-truncate.ts` as internal to `packages/tui/src/components/sidebar-card.tsx` — no direct test or other importer exists; behavioral coverage lives in `packages/tui/tests/card-frame-integrity.test.tsx` via the `Card`/`SidebarPanelCard` chain.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `react-wrap-truncate.ts`
  - *How:* `packages/tui/src/components/sidebar-card.tsx`
  - *How:* `packages/tui/tests/card-frame-integrity.test.tsx`
  - *How:* `Card`
  - *How:* `SidebarPanelCard`

---
*Last capture: 2026-10-20T09:39:07.270Z · 1 entries*
