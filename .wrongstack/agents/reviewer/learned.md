# Learned instructions for `reviewer`

> Project-specific learning data for the `reviewer` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-25T16:46:07.508Z; skill=testing; skipped=18; skippedWins=18 -->
- **- For TUI animation tests in `packages/tui/tests/`, treat `vi.waitFor(..., { timeout, interval })` combined with a `vi.spyOn(Date, 'now')` frozen clock as the established anti-flake pattern (see `banner-formation.test.tsx`): the spy leaves real timers free to drive Ink repaints and waitFor polling, so fixed-ms `settle()` waits are the flaky construct — judge frame determinism from the mocked clock value, not wall-clock time, and do not flag the waitFor form as a hang risk.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/tui/tests/`
  - *How:* `vi.waitFor(..., { timeout, interval })`
  - *How:* `vi.spyOn(Date, 'now')`
  - *How:* `banner-formation.test.tsx`
  - *How:* `settle()`

<!-- learned-stamp: category=warning; capturedAt=2026-10-25T08:16:47.556Z; skill=chimera; applied=5; wins=5; skipped=28; skippedWins=28 -->
- **When reviewing `@wrongstack/*` package.json version bumps, first confirm dependents use `workspace:*` specifiers via a grep of `**/package.json` — this repo does (all 77 declarations), so internal version bumps are metadata-only and cannot break resolution, lockfile specifiers, or `--frozen-lockfile` installs. Also confirm `private: true`, which removes publish-side risk.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `@wrongstack/*`
  - *How:* `workspace:*`
  - *How:* `**/package.json`
  - *How:* `--frozen-lockfile`
  - *How:* `private: true`

<!-- learned-stamp: category=warning; capturedAt=2026-10-25T09:26:00.819Z; skill=code-review; skipped=19; skippedWins=19 -->
- **When reviewing trigger-based change detection in `packages/sage/src/sqlite-store-hq-sync.ts`, check whether `$.updatedAt` is stripped from the `changed()` helper before judging any metadata key's strip list. Because `applySemanticChange` (`packages/sage/src/shared/semantic-rewrite.ts`) always bumps `updatedAt`, every edit path that moves `updatedAt` still satisfies `changed(new) IS NOT changed(old)` and still replicates — so stripping a metadata key only matters for raw SQL paths that mutate `data` without `updatedAt` (e.g. `stampSqliteVerification` in `packages/sage/src/sqlite-store-verification-stamp.ts`), and it never suppresses a legitimate replication.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/sage/src/sqlite-store-hq-sync.ts`
  - *How:* `$.updatedAt`
  - *How:* `changed()`
  - *How:* `applySemanticChange`
  - *How:* `packages/sage/src/shared/semantic-rewrite.ts`
  - *How:* `updatedAt`
  - *How:* `changed(new) IS NOT changed(old)`
  - *How:* `data`
  - *How:* `stampSqliteVerification`
  - *How:* `packages/sage/src/sqlite-store-verification-stamp.ts`

---
*Last capture: 2026-10-25T16:46:07.508Z · 3 entries*
