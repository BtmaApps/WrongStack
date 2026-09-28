# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-09-28T22:04:58.224Z; skill=codebase-navigation; applied=1; wins=1 -->
- **For "map this test file" probes, treat the real blast radius as three checkable anchors, not the call graph: (1) the literal assertion anchors — testids, `data-*` attributes, and raw i18n key strings — against the component under test, (2) the package `vitest.config.ts` project include globs that pick the file up (gives the exact run command), and (3) its coverage `thresholds` block plus any doc that mirrors those numbers (e.g. `packages/webui/TESTING.md`), since editing tests can move the ratchet. When the file was just edited by the leader, say explicitly that the read is post-edit state only and a diff vs HEAD was not possible without a shell.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `data-*`
  - *How:* `vitest.config.ts`
  - *How:* `thresholds`
  - *How:* `packages/webui/TESTING.md`

## Project facts

<!-- learned-stamp: category=fact; capturedAt=2026-09-28T22:00:07.544Z; applied=2; wins=2; skipped=4; skippedWins=4 -->
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
*Last capture: 2026-09-28T22:04:58.224Z · 2 entries*
