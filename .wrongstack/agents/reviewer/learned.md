# Learned instructions for `reviewer`

> Project-specific learning data for the `reviewer` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-25T08:16:47.556Z; skill=chimera; applied=2; wins=2; skipped=12; skippedWins=12 -->
- **When reviewing `@wrongstack/*` package.json version bumps, first confirm dependents use `workspace:*` specifiers via a grep of `**/package.json` — this repo does (all 77 declarations), so internal version bumps are metadata-only and cannot break resolution, lockfile specifiers, or `--frozen-lockfile` installs. Also confirm `private: true`, which removes publish-side risk.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `@wrongstack/*`
  - *How:* `workspace:*`
  - *How:* `**/package.json`
  - *How:* `--frozen-lockfile`
  - *How:* `private: true`

<!-- learned-stamp: category=warning; capturedAt=2026-10-25T09:26:00.819Z; skill=code-review -->
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
*Last capture: 2026-10-25T09:26:00.819Z · 2 entries*
