# `/cron` — Session cron monitor

In the TUI, bare `/cron` opens the live cron monitor. `/cron list` uses the
registered cron list handler, backed by the plugin's `cron_list` tool. Missing
plugin state is reported as unavailable rather than an empty successful list.

The list contains job name, action, enabled state, interval, last/next run,
run count and overdue status, plus the concurrency limit. The shared loader
uses a five-second deadline. The slash view reads jobs; scheduling and removal
use the `cron_schedule` and `cron_cancel` plugin tools.

Cron is an opt-in plugin and its scheduling/iteration hooks live with the
current host. For jobs that survive sessions, use
[persistent automation](../subcommands/automation.md). Opening a cron monitor
does not make a session job durable.

Sources: [`cron-slash.ts`](../../packages/tui/src/cron-slash.ts),
[`resource overrides`](../../packages/tui/src/hooks/use-resource-slash-commands.ts),
[`cron plugin`](../../packages/plugins/src/cron/index.ts).
See [plugin enablement](plugin.md).
