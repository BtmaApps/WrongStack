# Learned instructions for `dependency`

> Project-specific learning data for the `dependency` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-09-26T12:23:24.477Z; skill=tech-stack -->
- **- **After a coordinated workspace version bump, sweep for completeness with `grep '"version": "<old>"'` over `**/package.json` (expect zero matches) before calling the bump consistent — a missed manifest is invisible to `pnpm install --frozen-lockfile --lockfile-only`, which only proves lockfile/manifest agreement, not that every package moved together. Pair it with the existing checks: `pnpm install --frozen-lockfile --lockfile-only` (hash `pnpm-lock.yaml` before/after to prove read-only) and the lockstep version fields in `website/package-lock.json` (root entry + `packages[""]`).** --- **No concerns.** This diff is a clean, coordinated release bump — `1.0.26 → 1.0.27` — with zero dependency movement. **What actually moved** - All 39 changed manifests changed exactly one line each: their own `version` field (`git diff --stat`: 39 files, 39 insertions, 39 deletions; every hunk is the version line). No packages added or removed, no dependency specifiers changed, so no version jumps and no transitive movement. - `website/package-lock.json`: exactly 2 lines — the root entry and `packages[""]` versions, the required lockstep for the standalone npm lockfile. - `pnpm-lock.yaml`: untouched, as expected for workspace-only own-version bumps. **Verified** - `pnpm install --frozen-lockfile --lockfile-only` → exit 0, all 39 workspace projects, "Lockfile passes supply-chain policies" → lockfile agrees with manifests. - `pnpm-lock.yaml` SHA-256 identical before/after the check (`A9F32602…377CC`) — the check mutated nothing. - Grep for `"version": "1.0.26"` across `**/package.json` → 0 matches: no manifest left behind; untracked files add no new package. - Standing `audit` at high+ severity → 0 advisories across 976 dependencies (and since no dependency changed, this diff introduced none). - Licences: no `licence`/`license` fields touched; all workspace packages remain MIT. **Context (not a dependency event)**: `CHANGELOG.md`'s Unreleased section carries the 1.0.27 content (Chimera review automation default-on; bug-hunter required-skills gate) — the bump is release mechanics for that train, which is peer-owned work. **Out of scope, FYI**: `package.json` pins `packageManager: pnpm@12.3.4` while pnpm reports 12.6.0 available — a deliberate tooling decision, not part of this diff.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `grep '"version": "<old>"'`
  - *How:* `**/package.json`
  - *How:* `pnpm install --frozen-lockfile --lockfile-only`
  - *How:* `pnpm-lock.yaml`
  - *How:* `website/package-lock.json`
  - *How:* `packages[""]`
  - *How:* `1.0.26 → 1.0.27`
  - *How:* `version`
  - *How:* `git diff --stat`
  - *How:* `A9F32602…377CC`
  - *How:* `"version": "1.0.26"`
  - *How:* `audit`
  - *How:* `licence`
  - *How:* `license`
  - *How:* `CHANGELOG.md`
  - *How:* `package.json`
  - *How:* `packageManager: pnpm@12.3.4`

<!-- learned-stamp: category=convention; capturedAt=2026-09-21T22:41:56.109Z; skill=tech-stack; applied=3; wins=3 -->
- **- Verify lockfile agreement after manifest-only commits with `pnpm install --frozen-lockfile --lockfile-only` (exit 0 = in sync and writes nothing; it fails if the lockfile were stale) and hash `pnpm-lock.yaml` before/after to prove the check mutated nothing. - Workspace-only `version` field bumps across `packages/*/package.json` intentionally leave `pnpm-lock.yaml` untouched — workspace importers record dependency specifiers, not own package versions; only `website/package-lock.json` needs a lockstep bump (top-level version + root package entry) because it is a standalone npm lockfile.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `pnpm install --frozen-lockfile --lockfile-only`
  - *How:* `pnpm-lock.yaml`
  - *How:* `version`
  - *How:* `packages/*/package.json`
  - *How:* `website/package-lock.json`

<!-- learned-stamp: category=convention; capturedAt=2026-08-13T13:58:34.995Z; skill=tech-stack; applied=8; wins=8 -->
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
*Last capture: 2026-09-26T12:23:24.477Z · 3 entries*
