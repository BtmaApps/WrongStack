# Learned instructions for `verifier`

> Project-specific learning data for the `verifier` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-09-16T13:58:56.873Z; skill=verify-before-done -->
- **When `pnpm check:architecture` fails with "core-public-api-snapshot.json is stale", treat inventory `sourceLines` drift as expected on worktrees with concurrent `packages/core/src/**` edits: diagnose read-only by copying `scripts/snapshot-core-public-api.mjs` to `.temp_files/`, patching its `emit` target there, running it, and `git diff --no-index`-ing against `architecture/`; attribute drift with `git diff --numstat`. Never run the `--write` script as verifier — report it; the committer owns regenerating `architecture/core-public-api-snapshot.json`.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `pnpm check:architecture`
  - *How:* `sourceLines`
  - *How:* `packages/core/src/**`
  - *How:* `scripts/snapshot-core-public-api.mjs`
  - *How:* `.temp_files/`
  - *How:* `emit`
  - *How:* `git diff --no-index`
  - *How:* `architecture/`
  - *How:* `git diff --numstat`
  - *How:* `--write`
  - *How:* `architecture/core-public-api-snapshot.json`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-09-16T13:43:56.139Z; skill=verify-before-done; applied=1; wins=1 -->
- **Always run `pnpm --filter <pkg> typecheck` per touched package even when focused vitest suites and `biome check` both pass — a string-concatenation typo (`-` written instead of `+` between literal fragments, e.g. `packages/tools/src/codebase-index/codebase-skeleton-tool.ts:52`) is valid runtime JS that silently corrupts the value to a `NaN`-prefixed string; vitest passes unless it asserts on the value's prefix, Biome doesn't flag it, and only `tsc --noEmit` rejects it (TS2362/TS2363).**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `pnpm --filter <pkg> typecheck`
  - *How:* `biome check`
  - *How:* `-`
  - *How:* `+`
  - *How:* `packages/tools/src/codebase-index/codebase-skeleton-tool.ts:52`
  - *How:* `NaN`
  - *How:* `tsc --noEmit`
  - *How:* `packages/tools/src/codebase-index/codebase-skeleton-tool.ts`

---
*Last capture: 2026-09-16T13:58:56.873Z · 2 entries*
