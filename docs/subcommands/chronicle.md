# `wstack chronicle` — Recorded events and metrics

Query the current project's cross-session event/provenance ledger. Event
queries and derived metrics are different views; neither proves the outcome
of activity that was never recorded.

```bash
wstack chronicle status
wstack chronicle query eventType=tool.executed limit=20 order=desc
wstack chronicle query path=src/app.ts line=42
wstack chronicle query providerId=openai outcome=failure
wstack chronicle facet modelId
wstack chronicle metrics providers
wstack chronicle metrics files path=src/app.ts
```

| Action | Output |
|---|---|
| `query [field=value ...]` | Recorded event query; default action |
| `status` | Owner/mode, pipeline, storage, journal and watcher health |
| `facet <field> [filters]` | Distinct/grouped event fields |
| `metrics [providers\|tasks\|files\|summary] [filters]` | Derived aggregates; default summary |
| `prune [--days N] [--dry-run]` | Retention purge or preview; default 30 days |
| `compact` | Offline SQLite compaction; the daemon must be stopped first |

Filters include time range (`from`, `to`), project/session/agent/task,
provider/model, trace/request/attempt/tool-call/resource identity, path, line,
text, cursor and limit. `eventType` and `outcome` accept comma-separated values.
`tag.<name>` matches tags; `attr.<name>` parses its value as JSON when possible.
Unknown filter keys are ignored, so use the documented keys deliberately.
Facet fields are restricted by the handler's allowlist.

Preview retention before applying it:

```bash
wstack chronicle prune --days 7 --dry-run
```

Retention requires a positive integer. Purge reports per-entry errors and
returns exit 1 when any occur. A daemon or query failure also produces an error;
compaction directly owns its offline maintenance boundary. Metrics may ingest
new journal data into the derived database before returning.

Source: [`chronicle.ts`](../../packages/cli/src/subcommands/handlers/chronicle.ts).
See [Chronicle ownership](../chronicle-architecture.md) and
[session event recording](../session-logging-events.md).
