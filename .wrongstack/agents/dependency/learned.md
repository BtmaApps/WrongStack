# Learned instructions for `dependency`

> Project-specific learning data for the `dependency` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-26T19:35:31.096Z; skill=tech-stack; applied=1; wins=1 -->
- **In a live multi-agent worktree, a failing `bun install --frozen-lockfile --dry-run` may reflect a mid-migration snapshot, not real drift: before reporting lockfile disagreement, re-check the current state (grep the importer block/version in `bun.lock`) and re-run the probe once — then report the result as point-in-time and tell the integrator to re-verify before commit.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers. Project signals: guard before shipping.
  - *How:* `bun install --frozen-lockfile --dry-run`
  - *How:* `bun.lock`

---
*Last capture: 2026-10-26T19:35:31.096Z · 1 entries*
