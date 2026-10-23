# Learned instructions for `reviewer`

> Project-specific learning data for the `reviewer` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-22T08:18:06.218Z; skill=security-scanner; applied=8; wins=8; skipped=13; skippedWins=13 -->
- **Always write BOM-stripping regexes as the explicit escape `/^\uFEFF/` (the established pattern across `packages/core/src` — `utils/config-json.ts`, `hq/alerts-config.ts`, `skills/manifest-store.ts`, `core/system-prompt-variants.ts`), never a raw pasted U+FEFF character in the source. A raw invisible codepoint is unverifiable by diff/grep rendering and indistinguishable from lookalike zero-width codepoints (U+200B, U+2060) that make the strip silently inert — in security paths like `packages/core/src/security/secret-vault.ts` that means plaintext secrets stay on disk while the code reads as fixed. When reviewing such a fix, confirm the actual codepoint (e.g. `rg` with a `\uFEFF` literal pattern) before trusting it.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `/^\uFEFF/`
  - *How:* `packages/core/src`
  - *How:* `utils/config-json.ts`
  - *How:* `hq/alerts-config.ts`
  - *How:* `skills/manifest-store.ts`
  - *How:* `core/system-prompt-variants.ts`
  - *How:* `packages/core/src/security/secret-vault.ts`
  - *How:* `rg`
  - *How:* `\uFEFF`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-23T15:36:14.470Z -->
- **Always resolve a new `architecture/test-skip-budget.json` entry against the real declaration before approving it — read the target test file, confirm the exact count of `it|test|describe.skip|todo|skipIf|runIf` matches (plus `it: it.skip` ternaries, `return skip(`, and `const x = it.skip` aliases, per `scripts/lib/test-skip-budget.mjs`), and compute the fingerprint as `sha256("<kind>:<normalized 3-line snippet>").slice(0,16)`. `validateSkipBudget` is an exact set comparison in both directions, so a missing entry fails the gate and a stale entry also fails it.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `architecture/test-skip-budget.json`
  - *How:* `it|test|describe.skip|todo|skipIf|runIf`
  - *How:* `it: it.skip`
  - *How:* `return skip(`
  - *How:* `const x = it.skip`
  - *How:* `scripts/lib/test-skip-budget.mjs`
  - *How:* `sha256("<kind>:<normalized 3-line snippet>").slice(0,16)`
  - *How:* `validateSkipBudget`

<!-- learned-stamp: category=convention; capturedAt=2026-10-22T08:37:55.254Z; skill=code-review; applied=1; wins=1; skipped=13; skippedWins=13 -->
- **Always resolve the reviewed surface against the file on disk before judging a call-site contract — the diff bundle is a snapshot and can lag the working tree (here `attemptReconnectHelper` in `packages/webui/src/lib/ws-client-connection.ts` changed from host fields to a `{ shouldReconnect: () => boolean }` config object between the diff snapshot and disk, changing what the caller must pass). ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `attemptReconnectHelper`
  - *How:* `packages/webui/src/lib/ws-client-connection.ts`
  - *How:* `{ shouldReconnect: () => boolean }`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-22T09:11:54.814Z; skipped=3; skippedWins=3 -->
- **When re-anchoring a `position: fixed` overlay to `position: absolute` inside a `position: relative` container, verify three properties before approving: (1) the container has `z-index: auto` so it creates no stacking context and the overlay's own `z-*` still resolves against the root context; (2) the container's right edge coincides with the viewport right edge (last in-flow flex child) so any `right-[<width>]` side-by-side offset against a `fixed` sibling panel still lands correctly; (3) the new ancestor's `overflow-hidden` does not clip the overlay's `w-[calc(100vw-…)]` at any breakpoint.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `position: fixed`
  - *How:* `position: absolute`
  - *How:* `position: relative`
  - *How:* `z-index: auto`
  - *How:* `z-*`
  - *How:* `right-[<width>]`
  - *How:* `fixed`
  - *How:* `overflow-hidden`
  - *How:* `w-[calc(100vw-…)]`

---
*Last capture: 2026-10-23T15:36:14.470Z · 4 entries*
