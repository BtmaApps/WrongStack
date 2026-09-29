# SAGE ownership

`@wrongstack/sage` is the implementation owner for WrongStack memory
backends. Hosts depend on Core's `MemoryPort`; they do not construct or inspect a
concrete store.

## Supported composition

- `createProjectSageMemoryPort(...)` is the production default. It connects
  every CLI, TUI, ACP, and WebUI host for a canonical project to one detached
  project server. That server is the only process that owns the SQLite
  connection, mutation queue, counters, and automatic hygiene throttle.
  Linked Git worktrees resolve to the main checkout identity and share it.
- `createSqliteMemoryPort(...)` is reserved for tests and explicit offline
  recovery (`WRONGSTACK_SAGE_INLINE=1`).
- `LegacyMemoryPortAdapter` wraps third-party or historical `MemoryStore`
  implementations.
- Optional retrieval and administration features are obtained with
  `getSageRetrieval(...)`, `getSageService(...)`, or
  `getSageSurface(...)`.

## HQ project memory synchronization

An enabled HQ connection automatically replicates `project`, `file`, and `symbol`
memories to HQ and every connected client with the same HQ project ID. The committed
`.wrongstack/project.json` is the preferred identity across machines; inspect it with
`wstack project id`. User/session memories, review candidates, audit logs, and local
retrieval counters are not replicated.

The CLI bridge polls a constant-size change clock on the project's SAGE owner through
authenticated IPC every three seconds. Acknowledged, unchanged stores are not scanned
again; writes from MCP and other local hosts advance the clock. HQ persists memory
records before fanout and restores them on client connection. Unacknowledged changes
are retried; reconnect re-announces local state. Disabling HQ stops the bridge.

For headless synchronization without a chat session, run `wstack sage sync` in the
project. It shares the configured `Sage.storage.directory`, including custom paths.
After upgrading, `wstack sage sync --restart-service` explicitly restarts only that
project's SAGE owner before starting the bridge; open CLI sessions are left running.
Stop the bridge with Ctrl+C. Ordinary `sage sync` never restarts an existing owner.

SQLite tracks logical revisions and durable tombstones, including physical removals.
Concurrent offline edits resolve by logical revision, deletion precedence, then a
stable change nonce; wall-clock time does not choose the winner. Imports preserve IDs
and revision state and rebuild the memory's derived graph edges. Missing records in
a partial snapshot are never interpreted as deletions. Tombstones are retained to
prevent old offline clients from resurrecting removed records.

As with Kanban project state, text survives the telemetry summary policy; HQ secret
scrubbing and path redaction still apply. Frames are chunked below 512 KiB and individual
records are capped at 256 KiB. An invalid/oversized record emits a warning while other
records continue syncing. Initial transfers wait for each chunk to flush before sending
the next, so large corpora do not exceed the socket queue limit. A receiver stalled for
10 seconds is disconnected and can reconnect to reconcile again.
All participants need the updated HQ/client/SAGE builds;
restart older SAGE owners explicitly after upgrading. Running sessions are not restarted
automatically.

## Internal boundaries

- `memory-port.ts`: host-facing lifecycle, adapters, and typed capabilities
- `project-server.ts`: single per-project SQLite owner and request dispatcher
- `project-server-client.ts` / `remote-memory-port.ts`: reconnecting IPC client
  and transparent `MemoryPort`/SAGE capability proxies
- `sqlite-store.ts`: persistence and migration implementation
- `store-helpers.ts`: canonical validation, normalization, and index helpers
- `retrieval/`: ranking and rendering helpers
- `host-wiring.ts`: shared `setupSage()` for CLI and WebUI — tool/turn inject,
  domain-term extract, context monitor, opt-in outcome capture, path-remap on
  rename commands, session-end commit extract, optional daily dry-run, and
  throttled full-option hygiene teardown
- `middleware/`: injection, turn, and tool-call policies; the injector emits
  per-memory rejection evidence (`rejectedDetail`) and a rolling-window
  `injector_rejection_burst` event when a memory is repeatedly rejected by
  the `belowScore` gate, so triage can fold fresh rejection signals into
  `value-score` without scanning the chronicle
- `triage/`: the 5-phase memory lifecycle pipeline — pre-filter (deterministic
  KEEP/DISCARD/UNCERTAIN), value-score (anchor + usage + freshness +
  quality + persistence, with optional `injectorEvidence`), llm-evaluator
  (appends a bounded `REJ:` line to its prompt when rejection pressure is
  observed), action-dispatcher (auto-applies or proposes; one computed
  path lowers `importance` when a memory is repeatedly rejected by the
  `belowScore` gate — never crossing the 0.9 user-designated floor), and
  `orchestrator.ts` which wires them and accepts an optional
  `injectorEvidenceProvider` per run
- `anchors/`, `embeddings/`, and `tools/`: focused feature adapters

Shared text normalization is owned by `store-helpers.ts`. Middleware may depend
on it directly; it must not import another middleware merely to reuse helpers.

## Verification

`tests/memory-port.test.ts` runs the same lifecycle and query contract against
SQLite and the legacy adapter. Consumer-boundary rules live in
`packages/core/tests/architecture/memory-port-boundary.test.ts`. Triage
tests cover the value-score, llm-evaluator, and action-dispatcher behavior
in `packages/sage/tests/triage/`; the injector's per-memory rejection
accounting is covered in
`packages/sage/tests/middleware/tool-call-memory-rejected-detail.test.ts`.
