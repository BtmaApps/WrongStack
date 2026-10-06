# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T18:58:51.600Z; skill=codebase-navigation; applied=28; wins=28; skipped=22; skippedWins=21 -->
- **- Locate producers of logs in the OS temp dir (`%TEMP%/<tool>-<scenario>-<TAG>.log`) by log **body tokens** (rg in tracked scope) plus a **filename-stem tree of `.temp_files`** — the redirect filename is chosen by the shell redirect and appears in no repo source, but its stem often matches the harness script stem (e.g. `wstack-longlived-L4.log` → `.temp_files/longlived.mjs`). Tag suffixes like `-L4` are runtime `argv` labels: confirm with a `*<TAG>*` filename tree returning zero. [skill: codebase-navigation] - When reading a harness log, map each line back to its producer's `console.log` calls and check for **early-exit branches**: a guard branch (`NO_PROJECT_DIR` … `### DONE`) proves the log is terminal and all later phases (DB reads, `SUMMARY=`/`VERDICT=` lines) never executed — report which verdict lines are absent, not just what is present. [skill: codebase-navigation]**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `%TEMP%/<tool>-<scenario>-<TAG>.log`
  - *How:* `.temp_files`
  - *How:* `wstack-longlived-L4.log`
  - *How:* `.temp_files/longlived.mjs`
  - *How:* `-L4`
  - *How:* `argv`
  - *How:* `*<TAG>*`
  - *How:* `console.log`
  - *How:* `NO_PROJECT_DIR`
  - *How:* `### DONE`
  - *How:* `SUMMARY=`
  - *How:* `VERDICT=`

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T21:25:37.474Z; applied=16; wins=16; skipped=23; skippedWins=22 -->
- **Always check for a sibling `vitest.proof.config.ts` before predicting how a `.temp_files/proof-driven-bug-hunter/<round>/` harness runs — not every round uses `run.mjs`. Read its `test.include`: it pins the test file by exact path (the only reference the test has), and both the test's `../../../packages/...` import and the config's `path.resolve(__dirname, '..','..','..')` repoRoot assume the round dir sits exactly three levels below repo root, so renaming/moving the test orphans the harness silently. Treat a sibling `red.log` containing only a RUN header with no PASS/FAIL lines as an aborted capture: report which verdict lines are absent, never infer RED or GREEN from it.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `vitest.proof.config.ts`
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`
  - *How:* `run.mjs`
  - *How:* `test.include`
  - *How:* `../../../packages/...`
  - *How:* `path.resolve(__dirname, '..','..','..')`
  - *How:* `red.log`

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T22:33:08.459Z; skill=codebase-navigation; applied=18; wins=18; skipped=14; skippedWins=13 -->
- **Always treat the header doc-comment and inline error-message line anchors inside a `.temp_files/proof-driven-bug-hunter/<round>/proof.test.ts` as pre-fix historical coordinates, not current source locations — the round documents the defect state (e.g. `coordinateRegex (gradle.ts:88)`), while the working tree already holds the fix. Re-anchor against the live module (`packages/<pkg>/src/...`, verified via `codebase-skeleton`) before editing either side. Also, when closing consumers of a round, grep the full round-directory name, never just the `proof.test.ts` stem — this repo contains many unrelated `*proof.test.ts` files under `packages/**/tests/**` that match the stem and inflate false closure. [skill: codebase-navigation]**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/proof.test.ts`
  - *How:* `coordinateRegex (gradle.ts:88)`
  - *How:* `packages/<pkg>/src/...`
  - *How:* `codebase-skeleton`
  - *How:* `proof.test.ts`
  - *How:* `*proof.test.ts`
  - *How:* `packages/**/tests/**`

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T08:49:41.917Z; skill=codebase-navigation; applied=2; wins=2; skipped=8; skippedWins=8 -->
- **Never infer file purpose from a scratch-file prefix under `.temp_files/` — verify by direct `read` first: `_ts_baseline.txt` there is a `git status --porcelain` snapshot, not TypeScript output. When closing consumers of an ignored `.temp_files/` artifact, a path-scoped `grep` into `.temp_files` can still return a false zero because rg honors `.gitignore` even when explicitly pathed; compensate by scanning the full `.temp_files` tree listing (capture the tree artifact log and grep it for the filename stem) and look for before/after sibling pairs (e.g. `_ts_after.txt` beside `_ts_baseline.txt`) to characterize the artifact family. Redirect-created files (`cmd > file.txt`) appear in no repo source, so a stem-scan zero plus a tracked-scope zero is the correct closure standard, not proof of an absent producer. [skill: codebase-navigation]**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.temp_files/`
  - *How:* `read`
  - *How:* `_ts_baseline.txt`
  - *How:* `git status --porcelain`
  - *How:* `grep`
  - *How:* `.temp_files`
  - *How:* `.gitignore`
  - *How:* `_ts_after.txt`
  - *How:* `cmd > file.txt`

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T20:31:43.044Z; skill=codebase-navigation; applied=32; wins=32; skipped=14; skippedWins=13 -->
- **Treat `packages/kanban-mcp` like `@wrongstack/tools`/`@wrongstack/providers`/`packages/sage-mcp` for test collection: it has no local `vitest.config.ts`, and its `package.json` `scripts.test` is an echo directing to `pnpm exec vitest run packages/kanban-mcp/tests` from the workspace root — collection contracts come from root `vitest.config.ts` and `packages/kanban-mcp/tsconfig.test.json`, never a package-local config. (anchors: `packages/kanban-mcp`, `vitest.config.ts`, `scripts.test`, `pnpm exec vitest run packages/kanban-mcp/tests`, `tsconfig.test.json`) [skill: codebase-navigation] Watch for dual-resolution import gotchas in test files that namespace-import `@wrongstack/tools/*` subpaths: vitest aliases resolve them to `src/` while `tsconfig.test.json` resolves to `dist/` — before predicting typecheck-vs-test disagreement, read the import block's comments (e.g. `packages/kanban-mcp/tests/adapter.test.ts` documents this for `@wrongstack/tools/kanban`) and check `dist/` freshness. (anchors: `@wrongstack/tools/kanban`, `packages/kanban-mcp/tests/adapter.test.ts`, `tsconfig.test.json`, `dist`) [skill: codebase-navigation]**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/kanban-mcp`
  - *How:* `@wrongstack/tools`
  - *How:* `@wrongstack/providers`
  - *How:* `packages/sage-mcp`
  - *How:* `vitest.config.ts`
  - *How:* `package.json`
  - *How:* `scripts.test`
  - *How:* `pnpm exec vitest run packages/kanban-mcp/tests`
  - *How:* `packages/kanban-mcp/tsconfig.test.json`
  - *How:* `tsconfig.test.json`
  - *How:* `@wrongstack/tools/*`
  - *How:* `src/`
  - *How:* `dist/`
  - *How:* `packages/kanban-mcp/tests/adapter.test.ts`
  - *How:* `@wrongstack/tools/kanban`
  - *How:* `dist`

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T06:52:42.551Z; skill=codebase-navigation; applied=9; wins=9; skipped=14; skippedWins=14 -->
- **When probing a volatile `.temp_files/proof-driven-bug-hunter/<round>/` directory, capture ALL sibling files (`vitest.proof.config.ts`, `proof.test.ts`, `run.mjs`) in **parallel** reads on first contact — wholesale deletion can occur between sequential reads, and because the dir is gitignored an uncaptured sibling is unrecoverable (observed: config read succeeded, the pinned test ENOENTed seconds later, round dir gone on re-tree). Anchor the probe's answer on the first-pass capture as the surviving record; do not retry reads of vanished siblings.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`
  - *How:* `vitest.proof.config.ts`
  - *How:* `proof.test.ts`
  - *How:* `run.mjs`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T06:44:35.307Z; applied=8; wins=8; skipped=19; skippedWins=18 -->
- **Always capture `.temp_files/proof-driven-bug-hunter/<round>/` file contents in the order config → test → logs — round directories there are volatile and can be wholesale-deleted mid-probe (observed: tree listed 8 files, next read ENOENTed, then scandir ENOENTed). Treat an ENOENT on a just-listed gitignored file as live churn: re-tree the parent once to confirm, then report your captured content as the surviving record instead of retrying reads.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T08:45:14.209Z; skipped=12; skippedWins=12 -->
- **Always re-anchor a captured lint log's flagged file against the live tree when the capture truncates the diagnostic header itself (e.g. `.temp_files/*.log` showing only `ports FIXABLE` instead of the full `assist/source/organizeImports` path header) — match the diagnostic's cited line-number content (anchor lines like `export { applySchema, DDL } from './store/schema.js';`) to the current source before calling the log stale or current, since Biome-style diagnostics carry exact line coordinates that survive header truncation.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/*.log`
  - *How:* `ports FIXABLE`
  - *How:* `assist/source/organizeImports`
  - *How:* `export { applySchema, DDL } from './store/schema.js';`
  - *How:* `./store/schema.js`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T09:34:36.391Z; skill=codebase-navigation; applied=4; wins=4 -->
- **For repo shell scripts like `.githooks/pre-commit`, the symbol index returns zero — establish wiring through three non-import channels instead: `package.json` scripts (`git config core.hooksPath .githooks` under `setup:hooks`), tests that `readFileSync` the hook file and assert literal content (e.g. `packages/core/tests/architecture/workflow-hardening.test.ts` pinning `sync-core-public-api-snapshot.mjs`), and guard-script header comments naming the hook as their invoker. Report "no importers" only after a repo-wide grep for the `.githooks` path, not from the index alone.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.githooks/pre-commit`
  - *How:* `package.json`
  - *How:* `git config core.hooksPath .githooks`
  - *How:* `setup:hooks`
  - *How:* `readFileSync`
  - *How:* `packages/core/tests/architecture/workflow-hardening.test.ts`
  - *How:* `sync-core-public-api-snapshot.mjs`
  - *How:* `.githooks`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T19:00:51.829Z; skill=node-modern; skipped=50; skippedWins=49 -->
- **Scratch harnesses inspect the per-project agent mailbox at `~/.wrongstack/projects/<dir>/_mailbox.sqlite` — table `messages` with columns `from_id, to_id, type, data`, where `data` is a JSON string carrying `subject` and `body` (see `.temp_files/dump-l4.mjs` using `node:sqlite` `DatabaseSync` with `{ readOnly: true }`). When a probe touches mailbox evidence, anchor on this schema**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `~/.wrongstack/projects/<dir>/_mailbox.sqlite`
  - *How:* `messages`
  - *How:* `from_id, to_id, type, data`
  - *How:* `data`
  - *How:* `subject`
  - *How:* `body`
  - *How:* `.temp_files/dump-l4.mjs`
  - *How:* `node:sqlite`
  - *How:* `DatabaseSync`
  - *How:* `{ readOnly: true }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T08:35:10.968Z; skill=codebase-navigation; applied=6; wins=6; skipped=8; skippedWins=8 -->
- **When a probe names a `.temp_files/proof-driven-bug-hunter/<round>/` target that is already absent at first contact, prove absence with four untruncated checks before reporting — direct `read`, exact-directory `tree` of the round dir, wildcard stem `glob` (e.g. `**/*gosum*` under `.temp_files`), and a repo-wide `grep` of the full round-dir name — then report the negative result instead of mapping a phantom or retrying reads. When the probe context says a leader "edited the file without reading it," state explicitly that the edit's landing checkout is unverified: `.temp_files` is gitignored, so absence means no baseline and no recovery, and the leader must re-stat the absolute path (or its isolated worktree root) its edit wrote to. [skill: codebase-navigation]**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`
  - *How:* `read`
  - *How:* `tree`
  - *How:* `glob`
  - *How:* `**/*gosum*`
  - *How:* `.temp_files`
  - *How:* `grep`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T07:57:28.292Z; applied=12; wins=12; skipped=6; skippedWins=6 -->
- **When mapping a gitignored one-shot harness config under `.temp_files/proof-driven-bug-hunter/<round>/`, close blast radius with two untruncated checks only — the round-dir-name grep across tracked scope (proves no external reference) and the root `vitest.config.ts` `.temp_files` exclusion (proves no collection) — then anchor the real fragility on the shared depth assumption: `path.resolve(__dirname, '..','..','..')` in `vitest.proof.config.ts` and the `../../../packages/...` imports in the sibling `proof.test.ts` must move together or the harness breaks silently. State explicitly that a read taken after an unread edit is the surviving record, not a baseline, because gitignored files have no Git recovery.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`
  - *How:* `vitest.config.ts`
  - *How:* `.temp_files`
  - *How:* `path.resolve(__dirname, '..','..','..')`
  - *How:* `vitest.proof.config.ts`
  - *How:* `../../../packages/...`
  - *How:* `proof.test.ts`

---
*Last capture: 2026-10-06T09:34:36.391Z · 12 entries*
