# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-09T13:23:54.682Z; skill=codebase-navigation; applied=11; wins=11 -->
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

<!-- learned-stamp: category=convention; capturedAt=2026-10-09T07:47:49.459Z; skill=codebase-navigation; applied=4; wins=4; skipped=10; skippedWins=10 -->
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

<!-- learned-stamp: category=convention; capturedAt=2026-10-09T13:27:30.291Z; applied=1; wins=1; skipped=9; skippedWins=9 -->
- **Always verify that page-probe registration actually executes before trusting a browser-audit script's report: in scratch scripts like `.temp_files/simpleui-design-audit.mjs`, a `primeProbes`-style helper that assigns `window.__probes` can be dead code while the driver still calls `window.__pro**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/simpleui-design-audit.mjs`
  - *How:* `primeProbes`
  - *How:* `window.__probes`

---
*Last capture: 2026-10-09T13:27:30.291Z · 3 entries*
