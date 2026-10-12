# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-10T09:57:35.513Z; skill=codebase-navigation; applied=87; wins=87; skipped=536; skippedWins=536 -->
- **Always check `architecture/test-skip-budget.json` and `docs/reports/architecture-health-current.json` for dependents of test files under `packages/*/tests/` — these data ratchets are the only "importers" a spec typically has, and edits to its skip structure or content require re-syncing via root `check:architecture`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `architecture/test-skip-budget.json`
  - *How:* `docs/reports/architecture-health-current.json`
  - *How:* `packages/*/tests/`
  - *How:* `check:architecture`

<!-- learned-stamp: category=convention; capturedAt=2026-10-11T11:29:36.005Z; skill=codebase-navigation; applied=67; wins=67; skipped=377; skippedWins=377 -->
- **Always grep `formatOutput` repo-wide before attributing callers — it collides with a local helper in `packages/cli/src/slash-commands/dev.ts` and `formatOutputBytes` in `packages/webui`, which `codebase-incoming-calls` flags as ambiguous multi-file symbols.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `formatOutput`
  - *How:* `packages/cli/src/slash-commands/dev.ts`
  - *How:* `formatOutputBytes`
  - *How:* `packages/webui`
  - *How:* `codebase-incoming-calls`

<!-- learned-stamp: category=convention; capturedAt=2026-10-12T06:33:25.149Z; applied=4; wins=4; skipped=139; skippedWins=139 -->
- **Always tree the round dir before reporting a `.temp_files/proof-driven-bug-hunter/<round>/*.config.ts` as runnable — a config whose `include` target is absent (e.g. `baseline-control.test.ts` without its test file) makes `vitest run -c` collect 0 tests silently green, which reads as a passing baseline but proves nothing.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/*.config.ts`
  - *How:* `include`
  - *How:* `baseline-control.test.ts`
  - *How:* `vitest run -c`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-11T10:49:59.069Z; skill=codebase-navigation; applied=187; wins=187; skipped=286; skippedWins=286 -->
- **Always bypass index tools for `.temp_files/proof-driven-bug-hunter/<round>/` config mapping — the index and rg skip `.temp_files`, so use direct `read`, `tree` of the round dir, and an in-dir grep for the config filename (a 0-match there proves external-only invocation, e.g. `vitest run -c`), not absence of callers.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`
  - *How:* `.temp_files`
  - *How:* `read`
  - *How:* `tree`
  - *How:* `vitest run -c`

---
*Last capture: 2026-10-12T06:33:25.149Z · 4 entries*
