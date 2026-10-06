# `/jev` — Decision account and feature controls

Alias: `/typesafe`. Jev is an auxiliary decision service, separate from the
chat provider selected by `/auth`. It is disabled by default and changes are
saved to the active profile.

| Command | Effect |
|---|---|
| `/jev`, `/jev status` | Account, enablement, feature readiness and logging state |
| `/jev on`, `/jev off` | Enable/disable all requests while retaining keys and feature choices |
| `/jev login typesafe\|openrouter\|custom` | Add/replace a key through the masked account flow |
| `/jev route typesafe\|openrouter` | Switch route, clearing the old route's key/model/endpoint |
| `/jev endpoint <url>` | Set a custom endpoint before custom login |
| `/jev model <id>\|default` | Pin/reset the decision model |
| `/jev timeout <ms>` | Set the request deadline |
| `/jev feature <name> on\|off` | Enable/disable one consumer |
| `/jev compaction hybrid\|intelligent\|selective` | Set profile compaction strategy |
| `/jev recall on\|off` | Configure the SAGE turn-context recall dependency |
| `/jev test` | Send one billed connection probe |
| `/jev check` | Run the billed synthetic feature checks |
| `/jev logs [feature]` | Recent activity in this process and the disk-log path |
| `/jev logcontent on\|off` | Enable/disable full request/response content on disk |
| `/jev remove-key` | Remove the profile key; an environment key may still apply |

Run `/jev status` to inspect readiness, `/jev help` for the accepted feature
names, and `/jev logs` to distinguish configured readiness from observed use.
The log view shows metadata; full content, when enabled, is in the log file.
Restart existing sessions to apply settings to every consumer.

Source: [`jev.ts`](../../packages/cli/src/slash-commands/jev.ts).
See [settings and activity](../jev-settings-and-activity.md),
[account ownership](../typesafe-account.md) and
[shell diagnostics](../subcommands/typesafe.md).
