# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-03T22:16:19.560Z; applied=17; wins=17; skipped=4; skippedWins=4 -->
- **Always tree the specific `.temp_files/proof-driven-bug-hunter/<round>/` dir and read its sibling config before predicting how that round's `proof.test.ts` runs — harness layout varies per round: round `r1-token-counter-deltacost-2026-10-04/` uses `run.mjs` + `vitest.proof.config.mjs` (repo-root cwd requirement, tee'd `proof.before.log`), while `round-2-2026-10-04-cargo-toml-hash/` ships a bare local `vitest.config.ts` with `include: ['proof.test.ts']` and no runner at all. Never assume the `run.mjs` pattern exists; absence of `proof.before.log` means the round has not been run yet.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`
  - *How:* `proof.test.ts`
  - *How:* `r1-token-counter-deltacost-2026-10-04/`
  - *How:* `run.mjs`
  - *How:* `vitest.proof.config.mjs`
  - *How:* `proof.before.log`
  - *How:* `round-2-2026-10-04-cargo-toml-hash/`
  - *How:* `vitest.config.ts`
  - *How:* `include: ['proof.test.ts']`

<!-- learned-stamp: category=warning; capturedAt=2026-10-03T22:01:22.151Z; skill=codebase-navigation; applied=13; wins=13; skipped=22; skippedWins=22 -->
- **When mapping consumers of any `packages/*/tsconfig.test.json`, never assume the package's own scripts invoke it: grep the repo for `tsconfig.test.json` and check both (a) the package's `package.json` scripts — some packages (mailbox-mcp, sage-mcp, kanban-mcp, acp, cli) wire `tsc --noEmit -p tsconfig.test.json` into their own `typecheck`, while others (tools, core) do not — and (b) `scripts/check-test-typecheck.mjs` `discoverProjects()`, which generically scans every workspace package for the config plus test files and is then the *only* caller. Diagnostics from each config are ratcheted by `architecture/test-typecheck-baseline/packages-<pkg>.json` behind `pnpm check:test-types`.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/*/tsconfig.test.json`
  - *How:* `tsconfig.test.json`
  - *How:* `package.json`
  - *How:* `tsc --noEmit -p tsconfig.test.json`
  - *How:* `typecheck`
  - *How:* `scripts/check-test-typecheck.mjs`
  - *How:* `discoverProjects()`
  - *How:* `architecture/test-typecheck-baseline/packages-<pkg>.json`
  - *How:* `pnpm check:test-types`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T22:20:01.747Z; skill=node-modern; applied=14; wins=14; skipped=3; skippedWins=3 -->
- **Always tree the specific `.temp_files/proof-driven-bug-hunter/<round>/` dir and read the round's config before predicting invocation — layouts vary per round with no shared runner: some rounds ship `run.mjs` + `vitest.proof.config.mjs` (repo-root cwd, tee'd `proof.before.log`); others (e.g. `-r2-mime-case-`) ship a bare `vitest.proof.config.ts` that spreads root `vitest.config.ts` with a pinned `include` and `exclude**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`
  - *How:* `run.mjs`
  - *How:* `vitest.proof.config.mjs`
  - *How:* `proof.before.log`
  - *How:* `-r2-mime-case-`
  - *How:* `vitest.proof.config.ts`
  - *How:* `vitest.config.ts`
  - *How:* `include`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T22:23:56.843Z; skill=codebase-navigation; applied=10; wins=10; skipped=5; skippedWins=5 -->
- **Resolve "who calls this test file" through invocation wiring, not import graphs: read the owning `packages/<pkg>/package.json` `scripts.test`, glob for a per-package `vitest.config.*` (its absence makes root `vitest.config.ts` the sole collector), and check `architecture/test-skip-budget.json` before touching any `describe.skipIf` — skip gates are ledgered there.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/<pkg>/package.json`
  - *How:* `scripts.test`
  - *How:* `vitest.config.*`
  - *How:* `vitest.config.ts`
  - *How:* `architecture/test-skip-budget.json`
  - *How:* `describe.skipIf`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T21:50:21.198Z; skill=node-modern; applied=28; wins=28; skipped=8; skippedWins=8 -->
- **When predicting gates for edits under `packages/tools/tests/**`, read `packages/tools/package.json` `scripts.test` first — it runs `vitest run --root ../.. packages/tools/tests`, and `packages/tools` has no own `vitest.config.*`, so the root `vitest.config.ts` (`packages/**/tests/**` include) is the sole collection config for that package's suites.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/tools/tests/**`
  - *How:* `packages/tools/package.json`
  - *How:* `scripts.test`
  - *How:* `vitest run --root ../.. packages/tools/tests`
  - *How:* `packages/tools`
  - *How:* `vitest.config.*`
  - *How:* `vitest.config.ts`
  - *How:* `packages/**/tests/**`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-03T22:26:49.835Z; skill=codebase-navigation; applied=7; wins=7; skipped=6; skippedWins=6 -->
- **Use a control grep before trusting a zero-hit grep into `.temp_files/`: a grep given an explicit path into the ignored directory DOES search it (verified in round `-r2-mime-case-` — token `regression-unfixed` hit while `vitest.unfixed` was a true zero). Always pair the zero-hit query with a known-present token (e.g. a filename stem from the target file) in the same scope; only a control hit makes the zero real, since `.temp_files/` ignore-filtering otherwise makes zeros ambiguous.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `.temp_files/`
  - *How:* `-r2-mime-case-`
  - *How:* `regression-unfixed`
  - *How:* `vitest.unfixed`

---
*Last capture: 2026-10-03T22:26:49.835Z · 6 entries*
