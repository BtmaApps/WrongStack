# Learned instructions for `security-scanner`

> Project-specific learning data for the `security-scanner` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-04T18:45:10.561Z; skipped=1; skippedWins=1 -->
- **Before applying a Chimera-suggested fix in a cascade, re-read the flagged file and check `git diff HEAD` — a parallel worker may have already landed the remediation after the review snapshot; confirm against the live tree, fix only what remains (here: lint debris), and never duplicate a fix that is already present. ```json { "verification_evidence": { "typecheck": { "command": "pnpm exec tsc --noEmit -p packages/core", "exitCode": 0 }, "lint": { "command": "pnpm exec biome check packages/core/src/sandbox/wrap.ts packages/core/tests/sandbox/mcp-gate.test.ts packages/mcp/src/wrap-tool.ts packages/mcp/tests/wrap-tool-sandbox.test.ts packages/mcp/tests/wrap-tool.test.ts", "exitCode": 0 }, "tests": { "command": "pnpm --dir packages/mcp exec vitest run tests/wrap-tool-sandbox.test.ts tests/wrap-tool.test.ts", "exitCode": 0 } } } ```**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `git diff HEAD`
  - *How:* `packages/core/src/sandbox/wrap.ts`
  - *How:* `packages/core/tests/sandbox/mcp-gate.test.ts`
  - *How:* `packages/mcp/src/wrap-tool.ts`
  - *How:* `packages/mcp/tests/wrap-tool-sandbox.test.ts`
  - *How:* `packages/mcp/tests/wrap-tool.test.ts`
  - *How:* `tests/wrap-tool-sandbox.test.ts`
  - *How:* `tests/wrap-tool.test.ts`

---
*Last capture: 2026-10-04T18:45:10.561Z · 1 entries*
