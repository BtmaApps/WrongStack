# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-09-28T15:52:37.257Z; skill=codebase-navigation; applied=3; wins=3; skipped=4; skippedWins=4 -->
- **- Always use unlimited (or depth ≥ 6) `tree` depth when inventorying project-kit fixture trees: a depth-3 tree reported `truncated=false` yet under-counted `temp-file-sweeper/fixtures/git-messy` (18 vs 20 files) by silently pruning files below the depth cutoff — verify fixture inventories with `read` or a deep tree, never a shallow one. - When mapping `.wrongstack/project-kit/<kit>/fixtures/**` data files, classify each as a **name-existence contract** (collision seeds, `.staged`/`.aged` marker entries, occupancy pre-seeds) or a **content contract** (`bytes` pinned in `kit.json` `tests[].expected`). Only content contracts make edits risky; for name-existence files, check whether deletion/rename or top-level additions would shift `scanned`/candidate expectations instead.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `tree`
  - *How:* `truncated=false`
  - *How:* `temp-file-sweeper/fixtures/git-messy`
  - *How:* `read`
  - *How:* `.wrongstack/project-kit/<kit>/fixtures/**`
  - *How:* `.staged`
  - *How:* `.aged`
  - *How:* `bytes`
  - *How:* `kit.json`
  - *How:* `tests[].expected`
  - *How:* `scanned`

<!-- learned-stamp: category=warning; capturedAt=2026-09-28T15:55:30.338Z; applied=5; wins=5 -->
- **Always resolve probe targets under `.temp_files/` with direct `read` and `tree` before analysis: `glob`/`grep` zero-hits there are non-evidence (rg-backed tools respect `.gitignore`), while `read` ENOENT at the resolved absolute path is authoritative absence. When a probed `.temp_files/` filename embeds a cluster name (e.g. `commit-msg-project-kit.txt` → `.temp_files/project-kit/`), enumerate that same-stem subdirectory with a complete `tree` (truncated=false) to rule out relocation. When context says a leader/peer edited a file that is ENOENT locally, report checkout-relative absence plus "possibly an isolated worktree" rather than guessing contents — never infer file contents from neighboring scratch files.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.temp_files/`
  - *How:* `read`
  - *How:* `tree`
  - *How:* `glob`
  - *How:* `grep`
  - *How:* `.gitignore`
  - *How:* `commit-msg-project-kit.txt`
  - *How:* `.temp_files/project-kit/`

<!-- learned-stamp: category=warning; capturedAt=2026-09-28T15:00:55.033Z; skill=codebase-navigation; applied=4; wins=4; skipped=8; skippedWins=8 -->
- **Do not assume all of `.wrongstack/` is invisible to discovery tools: the codebase index covers `.wrongstack/project-kit/**` (verified — `codebase-search` resolved `ageFixtureFiles` in `.wrongstack/project-kit/temp-file-sweeper/main.mjs`), even though rg-backed `grep` respects the gitignore and skips it. For probes under `.wrongstack/`, use `read` for known paths and `codebase-search`/`codebase-incoming-calls` for symbol-level questions; treat only `grep`/`glob` zero-hits there as non-evidence.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.wrongstack/`
  - *How:* `.wrongstack/project-kit/**`
  - *How:* `codebase-search`
  - *How:* `ageFixtureFiles`
  - *How:* `.wrongstack/project-kit/temp-file-sweeper/main.mjs`
  - *How:* `grep`
  - *How:* `read`
  - *How:* `codebase-incoming-calls`
  - *How:* `glob`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-09-28T16:51:07.585Z; applied=4; wins=4 -->
- **- Skip the same-stem relocation tree enumeration for `.temp_files/` probes when the direct `read` at the probed absolute/relative path already succeeds with `truncated=false` — a successful read proves presence at that path; the cluster-name subdirectory enumeration rule only fires on `ENOENT`. A broad `.temp_files/` tree is usually `truncated=true` and adds nothing. - Treat `.temp_files/commit-msg*.txt` files as scratch commit-message drafts with no code consumers (0 tracked-file references by construction): their only contract is the future commit text. Before reuse, check the draft's `File list:` line against actually staged files and re-verify embedded claims (timeouts, SHAs, guard results) against the committed change — a stale draft silently misdocuments the commit.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/`
  - *How:* `read`
  - *How:* `truncated=false`
  - *How:* `ENOENT`
  - *How:* `truncated=true`
  - *How:* `.temp_files/commit-msg*.txt`
  - *How:* `File list:`

<!-- learned-stamp: category=convention; capturedAt=2026-09-28T14:58:29.081Z; skill=codebase-navigation; applied=6; wins=6; skipped=8; skippedWins=8 -->
- **Always disambiguate fixture-marker greps with the leading dot: in `.wrongstack/project-kit/temp-file-sweeper/`, searching `aged` yields 15+ false hits from the substring "st**aged**" (`.staged` marker, "stages the names") — grep `\.aged` and `\.staged` to hit only the marker machinery in `main.mjs` and `kit.json`. Treat a project-kit fixture data file's "incoming calls" as its contract sites, not a call graph: for `temp-file-sweeper`, check (1) `kit.json` `tests[]` entries naming the fixture root (e.g. `@git/fixtures/aged`) and whether they pin `bytes` for the file, and (2) sibling marker JSON arrays `.staged` / `.aged` consumed by `main.mjs` `initializeWorkTree()` / `ageFixtureFiles()` during disposable-copy setup — together these fully determine a content edit's blast radius.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.wrongstack/project-kit/temp-file-sweeper/`
  - *How:* `aged`
  - *How:* `.staged`
  - *How:* `\.aged`
  - *How:* `\.staged`
  - *How:* `main.mjs`
  - *How:* `kit.json`
  - *How:* `temp-file-sweeper`
  - *How:* `tests[]`
  - *How:* `@git/fixtures/aged`
  - *How:* `bytes`
  - *How:* `.aged`
  - *How:* `initializeWorkTree()`
  - *How:* `ageFixtureFiles()`
  - *How:* `@git/fixtures`

<!-- learned-stamp: category=convention; capturedAt=2026-09-28T14:55:31.540Z; skill=typescript-strict; applied=10; wins=10; skipped=5; skippedWins=5 -->
- **Always treat empty `grep`/`glob` results under gitignored state directories (`.wrongstack/`, incl. `project-kit-runs`) as non-evidence — `rg`-backed search respects `.gitignore` and silently skips them; read a known-present path (e.g. `.wrongstack/AGENTS.md`) to confirm tool visibility before concluding absence. When tallying `project_kit_run` outcomes, parse failures from the thrown error message (`project-kit.ts` `execute` throws `JSON.stringify(result)`), because the persisted `record.json` redacts `error` to a generic string while keeping `status`/`durationMs`/`runId`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `grep`
  - *How:* `glob`
  - *How:* `.wrongstack/`
  - *How:* `project-kit-runs`
  - *How:* `rg`
  - *How:* `.gitignore`
  - *How:* `.wrongstack/AGENTS.md`
  - *How:* `project_kit_run`
  - *How:* `project-kit.ts`
  - *How:* `execute`
  - *How:* `JSON.stringify(result)`
  - *How:* `record.json`
  - *How:* `error`
  - *How:* `status`
  - *How:* `durationMs`
  - *How:* `runId`

<!-- learned-stamp: category=convention; capturedAt=2026-09-28T17:01:11.352Z; skill=codebase-navigation; applied=3; wins=3 -->
- **Always treat scratch A/B harnesses that derive one arm from live source via string replacement as drift-sensitive contracts: map their blast radius by grepping the exact anchor strings in the target source file (e.g. the `respond({ type: 'result' ... })` lines of `packages/tools/src/project-kit/runner.ts`) to confirm the harness still runs, and flag any edit to its mutual-exclusion guards as experiment-invalidating even when no repo code references the script — `codebase-search`/`codebase-incoming-calls` return 0 for files under `.temp_files/` because the index does not cover them.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `respond({ type: 'result' ... })`
  - *How:* `packages/tools/src/project-kit/runner.ts`
  - *How:* `codebase-search`
  - *How:* `codebase-incoming-calls`
  - *How:* `.temp_files/`

<!-- learned-stamp: category=convention; capturedAt=2026-09-28T15:48:42.081Z; applied=5; wins=5; skipped=4; skippedWins=4 -->
- **Disambiguate `runner.ts` probes by responsibility before anything else: the repo has three — `packages/tools/src/project-kit/runner.ts` (child-process IPC bootstrap, `BOOTSTRAP` const, `process.send`, `runKitProcess`), `packages/core/src/hooks/runner.ts` (`HookRunner`, in-process hook orchestration, no IPC), and `packages/bench/src/runner.ts` (`runWstack`, subprocess benching, no IPC). Only the project-kit one contains a child bootstrap; start there for any `process.send`/child-exit question. The project-kit regression harness is `fixture()`/`f.run('verify', input, rev, signal?)` in `packages/tools/tests/project-kit.test.ts`, with `runKitProcess` called solely by `executeKit` in `packages/tools/src/project-kit/service.ts`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `runner.ts`
  - *How:* `packages/tools/src/project-kit/runner.ts`
  - *How:* `BOOTSTRAP`
  - *How:* `process.send`
  - *How:* `runKitProcess`
  - *How:* `packages/core/src/hooks/runner.ts`
  - *How:* `HookRunner`
  - *How:* `packages/bench/src/runner.ts`
  - *How:* `runWstack`
  - *How:* `fixture()`
  - *How:* `f.run('verify', input, rev, signal?)`
  - *How:* `packages/tools/tests/project-kit.test.ts`
  - *How:* `executeKit`
  - *How:* `packages/tools/src/project-kit/service.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-09-28T14:12:18.609Z; skill=codebase-navigation; applied=30; wins=30; skipped=2; skippedWins=2 -->
- **For markdown docs, skip `codebase-skeleton` (it collapses prose to ~3 meaningless lines); `read` the file directly for section structure, and map "dependents" by exact-text grep of the doc's basename/stem — markdown has no import graph, so `codebase-incoming-calls` cannot answer "who imports it". Separate true doc-path references from name-colliding identifiers (e.g. `project-kit` capability ids, fixture dirs) before reporting callers.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `codebase-skeleton`
  - *How:* `read`
  - *How:* `codebase-incoming-calls`
  - *How:* `project-kit`

<!-- learned-stamp: category=convention; capturedAt=2026-09-28T17:26:53.663Z; applied=1; wins=1; skipped=1; skippedWins=1 -->
- **Treat scratch flake-repro probes that classify failures by an error-substring regex (e.g. `/without a successful result/` in `.temp_files/kit-flake-probe.mjs`-style scripts) as drift-sensitive against the production module's error text: before trusting a zero-failure rate, grep the exact phrase in the target source (e.g. `packages/tools/src/project-kit/runner.ts`) — a silent regex/source mismatch reports "no loss" and invalidates the A/B comparison without any visible error.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `/without a successful result/`
  - *How:* `.temp_files/kit-flake-probe.mjs`
  - *How:* `packages/tools/src/project-kit/runner.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-09-28T14:15:23.890Z; skill=codebase-navigation; applied=20; wins=20; skipped=9; skippedWins=9 -->
- **When tracing importers of a same-basename module such as `packages/tools/src/project-kit/schema.ts`, scope the relative-specifier grep (`\./schema(\.js)?['"]`) to the target's own directory first — repo-wide greps in `packages/tools` are dominated by the unrelated `codebase-index/schema.ts` (28+ hits), and only the directory-scoped pass plus a repo-wide absolute-substring grep (`project-kit/schema`) together prove the complete importer set.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/tools/src/project-kit/schema.ts`
  - *How:* `\./schema(\.js)?['"]`
  - *How:* `packages/tools`
  - *How:* `codebase-index/schema.ts`
  - *How:* `project-kit/schema`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-09-28T14:23:25.121Z; skill=codebase-navigation; applied=15; wins=15; skipped=10; skippedWins=10 -->
- **For `.wrongstack/project-kit/<name>/` kits, treat `kit.json` `tests[]` plus the guide's "Known limits" as the coverage contract: fixture subdirectories not referenced by any declared test (e.g. `temp-file-sweeper/fixtures/git-messy` vs the consumed `fixtures/messy`) mark branches verified only by ad-hoc scratch probes. When comparing `git rev-parse --show-toplevel` output against a `mkdtemp(os.tmpdir())` scratch, `fs.realpath` both sides before equality — lexical `path.resolve` comparisons miss win32 8.3 short names and symlinked temp dirs (pattern: `packages/tools/tests/codebase-index-git-blob-trust.test.ts`).**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `.wrongstack/project-kit/<name>/`
  - *How:* `kit.json`
  - *How:* `tests[]`
  - *How:* `temp-file-sweeper/fixtures/git-messy`
  - *How:* `fixtures/messy`
  - *How:* `git rev-parse --show-toplevel`
  - *How:* `mkdtemp(os.tmpdir())`
  - *How:* `fs.realpath`
  - *How:* `path.resolve`
  - *How:* `packages/tools/tests/codebase-index-git-blob-trust.test.ts`

---
*Last capture: 2026-09-28T17:26:53.663Z · 12 entries*
