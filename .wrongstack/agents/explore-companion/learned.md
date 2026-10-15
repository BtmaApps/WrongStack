# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-14T22:30:26.632Z; applied=7; wins=7; skipped=72; skippedWins=72 -->
- **Always check a proof round's directory contents (`tree`) before describing its runner: presence of `run.mjs` vs `vitest.proof.config.mts` determines the run command, and `vitest.proof.config.mts` files require `root` at repo root plus forward-slash `include` or Vitest silently collects 0 tests on Windows.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `tree`
  - *How:* `run.mjs`
  - *How:* `vitest.proof.config.mts`
  - *How:* `root`
  - *How:* `include`

<!-- learned-stamp: category=convention; capturedAt=2026-10-14T22:47:12.943Z; applied=1; wins=1; skipped=76; skippedWins=76 -->
- **Always tree the proof round directory before describing a `final-compare.test.ts`-style harness as runnable — imports like `./run-seam.js` / `./run-baseline.js` may have been lost when the file was copied between rounds (`.temp_files/proof-driven-bug-hunter/<round>/`), and Vitest module-resolution failure, not the defect, becomes the outcome.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `final-compare.test.ts`
  - *How:* `./run-seam.js`
  - *How:* `./run-baseline.js`
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`

## Project facts

<!-- learned-stamp: category=fact; capturedAt=2026-10-14T22:51:52.559Z; skill=codebase-navigation; skipped=75; skippedWins=75 -->
- **Classify `packages/webui-server/tests/*.test.ts` dependents by grepping the test stem repo-wide, not by import tools — suites export nothing, so their only consumers are Vitest include globs and `architecture/*.json` data ratchets that list file paths.**
  - *Why:* Current state of the project — assumed by other conventions, build steps, or peers, so acting on a stale assumption wastes a cycle.
  - *How:* `packages/webui-server/tests/*.test.ts`
  - *How:* `architecture/*.json`

<!-- learned-stamp: category=fact; capturedAt=2026-10-15T13:30:10.057Z; skill=codebase-navigation; applied=1; wins=1; skipped=15; skippedWins=15 -->
- **Treat version-pinning files like `.bun-version` as data, not code: answer consumer probes with direct `read` plus repo-wide `grep` on the filename — index/skeleton/call-graph tools return nothing for them, and CI workflows typically duplicate the literal instead of reading the file.**
  - *Why:* Current state of the project — assumed by other conventions, build steps, or peers, so acting on a stale assumption wastes a cycle.
  - *How:* `.bun-version`
  - *How:* `read`
  - *How:* `grep`

---
*Last capture: 2026-10-15T13:30:10.057Z · 4 entries*
