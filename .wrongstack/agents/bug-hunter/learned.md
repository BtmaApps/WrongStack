# Learned instructions for `bug-hunter`

> Project-specific learning data for the `bug-hunter` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-04T18:42:01.897Z; skill=typescript-strict -->
- **When adding a fail-closed wrapper in `packages/core/src/sandbox/wrap.ts` (or any gate over the `Tool` interface), never early-return on a missing `execute` — gate every seam the tool carries (`execute` AND `executeStream`), because `execute` is nominally required by `Tool` yet absent at runtime in cast-constructed stream-only fixtures (see `packages/core/tests/sandbox/mcp-gate.test.ts`), and an execute-only fast path silently bypasses the whole gate. Always resolve policy per call site with `resolveSandboxConfigForAgent(ctx?.agentId)` — per-agent T7 overrides merge over the process-global config (`packages/core/src/sandbox/agent-overrides.ts`), so a gate reading only `getResolvedSandboxConfig()` fail-opens for tightened agents. Verify with `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/core/tsconfig.json` and `pnpm exec vitest run packages/core/tests/sandbox packages/mcp/tests/wrap-tool-sandbox.test.ts`. ```json { "verification_evidence": { "typecheck": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/core/tsconfig.json", "exitCode": 0 }, "lint": { "command": "pnpm exec biome check packages/core/src/sandbox/wrap.ts packages/mcp/tests/wrap-tool-sandbox.test.ts", "exitCode": 0 }, "tests": { "command": "pnpm exec vitest run packages/mcp/tests/wrap-tool-sandbox.test.ts packages/mcp/tests/wrap-tool.test.ts packages/core/tests/sandbox", "exitCode": 0 } } } ```**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/core/src/sandbox/wrap.ts`
  - *How:* `Tool`
  - *How:* `execute`
  - *How:* `executeStream`
  - *How:* `packages/core/tests/sandbox/mcp-gate.test.ts`
  - *How:* `resolveSandboxConfigForAgent(ctx?.agentId)`
  - *How:* `packages/core/src/sandbox/agent-overrides.ts`
  - *How:* `getResolvedSandboxConfig()`
  - *How:* `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/core/tsconfig.json`
  - *How:* `pnpm exec vitest run packages/core/tests/sandbox packages/mcp/tests/wrap-tool-sandbox.test.ts`
  - *How:* `packages/core/tsconfig.json`
  - *How:* `packages/mcp/tests/wrap-tool-sandbox.test.ts`
  - *How:* `packages/mcp/tests/wrap-tool.test.ts`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T18:27:51.204Z; skill=typescript-strict; skipped=1; skippedWins=1 -->
- **Adjudicate "fragile in-callback options mutation" findings by verifying the store's mutate→appendHistory ordering AND checking whether the reviewer's outside-callback alternative recomputes transition fields from a record read before an async gap (e.g. an LLM call in `packages/requirement-intake/src/service.ts` `generateSuggestions`) — the fresh under-lock read is race-free; the "simpler" pre-read version reintroduces phantom-history TOCTOU. When a co-modified package typecheck fails at coordinates outside your edit (`submitIntake` region), rerun `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/requirement-intake/tsconfig.json` after the peer settles before attributing the break; settle residual formatting with scoped `pnpm exec biome check --write packages/requirement-intake/src/service.ts`. ```json { "verification_evidence": { "typecheck": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/requirement-intake/tsconfig.json", "exitCode": 0 }, "lint": { "command": "pnpm exec biome check packages/requirement-intake/src/service.ts", "exitCode": 0 }, "tests": { "command": "pnpm exec vitest run packages/requirement-intake/tests/suggestions.test.ts", "exitCode": 0 } } } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/requirement-intake/src/service.ts`
  - *How:* `generateSuggestions`
  - *How:* `submitIntake`
  - *How:* `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/requirement-intake/tsconfig.json`
  - *How:* `pnpm exec biome check --write packages/requirement-intake/src/service.ts`
  - *How:* `packages/requirement-intake/tsconfig.json`
  - *How:* `packages/requirement-intake/tests/suggestions.test.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T17:13:58.283Z; skill=testing; skipped=3; skippedWins=3 -->
- **When regression-testing reentrant registry sweeps (e.g. `packages/plugin-sdk/src/runtime/h1-state.ts`), assert the **exact invocation count** of the rearming callback (`toBe(1)`) rather than mere test completion — a spin manifests as a suite hang, and an over-releasing variant fails the count. Cover both a self-rearm (cycle termination) and a distinct-child rearm (sweep completeness) in `packages/plugin-sdk/tests/`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/plugin-sdk/src/runtime/h1-state.ts`
  - *How:* `toBe(1)`
  - *How:* `packages/plugin-sdk/tests/`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-04T17:13:58.283Z; skill=typescript-strict; skipped=3; skippedWins=3 -->
- **Prefer a Set of released callback identities over an iteration cap when bounding reentrant release loops in registry helpers like `packages/plugin-sdk/src/runtime/h1-state.ts` — identity tracking terminates exactly on cycles (self or mutual) while still releasing genuinely new registrations, whereas a cap silently orphans legitimate chains. Drop the stale slot on break so a later `release()` cannot invoke an already-released unregister twice. ```json { "verification_evidence": { "typecheck": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/plugin-sdk/tsconfig.json", "exitCode": 0 }, "lint": { "command": "pnpm exec biome check packages/plugin-sdk/src/runtime/h1-state.ts packages/plugin-sdk/tests/h1-state.test.ts", "exitCode": 0 }, "tests": { "command": "pnpm exec vitest run packages/plugin-sdk/tests/h1-state.test.ts", "exitCode": 0 } } } ```**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `packages/plugin-sdk/src/runtime/h1-state.ts`
  - *How:* `release()`
  - *How:* `packages/plugin-sdk/tsconfig.json`
  - *How:* `packages/plugin-sdk/tests/h1-state.test.ts`

---
*Last capture: 2026-10-04T18:42:01.897Z · 4 entries*
