# /plugin — Plugin Manager

Alias: `/plugins`.

## What it does

Manages the lifecycle of installed plugins via the `onPlugin` callback. Delegates to the plugin management subsystem in `packages/cli/src/plugin-management.ts`.

## Subcommands

| Usage | Effect |
|---|---|
| `/plugin` | List configured plugins |
| `/plugin status` | Same as list |
| `/plugin menu` | Open the TUI plugin picker when available; otherwise show the audit report |
| `/plugin report` | Show effective state, risk, and lock/toggle policy for built-in plugin rows |
| `/plugin official` | List official bundled plugins and their aliases |
| `/plugin install <alias\|package>` | Add and enable a plugin |
| `/plugin add <alias\|package>` | Alias for install |
| `/plugin enable <alias\|package>` | Enable a configured plugin |
| `/plugin disable <alias\|package>` | Disable a configured plugin |
| `/plugin toggle <name>` | Toggle a safe audit-list plugin row |
| `/plugin remove <alias\|package>` | Remove from config |

## Official plugin aliases

| Alias | Plugin |
|---|---|
| `telegram` | `@wrongstack/telegram` — Telegram bridge |
| `lsp` | `@wrongstack/plug-lsp` — LSP-backed tools |

Install with: `wstack plugin install telegram`

## Code reference

- `packages/cli/src/slash-commands/plugin.ts` — slash command wrapper
- `packages/cli/src/plugin-management.ts` — actual logic
- `packages/core/src/plugin/loader.ts` — plugin loading
- `packages/contracts/src/types/plugin.ts` — Plugin interface
- `docs/plugin-management.md`
