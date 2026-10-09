# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-09T07:47:49.459Z; skill=codebase-navigation -->
- **Always map one-shot scratch scripts under `.temp_files/proof-driven-bug-hunter/<round>/` with direct `read`, a `tree` of the round dir, and a repo-wide grep of the script's hardcoded needle strings — the codebase index and rg both skip the gitignored `.temp_files` tree, so `codebase-search`/`codebase-incoming-calls` return nothing, and grepping distinctive literals (e.g. `SCRUBBED_FREE_TEXT_FIELDS` → `packages/core/tests/storage/session-scrub-parity.test.ts`) recovers the real execution target. Treat "all needles absent from the target" as proof the script already ran and any re-run will fail closed.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`
  - *How:* `read`
  - *How:* `tree`
  - *How:* `.temp_files`
  - *How:* `codebase-search`
  - *How:* `codebase-incoming-calls`
  - *How:* `SCRUBBED_FREE_TEXT_FIELDS`
  - *How:* `packages/core/tests/storage/session-scrub-parity.test.ts`

---
*Last capture: 2026-10-09T07:47:49.459Z · 1 entries*
