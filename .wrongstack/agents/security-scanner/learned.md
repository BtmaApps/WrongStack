# Learned instructions for `security-scanner`

> Project-specific learning data for the `security-scanner` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-13T19:43:54.323Z; skill=security-scanner; skipped=1; skippedWins=1 -->
- **Always check how a module memoizes a secret before treating a removed `__resetIpcEndpointSecretForTests()` in `packages/persistence/tests/ipc-endpoint-secret.test.ts` as a lost isolation guarantee — `ipcEndpointSecret()` in `packages/persistence/src/ipc-endpoint-secret.ts` caches by `{ file, secret }`, so redirecting the `_ipcEndpointSecretOps.file` seam to a different path already forces a fresh read.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `__resetIpcEndpointSecretForTests()`
  - *How:* `packages/persistence/tests/ipc-endpoint-secret.test.ts`
  - *How:* `ipcEndpointSecret()`
  - *How:* `packages/persistence/src/ipc-endpoint-secret.ts`
  - *How:* `{ file, secret }`
  - *How:* `_ipcEndpointSecretOps.file`

<!-- learned-stamp: category=convention; capturedAt=2026-10-13T19:43:54.323Z; skill=security-scanner; applied=1; wins=1 -->
- **When a security test asserts redaction, always require an explicit `not.toContain(<secret body>)` alongside any `toContain('[credential]')` — a truncation-plus-placeholder assertion still passes if the redaction regex collapses to the bare `wsg_` prefix; `packages/governance/src/sanitize.ts` is the function to keep pinned that way. ```bash bun x vitest run packages/governance/tests/credential-lease-controller.test.ts packages/persistence/tests/ipc-endpoint-secret.test.ts --maxWorkers=1 ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `not.toContain(<secret body>)`
  - *How:* `toContain('[credential]')`
  - *How:* `wsg_`
  - *How:* `packages/governance/src/sanitize.ts`
  - *How:* `packages/governance/tests/credential-lease-controller.test.ts`
  - *How:* `packages/persistence/tests/ipc-endpoint-secret.test.ts`

---
*Last capture: 2026-10-13T19:43:54.323Z · 2 entries*
