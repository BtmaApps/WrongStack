# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-17T22:47:19.371Z; skill=codebase-navigation; applied=14; wins=14; skipped=4; skippedWins=4 -->
- **Always grep for CSS class names rendered by a component (e.g. `.workspace-notes` targeted in `packages/vibeui/tests/browser-smoke.mjs`) when closing a React component's blast radius — browser tests select by class, not symbol, so `codebase-incoming-calls` misses them.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.workspace-notes`
  - *How:* `packages/vibeui/tests/browser-smoke.mjs`
  - *How:* `codebase-incoming-calls`

<!-- learned-stamp: category=convention; capturedAt=2026-10-18T00:24:44.281Z; skill=codebase-navigation; applied=1; wins=1; skipped=8; skippedWins=8 -->
- **Always pair `codebase-incoming-calls` with a per-symbol repo-wide grep AND a file-scoped grep when closing consumers of `packages/vibeui/src/lib/*` modules — this session the index returned zero callers for `draftAfterSave` and `listReplyEffect` while live importers existed (`instructions-editor.tsx:4`, `memory-browser.tsx:6`), and repo-wide greps themselves under-reported (missed a plain `from '../lib/component-guards'` line and omitted a whole test file). Validate any unexpected zero-hit by globbing the sibling test directory by module stem (`packages/<pkg>/tests/<module-stem>.test.ts`) and grepping that file directly before reporting absence.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `codebase-incoming-calls`
  - *How:* `packages/vibeui/src/lib/*`
  - *How:* `draftAfterSave`
  - *How:* `listReplyEffect`
  - *How:* `instructions-editor.tsx:4`
  - *How:* `memory-browser.tsx:6`
  - *How:* `from '../lib/component-guards'`
  - *How:* `packages/<pkg>/tests/<module-stem>.test.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-18T00:19:24.534Z; skill=codebase-navigation; applied=5; wins=5; skipped=8; skippedWins=8 -->
- **Read a file's exact exported symbol spelling with `codebase-skeleton` before running `codebase-incoming-calls` on it — guessing casing (e.g. `resolveVibeuiDist` vs the actual `resolveVibeUiDistDir` in `packages/cli/src/vibeui-dist.ts`) returns a misleading zero-caller result that can be mistaken for dead code.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `codebase-skeleton`
  - *How:* `codebase-incoming-calls`
  - *How:* `resolveVibeuiDist`
  - *How:* `resolveVibeUiDistDir`
  - *How:* `packages/cli/src/vibeui-dist.ts`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-18T00:21:00.152Z; skill=codebase-navigation; applied=4; wins=4; skipped=6; skippedWins=6 -->
- **Always pair a module-path grep with per-export incoming-call analysis when mapping blast radius for a state-model module like `packages/vibeui/src/lib/session.ts`: the main reducer (`reduceFrame`) had a single production caller (`use-session.ts`), while its co-exported helpers (`record`/`text`/`rows`/`contentText`) and types (`SessionState`, `ChatEntry`, `ToolEntry`, `AgentEntry`, `InputRequest`) reached 20+ modules — including type-only imports that `codebase-incoming-calls` does not surface. Read the sole reducer caller's wrapper (here `use-session.ts` ~L150–200) to document the behavioral boundary (session filtering, run-ownership post-processing) before the leader edits the reducer itself.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `packages/vibeui/src/lib/session.ts`
  - *How:* `reduceFrame`
  - *How:* `use-session.ts`
  - *How:* `record`
  - *How:* `text`
  - *How:* `rows`
  - *How:* `contentText`
  - *How:* `SessionState`
  - *How:* `ChatEntry`
  - *How:* `ToolEntry`
  - *How:* `AgentEntry`
  - *How:* `InputRequest`
  - *How:* `codebase-incoming-calls`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-18T00:27:27.294Z; skipped=7; skippedWins=7 -->
- **Always use `tree` (or direct `read`) instead of `glob` for existence checks inside ignore-suppressed paths — both `packages/*/dist/*` (build output) and `.temp_files/**` (scratch) return zero files from `glob` even when the target exists, as with `packages/vibeui/dist/index.html`. Treat any zero-result `glob` in those locations as inconclusive traversal, not absence, before reporting a probe's serving target or cleanup scope as missing.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `tree`
  - *How:* `read`
  - *How:* `glob`
  - *How:* `packages/*/dist/*`
  - *How:* `.temp_files/**`
  - *How:* `packages/vibeui/dist/index.html`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-18T00:25:19.253Z; skill=codebase-navigation; applied=1; wins=1; skipped=7; skippedWins=7 -->
- **Always validate grep traversal into ignored scratch dirs (`.temp_files/**`) by grepping a string known to exist in the target file (e.g. its own filename) — a zero-hit repo-wide sweep there means `.gitignore` suppressed the directory, not absence of callers; use a path-scoped `grep` to distinguish, since `codebase-*` index tools and root `rg` both exclude those paths.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `.temp_files/**`
  - *How:* `.gitignore`
  - *How:* `grep`
  - *How:* `codebase-*`
  - *How:* `rg`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-18T00:25:19.253Z; skill=node-modern; applied=2; wins=2; skipped=6; skippedWins=6 -->
- **In scratch evidence harnesses that use Playwright `page.evaluate(fn)`, verify that page-side globals referenced across evaluate boundaries (e.g. `window.__probeInfo`) are actually assigned inside evaluated code — objects returned from `page.evaluate` land in Node, not the page, so passes reading such globals silently collect empty evidence (`{...undefined}` → `{}`) without any error, as in `.temp_files/vibeui/design-probe.mjs`.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `page.evaluate(fn)`
  - *How:* `window.__probeInfo`
  - *How:* `page.evaluate`
  - *How:* `{...undefined}`
  - *How:* `{}`
  - *How:* `.temp_files/vibeui/design-probe.mjs`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-18T00:18:09.173Z; skill=codebase-navigation; applied=8; wins=8; skipped=7; skippedWins=7 -->
- **When mapping blast radius for a React hook whose public contract is `type X = ReturnType<typeof hook>` (e.g. `SessionController` in `packages/vibeui/src/lib/use-session.ts`), always repo-grep the ReturnType alias separately — `codebase-incoming-calls` reports only runtime callers (here: one, `workspace.tsx:55`) and misses the ~15 type-only prop consumers that define the real edit surface. Pair the alias grep with a grep of each co-exported type name (`Attachment`, `DraftRequest`) to close type-only imports.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `type X = ReturnType<typeof hook>`
  - *How:* `SessionController`
  - *How:* `packages/vibeui/src/lib/use-session.ts`
  - *How:* `codebase-incoming-calls`
  - *How:* `workspace.tsx:55`
  - *How:* `Attachment`
  - *How:* `DraftRequest`

---
*Last capture: 2026-10-18T00:27:27.294Z · 8 entries*
