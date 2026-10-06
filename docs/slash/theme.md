# `/theme` — TUI theme presets

`/theme` opens a preset picker when the host provides an input reader; otherwise
it prints the current preset and available ids. `/theme <preset>` selects an
exact preset id and updates `themePreset` in the config store.

```text
/theme
/theme catppuccin
```

The interactive menu accepts Up/Down, Enter to apply and cancellation to leave
the selection unchanged. Unknown ids print the available list. Available
presets are derived from the TUI palette metadata rather than a fixed count in
this document. The update changes TUI colors; it does not select a project
design kit or a WebUI page theme.

Source: [`theme.ts`](../../packages/cli/src/slash-commands/theme.ts).
See [TUI layout](../tui-ink.md), [sidebar](sidebar.md) and
[project design](design.md).
