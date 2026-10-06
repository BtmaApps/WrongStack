# `wstack governance` — Advisory service status

```bash
wstack governance status
wstack governance status --json
```

Bare `wstack governance` also selects `status`. The command reads the current
project daemon's local status capability. It does not evaluate a task or alter
governance policy.

The text view reports daemon identity, attachment broker health, operator
signal/code/action, and available consecutive-failure, pending-revocation and
audit-persistence fields. Signals are advisory: the command does not stop
active tasks or model requests. JSON exposes the structured availability
result rather than converting an unavailable service into a successful empty
status.

Available status returns 0; unavailable service or an unknown action returns
1. Use the reported availability code/reason to investigate the daemon or
configuration. Governance is excluded from the TUI's bulk daemon restart.

Source: [`governance.ts`](../../packages/cli/src/subcommands/handlers/governance.ts).
See [project daemons](../project-daemons.md) and
[TUI connection controls](../slash/connections.md).
