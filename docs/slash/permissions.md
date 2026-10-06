# `/permissions` — Explain decisions and session rules

The slash command inspects the active session's permission policy and can add
temporary allow/deny rules. Rules are stored in session state, not the profile
or project trust file.

| Command | Effect |
|---|---|
| `/permissions`, `/permissions list` | List session rules |
| `/permissions rules` | Show compiled policy order and current YOLO state |
| `/permissions explain <tool> [JSON]` | Explain a call without executing it |
| `/permissions allow <tool> [pattern]` | Add a session allow rule |
| `/permissions deny <tool> [pattern]` | Add a session deny rule |
| `/permissions remove <n>` | Remove a one-based listed rule |
| `/permissions clear` | Remove all session overrides |

```text
/permissions explain read {"path":"README.md"}
/permissions deny write
/permissions list
/permissions remove 1
```

An exact tool name must be registered; a tool glob can target tools loaded
later. Duplicate rules are not added again. Explanation refuses unknown tools
or malformed JSON and does not ask for approval or mutate trust.

Allow rules do not grant unrestricted authority: destructive calls, credential
reads and higher-priority policy boundaries still apply. Under `--restricted`,
session allow rules are not honored; deny rules still apply. Use the compiled
rule view to assess precedence instead of inferring it from rule insertion order.

The shell equivalent, [wstack permissions](../subcommands/permissions.md),
builds a fresh-session view and cannot see this session's temporary answers.
Source: [`permissions.ts`](../../packages/cli/src/slash-commands/permissions.ts).
See [YOLO](yolo.md) and [read-only mode](../readonly-mode.md).
