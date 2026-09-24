# Codebase Index Service

WrongStack runs one detached index server for each resolved local index
directory. TUI, CLI, WebUI, tool calls, and Code Atlas graph queries share that
process and its SQLite index.

## Lifecycle

- The IPC endpoint is deterministic: a Windows named pipe or a Unix-domain
  socket derived from the resolved index directory.
- The first client that cannot connect starts a detached server. Concurrent
  starters are elected by the operating system's exclusive socket bind; losing
  candidates exit.
- Clients disconnect independently. The server remains available for other
  clients, then exits after five idle minutes by default.
- `WRONGSTACK_INDEX_SERVER_IDLE_MS` changes the idle timeout.
- `WRONGSTACK_INDEX_INLINE=1` or `WRONGSTACK_INDEX_SERVER=0` disables the
  detached service and retains the worker/inline fallback.

## Transport

The default wire framing is newline-delimited JSON (NDJSON). The server also
speaks a binary framing — `[0x57][uint32 BE length][MessagePack payload]` —
read per frame by sniffing the first byte, never by a latched mode: the
reader accepts JSON and binary frames interleaved on the same socket, so a
JSON broadcast between binary responses cannot desynchronize it. The server
advertises the capability as `binarySupported` in its `hello` frame and
answers each request in the framing it arrived in; note that the server's
**outbound** framing latches to binary after the first binary request on a
connection (later JSON-framed requests still get binary responses) — the
per-frame sniffing applies to inbound traffic on both sides.

Client adoption is **opt-in** via `WRONGSTACK_INDEX_BINARY=1`. The default
stays NDJSON because the measured trade-off is poor: on a Windows named pipe
(2026-08 benchmark, 100-result search response) MessagePack frames were 8.3%
smaller but ~1.9× slower round-trip — V8's native `JSON.stringify`/`parse`
beats the pure-JavaScript msgpack codec roughly 3:1, and the wire savings do
not recover the codec cost. The capability is kept for runtimes or payloads
where that balance flips.

Frame ceilings protect both sides, and the caps are split by direction —
deliberately, not by omission: JSON frames are capped at 64 Mi characters;
binary frames at 256 MiB on the client's reader (`MAX_BINARY_FRAME_BYTES`
— responses are the big direction) and a tighter 64 Mi inbound bound for
requests (`MAX_INBOUND_BINARY_FRAME_BYTES`, matching the JSON request
ceiling — requests are small by construction and readable before the auth
check). The two binary constants are intentionally separate: unifying
them would either widen the server's unauthenticated write surface or
make the client reject legitimate large responses. Oversized requests
are rejected from the 5-byte header
before the server waits on or accumulates the declared payload. A garbage or
oversized frame destroys the socket. MessagePack normalizes `undefined` away
before encoding (`nil` would arrive as `null` and change payload shape
between framings), and the search readers treat a `null` filter field as
absent.

## Concurrency

- Read operations may run concurrently.
- SQLite writes are serialized through one server-owned queue.
- Idle-time WAL maintenance: after every write run the daemon arms a sliding
  30s idle timer (override with `WRONGSTACK_INDEX_WAL_IDLE_MS`). When it fires
  — and no reader holds the WAL — the server checkpoints and truncates
  `index.db-wal`, and every 8th fire runs `PRAGMA optimize` to refresh planner
  statistics. Maintenance timers are unref'd, so they never delay the
  daemon's own idle exit.
- Identical unforced full-index requests share one active indexing job and
  receive the same progress stream.
- External file watching is owned and debounced by the server, so opening more
  clients does not multiply project watchers. Ownership is tracked per client;
  the last owner disconnecting closes the watcher and clears its debounce
  timers and pending-file sets.

## Cost is proportional to change

Every index run records what it changed — files re-parsed, added, deleted —
and everything after the parse scales with that, not with the repository:

- **Relation pass** (`relation-pass.ts`): a rewritten file re-resolves only its
  own imports; an added file also retries every still-unresolved import (so
  `import './b'` written before `b.ts` existed resolves the moment it appears,
  even from a watcher run that only names `b.ts`); a deleted file re-resolves
  its importers. Package labels are written as a diff, and only for new files
  unless the detected module structure changed. The structure is cached per
  store behind a `relation_epoch` metadata key any writer bumps, and a full
  project run always re-detects it (non-indexed markers such as `go.mod` reach
  no watcher). `module_resolution_version` forces one full pass when the
  resolver changes.
- **Ranks** recompute once 25 files have changed since the last pass
  (`rank_stale_files`, accumulated across runs), never for a run that changed
  nothing.
- **Git trust is per file.** `files.git_blob` holds the staged blob (bound to
  the row's content hash) a completed full run saw the file clean at. A later
  full run skips — no stat, no read — every file Git still reports clean at
  that blob, so an edit elsewhere or a branch switch re-reads only what moved.
  Any rewrite clears the stamp, so an edit-then-revert made while no watcher
  ran is re-read. Discovery is one `git ls-files -t -s -m -d -o` process
  (spawns block the event loop for hundreds of milliseconds on Windows); the
  end-of-run re-listing that guards against edits racing the run only happens
  when the run writes a new stamp.
- **Generations.** A run reports `contentChanged: false` when it left every
  row, edge and rank as it found them — typically the watcher's echo of an edit
  a tool already indexed. The server then keeps its generation, so query caches
  stay valid and clients (WebUI Code Map, TUI) do not refetch. Content caches
  key on the `graph_stamp` metadata, which moves only with rows or edges.

Measured on this repository (9.6k files, 74k symbols, 270k refs; three
processes each, see `PERF_LOG.md`): a full run over an unchanged checkout
5.4 s → 0.7 s, a one-file edit ~470 → ~90 ms, the watcher echo ~400 → 2 ms, and a cold full index 82 s → 46 s.

## What a ref points at

Name resolution (`writer-refs.ts`) gives a ref the lowest symbol id declaring
its name in the language family — a guess. For the JS family
`ref-binding-pass.ts` then binds each ref from what its own file says, after
the relation pass has resolved import targets:

1. a top-level declaration of the name in the same file;
2. the file's import of the name, followed into the resolved module and
   through `export { X } from` / `export * from` up to four files — `to_id` is
   that declaration, `to_file` its file;
3. an import from outside the index (`vitest`, `node:path`, an unresolved
   relative path) — bound to nothing: `to_id` NULL, `to_file` `''`;
4. otherwise the name guess stands (globals, ambient declarations, aliased
   and namespace imports).

The name resolvers skip `to_file = ''` refs and JS import refs (whose `to_id`
is the export this pass found), and the incoming-calls name fallback skips
both. A run rebinds only what it can have changed: every ref of a re-parsed
file, and elsewhere the refs named like one that pointed (`to_file`) into a
changed file, captured before the relation pass clears it.
`ref_binding_version` forces one whole-index rebind (≈1.3 s here).

Refs hang off symbols, so a file that declares nothing — a test file of
`describe`/`it` blocks, a barrel of re-exports, an entry script — owns its
refs through one synthetic `mod` symbol named `<module>` (`MODULE_OWNER_NAME`).
It has no search text and is never reported as dead code; before it existed,
a tenth of this repository's files contributed no imports or calls, and
re-export chains broke at every pure barrel. `module_owner_version` re-parses
an older index's symbol-less files once.

## Reads during a refresh

While an index refresh is publishing, reads are served from the previous
generation's query caches instead of failing, and the response carries
`stale: true` so callers know the answer predates the run in flight. This
applies to `search`, `packageGraph`, `fileGraph`, `symbolGraph`,
`incomingCalls`, and `outgoingCalls`. A read with no cached answer still fails
with `IndexRefreshInProgressError`: read operations share the server's single
pooled SQLite connection with the in-flight write transaction, so loading
fresh mid-run would read uncommitted rows. `stats` always refuses during a
refresh — it is the progress poll, and a cached pre-run answer would read as
"finished" with old numbers.

The `stale` flag is additive on the wire (`SearchOpResult`,
`IncomingCallsResult`, `OutgoingCallsResult`, and graph results). The read
tools (`codebase-search`, `codebase-incoming-calls`, `codebase-outgoing-calls`)
attempt the query during a refresh rather than refusing upfront, surface
`stale` on their output, and degrade a cache-miss refusal to an advisory
status. The worker/inline fallback path (no server-side cache layer) still
refuses reads for the whole refresh.

Cache preservation across runs: a targeted run (an explicit file list —
per-edit and watcher reindexes, not forced) keeps the query caches on both
success and failure; anything that can reshape the whole index (full scans,
`force` rebuilds, `langs`/`ignore`-filtered runs) clears them on completion
and on failure alike. Preserved entries are generation-tagged, so idle reads
never see them — they only surface, flagged `stale`, inside the next
refresh's window, and only while they lag the publishing generation by at
most two completions (`MAX_STALE_GENERATION_LAG`); an older entry is refused
like a cache miss rather than served as an increasingly outdated answer.

## Vector layer (P4.11)

The 384-dim char-trigram embedding layer is **opt-in** via
`WRONGSTACK_INDEX_VECTORS=1`; the default is off. Measured on a 3000-symbol
corpus (2026-08): recall@10 and MRR are identical with the layer off — the
trigram embedding duplicated the FTS5 trigram tokenizer's lexical ranking —
while the index database is ~55% smaller and full indexing ~2.2× faster.
Opening a legacy database with the gate off drops `symbol_vectors` (its pages
return to the free list); re-enabling plus a force reindex repopulates it.
The RRF fusion path in `searchRanked` remains available when the gate is on.

## Health and control

Clients heartbeat every ten seconds. One missed heartbeat is `degraded`; three
consecutive misses are `unresponsive`. Any valid server message recovers the
connection without killing a possibly busy indexing job.

The server also applies a 45-second client lease. Any request or heartbeat
renews it. A socket that remains open but sends no heartbeat is treated as a
ghost client and disconnected; when that was the final client, the normal idle
shutdown countdown starts. `WRONGSTACK_INDEX_SERVER_CLIENT_LEASE_MS` changes
the lease and `WRONGSTACK_INDEX_SERVER_IDLE_MS` changes the idle shutdown
delay.

Health snapshots include:

- round-trip latency and missed heartbeat count;
- server uptime, RSS, heap, and external memory;
- connected clients and active requests;
- active and queued writes;
- pending watcher files and current indexing activity.

The TUI status chip shows the connection state and its detail panel shows the
full snapshot. WebUI's `/debug/system` payload exposes the cached server state.
Library users can call `checkCodebaseIndexServerHealth`.

`shutdownCodebaseIndexServer` stops the project server for every client. WebUI
also exposes the privileged `codebase.index.server.shutdown` WebSocket action;
it goes through the normal authorization boundary before shutdown. The WebUI
client correlates the result by request id and never queues this destructive
action for replay after a disconnected session.

## Parser architecture

Symbols are extracted by per-language parser modules loaded lazily by
`parser-dispatch.ts`. Each parser is a standalone module imported only when a
file of its language is encountered — the TypeScript compiler API, for instance,
is never loaded for a Go-only project.

Parser worker threads (`parser-worker-pool.ts`, `parser-worker-script.ts`)
parallelize bulk parsing: when a run holds at least 500 candidate files on a
non-frugal perf profile — the default threshold, overridable via
`WRONGSTACK_INDEX_WORKER_THRESHOLD` (`0` disables the worker path entirely;
unparsable or negative values fall back to the 500 default) — file contents,
already read on the main thread for the content-hash check, are distributed
across up to four worker threads
(cores − 1, clamped) that parse without touching SQLite; all writes stay on
the server thread through one `commitBatch` transaction per outer batch.
Smaller runs, frugal profiles, a `0` threshold, and pool-spawn failures fall
back to inline parsing on the server's event loop, which is already off every
client's main thread.

## Compatibility and recovery

The protocol begins with a versioned handshake. Health payloads are validated at
runtime; a server from an older compatible build may still be reported healthy
without process metrics. Stale Unix sockets and metadata are replaced only
after a direct connection fails, and metadata is removed only by its owning
process. IPC frames are bounded in both framings — 64 Mi characters for
NDJSON, the header-checked binary caps described under Transport — so a
malformed or runaway peer cannot grow an input buffer without bound.
