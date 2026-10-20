# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-20T10:56:44.103Z; skill=codebase-navigation; applied=8; wins=8; skipped=29; skippedWins=29 -->
- **When probing test files in `packages/primitives/tests/regex-ambiguity.test.ts`, treat the assertion verdicts (`ambiguous`/`unambiguous`/`unparsable`) as a pinned cross-layer contract: they gate `packages/primitives/src/regex-guard.ts` rejection behavior and are mirrored in `regex-guard.test.ts` and `docs/adr/adr-004-step-budgeted-regex-ambiguity-matcher.md` — always check all three before changing expectations.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/primitives/tests/regex-ambiguity.test.ts`
  - *How:* `ambiguous`
  - *How:* `unambiguous`
  - *How:* `unparsable`
  - *How:* `packages/primitives/src/regex-guard.ts`
  - *How:* `regex-guard.test.ts`
  - *How:* `docs/adr/adr-004-step-budgeted-regex-ambiguity-matcher.md`

<!-- learned-stamp: category=convention; capturedAt=2026-10-20T09:39:07.270Z; skill=codebase-navigation; skipped=80; skippedWins=80 -->
- **When probing TUI card-frame modules, treat `react-wrap-truncate.ts` as internal to `packages/tui/src/components/sidebar-card.tsx` — no direct test or other importer exists; behavioral coverage lives in `packages/tui/tests/card-frame-integrity.test.tsx` via the `Card`/`SidebarPanelCard` chain.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `react-wrap-truncate.ts`
  - *How:* `packages/tui/src/components/sidebar-card.tsx`
  - *How:* `packages/tui/tests/card-frame-integrity.test.tsx`
  - *How:* `Card`
  - *How:* `SidebarPanelCard`

---
*Last capture: 2026-10-20T10:56:44.103Z · 2 entries*
