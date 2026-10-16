# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-15T16:29:45.837Z; skill=codebase-navigation; applied=18; wins=18; skipped=357; skippedWins=357 -->
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

<!-- learned-stamp: category=convention; capturedAt=2026-10-14T22:30:26.632Z; applied=35; wins=35; skipped=447; skippedWins=447 -->
- **Always check a proof round's directory contents (`tree`) before describing its runner: presence of `run.mjs` vs `vitest.proof.config.mts` determines the run command, and `vitest.proof.config.mts` files require `root` at repo root plus forward-slash `include` or Vitest silently collects 0 tests on Windows.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `tree`
  - *How:* `run.mjs`
  - *How:* `vitest.proof.config.mts`
  - *How:* `root`
  - *How:* `include`

<!-- learned-stamp: category=convention; capturedAt=2026-10-16T06:04:08.838Z; skill=codebase-navigation; applied=18; wins=18; skipped=230; skippedWins=230 -->
- **Always close consumer probes for small domain modules by combining the module-path grep (`./vibe(\.js)?["']`) with a symbol-name grep — barrel re-exports (e.g. `packages/requirement-intake/src/index.ts`) hide consumers behind the package alias `@wrongstack/requirement-intake`, so a module-path grep alone shows only intra-package imports.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `./vibe(\.js)?["']`
  - *How:* `packages/requirement-intake/src/index.ts`
  - *How:* `@wrongstack/requirement-intake`

<!-- learned-stamp: category=convention; capturedAt=2026-10-15T15:22:08.431Z; applied=52; wins=52; skipped=343; skippedWins=343 -->
- **Always include `suggested_next_steps` (empty array is valid) in `submit_result` — the schema requires it even for a complete probe answer with no follow-up.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `suggested_next_steps`
  - *How:* `submit_result`

<!-- learned-stamp: category=convention; capturedAt=2026-10-15T20:43:48.313Z; applied=20; wins=20; skipped=272; skippedWins=272 -->
- **Always infer an in-progress fix's subject from mtime-descending `glob` over `packages/**/src/**` paired with `packages/**/tests/**` when the probe names only a vague todo — the freshest matching production/test pair plus the fix's own header comment is usually sufficient to map symbols without reading full files.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `glob`
  - *How:* `packages/**/src/**`
  - *How:* `packages/**/tests/**`

<!-- learned-stamp: category=convention; capturedAt=2026-10-16T12:26:16.994Z; skill=codebase-navigation; applied=15; wins=15; skipped=24; skippedWins=24 -->
- **Always locate an active proof-driven-bug-hunter round by `tree`-ing `.temp_files/proof-driven-bug-hunter/` directly — a bare `glob '.temp_files/**'` can return zero files while the directory exists with contents, because repo ignore rules suppress glob traversal but not explicit tree reads.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `tree`
  - *How:* `.temp_files/proof-driven-bug-hunter/`
  - *How:* `glob '.temp_files/**'`

<!-- learned-stamp: category=convention; capturedAt=2026-10-16T11:54:25.450Z; applied=25; wins=25; skipped=43; skippedWins=43 -->
- **Always map a proof round's completeness by `tree`-ing `.temp_files/proof-driven-bug-hunter/<round>/` first — presence of only `proof.ts` (no `run.mjs`/`vitest.proof.config.mjs`/`REPORT.md`) means the round is a bare direct-run proof and "clean up round dir" resolves to deleting exactly that directory.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `tree`
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`
  - *How:* `proof.ts`
  - *How:* `run.mjs`
  - *How:* `vitest.proof.config.mjs`
  - *How:* `REPORT.md`

<!-- learned-stamp: category=convention; capturedAt=2026-10-16T12:05:25.678Z; applied=2; wins=2; skipped=59; skippedWins=59 -->
- **Always orient a "record state + audit fresh surface" Discover probe by globbing the target package mtime-descending AND the proof-round directory separately — an empty `.temp_files/proof-driven-bug-hunter/**` proves the round must be scaffolded, not resumed, and changes what "record state" means.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/proof-driven-bug-hunter/**`

<!-- learned-stamp: category=convention; capturedAt=2026-10-16T11:32:14.653Z; skill=codebase-navigation; applied=4; wins=4; skipped=76; skippedWins=76 -->
- **Always orient a vague "Discover/map fresh surfaces" probe with an mtime-descending `glob` over `packages/**/src/**` paired with `packages/**/tests/**`, then `codebase-skeleton` the top 3-4 files — the freshest production/test pair usually names the active feature without reading full bodies.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `glob`
  - *How:* `packages/**/src/**`
  - *How:* `packages/**/tests/**`
  - *How:* `codebase-skeleton`

<!-- learned-stamp: category=convention; capturedAt=2026-10-15T20:52:53.761Z; skill=codebase-navigation; applied=3; wins=3; skipped=278; skippedWins=278 -->
- **Always pair a `timingSafeTokenEqual`/shared-helper probe with a quick `codebase-search` on the helper name before reporting gateway crypto imports as local — `packages/primitives/src/timing-safe.ts` is the repo's canonical constant-time compare seam, and fresh gateway edits may already route through it.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `timingSafeTokenEqual`
  - *How:* `codebase-search`
  - *How:* `packages/primitives/src/timing-safe.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-16T11:01:48.131Z; applied=30; wins=30; skipped=84; skippedWins=84 -->
- **Always read a proof-round test's import list against its hook usage before predicting it will run — `.temp_files/proof-driven-bug-hunter/**` suites commonly call `beforeAll`/`afterAll` while importing only a subset from `vitest` under `globals: false`, which fails at collection time; pair the file read with a `tree` of the round directory to confirm whether any runner (`run.mjs` / `vitest.proof.config.mjs`) exists at all.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/proof-driven-bug-hunter/**`
  - *How:* `beforeAll`
  - *How:* `afterAll`
  - *How:* `vitest`
  - *How:* `globals: false`
  - *How:* `tree`
  - *How:* `run.mjs`
  - *How:* `vitest.proof.config.mjs`

<!-- learned-stamp: category=convention; capturedAt=2026-10-15T20:04:33.686Z; applied=42; wins=42; skipped=309; skippedWins=309 -->
- **Always report a proof round's runner contract from both `vitest.proof.config.mjs` (presence of `run.mjs`, `root` default, `include` spelling) and the test's own production imports — in `.temp_files/proof-driven-bug-hunter/<round>/`, the test's only "dependents" are the config's `include` globs, so blast radius for editing the proof file is always round-local.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `vitest.proof.config.mjs`
  - *How:* `run.mjs`
  - *How:* `root`
  - *How:* `include`
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`

<!-- learned-stamp: category=convention; capturedAt=2026-10-15T20:29:10.935Z; applied=56; wins=56; skipped=256; skippedWins=256 -->
- **Always scaffold proof-round vitest configs by copying an existing round's `vitest.proof.config.mjs` under `.temp_files/proof-driven-bug-hunter/` — its `root: repoRoot`, forward-slash `include`, and `coreAliases()` wiring are load-bearing on Windows; the "Record the starting state" contract (revision + dirty paths + pre-failing tests) lives in `packages/core/skills/verify-before-done/SKILL.md`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `vitest.proof.config.mjs`
  - *How:* `.temp_files/proof-driven-bug-hunter/`
  - *How:* `root: repoRoot`
  - *How:* `include`
  - *How:* `coreAliases()`
  - *How:* `packages/core/skills/verify-before-done/SKILL.md`

<!-- learned-stamp: category=convention; capturedAt=2026-10-16T12:48:44.801Z; skill=node-modern; applied=1; wins=1; skipped=10; skippedWins=10 -->
- **Always treat a "clean up round dir" todo's glob-zero result as inconclusive — repo ignore rules suppress `.temp_files/**` glob traversal, so confirm round-dir contents (and absence of nested `node_modules` junctions) with a direct `tree` of `.temp_files/proof-driven-bug-hunter/<round>/` before reporting the deletion scope.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/**`
  - *How:* `node_modules`
  - *How:* `tree`
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`

<!-- learned-stamp: category=convention; capturedAt=2026-10-14T22:47:12.943Z; applied=8; wins=8; skipped=472; skippedWins=472 -->
- **Always tree the proof round directory before describing a `final-compare.test.ts`-style harness as runnable — imports like `./run-seam.js` / `./run-baseline.js` may have been lost when the file was copied between rounds (`.temp_files/proof-driven-bug-hunter/<round>/`), and Vitest module-resolution failure, not the defect, becomes the outcome.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `final-compare.test.ts`
  - *How:* `./run-seam.js`
  - *How:* `./run-baseline.js`
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`

<!-- learned-stamp: category=convention; capturedAt=2026-10-16T12:39:02.135Z; skill=node-modern; applied=9; wins=9; skipped=8; skippedWins=8 -->
- **Always tree the specific round directory under `.temp_files/proof-driven-bug-hunter/` and read its `vitest.proof.config.mjs` include glob before predicting a proof test's filename/environment — the config's `environment: 'node'` plus a comment requiring an in-file jsdom pragma means the proof file name and pragma are contract-fixed, not free choices.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/proof-driven-bug-hunter/`
  - *How:* `vitest.proof.config.mjs`
  - *How:* `environment: 'node'`

<!-- learned-stamp: category=convention; capturedAt=2026-10-16T12:31:26.272Z; applied=12; wins=12; skipped=18; skippedWins=18 -->
- **Always verify a bug-hunt round's paper trail with a direct `tree` of `.temp_files/proof-driven-bug-hunter/` plus a repo-wide grep for `dedup ledger` before assuming round reports or ledgers persist on disk — this repo's protocol keeps them conversation-only, and an empty round dir means the report must be assembled from session history, not the tree.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `tree`
  - *How:* `.temp_files/proof-driven-bug-hunter/`
  - *How:* `dedup ledger`

<!-- learned-stamp: category=convention; capturedAt=2026-10-15T20:32:50.590Z; skill=codebase-navigation; applied=269; wins=269; skipped=31; skippedWins=31 -->
- **When a probe names a vague leader todo ("final diff review, round report") with no file hint, orient via `glob` mtime-descending over `packages/**/src/**` to cluster the freshest edits, then `codebase-skeleton` the top cluster plus its matching `tests/` directory — skip `.temp_files/proof-driven-bug-hunter/` mapping when a glob shows no round exists.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `glob`
  - *How:* `packages/**/src/**`
  - *How:* `codebase-skeleton`
  - *How:* `tests/`
  - *How:* `.temp_files/proof-driven-bug-hunter/`

<!-- learned-stamp: category=convention; capturedAt=2026-10-15T15:55:45.365Z; applied=48; wins=48; skipped=335; skippedWins=335 -->
- **When probing packages like `@wrongstack/webui` whose names prefix-match siblings (`@wrongstack/webui-server`, `-protocol`), always end the bare-specifier grep with `@wrongstack/webui"` (closing quote) and classify every hit by full import specifier — index tools and broad greps otherwise return mostly prefix-match noise from bun.lock and `.wrongstack/atlas/atlas.json`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `@wrongstack/webui`
  - *How:* `@wrongstack/webui-server`
  - *How:* `-protocol`
  - *How:* `@wrongstack/webui"`
  - *How:* `.wrongstack/atlas/atlas.json`

## Project facts

<!-- learned-stamp: category=fact; capturedAt=2026-10-14T22:51:52.559Z; skill=codebase-navigation; applied=4; wins=4; skipped=474; skippedWins=474 -->
- **Classify `packages/webui-server/tests/*.test.ts` dependents by grepping the test stem repo-wide, not by import tools — suites export nothing, so their only consumers are Vitest include globs and `architecture/*.json` data ratchets that list file paths.**
  - *Why:* Current state of the project — assumed by other conventions, build steps, or peers, so acting on a stale assumption wastes a cycle.
  - *How:* `packages/webui-server/tests/*.test.ts`
  - *How:* `architecture/*.json`

<!-- learned-stamp: category=fact; capturedAt=2026-10-15T19:59:22.221Z; skill=codebase-navigation; applied=38; wins=38; skipped=318; skippedWins=318 -->
- **For `packages/cli/tests/wrongforge-leader/*` suites, establish dependents with a repo-wide stem grep plus the architecture JSON ratchets (`architecture/test-only-exports.json`, `docs/reports/architecture-health-current.json`) — they export nothing and have no importers, and cross-package consumers of the production module appear only via module-path grep (`wrongforge-leader-provider(\.js)?`), not via symbol impact tools.**
  - *Why:* Current state of the project — assumed by other conventions, build steps, or peers, so acting on a stale assumption wastes a cycle.
  - *How:* `packages/cli/tests/wrongforge-leader/*`
  - *How:* `architecture/test-only-exports.json`
  - *How:* `docs/reports/architecture-health-current.json`
  - *How:* `wrongforge-leader-provider(\.js)?`

<!-- learned-stamp: category=fact; capturedAt=2026-10-15T13:30:10.057Z; skill=codebase-navigation; applied=3; wins=3; skipped=416; skippedWins=416 -->
- **Treat version-pinning files like `.bun-version` as data, not code: answer consumer probes with direct `read` plus repo-wide `grep` on the filename — index/skeleton/call-graph tools return nothing for them, and CI workflows typically duplicate the literal instead of reading the file.**
  - *Why:* Current state of the project — assumed by other conventions, build steps, or peers, so acting on a stale assumption wastes a cycle.
  - *How:* `.bun-version`
  - *How:* `read`
  - *How:* `grep`

---
*Last capture: 2026-10-16T12:48:44.801Z · 22 entries*
