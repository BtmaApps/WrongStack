# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-15T16:29:45.837Z; skill=codebase-navigation; applied=9; wins=9; skipped=198; skippedWins=198 -->
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

<!-- learned-stamp: category=convention; capturedAt=2026-10-14T22:30:26.632Z; applied=16; wins=16; skipped=298; skippedWins=298 -->
- **Always check a proof round's directory contents (`tree`) before describing its runner: presence of `run.mjs` vs `vitest.proof.config.mts` determines the run command, and `vitest.proof.config.mts` files require `root` at repo root plus forward-slash `include` or Vitest silently collects 0 tests on Windows.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `tree`
  - *How:* `run.mjs`
  - *How:* `vitest.proof.config.mts`
  - *How:* `root`
  - *How:* `include`

<!-- learned-stamp: category=convention; capturedAt=2026-10-16T06:04:08.838Z; skill=codebase-navigation; applied=17; wins=17; skipped=63; skippedWins=63 -->
- **Always close consumer probes for small domain modules by combining the module-path grep (`./vibe(\.js)?["']`) with a symbol-name grep — barrel re-exports (e.g. `packages/requirement-intake/src/index.ts`) hide consumers behind the package alias `@wrongstack/requirement-intake`, so a module-path grep alone shows only intra-package imports.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `./vibe(\.js)?["']`
  - *How:* `packages/requirement-intake/src/index.ts`
  - *How:* `@wrongstack/requirement-intake`

<!-- learned-stamp: category=convention; capturedAt=2026-10-15T15:22:08.431Z; applied=22; wins=22; skipped=205; skippedWins=205 -->
- **Always include `suggested_next_steps` (empty array is valid) in `submit_result` — the schema requires it even for a complete probe answer with no follow-up.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `suggested_next_steps`
  - *How:* `submit_result`

<!-- learned-stamp: category=convention; capturedAt=2026-10-15T20:43:48.313Z; applied=13; wins=13; skipped=111; skippedWins=111 -->
- **Always infer an in-progress fix's subject from mtime-descending `glob` over `packages/**/src/**` paired with `packages/**/tests/**` when the probe names only a vague todo — the freshest matching production/test pair plus the fix's own header comment is usually sufficient to map symbols without reading full files.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `glob`
  - *How:* `packages/**/src/**`
  - *How:* `packages/**/tests/**`

<!-- learned-stamp: category=convention; capturedAt=2026-10-15T20:52:53.761Z; skill=codebase-navigation; applied=1; wins=1; skipped=112; skippedWins=112 -->
- **Always pair a `timingSafeTokenEqual`/shared-helper probe with a quick `codebase-search` on the helper name before reporting gateway crypto imports as local — `packages/primitives/src/timing-safe.ts` is the repo's canonical constant-time compare seam, and fresh gateway edits may already route through it.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `timingSafeTokenEqual`
  - *How:* `codebase-search`
  - *How:* `packages/primitives/src/timing-safe.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-15T20:04:33.686Z; applied=11; wins=11; skipped=172; skippedWins=172 -->
- **Always report a proof round's runner contract from both `vitest.proof.config.mjs` (presence of `run.mjs`, `root` default, `include` spelling) and the test's own production imports — in `.temp_files/proof-driven-bug-hunter/<round>/`, the test's only "dependents" are the config's `include` globs, so blast radius for editing the proof file is always round-local.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `vitest.proof.config.mjs`
  - *How:* `run.mjs`
  - *How:* `root`
  - *How:* `include`
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`

<!-- learned-stamp: category=convention; capturedAt=2026-10-15T20:29:10.935Z; applied=15; wins=15; skipped=129; skippedWins=129 -->
- **Always scaffold proof-round vitest configs by copying an existing round's `vitest.proof.config.mjs` under `.temp_files/proof-driven-bug-hunter/` — its `root: repoRoot`, forward-slash `include`, and `coreAliases()` wiring are load-bearing on Windows; the "Record the starting state" contract (revision + dirty paths + pre-failing tests) lives in `packages/core/skills/verify-before-done/SKILL.md`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `vitest.proof.config.mjs`
  - *How:* `.temp_files/proof-driven-bug-hunter/`
  - *How:* `root: repoRoot`
  - *How:* `include`
  - *How:* `coreAliases()`
  - *How:* `packages/core/skills/verify-before-done/SKILL.md`

<!-- learned-stamp: category=convention; capturedAt=2026-10-14T22:47:12.943Z; applied=3; wins=3; skipped=309; skippedWins=309 -->
- **Always tree the proof round directory before describing a `final-compare.test.ts`-style harness as runnable — imports like `./run-seam.js` / `./run-baseline.js` may have been lost when the file was copied between rounds (`.temp_files/proof-driven-bug-hunter/<round>/`), and Vitest module-resolution failure, not the defect, becomes the outcome.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `final-compare.test.ts`
  - *How:* `./run-seam.js`
  - *How:* `./run-baseline.js`
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`

<!-- learned-stamp: category=convention; capturedAt=2026-10-15T20:32:50.590Z; skill=codebase-navigation; applied=124; wins=124; skipped=8; skippedWins=8 -->
- **When a probe names a vague leader todo ("final diff review, round report") with no file hint, orient via `glob` mtime-descending over `packages/**/src/**` to cluster the freshest edits, then `codebase-skeleton` the top cluster plus its matching `tests/` directory — skip `.temp_files/proof-driven-bug-hunter/` mapping when a glob shows no round exists.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `glob`
  - *How:* `packages/**/src/**`
  - *How:* `codebase-skeleton`
  - *How:* `tests/`
  - *How:* `.temp_files/proof-driven-bug-hunter/`

<!-- learned-stamp: category=convention; capturedAt=2026-10-15T15:55:45.365Z; applied=25; wins=25; skipped=190; skippedWins=190 -->
- **When probing packages like `@wrongstack/webui` whose names prefix-match siblings (`@wrongstack/webui-server`, `-protocol`), always end the bare-specifier grep with `@wrongstack/webui"` (closing quote) and classify every hit by full import specifier — index tools and broad greps otherwise return mostly prefix-match noise from bun.lock and `.wrongstack/atlas/atlas.json`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `@wrongstack/webui`
  - *How:* `@wrongstack/webui-server`
  - *How:* `-protocol`
  - *How:* `@wrongstack/webui"`
  - *How:* `.wrongstack/atlas/atlas.json`

## Project facts

<!-- learned-stamp: category=fact; capturedAt=2026-10-14T22:51:52.559Z; skill=codebase-navigation; applied=4; wins=4; skipped=306; skippedWins=306 -->
- **Classify `packages/webui-server/tests/*.test.ts` dependents by grepping the test stem repo-wide, not by import tools — suites export nothing, so their only consumers are Vitest include globs and `architecture/*.json` data ratchets that list file paths.**
  - *Why:* Current state of the project — assumed by other conventions, build steps, or peers, so acting on a stale assumption wastes a cycle.
  - *How:* `packages/webui-server/tests/*.test.ts`
  - *How:* `architecture/*.json`

<!-- learned-stamp: category=fact; capturedAt=2026-10-15T19:59:22.221Z; skill=codebase-navigation; applied=24; wins=24; skipped=164; skippedWins=164 -->
- **For `packages/cli/tests/wrongforge-leader/*` suites, establish dependents with a repo-wide stem grep plus the architecture JSON ratchets (`architecture/test-only-exports.json`, `docs/reports/architecture-health-current.json`) — they export nothing and have no importers, and cross-package consumers of the production module appear only via module-path grep (`wrongforge-leader-provider(\.js)?`), not via symbol impact tools.**
  - *Why:* Current state of the project — assumed by other conventions, build steps, or peers, so acting on a stale assumption wastes a cycle.
  - *How:* `packages/cli/tests/wrongforge-leader/*`
  - *How:* `architecture/test-only-exports.json`
  - *How:* `docs/reports/architecture-health-current.json`
  - *How:* `wrongforge-leader-provider(\.js)?`

<!-- learned-stamp: category=fact; capturedAt=2026-10-15T13:30:10.057Z; skill=codebase-navigation; applied=2; wins=2; skipped=249; skippedWins=249 -->
- **Treat version-pinning files like `.bun-version` as data, not code: answer consumer probes with direct `read` plus repo-wide `grep` on the filename — index/skeleton/call-graph tools return nothing for them, and CI workflows typically duplicate the literal instead of reading the file.**
  - *Why:* Current state of the project — assumed by other conventions, build steps, or peers, so acting on a stale assumption wastes a cycle.
  - *How:* `.bun-version`
  - *How:* `read`
  - *How:* `grep`

---
*Last capture: 2026-10-16T06:04:08.838Z · 14 entries*
