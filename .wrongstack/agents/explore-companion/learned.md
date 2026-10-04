# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-04T17:12:56.059Z; skill=codebase-navigation; applied=15; wins=15; skipped=42; skippedWins=42 -->
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

<!-- learned-stamp: category=warning; capturedAt=2026-10-04T18:51:34.226Z; skill=codebase-navigation; applied=1; wins=1; skipped=6; skippedWins=6 -->
- **When documenting a config key's in-project trust status in `docs/configuration.md`, diff the prose lists ("In-project config trust boundary", ~) against the code tables in `packages/core/src/storage/config-loader/in-project-policy.ts` (`IN_PROJECT_ALLOWED_KEYS`, `KNOWN_DENIED_IN_PROJECT`, `IN_PROJECT_DENIED_PATHS`) — the doc lists are hand-maintained and drift (e.g. all three `tools.sandbox.*` denied paths were missing while code enforced them). Treat the code table as source of truth, never the doc.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `docs/configuration.md`
  - *How:* `packages/core/src/storage/config-loader/in-project-policy.ts`
  - *How:* `IN_PROJECT_ALLOWED_KEYS`
  - *How:* `KNOWN_DENIED_IN_PROJECT`
  - *How:* `IN_PROJECT_DENIED_PATHS`
  - *How:* `tools.sandbox.*`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T17:29:01.311Z; skill=codebase-navigation; applied=12; wins=12; skipped=37; skippedWins=37 -->
- **Always map test-file blast radius through collectors and gates, not call graphs: leaf `*.test.ts` files have no exports or importers, so check package `vitest.config.ts` + root `vitest.config.ts` `include` patterns, `tsconfig.test.json` via the package `typecheck` script, and coverage `include`/thresholds (e.g. `packages/cli/vitest.config.ts`) — weakened assertions can fail coverage gates even when no code imports the test. Watch for CWD-relative scratch roots like `path.resolve('../../.temp_files')` in CLI fleet tests, which assume vitest CWD = package root.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `*.test.ts`
  - *How:* `vitest.config.ts`
  - *How:* `include`
  - *How:* `tsconfig.test.json`
  - *How:* `typecheck`
  - *How:* `packages/cli/vitest.config.ts`
  - *How:* `path.resolve('../../.temp_files')`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T18:56:28.463Z; skill=codebase-navigation; skipped=5; skippedWins=5 -->
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

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T19:25:58.141Z; skill=codebase-navigation -->
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

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T17:11:34.959Z; skill=codebase-navigation; applied=1; wins=1; skipped=57; skippedWins=57 -->
- **Before reporting blast radius for WebUI view mounting, check `packages/webui/tests/components/chat-keep-alive.test.ts` — it asserts on raw source text of `packages/webui/src/components/ViewRouter.tsx` (`<ChatView />` always mounted, `ws-view-parked` parking, regex-rejected conditional renders), so structural or formatting edits to that render site can break tests that import graphs won't reveal.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/webui/tests/components/chat-keep-alive.test.ts`
  - *How:* `packages/webui/src/components/ViewRouter.tsx`
  - *How:* `<ChatView />`
  - *How:* `ws-view-parked`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T19:19:19.976Z; skill=typescript-strict; applied=3; wins=3 -->
- **Re-verify file-payload claims against current source before applying stale role notes: `packages/core/src/sandbox/windows-helper.ts` no longer embeds the PowerShell/C# Safer P/Invoke script older notes describe — it is now the 82-line `runas /trustlevel:0x20000` variant (`defaultWindowsHelperRunner`), so its behavioral contract lives in the TypeScript signatures and header doc, not inside a string payload. When mapping sandbox helper blast radius, anchor on `windows-native.ts:11` (production), `sandbox/index.ts:34` (public-API snapshot gate), and the env-gated `windows-native-integration.test.ts`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/core/src/sandbox/windows-helper.ts`
  - *How:* `runas /trustlevel:0x20000`
  - *How:* `defaultWindowsHelperRunner`
  - *How:* `windows-native.ts:11`
  - *How:* `sandbox/index.ts:34`
  - *How:* `windows-native-integration.test.ts`
  - *How:* `sandbox/index.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T17:37:15.631Z; skill=codebase-navigation; applied=12; wins=12; skipped=35; skippedWins=35 -->
- **When `codebase-impact-analysis` reports indirect call sites with `line: 0` (e.g. `applyHelper` reachability into `packages/core/src/sandbox/wrap.ts`), confirm exact locations with a literal-path `grep` for the symbol before citing `file:line`; report only grep-confirmed line numbers.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `codebase-impact-analysis`
  - *How:* `line: 0`
  - *How:* `applyHelper`
  - *How:* `packages/core/src/sandbox/wrap.ts`
  - *How:* `grep`
  - *How:* `file:line`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T17:37:15.631Z; skill=codebase-navigation; applied=3; wins=3; skipped=44; skippedWins=44 -->
- **When mapping a file whose main payload is a string-embedded script (e.g. the PowerShell/C# inside `packages/core/src/sandbox/windows-helper.ts`), read the full file with `read` — `codebase-skeleton` compresses the embedded script, and the behavioral contract (diagnostic exit codes, stdout lines, template-literal backslash prohibition) lives inside the string, not in TypeScript signatures.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/core/src/sandbox/windows-helper.ts`
  - *How:* `read`
  - *How:* `codebase-skeleton`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-04T17:39:58.246Z; skill=codebase-navigation; applied=7; wins=7; skipped=39; skippedWins=39 -->
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

<!-- learned-stamp: category=fact; capturedAt=2026-10-04T19:22:17.596Z; skill=codebase-navigation; applied=1; wins=1 -->
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

---
*Last capture: 2026-10-04T19:25:58.141Z · 11 entries*
