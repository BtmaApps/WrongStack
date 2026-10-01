# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-01T17:59:18.725Z; skill=codebase-navigation; applied=5; wins=5; skipped=9; skippedWins=9 -->
- **[skill: codebase-navigation] When mapping the blast radius of a gitignored one-shot checker script under `.temp_files/`, treat its assertion anchors — every `existsSync`/`readdirSync`/`execSync` target — as the real blast surface and verify each anchor's *live* state with a direct `tree`/ENOENT probe instead of trusting `codebase-search`: the persisted index can still contain symbols from directories deleted after indexing (e.g. `packages/webui/dist.__probe_backup` hits surviving an ENOENT live check), so index presence is never proof an assertion target exists. Pair with a start/end re-read of the script, since the requester's edits can land mid-probe.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.temp_files/`
  - *How:* `existsSync`
  - *How:* `readdirSync`
  - *How:* `execSync`
  - *How:* `tree`
  - *How:* `codebase-search`
  - *How:* `packages/webui/dist.__probe_backup`

<!-- learned-stamp: category=warning; capturedAt=2026-10-01T17:34:23.893Z; skill=codebase-navigation; applied=13; wins=13; skipped=21; skippedWins=21 -->
- **Always grep a `*.test.ts` body for `readFileSync`/`join(ROOT, ...)` targets when asked for its callers and dependents — source-pin suites (e.g. `packages/webui/tests/lib/kanban-board-active.test.ts`) assert on the *text* of production files they never import, so their blast radius is those files, not their import graph. Pair the usual export/importer greps with a body scan for disk reads before declaring a test file a zero-dependency leaf.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `*.test.ts`
  - *How:* `readFileSync`
  - *How:* `join(ROOT, ...)`
  - *How:* `packages/webui/tests/lib/kanban-board-active.test.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-10-01T16:54:41.645Z; skill=codebase-navigation; applied=81; wins=81; skipped=8; skippedWins=8 -->
- **Always pair a leaf-specifier repo-wide grep (`output_mode: "content"`, `truncated=false`) with direct reads of any candidate file whose grep hit shows a closing brace on its own line (e.g. `} from '../settings-menu.js';`) — that is a multiline `import {` block whose member list lives lines above the hit, and reporting importers from the hit line alone will silently drop every symbol except the last. The same applies to `codebase-skeleton`, which shows a file's own imports but never which symbols its consumers pull.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `output_mode: "content"`
  - *How:* `truncated=false`
  - *How:* `} from '../settings-menu.js';`
  - *How:* `import {`
  - *How:* `codebase-skeleton`
  - *How:* `../settings-menu.js`

<!-- learned-stamp: category=warning; capturedAt=2026-10-01T16:23:29.179Z; skill=codebase-navigation; applied=36; wins=36; skipped=110; skippedWins=110 -->
- **Always surface a temp probe script's own header-comment invariants before mapping its blast radius: one-shot scripts under gitignored `.temp_files/` (e.g. `.mjs` HTTP probes like `probe-live-*.mjs`) have no exports, importers, or index coverage, so their real blast radius is the live endpoints they touch — grep the body for `http.` verbs and process-kill calls, and flag GET-only/never-kill contracts (a probe server can parent the agent session itself) when a leader edits the script unread.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.temp_files/`
  - *How:* `.mjs`
  - *How:* `probe-live-*.mjs`
  - *How:* `http.`

<!-- learned-stamp: category=warning; capturedAt=2026-10-01T15:47:52.362Z; skill=codebase-navigation; applied=63; wins=63; skipped=115; skippedWins=115 -->
- **Keep grep `pattern` alternations under the 256-character cap: split large symbol-closure searches into multiple `files_with_matches` greps (e.g. functions vs types/consts) rather than one long regex, then verify unexpected hits in content mode — comment-only mentions of exported type names (e.g. `SqliteCreateCandidateContext` in `packages/sage-mcp/src/adapter.ts`) are common and must not be counted as importers.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `pattern`
  - *How:* `files_with_matches`
  - *How:* `SqliteCreateCandidateContext`
  - *How:* `packages/sage-mcp/src/adapter.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-10-01T17:38:42.521Z; skill=codebase-navigation; applied=1; wins=1; skipped=25; skippedWins=25 -->
- **Never trust a zero-match `grep` whose pattern contains a raw `<` — the angle bracket can arrive HTML-escaped (`&lt;`) and silently search for the wrong literal, producing a false absence. Verify such empty results by re-running with a ripgrep hex escape (`\x3CSettingsPanel` instead of `<SettingsPanel`) or a brace-anchored variant before reporting "no JSX usage".**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `grep`
  - *How:* `<`
  - *How:* `&lt;`
  - *How:* `\x3CSettingsPanel`
  - *How:* `<SettingsPanel`

<!-- learned-stamp: category=warning; capturedAt=2026-10-01T16:46:47.959Z; skill=codebase-navigation; applied=102; wins=102; skipped=7; skippedWins=7 -->
- **When a probed `.temp_files/` one-shot script returns ENOENT even though the leader reports having just edited it, conclude the edit was lost or never persisted instead of searching harder — prove it three ways (direct `read` ENOENT, complete `tree` with a name-variant glob plus case-insensitive artifact grep for the distinguishing substring, and a repo-wide exact-name `grep` with `truncated=false`), then report recreation as consequence-free for the import graph only if the reference grep is zero, since `.temp_files/` is gitignored and invisible to `codebase-search`/`codebase-incoming-calls`.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.temp_files/`
  - *How:* `read`
  - *How:* `tree`
  - *How:* `grep`
  - *How:* `truncated=false`
  - *How:* `codebase-search`
  - *How:* `codebase-incoming-calls`

<!-- learned-stamp: category=warning; capturedAt=2026-10-01T16:19:01.164Z; skill=node-modern; applied=54; wins=54; skipped=98; skippedWins=98 -->
- **When mapping a gitignored `.temp_files/` script's reference closure, expect `glob **/<name>*` to return zero even while the file exists (ignore rules hide it) — prove existence only with a direct `read`. If a repo-wide reference `grep` times out, do not retry it; narrow to likely invocation homes (`scripts/`, root `package.json` content greps) and label full-tree closure as unverified.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.temp_files/`
  - *How:* `glob **/<name>*`
  - *How:* `read`
  - *How:* `grep`
  - *How:* `scripts/`
  - *How:* `package.json`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T16:44:40.163Z; applied=28; wins=28; skipped=84; skippedWins=84 -->
- **- Always grep the captured tree *artifact* log for a case-insensitive filename substring when a `.temp_files/` tree listing comes back `truncated=true`: the displayed tree is capped, but the artifact file holds the complete enumeration, and one `dts`-style substring grep of it exhaustively rules out every naming variant of a probe target in a single pass — cheaper than paginated re-trees or per-name globs, which ignore rules hide anyway.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/`
  - *How:* `truncated=true`
  - *How:* `dts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T16:40:55.298Z; skill=codebase-navigation; applied=45; wins=45; skipped=75; skippedWins=75 -->
- **- Treat a module's static import block as an incomplete dependency list: dynamic `import('...')` calls (e.g. `void import('@wrongstack/providers').then(...)` in `packages/webui-server/src/server/prefs-handlers.ts:478`) are invisible to `codebase-skeleton` and file reads of the import header. Before declaring outgoing deps closed, run `codebase-outgoing-calls` or a body grep for `\bimport\(` — the index resolves dynamic-import callees the skeleton omits. - Reconcile `codebase-outgoing-calls` rows against the verified import closure before reporting dependencies: rows anchored to files outside that closure (local variables like `parsed`/`ctx` colliding with same-named declarations in `packages/core`/`packages/cli`) are index noise, not edges.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `import('...')`
  - *How:* `void import('@wrongstack/providers').then(...)`
  - *How:* `packages/webui-server/src/server/prefs-handlers.ts:478`
  - *How:* `codebase-skeleton`
  - *How:* `codebase-outgoing-calls`
  - *How:* `\bimport\(`
  - *How:* `parsed`
  - *How:* `ctx`
  - *How:* `packages/core`
  - *How:* `packages/cli`
  - *How:* `packages/webui-server/src/server/prefs-handlers.ts`
  - *How:* `@wrongstack/providers`

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T17:43:14.995Z; applied=6; wins=6; skipped=17; skippedWins=17 -->
- **Always capture and reproduce the full content of a self-deleting one-shot script (one whose allowlist includes its own filename, e.g. `.temp_files/*.mjs` cleaners using `rmSync`) in the probe deliverable itself — mid-probe execution destroys the only evidence, so embed the captured source and line anchors in the report instead of citing a file the leader can no longer open. Pair this with the start/end drift re-read rule: an ENOENT on the second read of such a script is the script's own effect, not a lost edit.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/*.mjs`
  - *How:* `rmSync`

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T16:23:22.218Z; applied=53; wins=53; skipped=94; skippedWins=94 -->
- **Always diff two reads of a volatile `.temp_files/` target instead of treating the first read as final: between start and end snapshots, compare imports and line counts, and report the drift explicitly (e.g. a new `readFileSync` import appearing at `.temp_files/_ratchet-probe.mjs:5` mid-probe). A concurrent in-flight edit by the leader is the expected cause — re-anchor all `file:line` citations to the snapshot they came from rather than reconciling silently.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/`
  - *How:* `readFileSync`
  - *How:* `.temp_files/_ratchet-probe.mjs:5`
  - *How:* `file:line`
  - *How:* `.temp_files/_ratchet-probe.mjs`

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T16:58:07.918Z; skill=codebase-navigation; applied=44; wins=44; skipped=40; skippedWins=40 -->
- **Always include dynamic-import and mock patterns — `(import\(|vi\.mock\()` — when closing a module's consumer set; a `from '<specifier>'` grep alone missed the *only* production caller of `packages/cli/src/webui-server.ts` (`await import('../webui-server.js')` at `packages/cli/src/boot/dispatch-webui.ts:237`) and the `vi.mock` at `packages/cli/tests/cli-dispatch-journeys.test.ts:20`. Pair the symbol-name grep, the from-line grep, and the `import()`/`vi.mock` grep before reporting a module's import closure as complete.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `(import\(|vi\.mock\()`
  - *How:* `from '<specifier>'`
  - *How:* `packages/cli/src/webui-server.ts`
  - *How:* `await import('../webui-server.js')`
  - *How:* `packages/cli/src/boot/dispatch-webui.ts:237`
  - *How:* `vi.mock`
  - *How:* `packages/cli/tests/cli-dispatch-journeys.test.ts:20`
  - *How:* `import()`
  - *How:* `../webui-server.js`
  - *How:* `packages/cli/src/boot/dispatch-webui.ts`
  - *How:* `packages/cli/tests/cli-dispatch-journeys.test.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T18:35:08.361Z; skill=typescript-strict; skipped=9; skippedWins=9 -->
- **Always treat `packages/simpleui` vitest configuration as living in `packages/simpleui/vite.config.ts` (`test: { maxWorkers }` + react plugin) — there is no `vitest.config.ts` in that package, and per-file `// @vitest-environment jsdom` docblocks in `packages/simpleui/tests/**` are the sole jsdom selector for most suites, so removing a docblock line silently drops the suite to a node environment that fails on `document`. Before predicting blast radius of editing a `packages/simpleui` test file, check both type gates: the package `typecheck` script (`tsc --noEmit`) uses `tsconfig.json`, which excludes `tests`, while `tsconfig.test.json` (includes `tests/**/*`) is executed repo-wide by `scripts/check-test-typecheck.mjs` via `pnpm check:test-types` — a baseline ratchet that fails on new or increased diagnostics and is wired into `release:check`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/simpleui`
  - *How:* `packages/simpleui/vite.config.ts`
  - *How:* `test: { maxWorkers }`
  - *How:* `vitest.config.ts`
  - *How:* `// @vitest-environment jsdom`
  - *How:* `packages/simpleui/tests/**`
  - *How:* `document`
  - *How:* `typecheck`
  - *How:* `tsc --noEmit`
  - *How:* `tsconfig.json`
  - *How:* `tests`
  - *How:* `tsconfig.test.json`
  - *How:* `tests/**/*`
  - *How:* `scripts/check-test-typecheck.mjs`
  - *How:* `pnpm check:test-types`
  - *How:* `release:check`

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T16:00:44.689Z; applied=147; wins=147; skipped=20; skippedWins=20 -->
- **Treat every edit inside a `.temp_files/` proof-round directory as ephemeral and unrecoverable: `.temp_files/` is gitignored and round dirs rotate wholesale (parent `tree` ENOENT proves whole-round deletion, not just file churn). Before editing or running anything under `.temp_files/<skill>/<round>/`, re-read the exact target file and re-run the parent-directory `tree` (`truncated=false`) in the same breath, then run `npx vitest run --config <round>/<exact-config>` from repo root — and warn the requester that any edit made before a rotation is gone with no git history to recover it from.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/`
  - *How:* `tree`
  - *How:* `.temp_files/<skill>/<round>/`
  - *How:* `truncated=false`
  - *How:* `npx vitest run --config <round>/<exact-config>`

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T17:01:49.388Z; applied=19; wins=19; skipped=57; skippedWins=57 -->
- **When a probe maps a factory module under `packages/webui-server/src/server/`, treat `tests/host-seam-parity.test.ts` as the seam-drift canary for blast radius: it asserts embedded-host adapters (e.g. `embedded-host-adapters.ts`) stay parity with the standalone host, so any edit to the embedded context interfaces or factories should flag that suite even when it does not import the leaf file directly.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/webui-server/src/server/`
  - *How:* `tests/host-seam-parity.test.ts`
  - *How:* `embedded-host-adapters.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T15:51:51.499Z; skill=codebase-navigation; applied=155; wins=155; skipped=20; skippedWins=20 -->
- **When a probed `.temp_files` round path returns ENOENT, enumerate its parent directory with an exact `tree` (`truncated=false`) instead of reporting "not found" — proof rounds rotate (e.g. `r1-...` deleted while `r2-...` appears under the same skill dir in `.temp_files/`), and the leader's stale reference should be answered with the live successor path plus a re-verify-existence warning, since round cleanup can delete edits mid-session.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files`
  - *How:* `tree`
  - *How:* `truncated=false`
  - *How:* `r1-...`
  - *How:* `r2-...`
  - *How:* `.temp_files/`

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T17:34:20.918Z; skill=codebase-navigation; applied=35; wins=35 -->
- **When a recursive glob-filtered `tree` under `.temp_files/` reports `total_files=N` but the display truncates before alphabetically-late entries, re-run the tree with a root-level glob (`*<name>*`, not `**/*<name>*`) — it returns the actual filenames with `truncated=false`, which is what you need before warning a leader about name-variant siblings of a temp script they edited unread.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `tree`
  - *How:* `.temp_files/`
  - *How:* `total_files=N`
  - *How:* `*<name>*`
  - *How:* `**/*<name>*`
  - *How:* `truncated=false`

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T16:41:38.252Z; skill=node-modern; applied=31; wins=31; skipped=88; skippedWins=88 -->
- **When judging edit blast radius for `packages/webui-server/tests/*.test.ts`, always check assertions for CWD-relative `path.resolve('packages', ...)` calls against the package `test` script's CWD (`vitest run --config vitest.config.ts` in `package.json` runs with package-dir CWD, not repo root) — guards can silently degrade to trivially-passing or self-skip depending on invocation directory, so state both readings instead of assuming repo-root execution.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/webui-server/tests/*.test.ts`
  - *How:* `path.resolve('packages', ...)`
  - *How:* `test`
  - *How:* `vitest run --config vitest.config.ts`
  - *How:* `package.json`

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T17:57:04.572Z; skill=codebase-navigation; applied=3; wins=3; skipped=12; skippedWins=12 -->
- **When mapping a gitignored one-shot diagnostic script under `.temp_files/`, define its blast radius from the body, not the import graph: enumerate every `execSync`/`spawn` template-literal command (the interpolated `spec` strings are the real surface — shell metacharacters throw) and every `fs` walk root, and always flag CWD-relative git pathspecs (`git status --porcelain -- <path>` resolves against the current directory), which silently report a false "clean" when run outside the repo root. Re-read the file immediately before finalizing: leader edits land mid-probe and overwrite the only snapshot.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/`
  - *How:* `execSync`
  - *How:* `spawn`
  - *How:* `spec`
  - *How:* `fs`
  - *How:* `git status --porcelain -- <path>`

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T16:09:45.221Z; skill=codebase-navigation; applied=11; wins=11; skipped=150; skippedWins=150 -->
- **When mapping importers of a `packages/*/src/types/<leaf>.ts` module, grep three patterns, not one: the path-style specifier (`types/<leaf>`), the sibling specifier (`from './<leaf>.js'` — invisible to path-style searches inside the same `types/` dir), and the exported symbol names repo-wide. Same-named types are often locally redefined in sibling packages (e.g. `ConnectionHealthService` exists independently in `packages/webui/src/types/connections.ts`, `packages/webui-server/src/server/connections/types.ts`, and `packages/tui/src/connections-health.ts`), so verify every symbol hit with an import-line check before counting it as a consumer.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/*/src/types/<leaf>.ts`
  - *How:* `types/<leaf>`
  - *How:* `from './<leaf>.js'`
  - *How:* `types/`
  - *How:* `ConnectionHealthService`
  - *How:* `packages/webui/src/types/connections.ts`
  - *How:* `packages/webui-server/src/server/connections/types.ts`
  - *How:* `packages/tui/src/connections-health.ts`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-01T16:37:52.275Z; skill=codebase-navigation; applied=90; wins=90; skipped=37; skippedWins=37 -->
- **Pair every bare-module-name grep with an import-line grep (`from ['"].*<leaf>`) before naming importers: same-named modules across `packages/cli` and `packages/webui-server` (e.g. `credential-watcher` vs `start-webui-credential-watcher` exporting `setupWebuiCredentialWatcher`) plus comment/report-artifact matches inflate `files_with_matches`, while the import-line pattern yields the authoritative consumer set in one pass.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `from ['"].*<leaf>`
  - *How:* `packages/cli`
  - *How:* `packages/webui-server`
  - *How:* `credential-watcher`
  - *How:* `start-webui-credential-watcher`
  - *How:* `setupWebuiCredentialWatcher`
  - *How:* `files_with_matches`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-01T17:22:17.292Z; skill=codebase-navigation; applied=45; wins=45 -->
- **Prefer a glob-filtered `tree` (`tree` with `glob: "**/*<substring>*"`, read `total_files` from the header) over grepping a captured tree artifact log when proving filename-variant absence in an ignored tree like `.temp_files/`: inline tree output has no artifact file to grep, the display cap hides rows, but `total_files=0` under the glob filter is the complete match count across every subdirectory in one pass — pair it with a repo-wide case-insensitive content grep (`truncated=false`) and a direct `read` ENOENT for the three-way absence proof.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `tree`
  - *How:* `glob: "**/*<substring>*"`
  - *How:* `total_files`
  - *How:* `.temp_files/`
  - *How:* `total_files=0`
  - *How:* `truncated=false`
  - *How:* `read`

---
*Last capture: 2026-10-01T18:35:08.361Z · 23 entries*
