# Learned instructions for `executor`

> Project-specific learning data for the `executor` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-09-23T16:43:01.087Z; skill=verify-before-done; skipped=1; skippedWins=1 -->
- **Always open the SimpleUI diff panel through the UtilityDock "Changes" badge (`utility-dock.tsx`, gated by `aggregateFileEdits` over completed mutating tool calls) when driving the UI in tests — `chat-message-list.tsx` does not pass `onOpenDiff` to `ToolCallEntry`, so the per-entry View-diff button never renders in the live leader timeline.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `utility-dock.tsx`
  - *How:* `aggregateFileEdits`
  - *How:* `chat-message-list.tsx`
  - *How:* `onOpenDiff`
  - *How:* `ToolCallEntry`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-09-23T17:31:55.299Z; skill=verify-before-done -->
- **- Always verify `.temp_files` cleanup with `dir /b .temp_files` (cmd) on Windows — the `glob` tool returns nothing for the hidden `.temp_files` directory, which hid ~30 pre-existing files; multi-path quoted `del /q` in one cmd invocation can also fail while reporting success downstream. - When no MCP `remember` tool is registered, record SAGE memories programmatically via `packages/sage/dist/index.js`: `createSqliteMemoryPort({ projectRoot })` → `getSageService(port)` → `service.rememberSage({ text, kind, scope, anchors, supersedes, tags, importance, confidence })` — the official write path (…**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files`
  - *How:* `dir /b .temp_files`
  - *How:* `glob`
  - *How:* `del /q`
  - *How:* `remember`
  - *How:* `packages/sage/dist/index.js`
  - *How:* `createSqliteMemoryPort({ projectRoot })`
  - *How:* `getSageService(port)`
  - *How:* `service.rememberSage({ text, kind, scope, anchors, supersedes, tags, importance, confidence })`

---
*Last capture: 2026-09-23T17:31:55.299Z · 2 entries*
