# Learned instructions for `security-scanner`

> Project-specific learning data for the `security-scanner` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-22T08:30:24.973Z; skill=security-scanner -->
- **When testing redaction, trust only in-process boolean assertions (`out.includes(credential)`) over displayed tool output — the host output gate rewrites displayed text and can make a leaking string look redacted; print booleans, never the credential or its container.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `out.includes(credential)`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-13T19:43:54.323Z; skill=security-scanner; skipped=3; skippedWins=3 -->
- **Always check how a module memoizes a secret before treating a removed `__resetIpcEndpointSecretForTests()` in `packages/persistence/tests/ipc-endpoint-secret.test.ts` as a lost isolation guarantee — `ipcEndpointSecret()` in `packages/persistence/src/ipc-endpoint-secret.ts` caches by `{ file, secret }`, so redirecting the `_ipcEndpointSecretOps.file` seam to a different path already forces a fresh read.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `__resetIpcEndpointSecretForTests()`
  - *How:* `packages/persistence/tests/ipc-endpoint-secret.test.ts`
  - *How:* `ipcEndpointSecret()`
  - *How:* `packages/persistence/src/ipc-endpoint-secret.ts`
  - *How:* `{ file, secret }`
  - *How:* `_ipcEndpointSecretOps.file`

<!-- learned-stamp: category=convention; capturedAt=2026-10-13T19:43:54.323Z; skill=security-scanner; applied=1; wins=1; skipped=2; skippedWins=2 -->
- **When a security test asserts redaction, always require an explicit `not.toContain(<secret body>)` alongside any `toContain('[credential]')` — a truncation-plus-placeholder assertion still passes if the redaction regex collapses to the bare `wsg_` prefix; `packages/governance/src/sanitize.ts` is the function to keep pinned that way. ```bash bun x vitest run packages/governance/tests/credential-lease-controller.test.ts packages/persistence/tests/ipc-endpoint-secret.test.ts --maxWorkers=1 ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `not.toContain(<secret body>)`
  - *How:* `toContain('[credential]')`
  - *How:* `wsg_`
  - *How:* `packages/governance/src/sanitize.ts`
  - *How:* `packages/governance/tests/credential-lease-controller.test.ts`
  - *How:* `packages/persistence/tests/ipc-endpoint-secret.test.ts`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-22T08:19:04.479Z; skill=security-scanner; applied=1; wins=1 -->
- **- When reviewing a new scrubber pattern's token class, probe a token containing every excluded alphabet variant (`-`, `_` for base64url): a class gap plus a non-consuming lookahead boundary produces a *partial* redaction that leaks the tail, which a standard-alphabet test cannot catch. Anchor: `packages/core/src/security/secret-scrubber-patterns.ts`. - Verify scrubber regex/anchor behavior empirically with `bun -e "import { DefaultSecretScrubber } from './packages/core/src/security/secret-scrubber.ts'; …"` instead of static reasoning — anchor pre-scan case handling is not visible from the pattern table and static reading produced one false hypothesis in practice. - When a new pattern carries a length cap, probe an over-cap token before reporting coverage: over-cap credentials pass wholly unredacted, and the cap is an intentional trade-off that should be named in the report rather than counted as a match. - Test probes of base64 behavior must confirm the fixture actually contains the special chars under test (`+`, `/`) — `String.indexOf` coerces a regex argument to a literal string and silently returns -1, making the condition vacuous; use `String.search(/[+/]/)`.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `-`
  - *How:* `_`
  - *How:* `packages/core/src/security/secret-scrubber-patterns.ts`
  - *How:* `bun -e "import { DefaultSecretScrubber } from './packages/core/src/security/secret-scrubber.ts'; …"`
  - *How:* `+`
  - *How:* `/`
  - *How:* `String.indexOf`
  - *How:* `String.search(/[+/]/)`
  - *How:* `./packages/core/src/security/secret-scrubber.ts`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-22T08:30:24.973Z; skill=security-scanner -->
- **When adding a pattern to `packages/core/src/security/secret-scrubber-patterns.ts` whose regex matches more spellings than its anchor literals admit (e.g. per-letter case classes), verify the anchor pre-scan in `packages/core/src/security/secret-scrubber.ts` (`ANCHOR_PRESCAN`, case-sensitive) admits the pattern's full match surface — a case-insensitive scheme needs a case-insensitive pre-scan word like `BEARER_WORD`, and a mixed-casing test in `packages/core/tests/security/secret-scrubber-credential-shapes.test.ts` asserting `not.toContain(<credential>)`.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `packages/core/src/security/secret-scrubber-patterns.ts`
  - *How:* `packages/core/src/security/secret-scrubber.ts`
  - *How:* `ANCHOR_PRESCAN`
  - *How:* `BEARER_WORD`
  - *How:* `packages/core/tests/security/secret-scrubber-credential-shapes.test.ts`
  - *How:* `not.toContain(<credential>)`

---
*Last capture: 2026-10-22T08:30:24.973Z · 5 entries*
