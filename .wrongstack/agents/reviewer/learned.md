# Learned instructions for `reviewer`

> Project-specific learning data for the `reviewer` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-22T08:18:06.218Z; skill=security-scanner; applied=22; wins=22; skipped=40; skippedWins=40 -->
- **Always write BOM-stripping regexes as the explicit escape `/^\uFEFF/` (the established pattern across `packages/core/src` — `utils/config-json.ts`, `hq/alerts-config.ts`, `skills/manifest-store.ts`, `core/system-prompt-variants.ts`), never a raw pasted U+FEFF character in the source. A raw invisible codepoint is unverifiable by diff/grep rendering and indistinguishable from lookalike zero-width codepoints (U+200B, U+2060) that make the strip silently inert — in security paths like `packages/core/src/security/secret-vault.ts` that means plaintext secrets stay on disk while the code reads as fixed. When reviewing such a fix, confirm the actual codepoint (e.g. `rg` with a `\uFEFF` literal pattern) before trusting it.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `/^\uFEFF/`
  - *How:* `packages/core/src`
  - *How:* `utils/config-json.ts`
  - *How:* `hq/alerts-config.ts`
  - *How:* `skills/manifest-store.ts`
  - *How:* `core/system-prompt-variants.ts`
  - *How:* `packages/core/src/security/secret-vault.ts`
  - *How:* `rg`
  - *How:* `\uFEFF`

<!-- learned-stamp: category=warning; capturedAt=2026-10-24T15:40:25.855Z; skipped=20; skippedWins=20 -->
- **Treat `DEFAULT_MODES` prompts in `packages/core/src/models/default-modes.ts` as lazy file-backed accessors: literal `prompt: ''` entries are back-filled at module load via `Object.defineProperty` for ids in `LAZY_MODE_PROMPT_IDS`, so `.prompt` resolves through `modePrompt(id)` to `packages/core/instructions/modes/<id>.md` — never flag code reading `.prompt` off the catalog as reading an inert empty string, and verify such a suspicion against the post-array `for` loop before citing it.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `DEFAULT_MODES`
  - *How:* `packages/core/src/models/default-modes.ts`
  - *How:* `prompt: ''`
  - *How:* `Object.defineProperty`
  - *How:* `LAZY_MODE_PROMPT_IDS`
  - *How:* `.prompt`
  - *How:* `modePrompt(id)`
  - *How:* `packages/core/instructions/modes/<id>.md`
  - *How:* `for`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-24T15:07:17.903Z; skill=bug-hunter; applied=1; wins=1; skipped=22; skippedWins=22 -->
- **Always map each timer in `packages/cli/src/fleet/host-memory-companion.ts` to its specific budget before comparing docs claims: `withinIoBudget` = `ioTimeoutMs ?? 30_000`, `spawnBounded` startup = `Math.min(config.timeoutMs ?? 60_000, 60_000)`, probe watchdog/task = constrained `workerConfig.timeoutMs` — a doc's "deadline" wording can refer to any of the three. Treat `constrainMemoryCompanion` in `packages/cli/src/fleet/memory-companion-policy.ts` as idempotent (per-key positive-finite honor with fixed defaults) — nesting it around an already-constrained `workerConfig` at spawn is safe, not a double-clamp bug.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/cli/src/fleet/host-memory-companion.ts`
  - *How:* `withinIoBudget`
  - *How:* `ioTimeoutMs ?? 30_000`
  - *How:* `spawnBounded`
  - *How:* `Math.min(config.timeoutMs ?? 60_000, 60_000)`
  - *How:* `workerConfig.timeoutMs`
  - *How:* `constrainMemoryCompanion`
  - *How:* `packages/cli/src/fleet/memory-companion-policy.ts`
  - *How:* `workerConfig`

<!-- learned-stamp: category=convention; capturedAt=2026-10-24T15:32:24.415Z; skill=code-review; applied=2; wins=2; skipped=19; skippedWins=19 -->
- **Always resolve a doc claim that a config clamp changed *direction or default* (e.g. `tools.perIterationOutputCapBytes` in `docs/architecture/explore-companion-subagent.md` claiming 24k lower-only → 100k either-direction) against the enforcement site on disk in the same review — when the scoped diff contains no matching code change, the enforcement may live in an also-changed sibling (`packages/cli/src/fleet/`, `packages/core/src/coordination/`), and a stale claim silently misinforms operators. Likewise, before approving host code that delegates ceilings via `applyRosterBudget(template)` (as in `packages/cli/src/fleet/host-explore-companion.ts`), read `applyRosterBudget` in `packages/core/src/coordination/fleet.ts` to confirm explicit per-agent budgets survive the merge rather than being replaced by `FLEET_ROSTER_BUDGETS` values — identical default numbers make both semantics indistinguishable to tests.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `tools.perIterationOutputCapBytes`
  - *How:* `docs/architecture/explore-companion-subagent.md`
  - *How:* `packages/cli/src/fleet/`
  - *How:* `packages/core/src/coordination/`
  - *How:* `applyRosterBudget(template)`
  - *How:* `packages/cli/src/fleet/host-explore-companion.ts`
  - *How:* `applyRosterBudget`
  - *How:* `packages/core/src/coordination/fleet.ts`
  - *How:* `FLEET_ROSTER_BUDGETS`

<!-- learned-stamp: category=convention; capturedAt=2026-10-23T15:36:14.470Z; skipped=41; skippedWins=41 -->
- **Always resolve a new `architecture/test-skip-budget.json` entry against the real declaration before approving it — read the target test file, confirm the exact count of `it|test|describe.skip|todo|skipIf|runIf` matches (plus `it: it.skip` ternaries, `return skip(`, and `const x = it.skip` aliases, per `scripts/lib/test-skip-budget.mjs`), and compute the fingerprint as `sha256("<kind>:<normalized 3-line snippet>").slice(0,16)`. `validateSkipBudget` is an exact set comparison in both directions, so a missing entry fails the gate and a stale entry also fails it.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `architecture/test-skip-budget.json`
  - *How:* `it|test|describe.skip|todo|skipIf|runIf`
  - *How:* `it: it.skip`
  - *How:* `return skip(`
  - *How:* `const x = it.skip`
  - *How:* `scripts/lib/test-skip-budget.mjs`
  - *How:* `sha256("<kind>:<normalized 3-line snippet>").slice(0,16)`
  - *How:* `validateSkipBudget`

<!-- learned-stamp: category=convention; capturedAt=2026-10-22T08:37:55.254Z; skill=code-review; applied=1; wins=1; skipped=54; skippedWins=54 -->
- **Always resolve the reviewed surface against the file on disk before judging a call-site contract — the diff bundle is a snapshot and can lag the working tree (here `attemptReconnectHelper` in `packages/webui/src/lib/ws-client-connection.ts` changed from host fields to a `{ shouldReconnect: () => boolean }` config object between the diff snapshot and disk, changing what the caller must pass).**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `attemptReconnectHelper`
  - *How:* `packages/webui/src/lib/ws-client-connection.ts`
  - *How:* `{ shouldReconnect: () => boolean }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-24T14:33:13.226Z; applied=3; wins=3; skipped=31; skippedWins=31 -->
- **Always verify a module-to-re-export-shim refactor by resolving every symbol in the shim's `export { … } from '@scope/pkg/subpath'` list against the new source file on disk, and diffing the moved body against the deleted implementation — a verbatim move with a complete symbol list is the pass condition; a dropped, renamed, or rewritten symbol is an instant break for deep-path importers, and package.json `exports` additions (as in `packages/primitives/package.json`) must name each new entrypoint in the build script's entry map.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `export { … } from '@scope/pkg/subpath'`
  - *How:* `exports`
  - *How:* `packages/primitives/package.json`
  - *How:* `@scope/pkg`

<!-- learned-stamp: category=convention; capturedAt=2026-10-24T14:46:01.897Z; applied=3; wins=3; skipped=28; skippedWins=28 -->
- **Always verify that a module-extraction refactor which moves helpers into a sibling file preserves the original module's public export surface — grep every consumer of the source module for each moved symbol name (including `packages/vibeui/src/lib/session` → `record`, `rows`, `text`, `contentText`) and confirm the source module re-exports them, since `import { X } from './session'` consumers break silently at build time otherwise.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/vibeui/src/lib/session`
  - *How:* `record`
  - *How:* `rows`
  - *How:* `text`
  - *How:* `contentText`
  - *How:* `import { X } from './session'`

<!-- learned-stamp: category=convention; capturedAt=2026-10-24T15:02:44.063Z; skill=code-review; applied=11; wins=11; skipped=14; skippedWins=14 -->
- **When a review bundle retargets test imports from `@wrongstack/core/agent-catalog` to `@wrongstack/agent-catalog` (or deep `../../../agent-catalog/src/...` paths) during the core-extraction refactor, prove the target exists with a `glob` over `packages/agent-catalog/src/**` before issuing an all-clear.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `@wrongstack/core/agent-catalog`
  - *How:* `@wrongstack/agent-catalog`
  - *How:* `../../../agent-catalog/src/...`
  - *How:* `glob`
  - *How:* `packages/agent-catalog/src/**`
  - *How:* `@wrongstack/core`

<!-- learned-stamp: category=convention; capturedAt=2026-10-24T14:22:10.589Z; skill=chimera; applied=3; wins=3; skipped=34; skippedWins=34 -->
- **When a review bundle shows a diff that retargets test imports across package boundaries (e.g. `packages/core/tests/**` → `packages/agent-catalog/src/**`), verify each new target file exists on disk before declaring all-clear: a typo'd or unmoved path makes the test import fail at collection time rather than produce a subtle logic defect, so a `glob` over the new package's `src/` directory is the fastest proof. Always resolve allowlist-style string constants in architecture/security tests against the filesystem, not against the diff hunk: `ALLOWED` sets and `INJECTION_SITES` arrays are compared by exact relative path, so a stale entry turns the assertion into a silent no-op instead of a failure. Grep the referenced module for the guarded symbol (e.g. `formatProjectSuppliedBlock`) to prove the enumerated site still calls the helper.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/core/tests/**`
  - *How:* `packages/agent-catalog/src/**`
  - *How:* `glob`
  - *How:* `src/`
  - *How:* `ALLOWED`
  - *How:* `INJECTION_SITES`
  - *How:* `formatProjectSuppliedBlock`

<!-- learned-stamp: category=convention; capturedAt=2026-10-22T09:11:54.814Z; skipped=44; skippedWins=44 -->
- **When re-anchoring a `position: fixed` overlay to `position: absolute` inside a `position: relative` container, verify three properties before approving: (1) the container has `z-index: auto` so it creates no stacking context and the overlay's own `z-*` still resolves against the root context; (2) the container's right edge coincides with the viewport right edge (last in-flow flex child) so any `right-[<width>]` side-by-side offset against a `fixed` sibling panel still lands correctly; (3) the new ancestor's `overflow-hidden` does not clip the overlay's `w-[calc(100vw-…)]` at any breakpoint.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `position: fixed`
  - *How:* `position: absolute`
  - *How:* `position: relative`
  - *How:* `z-index: auto`
  - *How:* `z-*`
  - *How:* `right-[<width>]`
  - *How:* `fixed`
  - *How:* `overflow-hidden`
  - *How:* `w-[calc(100vw-…)]`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-24T14:52:10.845Z; skill=code-review; applied=1; wins=1; skipped=26; skippedWins=26 -->
- **When reviewing a module-extraction refactor, verify the extracted sibling's back-reference to the source module is `import type` (erased at compile time), not a runtime import — a runtime back-import (as in `packages/vibeui/src/lib/session-agents.ts` importing `SessionState` from `session.ts`) would create a true module cycle that breaks ESM initialization order even though TypeScript compiles cleanly. Also confirm every formerly module-private helper that stays in use inside the source file (e.g. `bounded`, `number` in `session.ts`) is present in the new import list, and that pre-existing imports left behind by the move (e.g. `isActiveAgent`) still have a live call site.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `import type`
  - *How:* `packages/vibeui/src/lib/session-agents.ts`
  - *How:* `SessionState`
  - *How:* `session.ts`
  - *How:* `bounded`
  - *How:* `number`
  - *How:* `isActiveAgent`

## Project facts

<!-- learned-stamp: category=fact; capturedAt=2026-10-24T15:02:44.063Z; applied=3; wins=3; skipped=22; skippedWins=22 -->
- **In `packages/cli/src/fleet/memory-companion-policy.ts`, `constrainMemoryCompanion` honors each explicit positive finite budget key independently and falls back per-key to `DEFAULT_MEMORY_COMPANION_BUDGET` (3000/8000/1_000_000/20/1_800_000) — judge budget-expectation flips in companion tests against that per-key semantics, not as a wholesale ceiling change.**
  - *Why:* Current state of the project — assumed by other conventions, build steps, or peers, so acting on a stale assumption wastes a cycle.
  - *How:* `packages/cli/src/fleet/memory-companion-policy.ts`
  - *How:* `constrainMemoryCompanion`
  - *How:* `DEFAULT_MEMORY_COMPANION_BUDGET`

---
*Last capture: 2026-10-24T15:40:25.855Z · 13 entries*
