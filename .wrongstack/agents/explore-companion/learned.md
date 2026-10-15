# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-15T16:29:45.837Z; skill=codebase-navigation; skipped=7; skippedWins=7 -->
- **Never pass a filename stem (e.g. `secret-scrubber-patterns`) to `codebase-impact-analysis` — it returns `symbolFound=false`. Probe exported symbols (`codebase-incoming-calls` on `PATTERNS`) plus a repo-wide module-path grep (`secret-scrubber-patterns(\.js)?`) to establish consumer closure for unbarreled data modules like `packages/core/src/security/secret-scrubber-patterns.ts`.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `secret-scrubber-patterns`
  - *How:* `codebase-impact-analysis`
  - *How:* `symbolFound=false`
  - *How:* `codebase-incoming-calls`
  - *How:* `PATTERNS`
  - *How:* `secret-scrubber-patterns(\.js)?`
  - *How:* `packages/core/src/security/secret-scrubber-patterns.ts`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-14T22:30:26.632Z; applied=7; wins=7; skipped=107; skippedWins=107 -->
- **Always check a proof round's directory contents (`tree`) before describing its runner: presence of `run.mjs` vs `vitest.proof.config.mts` determines the run command, and `vitest.proof.config.mts` files require `root` at repo root plus forward-slash `include` or Vitest silently collects 0 tests on Windows.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `tree`
  - *How:* `run.mjs`
  - *How:* `vitest.proof.config.mts`
  - *How:* `root`
  - *How:* `include`

<!-- learned-stamp: category=convention; capturedAt=2026-10-15T15:22:08.431Z; applied=5; wins=5; skipped=22; skippedWins=22 -->
- **Always include `suggested_next_steps` (empty array is valid) in `submit_result` — the schema requires it even for a complete probe answer with no follow-up.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `suggested_next_steps`
  - *How:* `submit_result`

<!-- learned-stamp: category=convention; capturedAt=2026-10-14T22:47:12.943Z; applied=1; wins=1; skipped=111; skippedWins=111 -->
- **Always tree the proof round directory before describing a `final-compare.test.ts`-style harness as runnable — imports like `./run-seam.js` / `./run-baseline.js` may have been lost when the file was copied between rounds (`.temp_files/proof-driven-bug-hunter/<round>/`), and Vitest module-resolution failure, not the defect, becomes the outcome.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `final-compare.test.ts`
  - *How:* `./run-seam.js`
  - *How:* `./run-baseline.js`
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`

<!-- learned-stamp: category=convention; capturedAt=2026-10-15T15:55:45.365Z; skipped=15; skippedWins=15 -->
- **When probing packages like `@wrongstack/webui` whose names prefix-match siblings (`@wrongstack/webui-server`, `-protocol`), always end the bare-specifier grep with `@wrongstack/webui"` (closing quote) and classify every hit by full import specifier — index tools and broad greps otherwise return mostly prefix-match noise from bun.lock and `.wrongstack/atlas/atlas.json`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `@wrongstack/webui`
  - *How:* `@wrongstack/webui-server`
  - *How:* `-protocol`
  - *How:* `@wrongstack/webui"`
  - *How:* `.wrongstack/atlas/atlas.json`

## Project facts

<!-- learned-stamp: category=fact; capturedAt=2026-10-14T22:51:52.559Z; skill=codebase-navigation; skipped=110; skippedWins=110 -->
- **Classify `packages/webui-server/tests/*.test.ts` dependents by grepping the test stem repo-wide, not by import tools — suites export nothing, so their only consumers are Vitest include globs and `architecture/*.json` data ratchets that list file paths.**
  - *Why:* Current state of the project — assumed by other conventions, build steps, or peers, so acting on a stale assumption wastes a cycle.
  - *How:* `packages/webui-server/tests/*.test.ts`
  - *How:* `architecture/*.json`

<!-- learned-stamp: category=fact; capturedAt=2026-10-15T13:30:10.057Z; skill=codebase-navigation; applied=2; wins=2; skipped=49; skippedWins=49 -->
- **Treat version-pinning files like `.bun-version` as data, not code: answer consumer probes with direct `read` plus repo-wide `grep` on the filename — index/skeleton/call-graph tools return nothing for them, and CI workflows typically duplicate the literal instead of reading the file.**
  - *Why:* Current state of the project — assumed by other conventions, build steps, or peers, so acting on a stale assumption wastes a cycle.
  - *How:* `.bun-version`
  - *How:* `read`
  - *How:* `grep`

---
*Last capture: 2026-10-15T16:29:45.837Z · 7 entries*
