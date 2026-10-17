# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-17T16:39:57.414Z; skill=codebase-navigation; applied=3; wins=3; skipped=49; skippedWins=49 -->
- **Close `@wrongstack/kanban` consumer claims with the exact specifier `from '@wrongstack/kanban';` — the package publishes four subpath exports (`/test-support`, `/manager/lifecycle`, `/contract-graph`, `/queue-anomalies`) that bypass `packages/kanban/src/index.ts`, so a bare-specifier grep alone undercounts real importers and barrel edits don't reach subpath consumers.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `@wrongstack/kanban`
  - *How:* `from '@wrongstack/kanban';`
  - *How:* `/test-support`
  - *How:* `/manager/lifecycle`
  - *How:* `/contract-graph`
  - *How:* `/queue-anomalies`
  - *How:* `packages/kanban/src/index.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-10-17T16:43:02.965Z; skill=codebase-navigation; applied=11; wins=11; skipped=38; skippedWins=38 -->
- **Close consumer claims for `packages/kanban/src/verification/*` modules with behavioral seams, not module-path grep alone: tests under `packages/kanban/tests/verification/` routinely exercise a target module through `command-security.ts` (`validateCommand`) or `verification-context.ts` (`VerificationContext.runCommand`) without importing it — e.g. `desktop-vitest-command.test.ts` never imports `desktop-vitest-command.js`. Always pair the module-path grep with `codebase-incoming-calls` on each exported symbol and a glob of `packages/kanban/tests/verification/`.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/kanban/src/verification/*`
  - *How:* `packages/kanban/tests/verification/`
  - *How:* `command-security.ts`
  - *How:* `validateCommand`
  - *How:* `verification-context.ts`
  - *How:* `VerificationContext.runCommand`
  - *How:* `desktop-vitest-command.test.ts`
  - *How:* `desktop-vitest-command.js`
  - *How:* `codebase-incoming-calls`

<!-- learned-stamp: category=warning; capturedAt=2026-10-17T17:28:16.763Z; skill=codebase-navigation; applied=11; wins=11; skipped=20; skippedWins=20 -->
- **Close consumer claims for modules like `packages/tui/src/cell-selection.ts` with a repo-wide grep per exported symbol (`selectionText`, `selectedRuns`, `mountedTextRuns`, `screenOrigin`), never a single method: a module-path grep (`cell-selection(\.js)?["']`) returned 3 of 4 importers despite untruncated output, and `codebase-incoming-calls` showed 0 callers for `screenOrigin` due to a stale index. Also treat "only consumer is a hook with zero importers" (e.g. `useComposerPointer` in `packages/tui/src/hooks/use-composer-pointer.ts`) as a dead-code signal to report, not a reason to skip closing the symbol's consumers.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/tui/src/cell-selection.ts`
  - *How:* `selectionText`
  - *How:* `selectedRuns`
  - *How:* `mountedTextRuns`
  - *How:* `screenOrigin`
  - *How:* `cell-selection(\.js)?["']`
  - *How:* `codebase-incoming-calls`
  - *How:* `useComposerPointer`
  - *How:* `packages/tui/src/hooks/use-composer-pointer.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-10-17T19:25:01.030Z; skill=codebase-navigation; skipped=3; skippedWins=3 -->
- **Map `.temp_files/<round>/vitest.config.ts` scratch configs entirely from direct `read` + `tree` + repo-wide grep of the round name — they have zero incoming edges by construction (root vitest excludes `**/.temp_files/**`, gitignored, no exported symbols). Their real blast radius lives in three places: the base config they spread (edits propagate inward via `...base`), the module paths their plugins intercept (`load`/`resolveId` hooks), and cwd-relativity of `include`/`setupFiles` when no `test.root` is set — a config meant for `packages/<pkg>` cwd silently collects zero tests from repo root. Also check for a compiled `.js` twin next to any base config imported via a `.js` specifier (`glob packages/<pkg>/vitest.config.*`); if one exists, the stale artifact is what actually loads. **Key takeaway:** scratch Vitest configs have no incoming edges to trace — their risk is outbound: the live spread of a real package config, the modules their plugins shadow, and cwd-relative globs that fail silently from the wrong directory.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.temp_files/<round>/vitest.config.ts`
  - *How:* `read`
  - *How:* `tree`
  - *How:* `**/.temp_files/**`
  - *How:* `...base`
  - *How:* `load`
  - *How:* `resolveId`
  - *How:* `include`
  - *How:* `setupFiles`
  - *How:* `test.root`
  - *How:* `packages/<pkg>`
  - *How:* `.js`
  - *How:* `glob packages/<pkg>/vitest.config.*`

<!-- learned-stamp: category=warning; capturedAt=2026-10-17T18:48:28.119Z; applied=5; wins=5; skipped=4; skippedWins=4 -->
- **When probing scratch files under `.temp_files/<round>/`, capture the target file's full contents and a `tree` of its directory on the **first** read — concurrent leader cleanup deletes whole round directories mid-probe, and a second read will ENOENT with nothing left to cite. Also: don't spend query variants proving non-indexing for `.temp_files/**`; the root `vitest.config.ts` exclusion and rg's gitignore handling structurally guarantee zero index/grep hits there, so go straight to direct `read`/`tree` and label config wiring as inferred when sibling configs vanish before you can open them.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.temp_files/<round>/`
  - *How:* `tree`
  - *How:* `.temp_files/**`
  - *How:* `vitest.config.ts`
  - *How:* `read`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-17T17:31:03.722Z; skill=codebase-navigation; applied=22; wins=22; skipped=7; skippedWins=7 -->
- **Always map repository test files through three closures, in this order: (1) filename grep repo-wide — test files export nothing, so `codebase-incoming-calls`/`impact-analysis` have no symbols to trace and the filename is the only inbound edge; (2) collection — check BOTH the package-local `packages/<pkg>/vitest.config.ts` `include` and root `vitest.config.ts` (`packages/**/tests/**/*.test.{ts,tsx}`), since tui/desktop-style suites run under two runners; (3) edit gates — `packages/<pkg>/package.json` scripts (`test`, `typecheck:tests`), coverage `thresholds`, and the ratchet at `architecture/test-typecheck-baseline/packages-<pkg>.json`, where new diagnostics are release-blocking.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `codebase-incoming-calls`
  - *How:* `impact-analysis`
  - *How:* `packages/<pkg>/vitest.config.ts`
  - *How:* `include`
  - *How:* `vitest.config.ts`
  - *How:* `packages/**/tests/**/*.test.{ts,tsx}`
  - *How:* `packages/<pkg>/package.json`
  - *How:* `test`
  - *How:* `typecheck:tests`
  - *How:* `thresholds`
  - *How:* `architecture/test-typecheck-baseline/packages-<pkg>.json`

<!-- learned-stamp: category=convention; capturedAt=2026-10-17T16:15:26.303Z; applied=33; wins=33; skipped=35; skippedWins=35 -->
- **Verify `apps/desktop/tests/**` collection against both configs before predicting test discovery: the root `vitest.config.ts` include list explicitly contains `apps/**/tests/**/*.test.{ts,tsx}`, and `apps/desktop` additionally runs its own `vitest.config.ts` (`include: ['tests/**/*.test.ts']`) via the package `test` script — desktop tests execute under both runners, not just one.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `apps/desktop/tests/**`
  - *How:* `vitest.config.ts`
  - *How:* `apps/**/tests/**/*.test.{ts,tsx}`
  - *How:* `apps/desktop`
  - *How:* `include: ['tests/**/*.test.ts']`
  - *How:* `test`

<!-- learned-stamp: category=convention; capturedAt=2026-10-17T18:07:30.197Z; applied=10; wins=10; skipped=4; skippedWins=4 -->
- **When mapping proof-round configs under `.temp_files/proof-driven-bug-hunter/<round>/`, expect `vitest.config.ts` (not only `vitest.proof.config.mjs`) and read it directly — `.temp_files/**` is outside the index and excluded by root `vitest.config.ts`. These configs hard-code repo depth via `path.resolve(here, '../../..')` and a root-relative `include`; keep the round directory exactly three levels below the repo root and preserve `root: here`, or the proof silently collects zero tests. Close "who runs this" with a repo-wide grep of the round directory name plus a `tree` of the round dir — absence of `run.mjs`/`evidence/` proves manual invocation only.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`
  - *How:* `vitest.config.ts`
  - *How:* `vitest.proof.config.mjs`
  - *How:* `.temp_files/**`
  - *How:* `path.resolve(here, '../../..')`
  - *How:* `include`
  - *How:* `root: here`
  - *How:* `tree`
  - *How:* `run.mjs`
  - *How:* `evidence/`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-17T17:24:58.168Z; skill=codebase-navigation; applied=6; wins=6; skipped=27; skippedWins=27 -->
- **Resolve re-export facades before locating definitions in the TUI settings cluster: `packages/tui/src/components/settings-picker-model.ts` star-re-exports `settings-picker-constants.ts` and `settings-picker-resolver.ts`, so symbols like `SETTINGS_FIELD_COUNT` (constants:178) and `resolveSettingsFieldValue` (resolver:58) are not defined in the model file — use `codebase-search` on the symbol name rather than trusting the importing file. Consumers import the model path directly (not via a barrel), and `architecture/test-only-exports.json` gates test-facing exports from this file.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `packages/tui/src/components/settings-picker-model.ts`
  - *How:* `settings-picker-constants.ts`
  - *How:* `settings-picker-resolver.ts`
  - *How:* `SETTINGS_FIELD_COUNT`
  - *How:* `resolveSettingsFieldValue`
  - *How:* `codebase-search`
  - *How:* `architecture/test-only-exports.json`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-17T18:28:34.815Z; skipped=11; skippedWins=11 -->
- **When a `read` result is truncated but archived under `~/.wrongstack/tool-output/*.log`, grep that log for pattern counts to verify whole-file uniformity instead of re-reading the file — and copy the log path exactly; a single dropped character produces a misleading "does not exist" validation error.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `read`
  - *How:* `~/.wrongstack/tool-output/*.log`

## Project facts

<!-- learned-stamp: category=fact; capturedAt=2026-10-17T16:52:52.662Z; skill=codebase-navigation; applied=13; wins=13; skipped=35; skippedWins=35 -->
- **Close consumer claims for `packages/kanban/src/server/client.ts` with exported-symbol grep, not module-path grep alone: path patterns like `server/client(\.js)?["']` miss same-directory sibling imports (`./client.js`), which hid `kanban-store.ts`, `remote-storage.ts`, and `kanban-supervisor-bridge.ts` until a symbol grep on `getKanbanServerConnection` surfaced them. Pair `codebase-incoming-calls` with repo-wide greps for each exported name (`getKanbanServerConnection`, `closeKanbanServerConnections`, `isKanbanServerAvailable`) and remember barrel consumers import via `@wrongstack/kanban`, some as multiline import statements a single-line `import {...} from` regex will miss.**
  - *Why:* Current state of the project — assumed by other conventions, build steps, or peers, so acting on a stale assumption wastes a cycle.
  - *How:* `packages/kanban/src/server/client.ts`
  - *How:* `server/client(\.js)?["']`
  - *How:* `./client.js`
  - *How:* `kanban-store.ts`
  - *How:* `remote-storage.ts`
  - *How:* `kanban-supervisor-bridge.ts`
  - *How:* `getKanbanServerConnection`
  - *How:* `codebase-incoming-calls`
  - *How:* `closeKanbanServerConnections`
  - *How:* `isKanbanServerAvailable`
  - *How:* `@wrongstack/kanban`
  - *How:* `import {...} from`

---
*Last capture: 2026-10-17T19:25:01.030Z · 11 entries*
