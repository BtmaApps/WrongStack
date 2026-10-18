# Learned instructions for `bug-hunter`

> Project-specific learning data for the `bug-hunter` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-18T09:37:28.574Z; skill=bug-hunter -->
- **Always adjudicate `.name`-keyed error catches in `packages/cli/src` against the error class constructor and the repo's esbuild chunk-duplication hazard before flagging them as fragile — in this repo the name comparison is the hardened pattern and `instanceof` on cross-chunk workspace-imported error classes (`@wrongstack/core/*`) is the fragile variant. Anchors: `packages/cli/src/fleet/host-shadow-pass.ts` (name-keyed swallow of `FleetSpawnBudgetError`, class stamps `name` in `packages/core/src/coordination/director/director-errors.ts`), `packages/cli/src/wiring/proxy-probe.ts` (documented chunk-duplication), `packages/cli/src/goal-host.ts` (`instanceof GoalRunLeaseBusyError` — degrade-tolerant). Verify fire-and-forget containment by grepping repo-wide for the method name plus `.catch(`, and cite `packages/cli/tests/fleet/shadow-pass-unhandled.test.ts` as the regression-test pattern for unhandled-rejection probes.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.name`
  - *How:* `packages/cli/src`
  - *How:* `instanceof`
  - *How:* `@wrongstack/core/*`
  - *How:* `packages/cli/src/fleet/host-shadow-pass.ts`
  - *How:* `FleetSpawnBudgetError`
  - *How:* `name`
  - *How:* `packages/core/src/coordination/director/director-errors.ts`
  - *How:* `packages/cli/src/wiring/proxy-probe.ts`
  - *How:* `packages/cli/src/goal-host.ts`
  - *How:* `instanceof GoalRunLeaseBusyError`
  - *How:* `.catch(`
  - *How:* `packages/cli/tests/fleet/shadow-pass-unhandled.test.ts`
  - *How:* `@wrongstack/core`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-18T00:07:18.271Z; skipped=2; skippedWins=2 -->
- **Always check markdown-renderer link components for URL-scheme validation (`javascript:` hrefs) before declaring a React UI XSS-clean — absence of `dangerouslySetInnerHTML` is not sufficient; VibeUI's `markdown-content.tsx` ArtifactLink renders agent-controlled hrefs verbatim while `provider-manager.tsx` already ships a `safeLoginUrl` allowlist pattern to reuse.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `javascript:`
  - *How:* `dangerouslySetInnerHTML`
  - *How:* `markdown-content.tsx`
  - *How:* `provider-manager.tsx`
  - *How:* `safeLoginUrl`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-18T00:38:09.992Z; skill=typescript-strict; skipped=1; skippedWins=1 -->
- **Always re-read co-modified vibeui files immediately before editing — `packages/vibeui/src/lib/use-session.ts` was rewritten by a peer mid-hunt (guarded `edit` refused with external-modification), turning confirmed findings into already-fixed ones; report externally-fixed findings as resolved with live line anchors instead of re-applying fixes. Adjudicate Chimera "file shape" claims (one-liner, missing EOF newline) with byte-level checks (`[System.IO.File]::ReadAllBytes(...)` last bytes) rather than rendered diffs — snapshots of actively co-modified trees are routinely stale. ```json { "verification_evidence": { "typecheck": { "command": "node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/vibeui/tsconfig.json", "exitCode": 0 }, "lint": { "command": "bunx biome check packages/vibeui/src/lib/use-session.ts", "exitCode": 0 }, "tests": { "command": "bunx vitest run packages/vibeui/tests/session.test.ts", "exitCode": 0 } } } ```**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `packages/vibeui/src/lib/use-session.ts`
  - *How:* `edit`
  - *How:* `[System.IO.File]::ReadAllBytes(...)`
  - *How:* `packages/vibeui/tsconfig.json`
  - *How:* `packages/vibeui/tests/session.test.ts`

---
*Last capture: 2026-10-18T09:37:28.574Z · 3 entries*
