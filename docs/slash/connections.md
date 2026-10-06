# `/connections` — Project service health

TUI command; aliases `/conn` and `/conns`.

| Command | Effect |
|---|---|
| `/connections`, `/connections open` | Open the health/restart panel |
| `/connections restart` | Restart supported daemons sequentially and report each result |

Health includes Session Catalog, Chronicle, Codebase Index, SAGE, Kanban,
Mailbox and Governance. Restart covers the first six. Governance is read only
and is explicitly skipped. The operation needs an active project and refuses
a second concurrent restart through the same command instance.

A partial restart reports `OK`/`FAILED` per service and the successful count;
it is not an all-or-nothing transaction. The panel is a TUI capability and can
be unavailable in a host that has not mounted it. Use `wstack doctor --daemons`
for shell diagnostics.

Sources: [`connections-slash.ts`](../../packages/tui/src/connections-slash.ts),
[`connection-actions.ts`](../../packages/tui/src/connection-actions.ts).
See [project daemon recovery](../project-daemons.md) and
[governance status](../subcommands/governance.md).
