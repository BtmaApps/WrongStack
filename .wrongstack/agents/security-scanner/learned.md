# Learned instructions for `security-scanner`

> Project-specific learning data for the `security-scanner` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-09-28T08:15:00.858Z; skill=security-scanner; applied=1; wins=1; skipped=1; skippedWins=1 -->
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
*Last capture: 2026-09-28T08:15:00.858Z · 1 entries*
