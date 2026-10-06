# `wstack sage` — External-agent memory and HQ sync

Attach another coding agent to the SAGE memory of the current project. Supported
setup targets are `claude-code`, `codex`, `cursor` and `antigravity`.

```bash
wstack sage connect codex --dry-run
wstack sage connect codex
wstack sage connect print
wstack sage disconnect codex --dry-run
```

| Form | Purpose |
|---|---|
| `connect <client\|all> [--dry-run] [--command <path>]` | Plan/write client MCP setup |
| `connect print` | Emit setup snippets for another MCP client |
| `disconnect <client\|all> [--dry-run]` | Plan/remove the managed integration |
| `mcp [--origin <name>]` | Run the stdio facade configured in the other client |
| `sync [--restart-service]` | Run a memory-only HQ sync bridge |

Use the dry-run output to inspect the destination files and launcher. An
explicit `--command` chooses the installed WrongStack executable. The stdio
facade attaches to an already running project SAGE daemon and never starts
one: keep WrongStack open for that project while the external agent uses it.

External tools include `memory_search`, `memory_for_file`, `memory_for_path`,
`memory_graph`, and `memory_candidates` with list/propose operations. Proposals
require WrongStack review; external clients do not receive the host's vector
fusion or direct structured-memory mutation authority.

`sage sync` is a different workflow. It requires enabled HQ configuration,
publishes memory synchronization with automatic reconnect, and stays alive
until Ctrl+C. `--restart-service` first requests a SAGE shutdown to upgrade the
active service; a refused restart returns an error. It does not establish a
session's Kanban synchronization owner.

Sources: [`sage.ts`](../../packages/cli/src/subcommands/handlers/sage.ts),
[`sage-connect.ts`](../../packages/cli/src/sage-connect.ts),
[`sage-sync.ts`](../../packages/cli/src/subcommands/handlers/sage-sync.ts).
See [SAGE retrieval](../sage/retrieval.md) and [HQ](../hq.md).
