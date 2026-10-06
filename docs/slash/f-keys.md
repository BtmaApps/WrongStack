# /f — F-key panel launcher

Opens the TUI's F-key panels by number, for terminals or keyboards where the
physical F-keys are captured (tmux, some terminal emulators, laptops with an
Fn layer). In the TUI `/f` opens a keyboard-navigable picker; `/f3` directly
requests the F3 panel. The CLI's underlying `/f 3` numeric launcher is
overridden by that TUI picker and should not be confused with `/f3`.

## Usage

| Command | Effect |
|---|---|
| `/f` | TUI: open the panel picker. REPL: list numbered panels. |
| `/f <1-12>` | Underlying CLI numeric launcher; the TUI override opens its picker. |
| `/f1` … `/f12` | Same, as single commands (hidden from the slash picker). |

## Panel map

| Key | Panel |
|---|---|
| F1 | project switcher |
| F2 | fleet orchestration monitor |
| F3 | agents live monitor |
| F4 | worktree monitor |
| F5 | plan panel |
| F6 | todos monitor overlay |
| F7 | queue panel |
| F8 | process list overlay |
| F9 | goal panel |
| F10 | live sessions panel |
| F11 | coordinator monitor |
| F12 | Kanban board panel |

## Notes

- Panels are a TUI feature. In the plain REPL (or headless mode) the command
  prints a note instead of opening an overlay.
- The `/f1`–`/f12` aliases exist so typing `/f1` without a space also works;
  they are hidden from the command picker to avoid clutter.

See also: `/mouse` (mouse mode for clicking panels), `/statusline`.
