# `/webui` — App surface guidance

This command describes WrongStack's browser surfaces from an active CLI/TUI session. It does **not** start another process or open a browser.

| Command | Alias | Result |
|---|---|---|
| `/webui` | `/web` | Explain how to start and access the browser UI. |

The command is deliberately informational: a running slash-command host does not reliably know which host or port the user intends to launch. From a shell, use the actual launch surfaces instead:

```text
wstack --webui
wstack --vibeui
```

VibeUI is a focused browser coding workspace; terminal/editor, browser streams
and automation editing remain in the full WebUI. SimpleUI was retired and replaced by VibeUI; `wstack simpleui` / `--simpleui` now open VibeUI.

## Code reference

- `packages/cli/src/slash-commands/surfaces.ts`
- `packages/cli/src/arg-parser.ts` — parses the `--webui` and `--vibeui` launch forms (and redirects the retired `--simpleui` to VibeUI)
