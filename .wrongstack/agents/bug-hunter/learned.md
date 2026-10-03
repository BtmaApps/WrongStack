# Learned instructions for `bug-hunter`

> Project-specific learning data for the `bug-hunter` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-01T17:52:39.244Z; skill=typescript-strict; skipped=4; skippedWins=4 -->
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

<!-- learned-stamp: category=warning; capturedAt=2026-10-02T19:28:31.366Z; skill=typescript-strict; applied=1; wins=1; skipped=2; skippedWins=2 -->
- **Always run `git status --short` on a failing kanban test file before treating its red specs as regressions: an untracked (`??`) spec file failing against a *modified* production file (e.g. `packages/kanban/tests/verification/verification-integrity.test.ts` vs `packages/kanban/src/manager/tasks.ts`) marks in-flight peer TDD, not a break you introduced — attribute it with file:line and leave it to the owner. Falsify Chimera "ownership mismatch" findings by evaluating the suggested fix: when the remediation compares a report against its own persisted snapshot (`report.leaseId !== report.leaseId`), it is a tautology that can never fire — the live-`task.assignment` comparison in `packages/kanban/src/manager/lifecycle/definition-of-done.ts` is intentional fail-closed fencing (same contract as `expectedLeaseId` in `packages/kanban/src/verification/completion-gate.ts`), not a stale-evidence bug. ```json { "verification_evidence": { "typecheck": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/kanban/tsconfig.json", "exitCode": 0 }, "lint": { "command": "pnpm exec biome check packages/kanban/src/manager/lifecycle/definition-of-done.ts packages/kanban/src/verification/completion-protocol.ts", "exitCode": 0 }, "tests": { "command": "pnpm exec vitest run packages/kanban/tests/lifecycle.test.ts packages/kanban/tests/completion-gate.test.ts", "exitCode": 0 } } } ```**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `git status --short`
  - *How:* `??`
  - *How:* `packages/kanban/tests/verification/verification-integrity.test.ts`
  - *How:* `packages/kanban/src/manager/tasks.ts`
  - *How:* `report.leaseId !== report.leaseId`
  - *How:* `task.assignment`
  - *How:* `packages/kanban/src/manager/lifecycle/definition-of-done.ts`
  - *How:* `expectedLeaseId`
  - *How:* `packages/kanban/src/verification/completion-gate.ts`
  - *How:* `packages/kanban/tsconfig.json`
  - *How:* `packages/kanban/src/verification/completion-protocol.ts`
  - *How:* `packages/kanban/tests/lifecycle.test.ts`
  - *How:* `packages/kanban/tests/completion-gate.test.ts`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T17:07:01.945Z; skill=typescript-strict; applied=1; wins=1; skipped=4; skippedWins=4 -->
- **Treat an `edit` VALIDATION_ERROR "file was modified externally" during a parallel cascade as an expected race, not a denial: re-read the target range immediately, diff it mentally against the prior read (a collapsed multi-line condition usually means a peer's formatter ran), and re-anchor `old_string` to the current text instead of retrying the stale block. ```json { "verification_evidence": { "typecheck": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/webui/tsconfig.json", "exitCode": 0 }, "lint": { "command": "pnpm biome check packages/webui/src/stores/local-prefs.ts", "exitCode": 0 }, "tests": { "command": "pnpm --filter @wrongstack/webui exec vitest run local-prefs", "exitCode": 0 } } } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `edit`
  - *How:* `old_string`
  - *How:* `packages/webui/tsconfig.json`
  - *How:* `packages/webui/src/stores/local-prefs.ts`
  - *How:* `@wrongstack/webui`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-03T08:54:38.058Z; skill=testing -->
- **- Always re-run the covering suite (`pnpm exec vitest run packages/core/tests/chronicle`) before adjudicating a Chimera "dead constants / unwired remediation" finding on `packages/core/src/chronicle/tool-adapter.ts` — parallel workers routinely land the fix mid-session, and the pinning tests are the real contract. [skill: testing] - UTF-8 byte-bound truncation must strip the dangling **lead** byte, not just trailing continuation bytes: a kept lead decodes alone to U+FFFD, re-encodes to 3 bytes, and overshoots the byte budget (observed 514 > 512). Prefer a decode-verify loop (`!head.includes('\uFFFD') && Buffer.byteLength(head) <= budget`) as in `boundPath` in `packages/core/src/chronicle/tool-adapter.ts`. - EventMap event payload types live in `packages/core/src/kernel/events/*.ts` modules, not `kernel/events.ts` — grep the directory (and rely on `node node_modules/typescript/bin/tsc --noEmit -p packages/core/tsconfig.json`) before claiming an event field is missing. [skill: bug-hunter] - Evaluate the test's scrubber fixture before trusting an assertion that compares a scrubbed artifact against a raw input (`rawPath.startsWith(scrubbedPrefix)`): token replacement like `replaceAll('SECRET','[REDACTED]')` makes it unsatisfiable — the property must compare against the scrubbed form. [skill: testing] ```json { "verification_evidence": { "typecheck": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/core/tsconfig.json", "exitCode": 0 }, "lint": { "command": "pnpm exec biome check packages/core/src/chronicle/tool-adapter.ts packages/core/tests/chronicle/tool-adapter.test.ts", "exitCode": 0 }, "tests": { "command": "pnpm exec vitest run packages/core/tests/chronicle", "exitCode": 0, "note": "40 files / 298 tests passed, including the two previously failing boundPath specs" } } } ```**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `pnpm exec vitest run packages/core/tests/chronicle`
  - *How:* `packages/core/src/chronicle/tool-adapter.ts`
  - *How:* `!head.includes('\uFFFD') && Buffer.byteLength(head) <= budget`
  - *How:* `boundPath`
  - *How:* `packages/core/src/kernel/events/*.ts`
  - *How:* `kernel/events.ts`
  - *How:* `node node_modules/typescript/bin/tsc --noEmit -p packages/core/tsconfig.json`
  - *How:* `rawPath.startsWith(scrubbedPrefix)`
  - *How:* `replaceAll('SECRET','[REDACTED]')`
  - *How:* `packages/core/tsconfig.json`
  - *How:* `packages/core/tests/chronicle/tool-adapter.test.ts`

---
*Last capture: 2026-10-03T08:54:38.058Z · 4 entries*
