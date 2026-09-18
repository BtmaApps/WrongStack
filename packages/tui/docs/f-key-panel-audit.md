# F-key panel audit — 2026-09-18

Bottom F-key panels own keyboard input and preserve the hidden composer draft.
The same F-key closes the panel; another F-key switches panels. Sidebar twins
leave chat input available. Foreground confirmations suspend monitor input.

## Panel-by-panel review

| Key | Surface | Changes and checks |
| --- | --- | --- |
| F1 | Projects | Filter, selected project, short-screen window, always-visible close hint, same-key close and F-key switching. |
| F2 | Fleet | Capacity and worker telemetry, empty state, persistent title/footer, hidden-draft protection. |
| F3 | Agents | Windowed roster, selected detail, compact single-column layout, transcript navigation, F3/Esc close. |
| F4 | Worktrees | Conflict-first details, selection, Ctrl+W/Esc ownership, preserved draft. |
| F5 | Plan | Scope switch and selection, modifier isolation, F5/Esc close. |
| F6 | Todos | Sorted status rows, bounded selection window, F6/Esc close. |
| F7 | Queue | Delete/edit/refine/clear controls; Ctrl+D cannot delete; editing reveals the draft and closes the panel. |
| F8 | Processes | Stop/force confirmation, selection, matching R/r reset behavior, F8/Esc close. |
| F9 | Goal | Compact deliverables, only available coordinator actions shown; Ctrl+C cannot start the coordinator. |
| F10 | Sessions | Selected session and resume confirmation; F10 closes and other F-keys switch without being swallowed. |
| F11 | Coordinator | Goal/task inspection, protected draft, F11/Esc close, no duplicate live composer. |
| F12 | Kanban | Compact task list, discoverable `?` key help, selected board/task/column windows, modifier isolation. |

## Shared layout and input

- Panel geometry uses its allocated viewport instead of assuming the full terminal.
- Header and footer remain visible; overflowing content is accessible through
  Alt+PgUp/PgDn and the mouse wheel. F1/F10 retain wheel selection.
- Key labels stay together in wrapping F-panel footers. Display-width truncation
  handles wide and combined Unicode characters.
- Keyboard, paste, and Enter cannot modify or submit a hidden chat draft.
- Foreground prompt input cannot also navigate or mutate the underlying monitor.

## Regression coverage

- `f-key-panel-viewport.test.tsx`: F1–F12 at 120×40, 80×24, 52×16 and 40×12;
  title/close visibility, viewport bounds, selected rows, modifier isolation,
  prompt ownership, keyboard/wheel overflow scrolling.
- `key-handler-replay-corpus.test.ts`: all twelve panels preserve drafts and
  prevent hidden submission; F1/F10 allow function-key switching.
- Existing monitor, queue, process, goal, session, coordinator and Kanban suites.
- `subagent-models-tui-e2e.test.ts`: built CLI under a real PTY, statusline and
  model-panel interaction, F1–F12 opening/closing with draft preservation at
  110×40 and after resizing to 52×16.

Run package checks with `pnpm --dir packages/tui test`, `typecheck` and `build`.
The real-PTY test requires `WSTACK_E2E=1` and built workspace dependencies.
Local PTY validation is Windows-only; Linux/macOS and a full release gate are
separate validation scopes.

Final local results: 355 TUI test files / 5,927 tests passed; four dedicated
statusline color tests passed; TUI source/test typecheck, build and scoped Biome
passed. The repository test-typecheck ratchet reported zero new diagnostics.
The real-PTY test passed at both sizes, including all twelve panel toggles and
draft-preservation checks (62.46 seconds).
