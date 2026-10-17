# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-17T22:47:19.371Z; skill=codebase-navigation -->
- **Always grep for CSS class names rendered by a component (e.g. `.workspace-notes` targeted in `packages/vibeui/tests/browser-smoke.mjs`) when closing a React component's blast radius — browser tests select by class, not symbol, so `codebase-incoming-calls` misses them.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.workspace-notes`
  - *How:* `packages/vibeui/tests/browser-smoke.mjs`
  - *How:* `codebase-incoming-calls`

---
*Last capture: 2026-10-17T22:47:19.371Z · 1 entries*
