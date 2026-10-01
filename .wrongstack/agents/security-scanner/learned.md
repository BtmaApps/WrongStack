# Learned instructions for `security-scanner`

> Project-specific learning data for the `security-scanner` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T16:18:01.797Z; skill=security-scanner; skipped=2; skippedWins=2 -->
- **When reviewing a tri-state cache in a secret path — read the failure predicate, not just the cache guard. A guard like `if (secret !== undefined) cached = ...` in `packages/persistence/src/ipc-endpoint-secret.ts` only protects the `undefined` arm; any condition that also collapses to `null` (ENOENT, corrupt content, invalid-format) is still memoised and can permanently pin a process to the fail-open fallback. Check every `return` in the reader function against the single sentinel the cache guard tests for, and verify the accompanying test exercises each of them separately.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `if (secret !== undefined) cached = ...`
  - *How:* `packages/persistence/src/ipc-endpoint-secret.ts`
  - *How:* `undefined`
  - *How:* `null`
  - *How:* `return`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-09-28T08:15:00.858Z; skill=security-scanner; applied=5; wins=5; skipped=2; skippedWins=2 -->
- **When reviewing `packages/core/src/security/secret-scrubber.ts` pattern additions, always verify three table-derived invariants before flagging: (1) a Pattern with capturing groups must be excluded from `SIMPLE_PATTERNS` — `COMBINED_REGEX` wraps each source in a wrapper group and the scrub() callback maps group index to `COMBINED_REPLACEMENTS`; (2) `COMBINED_REPLACEMENTS` and the anchor pre-scan (`PATTERN_ANCHORS`/`ALL_ANCHORS`) are derived via `.map()`/`flatMap`, so no manual index or anchor sync is needed — only the `anchor` field must be a mandatory substring of any match; (3) every dedicated-pass pattern (like `url_credentials`) must be reachable from both `scrubObject` and `scrubObjectShared`, which both delegate per-string to `scrub()`. Run the covering suite with `pnpm exec vitest run <test-file>` from `packages/core` — the `test` tool fails with "vitest not found" in this workspace.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `packages/core/src/security/secret-scrubber.ts`
  - *How:* `SIMPLE_PATTERNS`
  - *How:* `COMBINED_REGEX`
  - *How:* `COMBINED_REPLACEMENTS`
  - *How:* `PATTERN_ANCHORS`
  - *How:* `ALL_ANCHORS`
  - *How:* `.map()`
  - *How:* `flatMap`
  - *How:* `anchor`
  - *How:* `url_credentials`
  - *How:* `scrubObject`
  - *How:* `scrubObjectShared`
  - *How:* `scrub()`
  - *How:* `pnpm exec vitest run <test-file>`
  - *How:* `packages/core`
  - *How:* `test`

---
*Last capture: 2026-10-01T16:18:01.797Z · 2 entries*
