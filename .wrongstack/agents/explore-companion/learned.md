# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T07:38:47.075Z; skill=codebase-navigation; applied=12; wins=12; skipped=23; skippedWins=23 -->
- **Always judge whether a proof-round vitest config's `resolve.alias` block is load-bearing by grepping the collected test's **runtime dependency import blocks** for value (non-`import type`) `@wrongstack/core` imports — type-only imports are erased and never hit resolution, so a test full of `import type` from `@wrongstack/core/...` proves nothing about alias necessity. Anchor: read the import block of each direct relative-path import in `packages/*/src` (e.g. `packages/sdd/src/sdd-parallel-run.ts`), not just the test file's own imports. After an unread edit of a gitignored proof-round config under `.temp_files/proof-driven-bug-hunter/<round>/`, verify the current on-disk state against the config's own header-comment contract (no `root`, `include` inside `test`, relative forward-slash include, exact `../` count shared by the helper import and `repoRoot`) — there is no git baseline to diff, so the header is the only recoverable pre-edit specification.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `resolve.alias`
  - *How:* `import type`
  - *How:* `@wrongstack/core`
  - *How:* `@wrongstack/core/...`
  - *How:* `packages/*/src`
  - *How:* `packages/sdd/src/sdd-parallel-run.ts`
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`
  - *How:* `root`
  - *How:* `include`
  - *How:* `test`
  - *How:* `../`
  - *How:* `repoRoot`

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T06:21:31.744Z; skill=codebase-navigation; applied=16; wins=16; skipped=49; skippedWins=49 -->
- **Always treat a log/artifact file under `.temp_files/` whose `read` `total_lines` changes between sequential reads as a live append in progress — never report a final line count, summary line, or pass/fail verdict for it; note the growth (e.g. total_lines 554→1344) and tell the leader to re-read the tail at completion. `codebase-skeleton`'s `originalLines` is only a point-in-time snapshot of such files, and for `.log` files it returns full raw content with `symbolCount: 0`, so a `read` of head/tail windows is the correct verification step, not the skeleton.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.temp_files/`
  - *How:* `read`
  - *How:* `total_lines`
  - *How:* `codebase-skeleton`
  - *How:* `originalLines`
  - *How:* `.log`
  - *How:* `symbolCount: 0`

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T06:01:13.170Z; skill=codebase-navigation; applied=12; wins=12; skipped=75; skippedWins=74 -->
- **Map TUI action blast radius through the composite `Action` union in `packages/tui/src/app-action-type.ts`, never the leaf files — each `app-action-{runtime,settings,services,workflows}.ts` leaf has exactly one importer (the aggregator at `app-action-type.ts`), while every reducer/hook/test consumes `Action` from `app-action-type.js` (40+ sites, incl. the `app-reducer.ts` re-export). Close leaf-consumer claims with a case-sensitive symbol grep (e.g. `AppActionRuntime`) over `packages/tui/**`, since no caller imports the leaf module path directly.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `Action`
  - *How:* `packages/tui/src/app-action-type.ts`
  - *How:* `app-action-{runtime,settings,services,workflows}.ts`
  - *How:* `app-action-type.ts`
  - *How:* `app-action-type.js`
  - *How:* `app-reducer.ts`
  - *How:* `AppActionRuntime`
  - *How:* `packages/tui/**`

<!-- learned-stamp: category=warning; capturedAt=2026-10-04T17:12:56.059Z; skill=codebase-navigation; applied=37; wins=37; skipped=149; skippedWins=147 -->
- **Never treat a `codebase-search` hit for an ignored-scope scratch script as a caller — index coverage stops at the ignore boundary, so name matches (e.g. `Probe2` in `packages/simpleui/tests/`) are collisions. Close callers of `.temp_files/*.ps1` probes with a filename-stem repo-wide grep plus a body-token control (e.g. grep the C# class name like `SaferProbe` in `.temp_files/`); if zero, callers are manual-only by construction, since `Add-Type`/P/Invoke probes import no project code. Identify a probe's role by grepping its Win32 API symbol in tracked scope (`SaferCreateLevel` → `packages/core/src/sandbox/windows-helper.ts`) instead of reading around.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `codebase-search`
  - *How:* `Probe2`
  - *How:* `packages/simpleui/tests/`
  - *How:* `.temp_files/*.ps1`
  - *How:* `SaferProbe`
  - *How:* `.temp_files/`
  - *How:* `Add-Type`
  - *How:* `SaferCreateLevel`
  - *How:* `packages/core/src/sandbox/windows-helper.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T05:51:27.477Z; skill=codebase-navigation; applied=26; wins=26; skipped=64; skippedWins=63 -->
- **When a `.temp_files/proof-driven-bug-hunter/<round>/` dir has no `run.mjs`, close the config's consumers with an exact-directory `tree` plus repo-wide greps for the config filename and round dirname — a two-file tree with zero grep hits proves manual-only `vitest run --config <path>` invocation, because the round-dir config filename never matches Vitest autodiscovery and root `vitest.config.ts` excludes `**/.temp_files/**`.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`
  - *How:* `run.mjs`
  - *How:* `tree`
  - *How:* `vitest run --config <path>`
  - *How:* `vitest.config.ts`
  - *How:* `**/.temp_files/**`

<!-- learned-stamp: category=warning; capturedAt=2026-10-04T18:51:34.226Z; skill=codebase-navigation; applied=1; wins=1; skipped=135; skippedWins=133 -->
- **When documenting a config key's in-project trust status in `docs/configuration.md`, diff the prose lists ("In-project config trust boundary", ~) against the code tables in `packages/core/src/storage/config-loader/in-project-policy.ts` (`IN_PROJECT_ALLOWED_KEYS`, `KNOWN_DENIED_IN_PROJECT`, `IN_PROJECT_DENIED_PATHS`) — the doc lists are hand-maintained and drift (e.g. all three `tools.sandbox.*` denied paths were missing while code enforced them). Treat the code table as source of truth, never the doc.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `docs/configuration.md`
  - *How:* `packages/core/src/storage/config-loader/in-project-policy.ts`
  - *How:* `IN_PROJECT_ALLOWED_KEYS`
  - *How:* `KNOWN_DENIED_IN_PROJECT`
  - *How:* `IN_PROJECT_DENIED_PATHS`
  - *How:* `tools.sandbox.*`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T08:32:57.282Z; skill=codebase-navigation -->
- **Always close a proof-round vitest config's alias load-bearing question by grepping the *collected test's direct relative-path targets* in `packages/*/src` for value (non-`import type`) bare-specifier imports — e.g. `packages/sdd/src` stores import `@wrongstack/core/tasking` and `@wrongstack/core/utils` at runtime (`TaskTracker`, `atomicWrite`), so any config collecting sdd tests needs `coreAliases` or it silently resolves stale `dist/`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/*/src`
  - *How:* `import type`
  - *How:* `packages/sdd/src`
  - *How:* `@wrongstack/core/tasking`
  - *How:* `@wrongstack/core/utils`
  - *How:* `TaskTracker`
  - *How:* `atomicWrite`
  - *How:* `coreAliases`
  - *How:* `dist/`
  - *How:* `@wrongstack/core`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T07:58:04.196Z; skill=codebase-navigation; applied=7; wins=7; skipped=15; skippedWins=15 -->
- **Always close consumers of a WebUI lib stats function with a case-sensitive symbol grep over `packages/webui/src` even when `codebase-incoming-calls` returns only tests — renderers routinely consume such functions type-only via `ReturnType<typeof storyStats>` (e.g. `packages/webui/src/components/session-story/StoryTables.tsx`), which the call index cannot see, while the real runtime caller sits in a component's `useMemo` (e.g. `packages/webui/src/components/SessionStoryView.tsx`).**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/webui/src`
  - *How:* `codebase-incoming-calls`
  - *How:* `ReturnType<typeof storyStats>`
  - *How:* `packages/webui/src/components/session-story/StoryTables.tsx`
  - *How:* `useMemo`
  - *How:* `packages/webui/src/components/SessionStoryView.tsx`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T17:29:01.311Z; skill=codebase-navigation; applied=44; wins=44; skipped=134; skippedWins=132 -->
- **Always map test-file blast radius through collectors and gates, not call graphs: leaf `*.test.ts` files have no exports or importers, so check package `vitest.config.ts` + root `vitest.config.ts` `include` patterns, `tsconfig.test.json` via the package `typecheck` script, and coverage `include`/thresholds (e.g. `packages/cli/vitest.config.ts`) — weakened assertions can fail coverage gates even when no code imports the test. Watch for CWD-relative scratch roots like `path.resolve('../../.temp_files')` in CLI fleet tests, which assume vitest CWD = package root.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `*.test.ts`
  - *How:* `vitest.config.ts`
  - *How:* `include`
  - *How:* `tsconfig.test.json`
  - *How:* `typecheck`
  - *How:* `packages/cli/vitest.config.ts`
  - *How:* `path.resolve('../../.temp_files')`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T07:42:09.310Z; skill=codebase-navigation; applied=10; wins=10; skipped=23; skippedWins=23 -->
- **Always prove existence of root-level files in `.temp_files/` (e.g. `commit-msg-*.txt` drafts) with a direct `read` — in this repo `glob`, `tree`'s glob filter, and path-scoped `grep` can all return false zeros there, even for a token verbatim in the file. Before trusting any ignored-scope grep zero for caller closure, run a body-token control against the target file; if the control fails, discard that pass and close callers with a repo-wide filename-stem grep for tracked scope plus a "manual-only by construction" verdict for scratch files nothing can reference. Gitignored scratch files have no git recovery — capture their full content in the report before the leader edits further. Key takeaway: `.temp_files/commit-msg-r1.txt` is an unreferenced, gitignored commit-message draft with zero code blast radius — its only value is its content, which is now safely captured.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/`
  - *How:* `commit-msg-*.txt`
  - *How:* `read`
  - *How:* `glob`
  - *How:* `tree`
  - *How:* `grep`
  - *How:* `.temp_files/commit-msg-r1.txt`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T18:56:28.463Z; skill=codebase-navigation; applied=4; wins=4; skipped=130; skippedWins=128 -->
- **Always resolve `packages/cli/src/slash-commands/mcp-utils.ts` to its real target before mapping MCP command surfaces — it is a deprecated re-export of `packages/cli/src/services/mcp-management.ts` (the only REPL/TUI `/mcp` renderer), while WebUI list output flows through `listMcp`/`McpServerInfo` in `packages/mcp/src/manage.ts`, which can lag fields the CLI renderer reads directly from `MCPServerConfig` (e.g. `sandboxTrust` badge exists in `renderList` but not in the shared projection).**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/cli/src/slash-commands/mcp-utils.ts`
  - *How:* `packages/cli/src/services/mcp-management.ts`
  - *How:* `/mcp`
  - *How:* `listMcp`
  - *How:* `McpServerInfo`
  - *How:* `packages/mcp/src/manage.ts`
  - *How:* `MCPServerConfig`
  - *How:* `sandboxTrust`
  - *How:* `renderList`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T08:10:16.645Z; applied=6; wins=6; skipped=8; skippedWins=8 -->
- **Always state pre-edit vs post-edit recovery explicitly when mapping a gitignored `.temp_files/` script the leader edited unread: the post-edit `read` is the only state that exists, so capture its full content in the report and label the pre-edit state unrecoverable — there is no git baseline to diff. Pair this with diffing any hand-copied codec constants (e.g. `DICTIONARY_V1`, format bytes in `.temp_files/*.mjs` vs `packages/core/src/chronicle/payload-codec.ts`) because drift fails silently through `catch { continue }` decode loops.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/`
  - *How:* `read`
  - *How:* `DICTIONARY_V1`
  - *How:* `.temp_files/*.mjs`
  - *How:* `packages/core/src/chronicle/payload-codec.ts`
  - *How:* `catch { continue }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T08:03:59.864Z; applied=7; wins=7; skipped=11; skippedWins=11 -->
- **Always treat `.temp_files/` inspection scripts that hand-copy codec internals (compression dictionaries, format-byte constants) as silently-coupled to their production mirror — before editing such a script, diff its copied constants against the source module (e.g. `DICTIONARY_V1`/`0x00`/`0x01` in the scratch script vs `packages/core/src/chronicle/payload-codec.ts`), because upstream drift does not error: fallback decode paths plus per-row `catch { continue }` just shrink the parsed-row count toward zero.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/`
  - *How:* `DICTIONARY_V1`
  - *How:* `0x00`
  - *How:* `0x01`
  - *How:* `packages/core/src/chronicle/payload-codec.ts`
  - *How:* `catch { continue }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T08:22:54.549Z; applied=5; wins=5; skipped=4; skippedWins=4 -->
- **Always treat a leader-reported "edit" of an ignored-scope file that `read` ENOENT plus the saved depth-1 `tree` log under `~/.wrongstack/tool-output/` (grepped with a known-present control token) prove absent as a misdirected write — report that the edit landed elsewhere (different worktree, typo'd path, or failed write) instead of mapping a phantom file, and close references with a repo-wide filename-stem grep (`commit-msg-`-style) at `truncated=false` before declaring zero blast radius.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `read`
  - *How:* `tree`
  - *How:* `~/.wrongstack/tool-output/`
  - *How:* `commit-msg-`
  - *How:* `truncated=false`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T19:25:58.141Z; skill=codebase-navigation; applied=27; wins=27; skipped=102; skippedWins=100 -->
- **Before mapping or approving edits to any `packages/**/tests/**/*.test.ts` file in this repo, diff the file's used symbols against its import lists with root `vitest.config.ts` `globals: false` in mind — vitest hooks (`afterAll`, `beforeEach`, …) and helper resets must be explicitly imported, so an un-imported used symbol is a guaranteed win32/ReferenceError failure invisible to production `tsc --noEmit -p packages/core`. When a test imports through `packages/core/src/sandbox/index.ts`, check the barrel's explicit re-export lines before proposing a barrel change: the barrel is under a public-API snapshot gate, and missing imports should be fixed in the test file, not by editing `src/sandbox/index.ts`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/**/tests/**/*.test.ts`
  - *How:* `vitest.config.ts`
  - *How:* `globals: false`
  - *How:* `afterAll`
  - *How:* `beforeEach`
  - *How:* `tsc --noEmit -p packages/core`
  - *How:* `packages/core/src/sandbox/index.ts`
  - *How:* `src/sandbox/index.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T17:11:34.959Z; skill=codebase-navigation; applied=1; wins=1; skipped=186; skippedWins=184 -->
- **Before reporting blast radius for WebUI view mounting, check `packages/webui/tests/components/chat-keep-alive.test.ts` — it asserts on raw source text of `packages/webui/src/components/ViewRouter.tsx` (`<ChatView />` always mounted, `ws-view-parked` parking, regex-rejected conditional renders), so structural or formatting edits to that render site can break tests that import graphs won't reveal.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/webui/tests/components/chat-keep-alive.test.ts`
  - *How:* `packages/webui/src/components/ViewRouter.tsx`
  - *How:* `<ChatView />`
  - *How:* `ws-view-parked`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T06:17:20.383Z; skill=codebase-navigation; applied=21; wins=21; skipped=47; skippedWins=47 -->
- **Classify `proof-driven-bug-hunter` rounds by harness type before predicting invocation: a `proof.ts` importing `node:assert/strict` with a `main().catch(...)` tail and no vitest imports is a standalone `tsx`/node script, not a vitest project — even when the round dir has no `config.ts`/`run.mjs`. Close it with the standard trio (exact-directory `tree`, repo-wide grep for the round dirname, zero exports) which proves manual-only invocation regardless of harness type.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `proof-driven-bug-hunter`
  - *How:* `proof.ts`
  - *How:* `node:assert/strict`
  - *How:* `main().catch(...)`
  - *How:* `tsx`
  - *How:* `config.ts`
  - *How:* `run.mjs`
  - *How:* `tree`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T19:19:19.976Z; skill=typescript-strict; applied=4; wins=4; skipped=128; skippedWins=126 -->
- **Re-verify file-payload claims against current source before applying stale role notes: `packages/core/src/sandbox/windows-helper.ts` no longer embeds the PowerShell/C# Safer P/Invoke script older notes describe — it is now the 82-line `runas /trustlevel:0x20000` variant (`defaultWindowsHelperRunner`), so its behavioral contract lives in the TypeScript signatures and header doc, not inside a string payload. When mapping sandbox helper blast radius, anchor on `windows-native.ts:11` (production), `sandbox/index.ts:34` (public-API snapshot gate), and the env-gated `windows-native-integration.test.ts`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/core/src/sandbox/windows-helper.ts`
  - *How:* `runas /trustlevel:0x20000`
  - *How:* `defaultWindowsHelperRunner`
  - *How:* `windows-native.ts:11`
  - *How:* `sandbox/index.ts:34`
  - *How:* `windows-native-integration.test.ts`
  - *How:* `sandbox/index.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T07:18:55.805Z; skill=codebase-navigation; applied=14; wins=14; skipped=32; skippedWins=32 -->
- **Treat the header comment of a round-owned `vitest.config.mts` under `.temp_files/proof-driven-bug-hunter/<round>/` as its behavioral contract — it encodes deliberate constraints (no `root`, `include` inside `test`, round-dir-relative forward-slash paths, exact `../` count for repoRoot) that an edit can silently violate, and the file has no git recovery because it sits in the gitignored `.temp_files/**` namespace. When judging whether the config's `resolve.alias` entries are load-bearing, grep the *collected test's* transitive runtime imports (e.g. `@wrongstack/sage` in `packages/webui-server/src/server/memory-handlers.ts`), not just the test's own direct relative-path imports.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `vitest.config.mts`
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`
  - *How:* `root`
  - *How:* `include`
  - *How:* `test`
  - *How:* `../`
  - *How:* `.temp_files/**`
  - *How:* `resolve.alias`
  - *How:* `@wrongstack/sage`
  - *How:* `packages/webui-server/src/server/memory-handlers.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T17:37:15.631Z; skill=codebase-navigation; applied=24; wins=24; skipped=152; skippedWins=150 -->
- **When `codebase-impact-analysis` reports indirect call sites with `line: 0` (e.g. `applyHelper` reachability into `packages/core/src/sandbox/wrap.ts`), confirm exact locations with a literal-path `grep` for the symbol before citing `file:line`; report only grep-confirmed line numbers.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `codebase-impact-analysis`
  - *How:* `line: 0`
  - *How:* `applyHelper`
  - *How:* `packages/core/src/sandbox/wrap.ts`
  - *How:* `grep`
  - *How:* `file:line`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T07:31:42.200Z; skill=codebase-navigation; applied=11; wins=11; skipped=28; skippedWins=28 -->
- **When closing consumers of a class module in `packages/sdd` that has a sibling `-types.ts` module (e.g. `sdd-parallel-run.ts` vs `sdd-parallel-run-types.ts`), always grep both module paths and split value vs type-only imports — siblings routinely import shared types from the `-types.js` module while the class file merely re-exports them, so a single module-path grep miscounts the class module's real dependents. Anchor the closure with a symbol-name grep (e.g. `SddParallelRun`) plus the barrel (`packages/sdd/src/index.ts`) to catch transitive package consumers like the CLI global in `packages/cli/src/wiring/sdd-handlers.ts`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/sdd`
  - *How:* `-types.ts`
  - *How:* `sdd-parallel-run.ts`
  - *How:* `sdd-parallel-run-types.ts`
  - *How:* `-types.js`
  - *How:* `SddParallelRun`
  - *How:* `packages/sdd/src/index.ts`
  - *How:* `packages/cli/src/wiring/sdd-handlers.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T07:01:21.819Z; skill=codebase-navigation; applied=43; wins=43; skipped=11; skippedWins=11 -->
- **When closing consumers of a symbol that is re-exported through barrels (e.g. `packages/mcp/src/transport-streamable.ts` → `transport.ts` → `index.ts`), enumerate files with grep `files_with_matches` before any `content` mode — a symbol-heavy test file (e.g. `transport.test.ts` with 40 `StreamableHTTPTransport` matches) consumes the per-file content cap and truncates, while `files_with_matches` returns the full file closure at `truncated=false`. Then split production vs. test consumers with a path-scoped grep over `packages/mcp/src` and close direct-import vs. barrel-import with a separate repo-wide module-path (`transport-streamable`) grep. Anchor: `StreamableHTTPTransport`, `packages/mcp/src/transport.ts`, `packages/mcp/src/index.ts`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/mcp/src/transport-streamable.ts`
  - *How:* `transport.ts`
  - *How:* `index.ts`
  - *How:* `files_with_matches`
  - *How:* `content`
  - *How:* `transport.test.ts`
  - *How:* `StreamableHTTPTransport`
  - *How:* `truncated=false`
  - *How:* `packages/mcp/src`
  - *How:* `transport-streamable`
  - *How:* `packages/mcp/src/transport.ts`
  - *How:* `packages/mcp/src/index.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T17:37:15.631Z; skill=codebase-navigation; applied=8; wins=8; skipped=168; skippedWins=166 -->
- **When mapping a file whose main payload is a string-embedded script (e.g. the PowerShell/C# inside `packages/core/src/sandbox/windows-helper.ts`), read the full file with `read` — `codebase-skeleton` compresses the embedded script, and the behavioral contract (diagnostic exit codes, stdout lines, template-literal backslash prohibition) lives inside the string, not in TypeScript signatures.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/core/src/sandbox/windows-helper.ts`
  - *How:* `read`
  - *How:* `codebase-skeleton`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T06:59:07.867Z; skill=codebase-navigation; applied=27; wins=27; skipped=29; skippedWins=29 -->
- **When mapping consumers of WebUI store selectors in `packages/webui/src/stores/fleet-selectors.ts`, close them with a symbol-name grep over `packages/webui`, not a module-path grep — the module has exactly one direct importer (`fleet-store.ts`), which re-exports the selector values (and `stores/index.ts` barrel re-exports them again), so path-only search hides every real consumer. Distinguish public surface (the six re-exported selectors) from private surface (`EMPTY_SESSION_TOTALS`/`UNATTRIBUTED`/`totalsCache`/`totalsBySession`, zero external users) before editing, and remember the `useSessionLeaderId`/`useSessionFleetTotals` hooks that wrap the selectors live in `fleet-store.ts`, not the selectors file.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/webui/src/stores/fleet-selectors.ts`
  - *How:* `packages/webui`
  - *How:* `fleet-store.ts`
  - *How:* `stores/index.ts`
  - *How:* `EMPTY_SESSION_TOTALS`
  - *How:* `UNATTRIBUTED`
  - *How:* `totalsCache`
  - *How:* `totalsBySession`
  - *How:* `useSessionLeaderId`
  - *How:* `useSessionFleetTotals`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-05T00:37:03.376Z; applied=1; wins=1; skipped=92; skippedWins=90 -->
- **Before renaming or moving `packages/webui/src/hooks/ws-reply-lanes.ts` or any `ws-*-handlers.ts` file, check the filename filter at `packages/webui/tests/hooks/ws-handlers-lane-routing.test.ts` — the lane-routing guard enumerates files by exact name pattern (`/^(?:.+-)?handlers\.ts$/` plus the literal `ws-reply-lanes.ts`), so renames silently remove files from the foreground-facade scan rather than failing loudly.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `packages/webui/src/hooks/ws-reply-lanes.ts`
  - *How:* `ws-*-handlers.ts`
  - *How:* `packages/webui/tests/hooks/ws-handlers-lane-routing.test.ts`
  - *How:* `/^(?:.+-)?handlers\.ts$/`
  - *How:* `ws-reply-lanes.ts`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-04T17:39:58.246Z; skill=codebase-navigation; applied=30; wins=30; skipped=145; skippedWins=143 -->
- **Use `docs/reports/architecture-health-current.json` as a shortcut for "which vitest project collects this test file": it contains a generated per-file → `projects` array (e.g. `webui-jsdom`, `server-node`) mapping every test file to its collector(s). Verify against `packages/webui/vitest.config.ts` project `include`/`exclude` when the entry looks stale — the JSON is generated inventory, not the collection source of truth.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `docs/reports/architecture-health-current.json`
  - *How:* `projects`
  - *How:* `webui-jsdom`
  - *How:* `server-node`
  - *How:* `packages/webui/vitest.config.ts`
  - *How:* `include`
  - *How:* `exclude`

## Project facts

<!-- learned-stamp: category=fact; capturedAt=2026-10-04T19:22:17.596Z; skill=codebase-navigation; applied=40; wins=40; skipped=90; skippedWins=88 -->
- **Close "who runs a gated integration test" by grepping its gate env var repo-wide, not just import graphs: `WRONGSTACK_SANDBOX_INTEGRATION` in this repo gates three suites (`packages/core/tests/sandbox/windows-native-integration.test.ts`, `packages/core/tests/sandbox/container.test.ts`, `packages/tools/tests/sandbox-integration.test.ts`) and is set by no workflow — so invocation is manual-only, a fact import/call graphs cannot show. For leaf test files (no exports), "callers" are the vitest collectors: root `vitest.config.ts` `include` plus the per-file `projects` mapping in `docs/reports/architecture-health-current.json`.**
  - *Why:* Current state of the project — assumed by other conventions, build steps, or peers, so acting on a stale assumption wastes a cycle.
  - *How:* `WRONGSTACK_SANDBOX_INTEGRATION`
  - *How:* `packages/core/tests/sandbox/windows-native-integration.test.ts`
  - *How:* `packages/core/tests/sandbox/container.test.ts`
  - *How:* `packages/tools/tests/sandbox-integration.test.ts`
  - *How:* `vitest.config.ts`
  - *How:* `include`
  - *How:* `projects`
  - *How:* `docs/reports/architecture-health-current.json`

<!-- learned-stamp: category=fact; capturedAt=2026-10-05T06:06:05.124Z; skill=codebase-navigation; applied=3; wins=3; skipped=80; skippedWins=79 -->
- **Locate TUI `State` field declarations by grepping the composed slice files, not just `packages/tui/src/app-state.ts` — reducer state like `messageJump` is declared in `packages/tui/src/app-panel-state.ts` (panel/overlay slice) with initial values in `packages/tui/src/app-initial-state.ts`; a zero-hit grep in `app-state.ts` means the field lives in a composed module, not that it is undeclared.**
  - *Why:* Current state of the project — assumed by other conventions, build steps, or peers, so acting on a stale assumption wastes a cycle.
  - *How:* `State`
  - *How:* `packages/tui/src/app-state.ts`
  - *How:* `messageJump`
  - *How:* `packages/tui/src/app-panel-state.ts`
  - *How:* `packages/tui/src/app-initial-state.ts`
  - *How:* `app-state.ts`

---
*Last capture: 2026-10-05T08:32:57.282Z · 28 entries*
