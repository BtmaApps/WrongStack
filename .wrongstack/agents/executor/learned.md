# Learned instructions for `executor`

> Project-specific learning data for the `executor` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T20:54:46.080Z; skill=typescript-strict; skipped=2; skippedWins=2 -->
- **- Always locate the real render point before assuming a named file owns it: `packages/cli/src/slash-commands/mcp-utils.ts` is a deprecated pure re-export of `packages/cli/src/services/mcp-management.ts`, whose `renderList` produces the `/mcp` list text for REPL, TUI-fallback, and WebUI hosts — future `/mcp` output changes belong in that service, not the slash-command wrapper. - On this Windows-cmd host, run repo-wide checks as `pnpm exec <tool> ... > .temp_files\<name>.log 2>&1` and read with `type`/`findstr` — `tail`, `grep` pipes, and `/d/...` `cd` paths do not exist in cmd, and bare `tsc`/tool names are not on PATH in this pnpm monorepo. - Write new tests first and observe them fail before implementing when the tree is shared with concurrent peers — a stash-revert red/green proof on a hot file (10+ peer write cycles/day) risks losing your own change; test-first ordering gets the same proof at zero risk.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/cli/src/slash-commands/mcp-utils.ts`
  - *How:* `packages/cli/src/services/mcp-management.ts`
  - *How:* `renderList`
  - *How:* `/mcp`
  - *How:* `pnpm exec <tool> ... > .temp_files\<name>.log 2>&1`
  - *How:* `type`
  - *How:* `findstr`
  - *How:* `tail`
  - *How:* `grep`
  - *How:* `/d/...`
  - *How:* `cd`
  - *How:* `tsc`

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T21:06:39.055Z; skill=testing -->
- **Always terminate the **last** SSE event fixture with a blank line (`'data: …', '', ''` joined with `\n`) in `packages/mcp` tests — `SSEReader` and `completeEventsEnd` only dispatch an event when a blank line follows it, so a stream that ends `data: x\n` silently drops its final event even after `controller.close()`. Use `"jsonrpc":"2.0"` in every envelope fixture for the streamable transport but not for the SSE transport: `extractJsonRpcEnvelopes` (`packages/mcp/src/transport-jsonrpc.ts`) rejects id-less envelopes without the `jsonrpc` field, while `SSEReader`-based dispatch never checks it. Never share one regex between `String.replace` and `RegExp.test` for control-character sanitization (`packages/mcp/src/protocol.ts`): `replace` needs the `g` flag, and a `g`-flagged regex makes `.test` stateful via `lastIndex` — declare a `/…/g` constant for replace and a separate `/…/` constant for tests. Attribute coverage gaps to your own change before trusting a red 100% gate on a shared dirty tree: parse `packages/mcp/coverage/coverage-final.json` (`s`/`b`/`fn` maps) and map each uncovered line to source, then check `git diff -- <file>` hunks to see which lines are yours — the gate can be red entirely from other agents' in-flight edits and pre-existing gaps.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `'data: …', '', ''`
  - *How:* `\n`
  - *How:* `packages/mcp`
  - *How:* `SSEReader`
  - *How:* `completeEventsEnd`
  - *How:* `data: x\n`
  - *How:* `controller.close()`
  - *How:* `"jsonrpc":"2.0"`
  - *How:* `extractJsonRpcEnvelopes`
  - *How:* `packages/mcp/src/transport-jsonrpc.ts`
  - *How:* `jsonrpc`
  - *How:* `String.replace`
  - *How:* `RegExp.test`
  - *How:* `packages/mcp/src/protocol.ts`
  - *How:* `replace`
  - *How:* `g`
  - *How:* `.test`
  - *How:* `lastIndex`
  - *How:* `/…/g`
  - *How:* `/…/`
  - *How:* `packages/mcp/coverage/coverage-final.json`
  - *How:* `s`
  - *How:* `b`
  - *How:* `fn`
  - *How:* `git diff -- <file>`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T14:51:05.321Z; skill=testing; applied=1; wins=1; skipped=3; skippedWins=3 -->
- **Before a mechanical test-fixture migration driven by a source-behavior change, always capture a baseline failing-test list first (`pnpm exec vitest run <pkg> --no-color > .temp_files\baseline.log`) and edit only occurrences the run proves broken — fixtures that inject state directly past the changed code path keep passing and must stay untouched. In `packages/mcp/tests`, initialize-*result* fixtures feeding a real transport `connect()` (e.g. `INIT_RESULT` in transport.test.ts) are affected by `assertSupportedServerProtocolVersion` in `packages/mcp/src/constants.ts`, while direct `internals._serverMetadata` injection helpers (e.g. `connectedClient()` in client-resources-prompts.test.ts) and `getServerMetadata()` mock returns (registry-*, manifest-cache suites) are not.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `pnpm exec vitest run <pkg> --no-color > .temp_files\baseline.log`
  - *How:* `packages/mcp/tests`
  - *How:* `connect()`
  - *How:* `INIT_RESULT`
  - *How:* `assertSupportedServerProtocolVersion`
  - *How:* `packages/mcp/src/constants.ts`
  - *How:* `internals._serverMetadata`
  - *How:* `connectedClient()`
  - *How:* `getServerMetadata()`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-09-29T07:23:54.131Z; skill=testing; applied=1; wins=1; skipped=18; skippedWins=18 -->
- **Always invoke `vitest` and `biome` in this repo through `pnpm exec <tool>` with `cwd` set to the package directory — the wrapper tools (`test`, `lint`, `format`) fail with "Executable not found in $PATH" because nothing is on the global PATH in this pnpm monorepo. For per-hunk review of working-tree changes, use `git diff -- <files>` via `exec`; the `diff` tool's files-only mode returns line-numbered dumps, not hunks.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `vitest`
  - *How:* `biome`
  - *How:* `pnpm exec <tool>`
  - *How:* `cwd`
  - *How:* `test`
  - *How:* `lint`
  - *How:* `format`
  - *How:* `git diff -- <files>`
  - *How:* `exec`
  - *How:* `diff`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-04T11:24:40.426Z; applied=2; wins=2; skipped=11; skippedWins=11 -->
- **Always verify OSS project "activity" from the fetched README alongside GitHub API flags when writing review reports — `archived: false` and a recent `pushed_at` can coexist with an explicit "read-only / no longer maintained" notice, so API metadata alone overstates liveness. Fetch `https://api.github.com/repos/<org>/<repo>` plus `https://raw.githubusercontent.com/<org>/<repo>/HEAD/README.md` and prefer the README's own maintenance statement for the verdict.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `archived: false`
  - *How:* `pushed_at`
  - *How:* `https://api.github.com/repos/<org>/<repo>`
  - *How:* `https://raw.githubusercontent.com/<org>/<repo>/HEAD/README.md`
  - *How:* `HEAD/README.md`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-05T14:51:05.321Z; skill=testing; skipped=4; skippedWins=4 -->
- **Use a baseline-vs-after vitest pair as the regression proof for fixture migrations: identical totals with failed→passed deltas (830→854 passed, 24→0 failed, same 4 skips) demonstrate no test was weakened, skipped, or deleted — run via `pnpm exec vitest run packages/mcp --no-color` from the repo root on Windows cmd.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `pnpm exec vitest run packages/mcp --no-color`

---
*Last capture: 2026-10-05T21:06:39.055Z · 6 entries*
