# Runtime and project-service subcommands

These keys are registered in
[`subcommands/index.ts`](../../packages/cli/src/subcommands/index.ts). The
[source-derived catalog](../current-catalog.md#shell-subcommands) lists all
keys and owners. Source usage blocks define the complete flag sets.

These are condensed summaries. Detailed use, flags, persistence and failure
behavior are in [remote](remote.md), [config transfer](config-transfer.md),
[Chronicle](chronicle.md), [SAGE](sage.md), [governance](governance.md),
[permissions](permissions.md), [proxy status](proxy-status.md),
[Jev](typesafe.md) and [skill evaluation](skill-suggest.md).

## Remote

`wstack remote user@host:/path --open` runs the runtime, tools and daemons on
the remote machine and tunnels its WebUI through system SSH. SSH configuration,
agent and known hosts apply; local provider configuration is not copied.
`ssh://user@host:port/path` selects a port. `--keep` leaves the remote runtime
running after disconnect; `--ssh-config` selects a config file and
`--remote-binary` selects an explicit build. Source:
[`remote.ts`](../../packages/cli/src/subcommands/handlers/remote.ts).

## Config transfer

`wstack config-export` writes `wstack-config.json` in the working directory.
`wstack config-import` applies recognized behavior settings to the active
profile under its lock, with backup and atomic persistence. Credentials,
fallback routing and unknown fields are excluded. Source:
[`config-transfer.ts`](../../packages/cli/src/subcommands/handlers/config-transfer.ts).

## Chronicle

`wstack chronicle` supports `query`, `status`, `facet`, `metrics`, `prune` and
`compact`. Queries accept `field=value` filters. Metrics select `providers`,
`tasks`, `files` or `summary`. `prune --days N --dry-run` previews retention;
`compact` requires the daemon to be stopped. Source:
[`chronicle.ts`](../../packages/cli/src/subcommands/handlers/chronicle.ts).
See [Chronicle ownership](../chronicle-architecture.md).

## SAGE

`wstack sage connect <client|all>` writes external-agent MCP setup; `--dry-run`
previews changes and `connect print` emits snippets. `disconnect` removes the
integration. `sage mcp --origin <name>` attaches to an existing project daemon
and never starts it. External clients receive read tools and candidate
proposals requiring WrongStack review; host-only vector fusion is excluded.
`sage sync` uses the separate sync handler. Sources:
[`sage.ts`](../../packages/cli/src/subcommands/handlers/sage.ts),
[`sage-sync.ts`](../../packages/cli/src/subcommands/handlers/sage-sync.ts).

## Governance

`wstack governance status [--json]` reads daemon operator status. Signals are
advisory and do not stop tasks or model execution. Unavailable status returns
exit 1. Source:
[`governance.ts`](../../packages/cli/src/subcommands/handlers/governance.ts).

## Diagnostics and permissions

`wstack proxy-status` reports the optional WrongProxy route through the
[`diagnostic handler`](../../packages/cli/src/subcommands/handlers/diag-doctor.ts).
`wstack permissions rules [--json]` lists rules;
`permissions explain <tool> --input '<json>' [--json]` explains a decision
without executing the tool or modifying trust/session state. Source:
[`permissions.ts`](../../packages/cli/src/subcommands/handlers/permissions.ts).
The live session counterpart is `/permissions`.

## Skill and decision diagnostics

`wstack skill-suggest "<request>"` previews routing; `--eval <file.jsonl>` and
`--sweep` evaluate labeled requests. They send request text to the configured
Jev route and can incur service cost. Source:
[`skill-suggest.ts`](../../packages/cli/src/subcommands/handlers/skill-suggest.ts).

`wstack typesafe` manages Jev account/status and diagnostics, including `on`,
`off`, `login`, `test`, `lint-conventions`, `check-judgments` and topic/memory/Brain
replay commands. Live diagnostics can call models. Source:
[`typesafe.ts`](../../packages/cli/src/subcommands/handlers/typesafe.ts).
See [Jev settings and activity](../jev-settings-and-activity.md).
