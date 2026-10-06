# `/sidebar` — TUI sidebar visibility

| Command | Effect |
|---|---|
| `/sidebar`, `/sidebar toggle` | Toggle the right sidebar |
| `/sidebar on` | Show it |
| `/sidebar off` | Hide it and give chat the available width |
| `/sidebar status` | Read its current visibility |

`show`, `true` and `1` are accepted on aliases; `hide`, `false` and `0` are off
aliases. The setting is `autonomy.showSidebar`, defaulting to true when absent.
The command updates the host config store; persistence follows that host's
normal configuration writer.

This controls the TUI layout. It does not stop autonomous work or workers,
and it does not hide the browser activity bar. If the surface has no config
store, the command reports that limitation.

Source: [`sidebar.ts`](../../packages/cli/src/slash-commands/sidebar.ts).
See [layout presets](lite-full.md) and [statusline](statusline.md).
