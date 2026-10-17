# TUI selection modes

## Usage

- **Block** is the default. Dragging across a card copies the entire card, preserving the previous behavior and copy-icon payloads.
- **Text** copies only the selected visible text. Markdown is selected as rendered, not by guessing offsets into its source.
- Change the mode in **Settings → Selection → Chat selection**, or click **[Block] / [Text]** in the composer footer.
- Both controls persist `autonomy.selectionMode` to the existing selected configuration scope. Missing or unknown saved values read as Block.
- The composer always uses text selection: drag and release to copy. A plain click does not copy. Keyboard shortcuts and Ctrl+C interruption are unchanged.
- Mode changes cancel pending selections. Composer edits, scrolling, hiding or disabling the composer also cancel its pending selection.
- Composer clipboard failures show `Copy failed`; preference-save failures restore the saved mode and show an error. Rapid indicator clicks are saved in order.

## Text-copy semantics

Selection endpoints are display cells, not UTF-16 indexes. Touching either half of a wide grapheme selects the whole grapheme. Reversed and multiline selections follow reading order rather than selecting a rectangle.

Chat text comes from mounted Ink text nodes and Yoga layout. Box borders, the scrollbar and the sidebar are not part of the text snapshot. Input text comes from the visible input layout without its prompt or frame. Visible wrapped rows are joined with newlines, and trailing whitespace is trimmed. Hidden source text and Markdown delimiters are not recovered by Text mode; use Block or a copy icon when source text is wanted.

## Implementation boundaries

- Settings field **67** is appended; existing field indices are unchanged.
- `packages/tui/src/cell-selection.ts` owns grapheme/cell selection and mounted-text geometry.
- `components/history/use-history-controller.ts` keeps the existing Block assembler and selects the Text path only when requested.
- `hooks/use-composer-pointer.ts` owns composer gestures and copy feedback; its absolute overlay does not contribute layout rows.
- CLI settings adapters handle disk persistence and rehydration; core declares the benign preference and its default.

## Verification (2026-10-17)

- TUI focused regression run: **13 files, 281 tests passed**, one worker. Covers the new selection suites plus drag-copy, pointer replay, input rails, Settings persistence/hydration/filter/overflow, and leaked-mouse guards.
- CLI: `bun run test tests/tui-selection-mode.test.ts tests/tui-settings-adapter.test.ts --maxWorkers=1` from `packages/cli`: **2 files, 32 tests passed**, including a fresh adapter reading the persisted file.
- `bun run typecheck` from `packages/tui`: source and test checks passed.
- `bun ../../scripts/bun-typecheck.mjs --noEmit` from `packages/core` and `packages/cli`: passed. CLI test typecheck with `-p tsconfig.test.json`: passed.
- `bun run build` from `packages/tui` and `packages/cli`: passed.
- Final scoped Biome check: **39 files passed**, no fixes needed. Final diff reviewed; `git diff --check` passed. All changed maintained files are below 800 lines (largest: 689).
- The full TUI run reached its 300-second budget. Its observed moved-line guard failure was corrected and the guard suite passed in the focused run; the full suite is **not claimed green**.
- An earlier root `bun run test` invocation expanded into the workspace suite instead of forwarding filters and reached its 120-second budget; it is **not claimed green**.

Physical Windows Terminal clipboard/mouse behavior was not exercised. Tests use real Ink/Yoga rendering with a synthetic TTY and mock the native clipboard boundary. No dependency installation or commit is part of this change.
