# Learned instructions for `dependency`

> Project-specific learning data for the `dependency` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-09-21T22:41:56.109Z; skill=tech-stack; applied=2; wins=2 -->
- **- Verify lockfile agreement after manifest-only commits with `pnpm install --frozen-lockfile --lockfile-only` (exit 0 = in sync and writes nothing; it fails if the lockfile were stale) and hash `pnpm-lock.yaml` before/after to prove the check mutated nothing. - Workspace-only `version` field bumps across `packages/*/package.json` intentionally leave `pnpm-lock.yaml` untouched — workspace importers record dependency specifiers, not own package versions; only `website/package-lock.json` needs a lockstep bump (top-level version + root package entry) because it is a standalone npm lockfile.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `pnpm install --frozen-lockfile --lockfile-only`
  - *How:* `pnpm-lock.yaml`
  - *How:* `version`
  - *How:* `packages/*/package.json`
  - *How:* `website/package-lock.json`

<!-- learned-stamp: category=convention; capturedAt=2026-08-13T13:58:34.995Z; skill=tech-stack; applied=7; wins=7 -->
- **Always treat `scripts/check-test-typecheck.mjs` as a non-regression ratchet rather than proof that tests typecheck cleanly: inspect `architecture/test-typecheck-baseline/*.json` and run each package’s `tsconfig.test.json` directly before claiming test TypeScript integrity. Keep `website/package.json`, `website/package-lock.json`, and the `website` importer in `pnpm-lock.yaml` synchronized while `website` remains both a pnpm workspace member and an npm-installed Pages project; verify both with frozen/clean installs in their respective package managers.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `scripts/check-test-typecheck.mjs`
  - *How:* `architecture/test-typecheck-baseline/*.json`
  - *How:* `tsconfig.test.json`
  - *How:* `website/package.json`
  - *How:* `website/package-lock.json`
  - *How:* `website`
  - *How:* `pnpm-lock.yaml`

---
*Last capture: 2026-09-21T22:41:56.109Z · 2 entries*
