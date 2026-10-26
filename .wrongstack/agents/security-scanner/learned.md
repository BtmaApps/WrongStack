# Learned instructions for `security-scanner`

> Project-specific learning data for the `security-scanner` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-24T14:25:44.453Z; skill=security-scanner; applied=1; wins=1; skipped=5; skippedWins=4 -->
- **Always treat `packages/core/src/security/capabilities.ts` as a re-export shim of `packages/primitives/src/tool-capabilities.ts` and review clamp changes at the enforcement site `packages/agent-catalog/src/project-agent-roster.ts` (`applyProjectAgentConfig`, merged-then-clamped around ) — the capability definitions and the subagent-spawn gate no longer live in the same package, so a diff touching only the shim file can never be evidence the clamp still fires.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/core/src/security/capabilities.ts`
  - *How:* `packages/primitives/src/tool-capabilities.ts`
  - *How:* `packages/agent-catalog/src/project-agent-roster.ts`
  - *How:* `applyProjectAgentConfig`

<!-- learned-stamp: category=warning; capturedAt=2026-10-24T16:05:18.332Z; skill=security-scanner; skipped=5; skippedWins=4 -->
- **When a capability/security file collapses to a re-export shim, its diff can never reveal dropped exports — diff the shim's re-export list against the canonical module's export surface instead (here `packages/core/src/security/capabilities.ts` vs `packages/primitives/src/tool-capabilities.ts`), and verify the clamp predicate at its enforcement site reached through the facade: `project-agent-identity.ts` re-exports `applyProjectAgentConfig` from `packages/agent-catalog/src/project-agent-roster.ts` (merged-then-clamped at the `allowedCapabilities` branch). Close the loop with `bun x vitest run packages/core/tests/security/capability-clamp.test.ts --maxWorkers=1`.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/core/src/security/capabilities.ts`
  - *How:* `packages/primitives/src/tool-capabilities.ts`
  - *How:* `project-agent-identity.ts`
  - *How:* `applyProjectAgentConfig`
  - *How:* `packages/agent-catalog/src/project-agent-roster.ts`
  - *How:* `allowedCapabilities`
  - *How:* `bun x vitest run packages/core/tests/security/capability-clamp.test.ts --maxWorkers=1`
  - *How:* `packages/core/tests/security/capability-clamp.test.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-10-22T08:30:24.973Z; skill=security-scanner; skipped=8; skippedWins=7 -->
- **When testing redaction, trust only in-process boolean assertions (`out.includes(credential)`) over displayed tool output — the host output gate rewrites displayed text and can make a leaking string look redacted; print booleans, never the credential or its container.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `out.includes(credential)`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-13T19:43:54.323Z; skill=security-scanner; skipped=11; skippedWins=10 -->
- **Always check how a module memoizes a secret before treating a removed `__resetIpcEndpointSecretForTests()` in `packages/persistence/tests/ipc-endpoint-secret.test.ts` as a lost isolation guarantee — `ipcEndpointSecret()` in `packages/persistence/src/ipc-endpoint-secret.ts` caches by `{ file, secret }`, so redirecting the `_ipcEndpointSecretOps.file` seam to a different path already forces a fresh read.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `__resetIpcEndpointSecretForTests()`
  - *How:* `packages/persistence/tests/ipc-endpoint-secret.test.ts`
  - *How:* `ipcEndpointSecret()`
  - *How:* `packages/persistence/src/ipc-endpoint-secret.ts`
  - *How:* `{ file, secret }`
  - *How:* `_ipcEndpointSecretOps.file`

<!-- learned-stamp: category=convention; capturedAt=2026-10-24T17:36:56.532Z; skill=security-scanner; skipped=4; skippedWins=3 -->
- **When a monorepo package extraction "moves" credential/security modules, prove the move was content-identical before treating it as a no-op: `git show HEAD:<old-path>` into a temp file, then `git diff --no-index` against the new path, and confirm the brute-force throttle's ordering (check-before-lookup) at the live enforcement site — then sweep consumers for stale doc comments claiming the old entry point, which are common and are not imports.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `git show HEAD:<old-path>`
  - *How:* `git diff --no-index`

<!-- learned-stamp: category=convention; capturedAt=2026-10-13T19:43:54.323Z; skill=security-scanner; applied=1; wins=1; skipped=10; skippedWins=9 -->
- **When a security test asserts redaction, always require an explicit `not.toContain(<secret body>)` alongside any `toContain('[credential]')` — a truncation-plus-placeholder assertion still passes if the redaction regex collapses to the bare `wsg_` prefix; `packages/governance/src/sanitize.ts` is the function to keep pinned that way.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `not.toContain(<secret body>)`
  - *How:* `toContain('[credential]')`
  - *How:* `wsg_`
  - *How:* `packages/governance/src/sanitize.ts`
  - *How:* `packages/governance/tests/credential-lease-controller.test.ts`
  - *How:* `packages/persistence/tests/ipc-endpoint-secret.test.ts`

---
*Last capture: 2026-10-24T17:36:56.532Z · 6 entries*
