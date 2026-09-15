# Kanban and todos review — 2026-09-15

## Scope

Reviewed the Kanban manager/SQLite/IPC test coverage, session todo projection,
plan/task identity, worklist request routing, CLI completion feedback, and WebUI
layout. Ran related suites across Kanban, Kanban MCP, tools, plugins, core storage,
CLI, TUI, SDD, SimpleUI, HQ, WebUI and the WebUI server.

The checkout is shared and contained unrelated pending changes before this work.
No live boards or session sidecars were edited, and no commit or push was made.

## Repairs

| Problem | Repair and evidence |
| --- | --- |
| Updating a promoted todo with the fields exposed in the tool schema lost its plan/task identity and retained a second unfinished row. | Restore prior source metadata before omission detection. Two regression cases failed before the fix and pass afterward. |
| A plan/task card and an unrelated todo sharing an ID caused the card edit to update the todo instead of its source file. | Match origin IDs only within the todo origin namespace. Two regression cases failed before the fix and pass afterward. |
| Enforcing a single active todo mutated the caller's input objects. | Clone incoming rows before normalization. Regression failed before the fix and passes afterward. |
| WebUI remove/clear reported success while the model tool retained unfinished rows. | Route explicit human removal through observed state replacement, preserving the managed-card deletion guard. Both real-adapter integration cases failed before the fix and pass afterward. |
| A missing requested session fell back to the foreground session. | Refuse an unresolved or mismatched session before exposing its worklist context. Integration regression failed before the fix and passes afterward. |
| Completing the last managed todo auto-cleared the list, then CLI/WebUI reported that completion was refused. | Recognize an empty successful completion result, while preserving warning/refusal handling. Both regressions failed before the fix and pass afterward. |
| Mobile users could not delete boards. | Show the existing two-step deletion control at mobile widths. Chromium reproduced the inaccessible control and verifies both clicks afterward. |
| Short mobile screens could lose access to the card area below the controls. | Allow mobile vertical scrolling and give the card area a minimum height. Chromium can reach and activate every view at 390×300. |

## Validation

- Initial backend/domain group: 102 files, 1,484 passing tests.
- Expanded backend/domain group after the source and routing repairs: 108 files,
  1,519 passing tests (includes worklist tests also present in the server group).
- CLI/TUI/SDD/SimpleUI/HQ group: 74 files, 1,085 passing tests.
- WebUI Kanban/todo/worklist group after layout repair: 25 files, 217 passing tests.
- WebUI-server Kanban/todo/worklist group: 15 files, 80 passing tests.
- Final completion-feedback and regression group: 4 files, 54 passing tests.
- Builds passed for tools, WebUI, WebUI-server and CLI. A subsequent server build
  initially encountered a stale Sage declaration from concurrent work; rebuilding
  Sage before the server and CLI resolved it.
- Biome passes for all 12 changed code/test files; `git diff --check` passes.
- Package typechecks passed for Kanban, tools, WebUI-server, WebUI and CLI
  (including the CLI test typecheck).
- Final `node scripts/check-test-typecheck.mjs --json` scan: 34 projects;
  no new diagnostics in the repaired scope and no unparsed failures. Two
  unrelated new diagnostics remain: `sage-context-carry.test.ts` (TS2493) and
  `sage-port-wrapper.test.ts` (TS2345). The global gate therefore is not green.

Counts overlap where suites were repeated; they must not be added as unique tests.

### Browser verification

Run `node packages/webui/tests/kanban-browser-smoke.mjs`.

The harness renders the real components, styles, stores and client in Chromium,
records outgoing messages, and does not connect to a live backend. It passed at
1440×900, 390×844 and 390×300, checking:

- All five Kanban views can be selected.
- No document-wide horizontal overflow.
- Board deletion requires two clicks and targets the intended board.
- Todo actions retain the correct session ID before and after a session switch.
- The old session's todo disappears when the active session changes.
- No browser page errors.

Screenshots are generated under `.reports/kanban-review/`.

## Limits

This is scoped regression and browser-component evidence, not a guarantee that
every possible Kanban workflow is error-free. The full release gate and live TUI
PTY verification were not run. The browser harness does not prove a complete
live-server user journey. Existing test-typecheck baseline debt and unrelated
concurrent Sage/vector-memory diagnostics are outside these repairs; the baseline
was not changed.

## Second pass — persistence and source ownership

Four additional defect groups were reproduced and repaired:

1. Parent plan/task completion read and wrote outside the shared file lock. A
   concurrent writer could overwrite completion. The entire read/modify/save
   operation now holds the same lock used by other storage writers.
2. Failed parent saves were ignored, including the storage API returning `false`.
   Failures now reach the tool caller through the existing warning result.
3. Numeric plan IDs were passed to a human ID/index resolver, which could complete
   a different row. Parent completion now matches the exact stored ID.
4. A foreign session's card could update local todos or sidecars when IDs matched.
   Session graph ownership is now checked before any source mutation. Cards
   without a session graph retain the existing binding behavior.

Eight added regression cases failed before their fixes and passed afterward:
two concurrent-writer cases, two failed-save cases, one numeric-ID case, and
three foreign-session source cases. The existing missing-path fixture was updated
to carry its actual session graph ID so it still exercises the missing-path error.

Validation for this pass:

- 113 test files / 1,511 tests passed across Kanban, Kanban MCP, tools, CLI todos,
  WebUI-server worklists and Kanban routes.
- Tools build and typecheck passed; Biome passed for the five affected code/test
  files; `git diff --check` passed.
- The 34-project test-typecheck scan found no new diagnostics in this scope and
  no unparsed failures. Concurrent Sage/vector-memory work still has four
  diagnostic groups, including two in `sage/tests/shared/file-proposals.test.ts`.
- No UI code changed in this pass; browser checks were not repeated. The full
  release gate was not run.

## Third pass — refused completion and delayed replies

Three additional problems were reproduced and repaired:

- A requested completed todo could mark its parent plan/task complete even when
  the managed Kanban card refused completion. Rollup now reads the accepted card
  status and retains source metadata separately from the auto-cleared todo list.
- The managed projection dropped promotion metadata after refusal. It now
  preserves the exact board/task source binding, including when the optimistic
  all-completed list has already auto-cleared. This keeps later retries connected
  to their parent plan/task.
- A delayed bare-board edit/move response selected the old board after the user
  had switched away. Only create/duplicate/generate responses now select a board;
  other responses update summaries and the matching currently selected board.

Five new parameterized regression cases reproduce these flows, with the two
completion cases also checking that source links survive auto-clear and refusal.
The broader backend group passed 113 files / 1,513 tests; WebUI passed 25 files /
220 tests. Chromium checks again passed at all three documented viewport sizes.
Tools and WebUI builds, typechecks, Biome and whitespace validation passed.
After the final promotion-metadata repair, the affected tools group was rerun:
26 files / 253 tests passed. The final 34-project test-typecheck scan still has
only the four unrelated Sage/vector-memory diagnostic groups; no new diagnostics
in the repaired scope and no unparsed failures.
