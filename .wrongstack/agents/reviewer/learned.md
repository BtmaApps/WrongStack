# Learned instructions for `reviewer`

> Project-specific learning data for the `reviewer` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-17T15:46:24.120Z; skill=testing; applied=2; wins=2; skipped=37; skippedWins=37 -->
- **Avoid `node -e "<code>" -- <positional args>` (and `-p`) when writing Vitest tests in this repo that must observe argument passing through `execTool`/`spawn`: under `bun --bun vitest` on Windows, `process.execPath` resolves to Bun's `node.exe` shim, which drops the first positional argument after inline code. Write a `.cjs` script into the test sandbox and pass it as `argv[1]` instead, asserting against `process.argv.slice(2)` — see `packages/tools/tests/exec-autonomy.test.ts` for the pattern. ```json { "findings": [] } ```**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `node -e "<code>" -- <positional args>`
  - *How:* `-p`
  - *How:* `execTool`
  - *How:* `spawn`
  - *How:* `bun --bun vitest`
  - *How:* `process.execPath`
  - *How:* `node.exe`
  - *How:* `.cjs`
  - *How:* `argv[1]`
  - *How:* `process.argv.slice(2)`
  - *How:* `packages/tools/tests/exec-autonomy.test.ts`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=warning; capturedAt=2026-10-17T17:51:56.205Z; skill=chimera; skipped=6; skippedWins=6 -->
- **When reviewing optimistic settings toggles in `packages/tui/src/app-view.tsx` (e.g. `selectionMode`, modeled on `toolResultViewMode`), treat the `localX` override + `selectionSaveQueue` (serialized `.then` chain) + `selectionSaveVersion` (monotonic counter) trio as intentional and race-safe: do not flag superseded-save failures or the picker-open override clear as bugs — the version guard prevents a stale failure from reverting a newer in-flight toggle, and the clear-effect converges with `liveSettings` without looping. Also verify `historyScrollRef` callbacks against the controller type in `packages/tui/src/components/history/scroll-controller-types.ts` before doubting `clearSelection`/`scrollToEntry` exist. ```json { "findings": [] } ```**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/tui/src/app-view.tsx`
  - *How:* `selectionMode`
  - *How:* `toolResultViewMode`
  - *How:* `localX`
  - *How:* `selectionSaveQueue`
  - *How:* `.then`
  - *How:* `selectionSaveVersion`
  - *How:* `liveSettings`
  - *How:* `historyScrollRef`
  - *How:* `packages/tui/src/components/history/scroll-controller-types.ts`
  - *How:* `clearSelection`
  - *How:* `scrollToEntry`
  - *How:* `json { "findings": [] }`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-17T17:44:26.894Z; skill=testing; applied=5; wins=5; skipped=3; skippedWins=3 -->
- **- Always cross-check strict count-based assertions in `packages/vibeui/tests/browser-smoke.mjs` (e.g. `.workspace-notes article` count, skills listbox option count) against the `for (const client of clients)` broadcast loops and the page's single-socket topology established by `connections++` / `clients.add` in `wss.on('connection')` — broadcast + strict count only coexist when the page holds exactly one socket. [skill: testing] - Treat a `page.clock.install()` without a matching uninstall in this smoke test as acceptable only when every subsequent step is server-push-driven or synchronous; flag it if later steps depend on app-side real timers (Playwright's installed clock keeps real-time ticking unless paused). [skill: testing] ---**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/vibeui/tests/browser-smoke.mjs`
  - *How:* `.workspace-notes article`
  - *How:* `for (const client of clients)`
  - *How:* `connections++`
  - *How:* `clients.add`
  - *How:* `wss.on('connection')`
  - *How:* `page.clock.install()`

<!-- learned-stamp: category=convention; capturedAt=2026-10-17T17:15:27.972Z; skill=chimera; applied=8; wins=8; skipped=13; skippedWins=13 -->
- **Always verify disk state with `git status -- <target paths>` plus a vocabulary `rg` (e.g. feature-specific identifiers like `selectionMode`) before reviewing an implementer's claimed work — an `aborted_by_parent` result with zero target-path changes means verdict `request changes` (deliverable absent), whereas `needs verification` is reserved for present-but-unchecked code. Anchor the absence proof in both status output and a zero-match symbol search so alternate naming cannot hide the work.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `git status -- <target paths>`
  - *How:* `rg`
  - *How:* `selectionMode`
  - *How:* `aborted_by_parent`
  - *How:* `request changes`
  - *How:* `needs verification`

<!-- learned-stamp: category=convention; capturedAt=2026-10-17T17:33:01.371Z; skill=chimera; applied=1; wins=1; skipped=12; skippedWins=12 -->
- **When a new required key joins `SettingsPickerValues` in `packages/tui/src/settings-contracts.ts` (or settingsPicker state in `packages/tui/src/app-panel-state.ts`), find *missed* test fixtures by grepping `packages/tui/tests` for a stable sibling required key (e.g. `toolResultViewMode`) — grepping the new key only surfaces sites the implementer already updated. Then verify any `Object.keys(SETTINGS_DEFAULTS).toHaveLength(N)` assertion by enumerating the literal in `packages/tui/src/components/settings-picker-model.ts`, skipping comment lines, instead of trusting the diff's count.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `SettingsPickerValues`
  - *How:* `packages/tui/src/settings-contracts.ts`
  - *How:* `packages/tui/src/app-panel-state.ts`
  - *How:* `packages/tui/tests`
  - *How:* `toolResultViewMode`
  - *How:* `Object.keys(SETTINGS_DEFAULTS).toHaveLength(N)`
  - *How:* `packages/tui/src/components/settings-picker-model.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-17T19:04:06.042Z; skill=testing -->
- **When reviewing theme-contrast audits that sample CSS custom properties through a 2D canvas in `packages/vibeui/tests/browser-smoke.mjs`, verify the token names exist in `packages/vibeui/src/app/globals.css` before trusting the ratio — an empty `getPropertyValue` result makes `ctx.fillStyle` assignment fail silently and reuse the previously painted color, so the assertion measures the wrong token instead of failing.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/vibeui/tests/browser-smoke.mjs`
  - *How:* `packages/vibeui/src/app/globals.css`
  - *How:* `getPropertyValue`
  - *How:* `ctx.fillStyle`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-17T17:01:58.153Z; skill=chimera; applied=13; wins=13; skipped=12; skippedWins=12 -->
- **Always trace UI `request(...)` call sites in `packages/vibeui` to `packages/vibeui/src/lib/use-panel-requests.ts` before flagging unhandled rejections or double-submits — the hook resolves `null` instead of rejecting, dedupes by expected frame type, and its `[state.id, connection]` cleanup cancels in-flight requests on session switch, so async send paths that guard on `busy` and clear drafts with functional identity comparisons are already race-safe. When reviewing new ws method calls like `mailbox.send` from vibeui/composer, verify field acceptance against `validateMailboxSendPayload` in `packages/webui-server/src/server/ws-mailbox-validation.ts` (12 validation branches — read them all), and confirm the server echoes the reply as a `mailbox.sent` frame with `requestId` + `success` so `acceptsPanelReply` can match it.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `request(...)`
  - *How:* `packages/vibeui`
  - *How:* `packages/vibeui/src/lib/use-panel-requests.ts`
  - *How:* `null`
  - *How:* `[state.id, connection]`
  - *How:* `busy`
  - *How:* `mailbox.send`
  - *How:* `validateMailboxSendPayload`
  - *How:* `packages/webui-server/src/server/ws-mailbox-validation.ts`
  - *How:* `mailbox.sent`
  - *How:* `requestId`
  - *How:* `success`
  - *How:* `acceptsPanelReply`

---
*Last capture: 2026-10-17T19:04:06.042Z · 7 entries*
