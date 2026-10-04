# Learned instructions for `dependency`

> Project-specific learning data for the `dependency` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-09-30T06:43:23.436Z; skill=tech-stack; applied=10; wins=10 -->
- **Always attribute every `pnpm-lock.yaml` hunk to its source before investigating: hash the lockfile, then re-run `pnpm install --frozen-lockfile --lockfile-only` and re-hash — if the hash is unchanged (exit 0), remaining diff hunks must each map to a `pnpm-workspace.yaml` change (e.g. a new `overrides` entry explains replacement-version hunks plus dependency-link hunks in the consumers), which cleanly separates override-driven security bumps from accidental lockfile churn during coordinated own-version bumps like `1.0.29 → 1.0.30`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `pnpm-lock.yaml`
  - *How:* `pnpm install --frozen-lockfile --lockfile-only`
  - *How:* `pnpm-workspace.yaml`
  - *How:* `overrides`
  - *How:* `1.0.29 → 1.0.30`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T12:20:31.297Z; applied=2; wins=2 -->
- **Always check `.github/workflows/pages.yml` for an explicit comment separating a workspace member's test tooling from its standalone npm tree before reporting a missing devDependency as a phantom dep — in this repo `website/` deliberately omits `vitest` (declared only at the workspace root) so the deployed Pages artifact's `npm ci` tree stays free of test code, and `website/package-lock.json` intentionally contains no `vitest` entry.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.github/workflows/pages.yml`
  - *How:* `website/`
  - *How:* `vitest`
  - *How:* `npm ci`
  - *How:* `website/package-lock.json`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T11:56:36.242Z; skill=node-modern; applied=3; wins=3; skipped=3; skippedWins=3 -->
- **Always verify a new `exports` subpath in `packages/*/package.json` also appears in the hardcoded `coreEntries`/`toolEntries` array in `scripts/build-package.mjs` — the build emits only listed entries, so a subpath export with no matching entry ships a `dist/` file that does not exist and fails at runtime with `ERR_PACKAGE_PATH_NOT_EXPORTED`, not at build time.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `exports`
  - *How:* `packages/*/package.json`
  - *How:* `coreEntries`
  - *How:* `toolEntries`
  - *How:* `scripts/build-package.mjs`
  - *How:* `dist/`
  - *How:* `ERR_PACKAGE_PATH_NOT_EXPORTED`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T12:28:55.488Z; skill=tech-stack; applied=1; wins=1 -->
- **Always verify that a new `exports` subpath in `packages/core/package.json` also appears in the `coreEntries` array in `scripts/build-package.mjs` before treating the manifest edit as complete — the build emits only listed entries, so an unwired subpath passes CI and fails at runtime with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Cross-check for a real consumer with `grep '@wrongstack/core/<subpath>'`; a subpath with zero importers is dead weight, one with a live importer in `packages/tools/src/` is a shipping break. `packages/core/tests/architecture/build-allowlist-freshness.test.ts` does NOT gate this parity, so no test failure will surface it.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `exports`
  - *How:* `packages/core/package.json`
  - *How:* `coreEntries`
  - *How:* `scripts/build-package.mjs`
  - *How:* `ERR_PACKAGE_PATH_NOT_EXPORTED`
  - *How:* `grep '@wrongstack/core/<subpath>'`
  - *How:* `packages/tools/src/`
  - *How:* `packages/core/tests/architecture/build-allowlist-freshness.test.ts`
  - *How:* `@wrongstack/core`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T10:01:31.959Z; skill=tech-stack; applied=5; wins=5 -->
- **In a pnpm workspace that is also a standalone npm project, cross-check any new tooling import against **both** the member's own lockfile and the root manifest: a config importing `vitest/config` plus `environment: 'jsdom'` needs two declared packages (`vitest`, `jsdom`), and the standalone `npm ci` path for that member will have neither unless both are added to its own `devDependencies`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `vitest/config`
  - *How:* `environment: 'jsdom'`
  - *How:* `vitest`
  - *How:* `jsdom`
  - *How:* `npm ci`
  - *How:* `devDependencies`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T10:01:31.959Z; skill=tech-stack; applied=5; wins=5 -->
- **Treat a `scripts`-only change in a `package.json` as lockfile-neutral: lockfiles record dependency specifiers, not `scripts`, so a manifest diff that touches only the `scripts` block must be followed by zero `pnpm-lock.yaml` churn. Verify agreement by comparing the `<member>:` importer block in `pnpm-lock.yaml` directly against the manifest rather than re-running the installer.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `scripts`
  - *How:* `package.json`
  - *How:* `pnpm-lock.yaml`
  - *How:* `<member>:`

<!-- learned-stamp: category=convention; capturedAt=2026-10-04T10:01:31.959Z; skill=tech-stack; applied=5; wins=5 -->
- **When a workspace member is also a standalone npm project with its own `package-lock.json`, a new script that invokes a toolchain binary is not necessarily a dependency the member owns — confirm with a filesystem check that the member's own `node_modules/<pkg>` and `node_modules/.bin/<pkg>.cmd` exist, because Node and npm both walk up to the workspace root and will silently mask a missing declaration. A green test run there proves only that the root install happens to be present.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `package-lock.json`
  - *How:* `node_modules/<pkg>`
  - *How:* `node_modules/.bin/<pkg>.cmd`

## Project facts

<!-- learned-stamp: category=fact; capturedAt=2026-10-04T12:20:31.297Z; skill=node-modern; applied=2; wins=2 -->
- **Treat a new `exports` subpath in `packages/core/package.json` as incomplete until the matching source path is present in the `coreEntries` array in `scripts/build-package.mjs` — the build emits only listed entries, so an unwired subpath passes CI and fails at runtime with `ERR_PACKAGE_PATH_NOT_EXPORTED`.**
  - *Why:* Current state of the project — assumed by other conventions, build steps, or peers, so acting on a stale assumption wastes a cycle.
  - *How:* `exports`
  - *How:* `packages/core/package.json`
  - *How:* `coreEntries`
  - *How:* `scripts/build-package.mjs`
  - *How:* `ERR_PACKAGE_PATH_NOT_EXPORTED`

---
*Last capture: 2026-10-04T12:28:55.488Z · 8 entries*
