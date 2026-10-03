# Learned instructions for `dependency`

> Project-specific learning data for the `dependency` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-09-30T06:43:23.436Z; skill=tech-stack; applied=4; wins=4 -->
- **Always attribute every `pnpm-lock.yaml` hunk to its source before investigating: hash the lockfile, then re-run `pnpm install --frozen-lockfile --lockfile-only` and re-hash — if the hash is unchanged (exit 0), remaining diff hunks must each map to a `pnpm-workspace.yaml` change (e.g. a new `overrides` entry explains replacement-version hunks plus dependency-link hunks in the consumers), which cleanly separates override-driven security bumps from accidental lockfile churn during coordinated own-version bumps like `1.0.29 → 1.0.30`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `pnpm-lock.yaml`
  - *How:* `pnpm install --frozen-lockfile --lockfile-only`
  - *How:* `pnpm-workspace.yaml`
  - *How:* `overrides`
  - *How:* `1.0.29 → 1.0.30`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T11:56:36.242Z; skill=node-modern -->
- **Always verify a new `exports` subpath in `packages/*/package.json` also appears in the hardcoded `coreEntries`/`toolEntries` array in `scripts/build-package.mjs` — the build emits only listed entries, so a subpath export with no matching entry ships a `dist/` file that does not exist and fails at runtime with `ERR_PACKAGE_PATH_NOT_EXPORTED`, not at build time.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `exports`
  - *How:* `packages/*/package.json`
  - *How:* `coreEntries`
  - *How:* `toolEntries`
  - *How:* `scripts/build-package.mjs`
  - *How:* `dist/`
  - *How:* `ERR_PACKAGE_PATH_NOT_EXPORTED`

---
*Last capture: 2026-10-03T11:56:36.242Z · 2 entries*
