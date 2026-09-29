# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-09-28T22:04:58.224Z; skill=codebase-navigation; applied=4; wins=4; skipped=16; skippedWins=16 -->
- **For "map this test file" probes, treat the real blast radius as three checkable anchors, not the call graph: (1) the literal assertion anchors — testids, `data-*` attributes, and raw i18n key strings — against the component under test, (2) the package `vitest.config.ts` project include globs that pick the file up (gives the exact run command), and (3) its coverage `thresholds` block plus any doc that mirrors those numbers (e.g. `packages/webui/TESTING.md`), since editing tests can move the ratchet. When the file was just edited by the leader, say explicitly that the read is post-edit state only and a diff vs HEAD was not possible without a shell.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `data-*`
  - *How:* `vitest.config.ts`
  - *How:* `thresholds`
  - *How:* `packages/webui/TESTING.md`

<!-- learned-stamp: category=convention; capturedAt=2026-09-29T07:32:51.853Z; skill=codebase-navigation; applied=2; wins=2; skipped=6; skippedWins=6 -->
- **For "what is model id X / where does it come from" probes, grep the exact literal repo-wide *including* `.wrongstack/` before searching symbols — uncataloged model ids exist only as passthrough strings from user config, and their sole in-repo trace is the gitignored `model` provenance field in `.wrongstack/agents/*/consolidation.json`. Cross-check `packages/providers/src/trusted-presets.ts` model lists: absence from a preset's `models[]` proves the id is not repo-defined, and the provider-half of any `providerId/model` error resolves via `packages/providers/src/index.ts` factory branches plus `packages/providers/src/minimax.ts`-style per-provider modules.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.wrongstack/`
  - *How:* `model`
  - *How:* `.wrongstack/agents/*/consolidation.json`
  - *How:* `packages/providers/src/trusted-presets.ts`
  - *How:* `models[]`
  - *How:* `providerId/model`
  - *How:* `packages/providers/src/index.ts`
  - *How:* `packages/providers/src/minimax.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-09-29T07:15:20.706Z; skill=codebase-navigation; applied=4; wins=4; skipped=9; skippedWins=9 -->
- **For caller probes against `packages/*/scripts/*.mjs`, treat them as standalone export-free CLI entry points: establish "no dependents" with a repo-wide exact-filename `grep` (covers package.json scripts, docs, tests) plus a `.temp_files/` `tree` check for spec/argument artifacts, not `codebase-incoming-calls` — top-level argv-driven `.mjs` scripts have no indexed symbols, and rg-based grep silently skips the gitignored `.temp_files/` where their past-run inputs live.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/*/scripts/*.mjs`
  - *How:* `grep`
  - *How:* `.temp_files/`
  - *How:* `tree`
  - *How:* `codebase-incoming-calls`
  - *How:* `.mjs`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-09-29T07:25:29.679Z; skill=codebase-navigation; applied=1; wins=1; skipped=9; skippedWins=9 -->
- **When mapping a `.temp_files/` scratch script's imports, resolve each package-internal specifier against the live checkout before describing its dependencies: bundled dist layouts (per-folder `dist/<dir>/index.js` plus per-file `.d.ts` only, as in `packages/providers/dist/oauth/`) mean `dist/<dir>/<module>.js` can be ENOENT even though `dist/` exists. Treat rg-backed `glob`/`grep` zero-hits under gitignored `dist/` as non-evidence; use direct `read` (ENOENT is authoritative) and check the bundle's tail `export {}` block for the symbol before proposing a rewire to that entry point.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `.temp_files/`
  - *How:* `dist/<dir>/index.js`
  - *How:* `.d.ts`
  - *How:* `packages/providers/dist/oauth/`
  - *How:* `dist/<dir>/<module>.js`
  - *How:* `dist/`
  - *How:* `glob`
  - *How:* `grep`
  - *How:* `read`
  - *How:* `export {}`

<!-- learned-stamp: category=pattern; capturedAt=2026-09-29T07:12:44.740Z; skipped=15; skippedWins=15 -->
- **When mapping dependents of `packages/cli/src/auth-menu/*` modules, expect the partial-mock pattern in `packages/cli/tests/`: `vi.mock('../src/auth-menu/<mod>.js', importOriginal => ({ ...await importOriginal(), <oneFn>: mock }))` — only the overridden export is faked, so sibling exports run live in those suites and stay in the blast radius of any edit. Always pair the exact-specifier grep with the barrel `packages/cli/src/auth-menu/index.ts`, since external consumers (e.g. `subcommands/handlers/auth.ts`) import via the barrel rather than the module path.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `packages/cli/src/auth-menu/*`
  - *How:* `packages/cli/tests/`
  - *How:* `vi.mock('../src/auth-menu/<mod>.js', importOriginal => ({ ...await importOriginal(), <oneFn>: mock }))`
  - *How:* `packages/cli/src/auth-menu/index.ts`
  - *How:* `subcommands/handlers/auth.ts`

## Project facts

<!-- learned-stamp: category=fact; capturedAt=2026-09-29T07:36:42.346Z; skill=codebase-navigation; skipped=6; skippedWins=6 -->
- **For "is in the provider waiting room / skipped without calling the API" probes, jump straight to two anchors: the throw site at the `runProviderWithRetry` pre-flight gate in `packages/core/src/core/provider-runner.ts` (synthetic 429, no wire call) and the state machine + recovery API (`unblock`/`retryNow`/`clear`/`sweepExpired`, quota ladder 15 min → 1 h, `quarantineSiblings` fan-out) in `packages/core/src/coordination/provider-status-tracker.ts`. Grep the provider half of `providerId/model` errors against `packages/providers/src/index.ts` factory branches and `packages/providers/src/trusted-presets.ts` `models[]` to decide whether the id is repo-defined or a user-config passthrough. [skill: codebase-navigation]**
  - *Why:* Current state of the project — assumed by other conventions, build steps, or peers, so acting on a stale assumption wastes a cycle.
  - *How:* `runProviderWithRetry`
  - *How:* `packages/core/src/core/provider-runner.ts`
  - *How:* `unblock`
  - *How:* `retryNow`
  - *How:* `clear`
  - *How:* `sweepExpired`
  - *How:* `quarantineSiblings`
  - *How:* `packages/core/src/coordination/provider-status-tracker.ts`
  - *How:* `providerId/model`
  - *How:* `packages/providers/src/index.ts`
  - *How:* `packages/providers/src/trusted-presets.ts`
  - *How:* `models[]`

<!-- learned-stamp: category=fact; capturedAt=2026-09-28T22:00:07.544Z; applied=2; wins=2; skipped=23; skippedWins=23 -->
- **Treat `packages/webui/tests/types/sage-type-contract.test.ts` as the sole drift guard for the SAGE type mirror: it textually parses `packages/webui/src/types/sage.ts` (`SageEntry`/`SageAnchor`) against `packages/sage/src/memory-model.ts` (`Sage`/`MemoryAnchor`), comparing property NAMES only in both directions. Any probe about adding/removing/renaming fields on those four interfaces has this file as its blast radius; it has no exports and no external callers, so guard-weakening edits (anchor lists, field pins, rename guards) are the only silent-failure mode.**
  - *Why:* Current state of the project — assumed by other conventions, build steps, or peers, so acting on a stale assumption wastes a cycle.
  - *How:* `packages/webui/tests/types/sage-type-contract.test.ts`
  - *How:* `packages/webui/src/types/sage.ts`
  - *How:* `SageEntry`
  - *How:* `SageAnchor`
  - *How:* `packages/sage/src/memory-model.ts`
  - *How:* `Sage`
  - *How:* `MemoryAnchor`

---
*Last capture: 2026-09-29T07:36:42.346Z · 7 entries*
