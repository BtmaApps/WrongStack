# Learned instructions for `bug-hunter`

> Project-specific learning data for the `bug-hunter` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T09:25:10.464Z; skill=typescript-strict; applied=1; wins=1; skipped=6; skippedWins=6 -->
- **Before applying any cascade fix on a co-modified tree, diff the exact path twice across the adjudication (`git diff --stat` then `git diff -U0 -- <path>` via `exec`) — an in-flight feature owner routinely lands the dedup between snapshots, and a guarded-edit no-match refusal means "re-anchor to live text," never "retry unchanged." A clean package typecheck (`node node_modules/typescript/bin/tsc --noEmit --pretty false -p <pkg>/tsconfig.json`) plus the covering vitest files is the decisive close-out for false-positive missing-field claims like `packages/webui-hq/src/data/local-prefs.ts:hideIdle`.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `git diff --stat`
  - *How:* `git diff -U0 -- <path>`
  - *How:* `exec`
  - *How:* `node node_modules/typescript/bin/tsc --noEmit --pretty false -p <pkg>/tsconfig.json`
  - *How:* `packages/webui-hq/src/data/local-prefs.ts:hideIdle`
  - *How:* `packages/webui-hq/src/data/local-prefs.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T15:01:07.367Z; skill=typescript-strict; skipped=5; skippedWins=5 -->
- **Never trust a visually-rendered `read` of a single trailing delimiter char when adjudicating mismatched-quote findings — run the package typecheck (`node node_modules/typescript/bin/tsc --noEmit --pretty false -p <pkg>/tsconfig.json`) and slice the exact bytes with PowerShell (`(Get-Content <path>)[n][-30..-1] -join ''`) before declaring a false positive. Also avoid fixing single chars via PowerShell `String.Replace` in double-quoted strings: the backtick is an escape character there and the match silently fails; use the guarded `edit` tool instead.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `read`
  - *How:* `node node_modules/typescript/bin/tsc --noEmit --pretty false -p <pkg>/tsconfig.json`
  - *How:* `(Get-Content <path>)[n][-30..-1] -join ''`
  - *How:* `String.Replace`
  - *How:* `edit`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-08T15:09:08.576Z; skill=testing; skipped=2; skippedWins=2 -->
- **Always falsify "wrong module identity" claims about `syncBuiltinESMExports()` in `packages/core/tests/coordination/single-instance-mailbox.test.ts` by (1) checking the consumer's access style — `import * as fsp` + `fsp.readFile` property reads in `packages/core/src/coordination/single-instance-mailbox.ts` are live namespace accesses that `syncBuiltinESMExports()` is documented to update, and (2) asking whether the test is self-falsifying: if the patch missed, the `rejects.toMatchObject({ code: 'EBUSY' })` assertion fails loudly ("resolved instead of rejected"), so a green run proves the SUT was patched. Node's `module.syncBuiltinESMExports()` bridges CJS-export mutations to builtin ESM namespaces by design — reject review claims that it "does not re-link consumer import bindings" without an executed counterexample.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `syncBuiltinESMExports()`
  - *How:* `packages/core/tests/coordination/single-instance-mailbox.test.ts`
  - *How:* `import * as fsp`
  - *How:* `fsp.readFile`
  - *How:* `packages/core/src/coordination/single-instance-mailbox.ts`
  - *How:* `rejects.toMatchObject({ code: 'EBUSY' })`
  - *How:* `module.syncBuiltinESMExports()`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T12:01:21.246Z; skill=testing; skipped=8; skippedWins=8 -->
- **Always falsify Chimera self-recursion and guard-omission claims by reading the live co-modified file before patching — in this repository the reviewer snapshot routinely lags an in-flight edit, and the suggested fix is often already present verbatim (e.g. `packages/core/src/goal/mission-refinement.ts` `notify` wrapper calling `opts?.onError?.(...)` and the dual `opts?.signal?.aborted` / `timer.signal.aborted` post-await checks). Anchor the adjudication with `git status --short -- <path>`, a full live read of the cited lines, and the covering suite (`pnpm exec vitest run packages/core/tests/goal/mission-refinement.test.ts`), then report resolved instead of applying duplicate logic.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/core/src/goal/mission-refinement.ts`
  - *How:* `notify`
  - *How:* `opts?.onError?.(...)`
  - *How:* `opts?.signal?.aborted`
  - *How:* `timer.signal.aborted`
  - *How:* `git status --short -- <path>`
  - *How:* `pnpm exec vitest run packages/core/tests/goal/mission-refinement.test.ts`
  - *How:* `packages/core/tests/goal/mission-refinement.test.ts`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-09T14:13:07.266Z; skill=bug-hunter; skipped=1; skippedWins=1 -->
- **Adjudicate modulo-rotation bug claims by evaluating the reachable count domain, not the expression shape: `x + ((i + (cond ? count - 1 : 1)) % count)` is a correct wrap-backward whenever `count ≥ 3`, because `count - 1 ≡ -1 (mod count)`; the "reverse equals forward" collapse only occurs at `count = 2`. Before accepting such a finding in `packages/tui/src/hooks/use-picker-keys-tools-settings.ts`, enumerate the modes that reach the branch (e.g. `remove` is consumed by earlier `else if` arms) and confirm the key parser's modifier flags — Ink reports Shift+Tab as `{ tab: true, shift: true }`. Separately, MCP `transport` values are canonical `stdio | sse | streamable-http` repo-wide (`packages/cli/src/boot/mcp-config-flag.ts` rejects others; `packages/cli/src/acp-mcp-servers.ts` canonicalizes `http` → `streamable-http`), so any TUI-side validator admitting `'http'` lets users persist configs the loader will reject — align validator whitelists with the canonical wire form and its own error message. ```json { "verification_evidence": { "typecheck": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/tui/tsconfig.json", "exitCode": 0 }, "lint": { "command": "pnpm exec biome check packages/tui/src/hooks/use-panel-controllers.ts", "exitCode": 0 }, "tests": { "command": "pnpm exec vitest run packages/tui/tests/mcp-panel-management.test.tsx", "exitCode": 0 } } } ```**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `x + ((i + (cond ? count - 1 : 1)) % count)`
  - *How:* `count ≥ 3`
  - *How:* `count - 1 ≡ -1 (mod count)`
  - *How:* `count = 2`
  - *How:* `packages/tui/src/hooks/use-picker-keys-tools-settings.ts`
  - *How:* `remove`
  - *How:* `else if`
  - *How:* `{ tab: true, shift: true }`
  - *How:* `transport`
  - *How:* `stdio | sse | streamable-http`
  - *How:* `packages/cli/src/boot/mcp-config-flag.ts`
  - *How:* `packages/cli/src/acp-mcp-servers.ts`
  - *How:* `http`
  - *How:* `streamable-http`
  - *How:* `'http'`
  - *How:* `packages/tui/tsconfig.json`
  - *How:* `packages/tui/src/hooks/use-panel-controllers.ts`
  - *How:* `packages/tui/tests/mcp-panel-management.test.tsx`

---
*Last capture: 2026-10-09T14:13:07.266Z · 5 entries*
