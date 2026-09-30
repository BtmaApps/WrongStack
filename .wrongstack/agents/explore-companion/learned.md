# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-09-30T19:25:32.595Z -->
- **- When tree-snapshotting a scratch runner's output artifacts, glob the round/owner prefix (e.g. `_r51*` under `.temp_files/`), never the script stem (`_r51_three_runs*`) — sibling artifacts named `_r51_results.txt` / `_r51_run<i>.log` share only the prefix, so a stem glob silently reports "no artifacts" while a run is live. - To decide whether an in-flight PowerShell instance parsed an edited script, compare mtimes: script mtime earlier than the output artifact's first-write mtime means the edit predates launch and the running instance matches the current file; the reverse means the instance is executing stale content. PowerShell's parse-to-AST-before-execute rule makes post-launch edits invisible to the live run either way.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `_r51*`
  - *How:* `.temp_files/`
  - *How:* `_r51_three_runs*`
  - *How:* `_r51_results.txt`
  - *How:* `_r51_run<i>.log`

<!-- learned-stamp: category=warning; capturedAt=2026-09-30T15:35:22.074Z; skill=codebase-navigation; applied=1; wins=1; skipped=85; skippedWins=85 -->
- **Avoid full import-path regexes like `from ['"]\.{1,2}(/[\w.-]+)*/project-root\.js['"]` when mapping module consumers with `grep` — nested quantifiers trigger its catastrophic-backtracking validation error. Search the bare leaf suffix instead (e.g. `project-root\.js` with `output_mode: content`); it catches every relative-import depth and its total count proves single-importer claims in one call.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `from ['"]\.{1,2}(/[\w.-]+)*/project-root\.js['"]`
  - *How:* `grep`
  - *How:* `project-root\.js`
  - *How:* `output_mode: content`

<!-- learned-stamp: category=warning; capturedAt=2026-09-30T18:35:29.740Z; skill=codebase-navigation; applied=8; wins=8; skipped=4; skippedWins=4 -->
- **Never re-report a stored importer-set fact (e.g. the old "`packages/core/src/quota/index.ts` has a single test importer" note in `.wrongstack/agents/explore-companion/consolidated.md`) without re-running the live specifier grep first — importer sets drift fast as a plane gets wired out. For `@wrongstack/core/quota`, the current set is ~29 production + ~19 test files spanning `packages/providers`, `packages/tui`, `packages/webui-server`, `packages/cli`, and `packages/webui`, with `packages/webui/src/stores/provider-quota-store.ts` still comment-only; prove any new count with `@wrongstack/core/quota` in `files_with_matches` mode plus a `quota/index\.js` relative-path grep.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/core/src/quota/index.ts`
  - *How:* `.wrongstack/agents/explore-companion/consolidated.md`
  - *How:* `@wrongstack/core/quota`
  - *How:* `packages/providers`
  - *How:* `packages/tui`
  - *How:* `packages/webui-server`
  - *How:* `packages/cli`
  - *How:* `packages/webui`
  - *How:* `packages/webui/src/stores/provider-quota-store.ts`
  - *How:* `files_with_matches`
  - *How:* `quota/index\.js`
  - *How:* `@wrongstack/core`

<!-- learned-stamp: category=warning; capturedAt=2026-09-30T18:44:54.486Z; skill=codebase-navigation; applied=4; wins=4 -->
- **Triage probe targets by file extension before applying module-shaped tooling: a "skeleton + callers + exports" probe aimed at a non-source artifact (`.log`, `.txt`, `.json` capture) under `.temp_files/` should be answered as an artifact classification — read it in full, extract the producing command/subject it documents, then prove zero name-references with one repo-wide stem grep plus one `.temp_files`-scoped content grep (both `truncated=false`). Run `codebase-search` on the stem once only to confirm the ignored-path index is non-evidence (fuzzy-only hits), never as the answer source.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.log`
  - *How:* `.txt`
  - *How:* `.json`
  - *How:* `.temp_files/`
  - *How:* `.temp_files`
  - *How:* `truncated=false`
  - *How:* `codebase-search`

<!-- learned-stamp: category=warning; capturedAt=2026-09-30T17:00:38.353Z; applied=1; wins=1; skipped=38; skippedWins=38 -->
- **When judging the blast radius of a leader's edit to a running `.temp_files/*.ps1` harness, state that PowerShell parses the entire script to AST before execution begins — a post-launch edit never alters the in-flight instance; the real hazards are the re-run path (`Remove-Item $out` at script start wipes prior results, `*>` truncates run logs) and two concurrent instances interleaving `Add-Content` writes into the same output file. Pair that with the results-artifact read: a lone START line plus run1.log present and run2+ logs absent pins the instance as live-or-killed during run 1.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.temp_files/*.ps1`
  - *How:* `Remove-Item $out`
  - *How:* `*>`
  - *How:* `Add-Content`

<!-- learned-stamp: category=warning; capturedAt=2026-09-30T18:30:53.365Z; skill=codebase-navigation; applied=14; wins=14; skipped=2; skippedWins=2 -->
- **When proving an importer set exhaustive, run the leaf-specifier and symbol-name greps repo-wide from the start — never pre-scope to `path=packages`. A `packages/`-scoped grep silently undercounts anything under `scripts/` or `docs/`, and generated artifacts (e.g. `docs/reports/architecture-health-current.json`) can surface as the only extra hit, which must be classified as a non-consumer rather than a false importer.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `path=packages`
  - *How:* `packages/`
  - *How:* `scripts/`
  - *How:* `docs/`
  - *How:* `docs/reports/architecture-health-current.json`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-09-30T17:25:22.676Z; skill=codebase-navigation; applied=11; wins=11; skipped=18; skippedWins=18 -->
- **Treat an underscore-prefixed module under `packages/*/src/` as potentially package-public, not internal: always check the package barrel (`packages/*/src/index.ts`) for a re-export before reporting a consumer set — `packages/tools/src/_concurrency.ts` looks private but is public via `@wrongstack/tools`, while its only real consumers are 5 in-package files. Pair the leaf-specifier grep (`_concurrency.js`) with a repo-wide symbol-name grep to separate true importers from same-named implementations in other packages (`bench/src/runner.ts`, `core/src/storage/storage-concurrency.ts`).**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/*/src/`
  - *How:* `packages/*/src/index.ts`
  - *How:* `packages/tools/src/_concurrency.ts`
  - *How:* `@wrongstack/tools`
  - *How:* `_concurrency.js`
  - *How:* `bench/src/runner.ts`
  - *How:* `core/src/storage/storage-concurrency.ts`
  - *How:* `src/index.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-09-30T17:22:34.692Z; skill=codebase-navigation; skipped=31; skippedWins=31 -->
- **When a leaf-specifier grep like `store-schema\.js` risks suffix-colliding with longer module names (`sqlite-store-schema.js` in another package), always run a content-mode pass over the import lines before counting consumers — the `.js` suffix match silently inflates the importer set with a different module from a different package.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `store-schema\.js`
  - *How:* `sqlite-store-schema.js`
  - *How:* `.js`

<!-- learned-stamp: category=convention; capturedAt=2026-09-30T15:56:11.800Z; skill=node-modern; applied=13; wins=13; skipped=72; skippedWins=72 -->
- **When a probe names a manifest file (e.g. root `package.json`) and asks for "callers/dependents", interpret it as *who reads the manifest*, not import-graph edges: grep `scripts/` for exact read forms (`resolve(repoRoot, 'package.json')`, `readFileSync(join(root, 'package.json')...)`), and separate root-manifest readers from the many per-package manifest readers (`scripts/build-package.mjs`, `packages/*/src/version.ts`-style files) that a name search for `packageJson` returns mixed together. Also check `pnpm-workspace.yaml` — pnpm roots usually omit a `workspaces` field, so the workspace set is not in the manifest.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `package.json`
  - *How:* `scripts/`
  - *How:* `resolve(repoRoot, 'package.json')`
  - *How:* `readFileSync(join(root, 'package.json')...)`
  - *How:* `scripts/build-package.mjs`
  - *How:* `packages/*/src/version.ts`
  - *How:* `packageJson`
  - *How:* `pnpm-workspace.yaml`
  - *How:* `workspaces`
  - *How:* `src/version.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-09-30T18:46:05.422Z; skill=codebase-navigation; applied=2; wins=2 -->
- **When a probe targets a gitignored `.temp_files/` scratch script, run `tree` with an exact stem glob twice (start and end of the probe) and treat the diff between snapshots as the authoritative liveness record — rg/grep cannot see the ignored tree, so a zero-hit referencer grep is non-evidence there, and two tree snapshots are what turn "file not found" into a dated mid-probe deletion finding backed by the first-read verbatim copy.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/`
  - *How:* `tree`

<!-- learned-stamp: category=convention; capturedAt=2026-09-30T18:37:20.772Z; skill=codebase-navigation; applied=5; wins=5; skipped=4; skippedWins=4 -->
- **When enumerating a module's importers, run the bare-stem `files_with_matches` grep first and treat it as the authoritative set — a `from '.../<stem>.js'` content grep undercounts, because test files can reference a module only through `vi.mock('<stem>.js', async (importOriginal) => ...)` with no static import line. If the bare-stem file list has more entries than the `from`-line count, grep the extra files individually for the stem before declaring them non-importers.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `files_with_matches`
  - *How:* `from '.../<stem>.js'`
  - *How:* `vi.mock('<stem>.js', async (importOriginal) => ...)`
  - *How:* `from`

<!-- learned-stamp: category=convention; capturedAt=2026-09-30T16:19:03.616Z; skill=codebase-navigation; applied=56; wins=56; skipped=11; skippedWins=11 -->
- **When mapping a module's consumers with `codebase-incoming-calls`, separate entries by `callType`: `"import"` rows are just import edges (often anchored to an unrelated symbol on the import line, e.g. a const or interface), while `"call"` rows are real invocation sites — pair the call rows with the leaf-specifier grep count (`truncated=false`) to prove the importer set is exhaustive before claiming "exactly N consumers".**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `codebase-incoming-calls`
  - *How:* `callType`
  - *How:* `"import"`
  - *How:* `"call"`
  - *How:* `truncated=false`

<!-- learned-stamp: category=convention; capturedAt=2026-09-30T15:31:13.513Z; skill=codebase-navigation; applied=4; wins=4; skipped=85; skippedWins=85 -->
- **When mapping a scratch runner script (e.g. `.temp_files/*.ps1`, `*.mjs` harnesses) for a leader, read the script's own output artifacts (its results/log files, discoverable via exact-directory `tree` of the ignored path) to detect in-flight execution — a results file whose last block is a START with no END means a live or killed instance. Flag re-entrancy hazards before advising edits or re-runs: self-`Remove-Item`-then-append output files mean a second invocation destroys prior evidence and two concurrent writers interleave output.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/*.ps1`
  - *How:* `*.mjs`
  - *How:* `tree`
  - *How:* `Remove-Item`

<!-- learned-stamp: category=convention; capturedAt=2026-09-30T18:39:58.325Z; skill=codebase-navigation; applied=3; wins=3; skipped=5; skippedWins=5 -->
- **When mapping a test file the leader edited without reading it, cross-check each assertion's expected shape against the real callee return type before reporting — grep the callee's return statements (e.g. `async appendBatch` in `packages/core/src/chronicle/sqlite-journal.ts`) rather than trusting the test's own comments. A blind edit commonly leaves assertions like `result.accepted` on a callee that returns `ChronicleEvent[]`, and static return-shape evidence flags the failing line without running the suite; pair it with a repo-wide stem grep to prove the test has zero importers and name the exact vitest project (root `root-node` when the package has no local `vitest.config.*`).**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `async appendBatch`
  - *How:* `packages/core/src/chronicle/sqlite-journal.ts`
  - *How:* `result.accepted`
  - *How:* `ChronicleEvent[]`
  - *How:* `root-node`
  - *How:* `vitest.config.*`

<!-- learned-stamp: category=convention; capturedAt=2026-09-30T16:34:54.489Z; skill=codebase-navigation; applied=2; wins=2; skipped=55; skippedWins=55 -->
- **When mapping consumers of `@wrongstack/primitives` redaction symbols (`redactCommand`, `redactSecrets`, `redactCommandArgs`), always exclude `packages/plugins/src/prompt-firewall/secret-detection.ts` from the count — its `redactSecrets` is a separate local implementation with `[REDACTED:<kind>]` markers, not the primitives one. The real consumer chain is leaf → barrel (`packages/primitives/src/index.ts`) → three re-export shims (`core/src/observability/redact-command.ts`, `tools/src/_redact-command.ts`, `telegram/src/redact.ts`) → downstream callers, plus two direct package-specifier importers in `packages/tools/src/project-kit/`; prove it with a leaf-suffix grep plus a separate `@wrongstack/primitives` specifier grep, because the shims import the package specifier and are invisible to the leaf grep.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `@wrongstack/primitives`
  - *How:* `redactCommand`
  - *How:* `redactSecrets`
  - *How:* `redactCommandArgs`
  - *How:* `packages/plugins/src/prompt-firewall/secret-detection.ts`
  - *How:* `[REDACTED:<kind>]`
  - *How:* `packages/primitives/src/index.ts`
  - *How:* `core/src/observability/redact-command.ts`
  - *How:* `tools/src/_redact-command.ts`
  - *How:* `telegram/src/redact.ts`
  - *How:* `packages/tools/src/project-kit/`

<!-- learned-stamp: category=convention; capturedAt=2026-09-30T14:45:48.100Z; skill=codebase-navigation; applied=61; wins=61; skipped=29; skippedWins=29 -->
- **When mapping consumers of `packages/core/src/chronicle/*` modules, pair the leaf-specifier grep with an exact-symbol-name grep over `packages/**/src` — the chronicle barrel (`packages/core/src/chronicle/index.ts`) and the `@wrongstack/core/chronicle` subpath hide importers in `packages/cli`, `packages/tui`, and `packages/webui-server` connection/chronicle modules from call-graph tools, and name-colliding symbols make `codebase-incoming-calls` per-file pinning unreliable there.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/core/src/chronicle/*`
  - *How:* `packages/**/src`
  - *How:* `packages/core/src/chronicle/index.ts`
  - *How:* `@wrongstack/core/chronicle`
  - *How:* `packages/cli`
  - *How:* `packages/tui`
  - *How:* `packages/webui-server`
  - *How:* `codebase-incoming-calls`
  - *How:* `@wrongstack/core`

<!-- learned-stamp: category=convention; capturedAt=2026-09-30T15:59:23.127Z; skill=codebase-navigation; applied=12; wins=12; skipped=71; skippedWins=71 -->
- **When mapping importers of a module by grepping the leaf specifier (e.g. `session-archive`), a multi-line `import { ... } from './x.js'` surfaces only at its closing `} from ...` line — always read the ~10 lines above each hit to enumerate which symbols the importer actually pulls. Importers routinely take a subset of a module's exports (e.g. `packages/core/src/storage/session-store.ts` imports 4 of 8 exports from `session-store/session-archive.ts`), and the un-imported exports are internal-only — a fact that changes blast-radius predictions.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `session-archive`
  - *How:* `import { ... } from './x.js'`
  - *How:* `} from ...`
  - *How:* `packages/core/src/storage/session-store.ts`
  - *How:* `session-store/session-archive.ts`
  - *How:* `./x.js`

<!-- learned-stamp: category=convention; capturedAt=2026-09-30T16:28:44.246Z; skill=codebase-navigation; applied=51; wins=51; skipped=9; skippedWins=9 -->
- **When probing a small leaf module's consumer set, pair the repo-wide leaf-suffix grep (`security/inbound.js`-style, `output_mode: content`, `truncated=false`) with a same-grep of each exported symbol name — the two together distinguish "imported but unused", "re-exported", and "called" cheaply, and a count of exactly N symbol occurrences in a barrel (e.g. `packages/*/src/index.ts`) proves the module is not package-public without reading `package.json` exports.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `security/inbound.js`
  - *How:* `output_mode: content`
  - *How:* `truncated=false`
  - *How:* `packages/*/src/index.ts`
  - *How:* `package.json`
  - *How:* `src/index.ts`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-09-30T17:10:44.779Z; applied=9; wins=9; skipped=29; skippedWins=29 -->
- **- Always capture full verbatim content on the first successful read of a live `.temp_files/` scratch target a leader is actively working on, and re-read immediately before finalizing — mid-probe deletion or concurrent edits are the norm, and the first read may be the last surviving copy. Use `read` twice (start + end) rather than assuming the first snapshot still holds. - Use a grep positive-control hit list as a liveness check: when the probe target itself should appear among positive-control matches but doesn't, suspect mid-probe deletion or concurrent edits and re-`read` before concluding anything about referencers.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `.temp_files/`
  - *How:* `read`

<!-- learned-stamp: category=pattern; capturedAt=2026-09-30T16:32:00.077Z; skill=codebase-navigation; applied=50; wins=50; skipped=8; skippedWins=8 -->
- **Prefer `grep` with `output_mode: files_with_matches` over `content` mode when proving an importer/consumer set for a symbol with many test-file matches — content mode truncates on per-file match limits and hides files, while `files_with_matches` returns the full file list with `truncated=false`, cheaply proving the set exhaustive (pair with a scoped `codebase-incoming-calls` to separate import edges from real call sites).**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `grep`
  - *How:* `output_mode: files_with_matches`
  - *How:* `content`
  - *How:* `files_with_matches`
  - *How:* `truncated=false`
  - *How:* `codebase-incoming-calls`

---
*Last capture: 2026-09-30T19:25:32.595Z · 20 entries*
