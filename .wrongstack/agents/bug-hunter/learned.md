# Learned instructions for `bug-hunter`

> Project-specific learning data for the `bug-hunter` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-01T17:52:39.244Z; skill=typescript-strict -->
- **Always repair `edit`-tool whitespace-normalized-match indentation drift with a scoped `pnpm exec biome check --write <file>` on the single touched file in `packages/simpleui`-style flows, then re-run `pnpm exec biome check <file>` — never hand-reindent the block, and never widen the write past the one file in a shared working tree. Falsify a review's corrupt-state domain before implementing its guard: numeric prefs arriving over a JSON WS payload can never be `NaN`/`Infinity` — the reachable hand-edit cases are `0`, negative, and fractional, so a `Number.isInteger(x) && x > 0` guard covers the whole real domain including the impossible ones, verified in `packages/simpleui/src/settings-panel.tsx` `pollIntervalOptions` with `pnpm --filter @wrongstack/simpleui exec vitest run tests/telegram-settings.test.tsx`. ```json { "verification_evidence": { "typecheck": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/simpleui/tsconfig.json", "exitCode": 0 }, "typecheck_test_config": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/simpleui/tsconfig.test.json", "exitCode": 1, "note": "All 9 errors in message-handler.test.ts, use-f5-resilience.test.tsx, use-file-mention.test.tsx — files outside this change's delta (peer in-flight feature); zero diagnostics in settings-panel.tsx or telegram-settings.test.tsx" }, "lint": { "command": "pnpm exec biome check packages/simpleui/src/settings-panel.tsx packages/simpleui/tests/telegram-settings.test.tsx", "exitCode": 0 }, "tests": { "command": "pnpm --filter @wrongstack/simpleui exec vitest run tests/telegram-settings.test.tsx", "exitCode": 0, "note": "15 passed / 0 failed (14 pre-existing + 1 new regression case)" } } } ```**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `edit`
  - *How:* `pnpm exec biome check --write <file>`
  - *How:* `packages/simpleui`
  - *How:* `pnpm exec biome check <file>`
  - *How:* `NaN`
  - *How:* `Infinity`
  - *How:* `0`
  - *How:* `Number.isInteger(x) && x > 0`
  - *How:* `packages/simpleui/src/settings-panel.tsx`
  - *How:* `pollIntervalOptions`
  - *How:* `pnpm --filter @wrongstack/simpleui exec vitest run tests/telegram-settings.test.tsx`
  - *How:* `tests/telegram-settings.test.tsx`
  - *How:* `packages/simpleui/tsconfig.json`
  - *How:* `packages/simpleui/tsconfig.test.json`
  - *How:* `packages/simpleui/tests/telegram-settings.test.tsx`
  - *How:* `@wrongstack/simpleui`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T17:07:01.945Z; skill=typescript-strict; skipped=1; skippedWins=1 -->
- **Treat an `edit` VALIDATION_ERROR "file was modified externally" during a parallel cascade as an expected race, not a denial: re-read the target range immediately, diff it mentally against the prior read (a collapsed multi-line condition usually means a peer's formatter ran), and re-anchor `old_string` to the current text instead of retrying the stale block. ```json { "verification_evidence": { "typecheck": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/webui/tsconfig.json", "exitCode": 0 }, "lint": { "command": "pnpm biome check packages/webui/src/stores/local-prefs.ts", "exitCode": 0 }, "tests": { "command": "pnpm --filter @wrongstack/webui exec vitest run local-prefs", "exitCode": 0 } } } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `edit`
  - *How:* `old_string`
  - *How:* `packages/webui/tsconfig.json`
  - *How:* `packages/webui/src/stores/local-prefs.ts`
  - *How:* `@wrongstack/webui`

---
*Last capture: 2026-10-01T17:52:39.244Z · 2 entries*
