# `/desktop` · `/webui` — App surface guidance

These commands describe WrongStack's graphical surfaces from an active CLI/TUI session. They do **not** start another process or open a browser.

| Command | Alias | Result |
|---|---|---|
| `/desktop` | — | Explain how the installed Desktop app relates to the current session. |
| `/webui` | `/web` | Explain how to start and access the browser UI. |

The commands are deliberately informational: a running slash-command host does not reliably know which platform package, host, or port the user intends to launch. From a shell, use the actual launch surfaces instead:

```text
wstack desktop
wstack --webui
wstack --vibeui
```

VibeUI is a focused browser coding workspace; terminal/editor, browser streams
and automation editing remain in the full WebUI. SimpleUI was retired and replaced by VibeUI; `wstack simpleui` / `--simpleui` now open VibeUI.

## Code reference

- `packages/cli/src/slash-commands/surfaces.ts`
- `packages/cli/src/arg-parser.ts` — parses the Desktop, `--webui`, and `--vibeui` launch forms (and redirects the retired `--simpleui` to VibeUI)
