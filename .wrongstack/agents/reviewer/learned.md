# Learned instructions for `reviewer`

> Project-specific learning data for the `reviewer` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-08T15:05:09.222Z; skill=chimera; applied=2; wins=2; skipped=12; skippedWins=12 -->
- **When reviewing a dependency removal in a `package.json`, verify lockfile sync by matching remaining references to their owning importer block: pnpm prunes fully-unused package resolutions, so zero references for a removed dep means the lockfile was regenerated, and a surviving reference is legitimate only if its importer block's dep set matches a *different* package (compare sibling deps like select/separator/tabs against the edited `package.json`). Never attribute a lockfile reference by line proximity alone. ```json { "findings": [] } ```**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `package.json`
  - *How:* `json { "findings": [] }`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-08T15:22:10.673Z; skill=chimera; applied=3; wins=3; skipped=9; skippedWins=9 -->
- **Treat the `Number.isFinite(x) && x >= min ? Math.min(x, 2_147_483_647) : DEFAULT` guard as the established convention for env-configured timer durations across WrongStack project servers (`mailbox-project-server*.ts`, `session-catalog/project-server.ts`, `kanban/src/server/project-server.ts`, `sage/src/project-server.ts`, `tools/src/codebase-index/project-server.ts`) — Node clamps `setTimeout`/`setInterval` delays above 2^31−1 ms to 1 ms. When reviewing new env-parsed idle/heartbeat values, a missing `Math.min(..., 2_147_483_647)` clamp is a real bug (1 ms flood); the clamp's presence is correct, not a magic number. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `Number.isFinite(x) && x >= min ? Math.min(x, 2_147_483_647) : DEFAULT`
  - *How:* `mailbox-project-server*.ts`
  - *How:* `session-catalog/project-server.ts`
  - *How:* `kanban/src/server/project-server.ts`
  - *How:* `sage/src/project-server.ts`
  - *How:* `tools/src/codebase-index/project-server.ts`
  - *How:* `setTimeout`
  - *How:* `setInterval`
  - *How:* `Math.min(..., 2_147_483_647)`
  - *How:* `json { "findings": [] }`

---
*Last capture: 2026-10-08T15:22:10.673Z · 2 entries*
