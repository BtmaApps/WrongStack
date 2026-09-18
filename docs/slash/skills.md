# Skill slash commands

The default-active `wstack-skills` plugin registers seven commands when plugins are enabled. Because it is a first-party official plugin, each command has a bare form and a namespaced form such as `/wstack-skills:skill`.

| Command | Purpose |
|---|---|
| `/skill [name]` | List discovered skills or preview one skill body. |
| `/skill use <name> <task>` | Ask the agent to load and apply a skill to the task. |
| `/skill reload` | Refresh discovery after external edits. |
| `/skill-gen` | Create, inspect, edit, or validate skills. |
| `/skill-search <query> [--page N] [--pageSize N]` | Search configured skill registries; see [skill-search](skill-search.md). |
| `/skill-install <ref> [--global]` | Install from GitHub or a registry ref. |
| `/skill-import <dir> ...` | Copy or link skills from another local agent/tool directory. |
| `/skill-update [name|ref] [--global]` | Refresh installed skills from their source. |
| `/skill-uninstall [name] [--global]` | Remove a skill; with no name, list installed skills in that scope. |

Run `/help <command>` for the full registered help of authoring and import flags. Project installs live under `.wrongstack/skills`; `--global` targets the user-level skill directory.

## Code reference

- `packages/core/src/plugins/skills-plugin.ts` — all seven registrations
- `packages/core/src/skills/skill-installer.ts` — install, import, update, and uninstall operations


## Inline skill mentions

Type `$` in the TUI, WebUI, or SimpleUI composer to search installed skills by
name or description. Use Up/Down and Enter/Tab to insert a selection; the browser
menus also support clicking. Selecting a skill does not send the draft. Escape
dismisses the menu and leaves the text intact.

Examples:

```text
$code-review Review the current changes.
$code-review $testing Review this module and add regression coverage.
```

The shared runtime recognizes the names against the installed catalog and tells
the agent to load the selected instructions before using them. This works
without enabling the automatic skill recommender. Unknown skill names are
reported as unavailable; mentions do not grant additional tool permissions.
Prompt refinement preserves the selected tokens.

Inline/fenced code and escaped dollar signs are literal: `\$testing` and code
examples do not select a skill. Uppercase shell variables such as `$HOME` and
scoped variables such as `$env:PATH` are not skill mentions. For ordinary shell
snippets containing lowercase dollar variables, use backticks or a code block.
The long form `/skill use <name> <task>` remains available in CLI/TUI.
