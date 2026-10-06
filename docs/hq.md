# HQ architecture and navigation

HQ is the cross-machine command center served by `wstack --hq` (or `wstack hq`).
The browser application in `packages/webui-hq` is distinct from the project
WebUI. The CLI server composes Core HQ state, authentication, publishers,
browser snapshots and commands.

| Owner | Source |
|---|---|
| Server entry | [`hq-server.ts`](../packages/cli/src/hq-server.ts) |
| Wire contracts and publishers | [`packages/core/src/hq/`](../packages/core/src/hq/) |
| View/navigation registry | [`views.ts`](../packages/webui-hq/src/components/hq/views.ts) |
| Browser transport | [`hq-socket.ts`](../packages/webui-hq/src/data/transport/hq-socket.ts) |
| Browser store | [`data/store/`](../packages/webui-hq/src/data/store/) |
| Alerts and persisted rule settings | [`alerts.ts`](../packages/core/src/hq/alerts.ts), [`alerts-config.ts`](../packages/core/src/hq/alerts-config.ts) |

Use the view registry for the current navigation and keyboard routes. Browser
views project live fleet, transcripts, Kanban, mailbox, approvals, Brain and
operational data; they do not independently own project databases. Published
snapshots and command outcomes carry host/session identity. Dropped live events
or disconnected hosts require refresh and must not be treated as complete
transcript evidence.

For startup, authentication, token management and operator commands, use the
[HQ command reference](subcommands/hq.md). For Linux service installation, use
[the service guide](hq-service.md); for agent telemetry, use
[agent monitoring](agent-monitoring.md).

Completed June–August plans live in the archive. The
[September RFC](plans/hq-improvements-2026-09.md) retains deferred proposals.
The [inspector design](designs/inspector-slots.md) describes proposed scaffolding;
its missing files are not current runtime modules.
