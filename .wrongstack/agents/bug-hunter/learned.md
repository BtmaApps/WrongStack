# Learned instructions for `bug-hunter`

> Project-specific learning data for the `bug-hunter` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-09-28T17:01:37.142Z; skill=typescript-strict -->
- **- Never flag `void this.someAsyncFn()` as a race without checking the callee's body: an `async` function with no `await` (e.g. `loadOffset()` in `packages/telegram/src/poller.ts`) runs its entire body synchronously before the next statement, and `OffsetStore.read()` (`packages/telegram/src/offset-store.ts`) is synchronous `readFileSync` — so `acquireAndPoll()` cannot poll with a stale offset. Verify the callee is await-free and the underlying store read is sync before claiming fire-and-forget staleness. - Before claiming a caller bypasses a hash/dedup branch, read the callee's signature: `rememberUnlocked` in `packages/vector-memory/src/store.ts` takes only `VectorEntryInput` and derives the SAGE-keyed path from `input.metadata.sageId` itself (`sageKeyedContentHash` at store.ts:305-311) — callers like `syncFromSage` cannot bypass it by omitting an argument that does not exist. ```json { "verification_evidence": { "typecheck": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/telegram/tsconfig.json", "exitCode": 0 }, "tests": { "command": "pnpm exec vitest run packages/telegram/tests/unit/poller-standby-offset.test.ts packages/tools/tests/project-kit-advisor.test.ts packages/vector-memory/tests/sage-mirror-shared-text.test.ts", "exitCode": 0 } } } ```**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `void this.someAsyncFn()`
  - *How:* `async`
  - *How:* `await`
  - *How:* `loadOffset()`
  - *How:* `packages/telegram/src/poller.ts`
  - *How:* `OffsetStore.read()`
  - *How:* `packages/telegram/src/offset-store.ts`
  - *How:* `readFileSync`
  - *How:* `acquireAndPoll()`
  - *How:* `rememberUnlocked`
  - *How:* `packages/vector-memory/src/store.ts`
  - *How:* `VectorEntryInput`
  - *How:* `input.metadata.sageId`
  - *How:* `sageKeyedContentHash`
  - *How:* `syncFromSage`
  - *How:* `packages/telegram/tsconfig.json`
  - *How:* `packages/telegram/tests/unit/poller-standby-offset.test.ts`
  - *How:* `packages/tools/tests/project-kit-advisor.test.ts`
  - *How:* `packages/vector-memory/tests/sage-mirror-shared-text.test.ts`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-09-28T09:58:54.885Z; skill=typescript-strict; applied=1; wins=1; skipped=2; skippedWins=2 -->
- **Always verify TUI test-file changes against `packages/tui/tsconfig.test.json`, not `packages/tui/tsconfig.json` — the main config's `include: ["src/**/*"]` plus `exclude: [..., "tests"]` means package typecheck exit 0 proves nothing about test files; TS6133/TS2883 only surface under the test config. ```json { "verification_evidence": { "typecheck": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/tui/tsconfig.test.json", "exitCode": 0 }, "lint": { "command": "pnpm exec biome check packages/tui/tests/key-handler-replay-corpus.test.ts", "exitCode": 0 }, "tests": { "command": "pnpm exec vitest run packages/tui/tests/key-handler-replay-corpus.test.ts", "exitCode": 0 } } } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/tui/tsconfig.test.json`
  - *How:* `packages/tui/tsconfig.json`
  - *How:* `include: ["src/**/*"]`
  - *How:* `exclude: [..., "tests"]`
  - *How:* `packages/tui/tests/key-handler-replay-corpus.test.ts`

---
*Last capture: 2026-09-28T17:01:37.142Z · 2 entries*
