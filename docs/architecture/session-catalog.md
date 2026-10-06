# Session catalog and presence

The per-project Session Catalog daemon owns catalog/index mutations, live
presence, ownership leases, resume reservations and maintenance admission.
Each active session host owns its append-only transcript writer; the catalog
daemon does not serialize every transcript event.

| Boundary | Source |
|---|---|
| IPC operations, credentials, defaults and events | [`protocol.ts`](../../packages/core/src/session-catalog/protocol.ts) |
| Daemon startup and client requests | [`client.ts`](../../packages/core/src/session-catalog/client.ts), [`project-server.ts`](../../packages/core/src/session-catalog/project-server.ts) |
| SQLite catalog owner | [`store.ts`](../../packages/core/src/session-catalog/store.ts), [`store-schema.ts`](../../packages/core/src/session-catalog/store-schema.ts) |
| Presence registry | [`session-registry.ts`](../../packages/core/src/session-catalog/session-registry.ts) |

Session leases exclude a second owner of the same session. Resume reservations
coordinate claiming, and maintenance leases guard destructive catalog work.
Protocol defaults are 30 seconds for a session lease and 15 seconds for a resume
reservation; the store bounds supplied durations. Live presence is different
from saved transcript history, so a disconnected surface refreshes the catalog
rather than assuming it saw every event.

The schema also tracks agent metadata and transcript content hashes, plus hot
and cold storage metadata. Additive schema repair does not itself imply a
breaking schema-version bump. Read the schema/store owners before changing
storage layout or rebuilding derived indexes.

See [project daemons](../project-daemons.md), [session journal](session-journal.md)
and [project goals](project-goals.md). The original completed rollout plan is
[archived](../archive/plans/session-catalog-project-service-2026-08.md).
