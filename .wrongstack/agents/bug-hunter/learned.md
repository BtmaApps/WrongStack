# Learned instructions for `bug-hunter`

> Project-specific learning data for the `bug-hunter` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-09-23T21:49:59.787Z; skill=typescript-strict -->
- **When a Chimera review lists files under "Assumptions / unverified" as not-read, check those exact files FIRST before dispatching or applying any fix — findings whose suggested fix lives in an unread module (e.g. a hook the refactor moved logic into, like `packages/simpleui/src/hooks/use-composer-state.ts`) are high-probability false positives already resolved on disk. Disprove quoted-code claims with one direct read plus `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/<pkg>/tsconfig.json`; never patch text that a fresh read shows absent.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/simpleui/src/hooks/use-composer-state.ts`
  - *How:* `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/<pkg>/tsconfig.json`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-09-23T20:47:01.147Z; skill=typescript-strict; applied=2; wins=2 -->
- **Always disprove claimed "hard type error" contract findings with a zero-cost typecheck before tracing them manually — `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/<pkg>` (exit 0) instantly falsifies any `TS2339 Property does not exist` claim in `packages/cli` or `packages/core`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/<pkg>`
  - *How:* `TS2339 Property does not exist`
  - *How:* `packages/cli`
  - *How:* `packages/core`

<!-- learned-stamp: category=convention; capturedAt=2026-09-23T20:49:44.622Z; skill=typescript-strict; skipped=1; skippedWins=1 -->
- **When a wiring function registers cleanup on an external `teardownHandlers` array in `packages/cli/src/wiring/*`, always fold the same cleanup into its own returned `dispose()` behind an idempotence flag — callers may drain the array, call `dispose()`, or both, and early-return branches that omit `dispose` leave tracer/exporter handles unowned.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `teardownHandlers`
  - *How:* `packages/cli/src/wiring/*`
  - *How:* `dispose()`
  - *How:* `dispose`

---
*Last capture: 2026-09-23T21:49:59.787Z · 3 entries*
