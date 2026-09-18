# Slash panel and settings audit — 2026-09-18

Scope: slash registration and aliases, panel opening and dismissal, modifier
isolation, filtering, selection visibility, scrolling, measured viewports,
settings field identity and persistence. Work used the current shared checkout.

## Panel ledger

Each row was traced through its command/opener, renderer and input handler.
The full TUI suite covers the existing behavior as well as the new regressions.
"PTY" below means the isolated built Windows CLI opened and dismissed that
surface; it does not mean an external provider operation was performed.

| Entry | Surface | Checks and outcome |
| --- | --- | --- |
| `/model`, `/provider`, `/switch` | Provider/model and reasoning effort | Existing measured viewport and selection checks; modified input isolated; PTY. |
| `/mode` | Agent modes | Added bounded selection window and single-row entries; PTY. |
| `/autonomy`, `/auto` | Autonomy selector | Preserved explicit command arguments instead of swallowing them into the picker; existing viewport tests. |
| `/theme` | Theme chooser/preview | Existing theme and measured-viewport checks; PTY. |
| `/settings`, `/config`, `/prefs` | 63 settings rows | Every row rendered at 100×18 and 52×10; see settings ledger below; PTY. |
| `/statusline` | Chip lines, order, density, visibility | Modifier isolation; existing regrouping, order, mouse geometry and persistence checks; PTY line/order editing. |
| `/plugin`, `/plugins` | Plugin switches | Measured rows replace whole-terminal guesses; bounded hints; locked-row regression coverage; PTY. |
| `/mcp`, `/mcp-servers` | MCP enable/restart | Measured rows, resize subscription, compact controls and modifier isolation; PTY. |
| `/tools` | Tool exposure/filter/toggle | Bounded chrome/details and focused row, compact controls; direct/lazy/disabled meanings preserved; PTY. |
| `/auth`, `/auth oauth` | Provider/key/catalog/form/OAuth flow | Explicit allocation, compact chrome, prompt/confirmation ownership, grapheme backspace and modifier isolation; bare `/auth` PTY. |
| `/brain` | Brain settings and decision log | Both views window around selection; large pools fit short screens; PTY. |
| `/shadow` | Shadow controls | Removed unimplemented i/m hints; compact layout; unsupported hosts now return the command's text fallback. PTY verifies fallback. |
| `/subagent-models` | Lane plan/session model/role summary | Whole-panel budget rather than treating maxRows as lane count; modified clear/toggle keys isolated; PTY. |
| `/help` | Command browser/details | Existing filter, selection and detail-scroll tests; added short-view selected-row checks; PTY. |
| `/skill`, `/skills` | Skill browser/details | Bounded rows and controls with long descriptions; PTY. |
| `/design` | Design kit/stack picker | Bounded rows, narrow controls and modifier isolation; PTY. |
| `/prompt`, `/prompts` | Prompt library | Replaced fixed twelve-row window with measured allocation; bounded descriptions and controls; PTY. |
| `/sessions`, `/resume`, `/load` | Historical-session picker | Existing typed-subcommand forwarding, windowing and busy-state coverage; PTY. |
| `/fallback` | Fallback routes | Shared resource browser: bounded list, scrollable full detail, visible actions, modified confirmation protection; PTY. |
| `/tier` | Cost tiers | Same shared-browser checks; PTY. |
| `/profile` | Profiles | Same shared-browser checks, including confirmation path; PTY. |
| `/provider-status` | Provider health | Same shared-browser checks; PTY. |
| `/memory` | Memory browser | Same shared-browser checks; PTY. |
| `/worktree` | Worktree browser | Same shared-browser checks; physical F4 remains the live monitor; PTY. |
| `/git` | Git browser | Same shared-browser checks; PTY. |
| `/audit` | Side-effect audit | Theme-aware shared shell; bounded scrollable records and pinned close hint; PTY. |
| `/mailbox`, `/inbox`, `/mail` | Mailbox summary | Bounded shared shell, scroll access and pinned close hint; real-renderer scroll tests. |
| `/cron` | Scheduled-job monitor | Reviewed existing input ownership, actions and shared-shell scrolling; existing tests. |
| `/context` | Context tabs | Reviewed tab shortcuts, modifier checks, empty states and typed-subcommand forwarding; existing tests. |
| `/connections`, `/conn`, `/conns` | Connections | Reviewed tab/confirmation ownership and bounded panel rendering; existing tests. |
| `/kanban` | Board monitor | Existing board/navigation, mutation-modifier and compact-view checks. |
| `/f`, `/f 1`…`/f 12`, `/f1`…`/f12` | Numbered panel selector/aliases | Corrected F5 label and `/f12` routing to Kanban. All physical F1–F12 exercised in PTY; `/f12` also exercised. |
| `/f1` | Project switcher | Existing filtering, selection and allocated viewport checks. |
| `/f2` | Fleet monitor | Existing ownership, scrolling and compact viewport checks. |
| `/f3`, `/agents` | Agent monitor | Existing ownership, compact roster and detail checks. |
| `/f4` | Worktree monitor | Existing ownership and worktree state tests. |
| `/f5` | Plan monitor | Existing selection, scope and shared-shell tests. |
| `/f6` | Todos | Existing selection and compact shared-shell tests. |
| `/f7` | Message queue | Existing edit/delete/clear and modifier protection tests. |
| `/f8` | Processes | Existing selection/action and viewport tests. |
| `/f9` | Goal | Existing lifecycle and conditional shortcut checks. |
| `/f10` | Live sessions | Existing selection/resume-confirmation and modifier checks. |
| `/f11` | Coordinator | Existing ownership and scrolling tests. |
| `/f12` | Kanban | Alias now matches physical F12 rather than opening statusline. |
| `/rewind` | Checkpoint timeline | Added focused window, modified-key rejection, empty-list guard and duplicate-rewind prevention. |
| `/clear` | Active-work clear confirmation | Exact YES retained; pinned controls, scrollable explanation and modified-Enter rejection. |
| `/exit` | Active-work exit confirmation | Pinned controls and modified-Enter rejection; detached-process notice retained. |
| Commands requesting y/n | Generic confirmation | Pinned controls and scrollable full question; Ctrl/Alt no longer approve. |

`/queue` and `/ps` have text command forms; the corresponding interactive
surfaces are also reachable through `/f7` and `/f8`. Plugin-defined commands
can add arbitrary host-owned prompts and are not an enumerable built-in catalog.

## Settings findings

- Placement rows 46–58 displayed the previous field's label. They now use the
  same starting index as reducers and persistence.
- Explicit `/settings <row>` navigation now runs after hydration, so a saved
  last-visited row cannot override the requested destination.
- All 63 canonical row names are discoverable through settings commands,
  including fields with no keyboard chord. Existing shorthand precedence stays.
- Inline updates/reset merge panel positions and map Fleet chat/token-saving
  aliases to canonical Settings keys. Save failures are returned in the command
  result instead of being reported as success.
- Picker saves are serialized. Rejected and synchronous failed writes are
  caught without losing subsequent queued changes.
- Esc clears filtering before closing. Editable text accepts pasted Unicode;
  backspace removes a whole grapheme. Plain action keys reject Ctrl/Alt.

## Validation boundaries

Tests use normal, short and narrow allocations, long lists/descriptions and
real Ink/Yoga layout. New regression suites cover panel geometry, every settings
row, command persistence, modifier isolation, scrollable summaries and slash
confirmations. The Windows PTY uses temporary configuration and a dummy local
provider. It does not authenticate real providers, connect production MCP
servers, execute remote actions or validate Linux/macOS terminal behavior.

The existing `/settings` and `/statusline` live-apply behavior is preserved.
Panel tests are scoped evidence, not a complete release gate.

Final validation: 368 TUI files / 6,327 tests, 71 dedicated color tests, and
23 focused CLI tests passed. The rebuilt Windows PTY regression passed in
93.99 seconds, including 24 slash-panel open/close cases and F1–F12 at two
terminal sizes. Source/test typecheck, TUI/CLI builds, scoped Biome and
`git diff --check` passed. The repository test-typecheck ratchet reported
zero new diagnostics; its pre-existing baseline diagnostics remain.

## Settings row ledger

Each row below was rendered with selection and Esc visible at both 100×18 and
52×10, and its canonical slash name was checked against the field index.

| Field | Setting |
| --- | --- |
| 0 | Default autonomy mode |
| 1 | Auto-proceed delay |
| 2 | Terminal title animation |
| 3 | YOLO mode |
| 4 | Fleet chat |
| 5 | Completion chime |
| 6 | Confirm before exit |
| 7 | Next prediction |
| 8 | MCP features |
| 9 | Plugin features |
| 10 | Memory features |
| 11 | Skills features |
| 12 | Models registry |
| 13 | Token-saving mode |
| 14 | Allow outside project root |
| 15 | Max iterations |
| 16 | Auto-proceed max iterations |
| 17 | Refine preview countdown |
| 18 | Refine |
| 19 | Refine language |
| 20 | Index on session start |
| 21 | Multi-diff summary |
| 22 | Thinking word |
| 23 | Reasoning mode |
| 24 | Reasoning effort |
| 25 | Reasoning preserve |
| 26 | Cache TTL |
| 27 | Context auto-compact |
| 28 | Compactor strategy |
| 29 | Context mode |
| 30 | Max concurrent |
| 31 | Log level |
| 32 | Audit level |
| 33 | Stream debug logging |
| 34 | Statusline |
| 35 | Config scope |
| 36 | Animation |
| 37 | Circuit breaker |
| 38 | Breaker timeout |
| 39 | Show model reasoning |
| 40 | Agent swarm panel |
| 41 | Pre-refine countdown |
| 42 | Read symbols |
| 43 | Show SAGE Memory Inject |
| 44 | SAGE Memory Inject threshold |
| 45 | Nextsteps tool |
| 46 | Project switcher placement |
| 47 | Fleet placement |
| 48 | Agents placement |
| 49 | Worktree placement |
| 50 | Plan placement |
| 51 | Todos placement |
| 52 | Queue placement |
| 53 | Process list placement |
| 54 | Goal placement |
| 55 | Sessions placement |
| 56 | Coordinator placement |
| 57 | Kanban placement |
| 58 | Connections placement |
| 59 | WrongProxy / WrongTrace |
| 60 | WrongProxy URL |
| 61 | Right sidebar |
| 62 | Tool result view |
