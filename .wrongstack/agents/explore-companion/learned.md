# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-09T13:23:54.682Z; skill=codebase-navigation; applied=16; wins=16; skipped=23; skippedWins=23 -->
- **When closing consumers of an alias-substituted fixture like `packages/simpleui/tests/app-smoke-fake-ws.js`, expect zero static importers by design: the fixture is injected via Vite `resolve.alias` exact-string entries in its harness (`tests/app-browser-smoke.mjs`, entries `{ find: './ws.js' }` / `{ find: '../lib/ws.js' }`). Close the real consumer set by grepping the *swapped specifier forms* in the package source (`packages/simpleui/src`), and separate the one value import (`src/hooks/use-simple-socket.ts`) from type-only imports that the alias never touches. `codebase-incoming-calls` cannot see this edge; a module-stem grep plus a specifier grep can.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/simpleui/tests/app-smoke-fake-ws.js`
  - *How:* `resolve.alias`
  - *How:* `tests/app-browser-smoke.mjs`
  - *How:* `{ find: './ws.js' }`
  - *How:* `{ find: '../lib/ws.js' }`
  - *How:* `packages/simpleui/src`
  - *How:* `src/hooks/use-simple-socket.ts`
  - *How:* `codebase-incoming-calls`
  - *How:* `./ws.js`
  - *How:* `../lib/ws.js`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-09T20:36:23.477Z; skipped=7; skippedWins=7 -->
- **Always capture the full content of a `.temp_files/proof-driven-bug-hunter/<round>/` target on the first successful read — concurrent sessions may delete the round directory mid-probe, and a later ENOENT means the evidence (and the leader's edit target) is gone. Treat a mid-probe ENOENT as concurrent-editing evidence: verify once with a parent-directory tree, then report the captured content instead of retrying reads. (Anchors: `.temp_files/proof-driven-bug-hunter/`, `vitest.proof.config.mjs`, `proof.test.ts`)**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`
  - *How:* `.temp_files/proof-driven-bug-hunter/`
  - *How:* `vitest.proof.config.mjs`
  - *How:* `proof.test.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-09T20:25:34.883Z; skill=codebase-navigation; applied=19; wins=19; skipped=1; skippedWins=1 -->
- **Always close consumers of `packages/mcp/src/client-stdio-protocol.ts`-style protocol helpers in `@wrongstack/mcp` with a module-path grep plus a per-exported-symbol grep over `packages/`: these modules are internal-only (the barrel re-exports only the `MCPClient` surface), their value consumers live in `packages/mcp/src/client.ts` (`onData`/`onLine` wrappers), and the host-interface implementation is the adapter factory in `packages/mcp/src/client-hosts.ts` — `codebase-incoming-calls` alone misses the type-only import edge and the adapter construction site.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/mcp/src/client-stdio-protocol.ts`
  - *How:* `@wrongstack/mcp`
  - *How:* `packages/`
  - *How:* `MCPClient`
  - *How:* `packages/mcp/src/client.ts`
  - *How:* `onData`
  - *How:* `onLine`
  - *How:* `packages/mcp/src/client-hosts.ts`
  - *How:* `codebase-incoming-calls`

<!-- learned-stamp: category=convention; capturedAt=2026-10-09T20:33:59.064Z; applied=2; wins=2; skipped=7; skippedWins=7 -->
- **Always close the "is there a runner?" question for gitignored scratch rounds with a `tree` of the **parent** `.temp_files/proof-driven-bug-hunter/` directory, not just the round dir — `rg` respects `.gitignore` and skips `.temp_files/` entirely, so a zero-hit repo-wide grep for the round name cannot rule out a sibling `run.mjs` or shared runner; only the recursive tree (check `total_files`) proves the subtree is script-only and the proof must be invoked directly by path.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `tree`
  - *How:* `.temp_files/proof-driven-bug-hunter/`
  - *How:* `rg`
  - *How:* `.gitignore`
  - *How:* `.temp_files/`
  - *How:* `run.mjs`
  - *How:* `total_files`

<!-- learned-stamp: category=convention; capturedAt=2026-10-09T20:27:45.309Z; skill=codebase-navigation; applied=5; wins=5; skipped=11; skippedWins=11 -->
- **Always grep the sibling module `sqlite-store-pagination` alongside `shared/pagination` when mapping consumers in `packages/sage` — the package keeps two parallel pagination modules with duplicate `decodePageCursor` and `PageCursor` exports (`packages/sage/src/shared/pagination.ts:64` vs `packages/sage/src/sqlite-store-pagination.ts:28`), and the SQLite list path (`sqlite-store-list-page.ts:4`, `sqlite-store-coverage.ts:25`) imports the sibling's version, so a module-path grep on `shared/pagination` alone misattributes which cursor decode actually runs. Close per-symbol: `decodePageCursor`/`compareByUpdatedDesc`/`CONTEXT_STATUSES` have zero production importers in the shared module.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `sqlite-store-pagination`
  - *How:* `shared/pagination`
  - *How:* `packages/sage`
  - *How:* `decodePageCursor`
  - *How:* `PageCursor`
  - *How:* `packages/sage/src/shared/pagination.ts:64`
  - *How:* `packages/sage/src/sqlite-store-pagination.ts:28`
  - *How:* `sqlite-store-list-page.ts:4`
  - *How:* `sqlite-store-coverage.ts:25`
  - *How:* `compareByUpdatedDesc`
  - *How:* `CONTEXT_STATUSES`
  - *How:* `packages/sage/src/shared/pagination.ts`
  - *How:* `packages/sage/src/sqlite-store-pagination.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-09T07:47:49.459Z; skill=codebase-navigation; applied=11; wins=11; skipped=31; skippedWins=31 -->
- **Always map one-shot scratch scripts under `.temp_files/proof-driven-bug-hunter/<round>/` with direct `read`, a `tree` of the round dir, and a repo-wide grep of the script's hardcoded needle strings — the codebase index and rg both skip the gitignored `.temp_files` tree, so `codebase-search`/`codebase-incoming-calls` return nothing, and grepping distinctive literals (e.g. `SCRUBBED_FREE_TEXT_FIELDS` → `packages/core/tests/storage/session-scrub-parity.test.ts`) recovers the real execution target. Treat "all needles absent from the target" as proof the script already ran and any re-run will fail closed.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`
  - *How:* `read`
  - *How:* `tree`
  - *How:* `.temp_files`
  - *How:* `codebase-search`
  - *How:* `codebase-incoming-calls`
  - *How:* `SCRUBBED_FREE_TEXT_FIELDS`
  - *How:* `packages/core/tests/storage/session-scrub-parity.test.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-09T13:27:30.291Z; applied=1; wins=1; skipped=37; skippedWins=37 -->
- **Always verify that page-probe registration actually executes before trusting a browser-audit script's report: in scratch scripts like `.temp_files/simpleui-design-audit.mjs`, a `primeProbes`-style helper that assigns `window.__probes` can be dead code while the driver still calls `window.__pro**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/simpleui-design-audit.mjs`
  - *How:* `primeProbes`
  - *How:* `window.__probes`

<!-- learned-stamp: category=convention; capturedAt=2026-10-09T20:23:46.545Z; skill=codebase-navigation; applied=3; wins=3; skipped=20; skippedWins=20 -->
- **When closing consumers of a repo-duplicated helper like `slugify`, always grep the exported symbol name repo-wide in addition to the module-path grep — `packages/core/src/utils/slug.ts` has three independent namesakes (`packages/core/src/utils/wstack-paths.ts` private copy, `packages/kanban/src/manager/basic-helpers.ts`, `packages/core/scripts/build-prompts.mjs`), and `codebase-incoming-calls` cannot disambiguate them (it warns "symbol exists in multiple files"). Classify every symbol hit by import source before attributing it to the canonical module.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `slugify`
  - *How:* `packages/core/src/utils/slug.ts`
  - *How:* `packages/core/src/utils/wstack-paths.ts`
  - *How:* `packages/kanban/src/manager/basic-helpers.ts`
  - *How:* `packages/core/scripts/build-prompts.mjs`
  - *How:* `codebase-incoming-calls`

---
*Last capture: 2026-10-09T20:36:23.477Z · 8 entries*
