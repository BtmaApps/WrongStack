# Learned instructions for `security-scanner`

> Project-specific learning data for the `security-scanner` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-02T19:27:50.362Z; applied=2; wins=2; skipped=2; skippedWins=2 -->
- **Remember that a widened token-skip prefix in a destructive-command classifier is a *tightening*, not a weakening: `HALT_LAUNCHER_PREFIX` only consumes launcher options before the verb, so widening what it can skip can only make more commands match `SYSTEM_HALT_COMMAND`. Verify with a first-character disjointness check across the inner alternatives before reporting ReDoS or parse-fork risk — the flag, env-assignment and numeric branches start with `-`, `[A-Za-z_]` and a digit/`.` respectively.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `HALT_LAUNCHER_PREFIX`
  - *How:* `SYSTEM_HALT_COMMAND`
  - *How:* `-`
  - *How:* `[A-Za-z_]`
  - *How:* `.`

<!-- learned-stamp: category=warning; capturedAt=2026-10-02T19:27:50.362Z; skill=security-scanner; applied=2; wins=2; skipped=2; skippedWins=2 -->
- **When a `packages/core/src/security/yolo-risk.ts` launcher-prefix change widens or narrows the numeric-operand regex, check for a matching fractional-duration case in `packages/core/tests/security/yolo-risk.test.ts` — the existing launcher `it.each` block covers integer operands only, so a widening can land with no regression test pinning it. The operand spelling `(?:\d+(?:\.\d*)?|\.\d+)[smhd]?` is hand-copied across `packages/core/src/security/yolo-risk.ts`, `packages/tools/src/_danger-detect.ts` (`TIMEOUT_DURATION`) and `packages/plugins/src/dep-guard/index.ts`, and the parity guard in `packages/tools/tests/danger-detect.test.ts` pins only `HALT_LAUNCHER_VALUE_FLAGS` — not this regex — so grep all three before changing one.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/core/src/security/yolo-risk.ts`
  - *How:* `packages/core/tests/security/yolo-risk.test.ts`
  - *How:* `it.each`
  - *How:* `(?:\d+(?:\.\d*)?|\.\d+)[smhd]?`
  - *How:* `packages/tools/src/_danger-detect.ts`
  - *How:* `TIMEOUT_DURATION`
  - *How:* `packages/plugins/src/dep-guard/index.ts`
  - *How:* `packages/tools/tests/danger-detect.test.ts`
  - *How:* `HALT_LAUNCHER_VALUE_FLAGS`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T16:18:01.797Z; skill=security-scanner; skipped=7; skippedWins=7 -->
- **When reviewing a tri-state cache in a secret path — read the failure predicate, not just the cache guard. A guard like `if (secret !== undefined) cached = ...` in `packages/persistence/src/ipc-endpoint-secret.ts` only protects the `undefined` arm; any condition that also collapses to `null` (ENOENT, corrupt content, invalid-format) is still memoised and can permanently pin a process to the fail-open fallback. Check every `return` in the reader function against the single sentinel the cache guard tests for, and verify the accompanying test exercises each of them separately.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `if (secret !== undefined) cached = ...`
  - *How:* `packages/persistence/src/ipc-endpoint-secret.ts`
  - *How:* `undefined`
  - *How:* `null`
  - *How:* `return`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-09-28T08:15:00.858Z; skill=security-scanner; applied=9; wins=9; skipped=3; skippedWins=3 -->
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
*Last capture: 2026-10-02T19:27:50.362Z · 4 entries*
