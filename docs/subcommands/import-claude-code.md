# `wstack import-claude-code`

Bring a Claude Code setup across. Previews by default; nothing is written
without `--apply`.

```bash
wstack import-claude-code                          # preview
wstack import-claude-code --apply                  # write to the active profile
wstack import-claude-code --apply --overwrite      # replace same-named servers
```

## What is imported

MCP servers, into `mcpServers` of the active profile config:

| Source | Imported as |
|---|---|
| `~/.claude.json` → `projects["<this project>"].mcpServers` | enabled |
| `<project>/.mcp.json` (the repository file) | **disabled**, unless `--enable-project-servers` |
| `~/.claude.json` → `mcpServers` (user level) | enabled |

When a name appears in several sources the first row wins. Claude Code's
`type: "stdio" | "http" | "sse"` maps to `transport: "stdio" |
"streamable-http" | "sse"`. An entry that cannot be mapped is listed as
`skip (invalid)` with the reason; a name already in your config is skipped
unless `--overwrite`.

Repository servers arrive disabled because `.mcp.json` ships with the code and
its servers run commands — the same reason the in-project config loader strips
`mcpServers` from `.wrongstack/config.json`. Review them, then `/mcp enable
<name>`.

## What is reported, not imported

| Found | Why not | Next step |
|---|---|---|
| `.claude/skills`, `~/.claude/skills` | already loaded in place (`skills.readClaudeSkills`) | nothing |
| hooks in `settings*.json` | matcher and payload semantics differ | recreate under `config.hooks` ([hooks](../hooks.md)) |
| `permissions` rules | a mistranslated deny rule is worse than none | `/permissions`, `--allowed-tools`, `--disallowed-tools` |
| `CLAUDE.md` files | project context lives elsewhere | merge what applies into `.wrongstack/AGENTS.md` |

For a one-off run with Claude Code's MCP file and no import, use
`wstack --mcp-config .mcp.json "<task>"`.
