# MCP protocol conformance

**Modern transport work checked against the published spec: 2026-10-22.**
Source of truth: <https://modelcontextprotocol.io/specification/latest> and the
[deprecated features registry](https://modelcontextprotocol.io/specification/2026-07-28/deprecated).
The modern versioning, discovery, stdio and Streamable HTTP contracts were
refreshed on that date. Historical feature notes below retain their own dates.
Implemented capabilities and remaining gaps are described below.

## Short answer

The client and server now implement modern `2026-07-28` core request flows over
stdio and Streamable HTTP, alongside the existing `2024-11-05` handshake path.
This is not a claim of full conformance or support for every optional extension.
Modern clients advertise form/URL elicitation only when a host handler is installed.
MRTR interactions use the existing user-input surface and the originating call's
requester. Modern tool calls can also follow Tasks from servers advertising that
extension. Sampling, roots and MCP Apps are not advertised or silently executed.

`SUPPORTED_PROTOCOL_VERSIONS` in `constants.ts` describes handshake revisions
only. `MODERN_PROTOCOL_VERSION` and the per-request envelope live separately in
`modern-protocol.ts`; adding a modern version to `initialize` would be wrong.

## What changed in 2026-07-28 (the reason this is not just "a few versions behind")

The current revision replaced the `initialize` handshake with a different model:

- every request declares its version in `_meta` under `io.modelcontextprotocol/protocolVersion`,
  and the server accepts or rejects each request independently;
- `server/discover` is a **mandatory** RPC returning supported versions, capabilities and identity;
- a version mismatch is answered with `UnsupportedProtocolVersionError` listing supported versions.

These flows are now implemented. Auto mode probes with `server/discover` before
initialization. A non-modern stdio error or bounded probe timeout selects the
legacy path. HTTP examines the error body before falling back on 400/404/405;
recognized modern errors never cause a downgrade. Modern requests include the
version, identity and capabilities in `_meta`, validate `resultType`, and neither
mint nor echo protocol session IDs. Server-initiated requests are ignored on
modern connections; HTTP cancellation closes the originating request.

HTTP mirrors `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name` and annotated
`Mcp-Param-*` values, including nested primitive parameters and Base64 sentinels.
Invalid header annotations are excluded from modern HTTP tool catalogs. Our
server validates header/body consistency before dispatch and returns protocol
errors for mismatches and unsupported revisions. Independent HTTP requests have
separate cancellation scopes even when their JSON-RPC IDs coincide.

Set a server's `protocolMode` to `"legacy"` to explicitly select its older
handshake behavior without a modern probe. The default is `"auto"`. Deprecated
HTTP+SSE stays on the legacy path. See the published
[versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning),
[discovery](https://modelcontextprotocol.io/specification/2026-07-28/server/discover),
[stdio](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio)
and [HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
contracts.

## Legacy handshake version adoption is enforced on both sides

`initialize` asks for the newest revision in `SUPPORTED_PROTOCOL_VERSIONS`. A server that cannot
honour it answers with a revision of its own — which describes the server, not a grant to us. So:

- **As a server** (`negotiateProtocolVersion`, `packages/mcp/src/constants.ts`): we echo a
  supported request, otherwise answer our own latest, and let the peer decide.
- **As a client** (`assertSupportedServerProtocolVersion`, same file): a revision outside
  `SUPPORTED_PROTOCOL_VERSIONS` is **not adopted**. We log a structured
  `mcp.protocol_version_mismatch` warning naming the server, what it claimed and what we support,
  then throw. Per `2024-11-05` lifecycle — "if the client does not support the version in the
  server's response, it SHOULD disconnect" — that throw *is* the disconnect: each transport's
  `connect()` catch aborts its controller, and `MCPClient.connect` closes the client, which
  terminates the stdio child. Nothing after `initialize` is sent, so we never issue requests under
  a revision we cannot honour, and the `MCP-Protocol-Version` header can no longer carry a version
  we do not implement.

Consequence worth knowing before debugging a "server won't connect" report: a server that ignores
version negotiation and always answers its own newest revision now fails at startup with that
warning instead of half-working. That is the intended trade — silent protocol guessing was the bug.
The server's claimed revision remains visible via `getServerMetadata()` for diagnostics.

## Implemented

| Area | Status |
| --- | --- |
| `initialize` / `notifications/initialized` + version negotiation | Yes (handshake model) |
| `ping` | Yes (both directions) |
| Transports: stdio, Streamable HTTP, HTTP+SSE | Yes (all three) |
| `tools/list` (paginated), `tools/call` | Yes |
| `resources/list`, `resources/templates/list`, `resources/read` (paginated) | Yes |
| `resources/subscribe` / `unsubscribe` | Yes |
| `notifications/resources/updated` | Yes (added 2026-09-22) |
| `prompts/list`, `prompts/get` (paginated) | Yes |
| `notifications/{tools,resources,prompts}/list_changed` | Yes |
| `notifications/cancelled` | Yes |
| Authorization: RFC 9728 + RFC 8414 discovery, PKCE S256, RFC 8707 resource indicators | Yes |
| Authorization: dynamic client registration (RFC 7591) | Yes — but see Deprecated below |
| Elicitation, form mode (`elicitation/create`) | Yes (added 2026-09-23) — see below |
| Elicitation, URL mode (`mode: "url"`, `-32042` URL elicitation required) | Yes (added 2026-09-25) — see below |
| Structured tool output (`outputSchema` / `structuredContent`) | Yes (added 2026-09-23) — see below |
| Resource links in tool results | Rendered and preserved; no automatic resource fetch |
| `completion/complete` | Client API exists; exported servers supply no suggestions |

## Not implemented — genuine gaps

| Feature | Introduced | Note |
| --- | --- | --- |
| Exported-server argument completion handlers | Legacy | The client API already exists |
| Modern subscription-listen host flow | `2026-07-28` | Not advertised; there is no modern live catalog subscription |
| Tasks: exported-server task execution and task notifications | `2026-07-28` | Client polling/input/cancellation, durable receipts and attached-session recovery exist |
| Extensions: MCP Apps, Skills over MCP | `2026-07-28` | Opt-in by design; skipping is fine |

## Modern multi round-trip requests

The client implements the published [MRTR contract](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr)
for `tools/call`, `resources/read` and `prompts/get` over stdio and Streamable HTTP.
When a server returns `input_required`, form and URL requests pass through the
same schema validation, consent and user-input adapter used by legacy elicitation.
No URL is opened by the protocol driver. An unattended host without an elicitation
handler advertises no elicitation capability and refuses such an interaction.

Each retry has a fresh JSON-RPC ID, preserves the original method/arguments, and
returns only that round's responses and exact opaque `requestState`. State and
answers never enter another parallel call. The registry binds tool interactions
to the originating run rather than a different run that happened to call the same
server more recently. An undefined origin cannot fall back to a concurrent caller.

A logical call allows at most eight interaction rounds and eight input requests
per round, with 256 KiB bounds on each input-required result and response map.
Network time uses one cumulative request budget; user typing does not consume it.
Each form waits at most ten minutes; the overall ceiling is the network budget
plus ten minutes. Cancellation/connection close releases the form even when the
host callback ignores its signal. A user cancel
stops the call without another RPC. A decline can be returned once, but cannot
cause another automatic prompt. Unsupported methods, malformed batches and
unadvertised sampling/root requests are refused before any form is shown.

Standalone server-to-client requests remain ignored on modern connections.
This is client-side MRTR support; the exported MCP server does not supply
interactive tool handlers. Legacy behavior remains
covered separately. Durable wire/control tests live in
`packages/mcp/tests/modern-mrtr*.test.ts` and exercise a real stdio child and an
independent HTTP peer in addition to deterministic cancellation/loop controls.

## Modern Tasks (client)

The client implements the [2026-07-28 Tasks extension](https://modelcontextprotocol.github.io/ext-tasks/specification/2026-07-28/tasks.html)
over stdio and Streamable HTTP. A server must advertise
`capabilities.extensions["io.modelcontextprotocol/tasks"]`. Only then do
`tools/call` and the task methods opt into the extension in per-request client
capabilities. `MCPRequestOptions.tasks: false` requires a synchronous result.
Resources and prompts never opt into task creation. Legacy connections retain
their existing behavior; our exported server does not advertise task execution.

Normal registry tools automatically wait for a task's final tool result. MRTR
can finish before task creation; after creation the original tool is never
replayed. The client polls `tasks/get`, honors the suggested polling interval
(with a 100 ms floor; 1 second when absent), and sends form/URL responses through
`tasks/update`. Input uses the same validation, consent and originating-run
binding as MRTR. Already answered keys are deduplicated across stale polls;
reusing a key for different input is rejected. Limits are eight inputs per
snapshot, 64 inputs per wait, and 256 KiB per input/response map. Sampling and
roots requests remain refused before displaying any form.

Task observation has its own 30 minute total deadline, including user interaction,
independent of the per-RPC network timeout. Callers may set `tasks.timeoutMs`
between 1 ms and 24 hours. Abort, user cancel and deadline expiry make a bounded,
best-effort `tasks/cancel` request. An acknowledgement only records cancellation
intent; it does not claim the remote work stopped. Closing a connection releases
the local wait without sending a request on that closed connection. Task IDs
are mirrored into HTTP `Mcp-Name` for get, update and cancel.

`MCPClient.getTask(taskId)` inspects a known task; `cancelTask(taskId)` requests
cancellation; `waitForTask(taskId, options)` resumes observation and returns the
final tool result without invoking the tool. An optional `tasks.onStatus` hook
runs before the first poll and on subsequent status reads. Hosts can save the
task ID there, bound to the exact configured server and authorized account, and
resume after reconnecting. Nonterminal wait errors retain `MCPTaskError.taskId`.
The CLI and standalone WebUI now persist project-local receipts under
`mcp-tasks/journal.json` in the project's WrongStack state directory. Receipts
contain task/server/tool identifiers, session and agent ownership, a connection
and authorization-grant digest, status metadata, and fingerprints of acknowledged
input keys. They never contain tool arguments, form answers, tokens, result
payloads or status messages. Files use atomic writes and the cross-process file
lock, are bounded to 1 MiB/256 receipts, and reject corrupt/linked journals.

Recovery runs when the owning session is attached (checked every five seconds),
with at most four recovery observations per pass. It preserves the server and
current tool allowlist/deny/sandbox policy. A changed account, connection,
project directory, session or agent cannot inherit the task. OAuth refresh keeps
the grant identity; a new login changes it. An older refresh response cannot
replace a newer login. Custom authorization providers must implement
`getTaskIdentity()` to enable durable task tracking; their existing calls still
work without it.

Each observer holds a 90 second lease with a 20 second heartbeat. Graceful
shutdown releases it; after a crash another process waits for it to expire.
Host shutdown/session detachment pauses local observation without requesting
remote cancellation. Explicit user abort retains the cooperative cancellation
behavior. Acknowledged input fingerprints survive restart so stale input polls
do not prompt again. A crash between a server acknowledgement and the local
fingerprint write is not an exactly-once delivery guarantee. Recovered output
is bounded to 16,000 characters and appended only to the owning conversation as
runtime-origin, untrusted remote data. The conversation writer is flushed before
delivery is acknowledged; a replayed receipt marker prevents duplicate recovery
messages after a crash in that acknowledgement window. A task may already have expired or its
server may not preserve work across its own restart. Missing/expired tasks are
reported without retrying the original tool. `isError` in a completed tool
result remains distinct from a task's `failed` protocol error.

Embedders opt in with `MCPRegistryOptions.taskJournalDir` and a
`taskRecoveryContext` getter, or call `setTaskRecoveryContext()` after constructing
their session host. `listTasks(context)`, `recoverTasks(context)`,
`retryTask(context, receiptId)` and `cancelTask(context, receiptId)` are scoped
to that actual context. Retry requests bypass the transient retry delay, never
take over a live observer lease, and never replay `tools/call`. Cancellation
uses the current server policy, sandbox gate and account binding; an acknowledgement
does not mark a task cancelled.

WebUI **Settings > MCP Servers > MCP tasks** lists the open session's saved
tasks and offers recovery and cooperative cancellation. Both standalone and
CLI-embedded hosts push task status and result-collection updates over the existing
WebSocket connection. `subscribeTasks(context, changed, closed)` observes committed
journal changes, including atomic replacements by another process, with a bounded
30-second resync if filesystem notifications fail. The browser receives fresh
snapshots with subscription IDs and increasing revisions; hidden panels detach,
and reconnecting panels request a new snapshot. Legacy hosts and interrupted
streams fall back to five-second refreshes while visible.
Only a safe task projection reaches the browser; remote IDs, account bindings,
input hashes and observer tokens stay on the host. All seven UI locales are
covered. The panel rejects stale session/request replies and never queues actions across
a disconnect. Socket close, unsubscription and host shutdown release observers.
The host stream never invokes a tool or resumes remote observation by itself.

Remote MCP task notifications/subscriptions are not advertised; the WebUI stream
is host-local. Wire tests in
`packages/mcp/tests/tasks-*.test.ts` exercise independent HTTP and stdio peers,
the registry/user-input path with concurrent runs, and a new client resuming a
saved ID. These are local protocol proofs, not third-party service certification.

## Not implemented — and that is correct

These are **Deprecated** in `2026-07-28` (SEP-2577), with new implementations told not to adopt
them. Earliest removal is the first revision on or after 2027-07-28.

| Feature | Why we are right to skip it |
| --- | --- |
| **Sampling** (`sampling/createMessage`) | Deprecated; migration path is "integrate directly with LLM provider APIs". We answer `-32601` and never advertise the capability. |
| **Roots** | Deprecated; migration path is tool parameters, resource URIs or server config. |
| **Logging** (`logging/setLevel`, `notifications/message`) | Deprecated; migration path is stderr for stdio, OpenTelemetry for observability. |

On legacy connections we advertise `capabilities: { elicitation: { form: {}, url: {} } }` when the host passes an elicitation
handler (the CLI host always does), and `{}` otherwise. Sampling and roots are never advertised, so
a server cannot call something we do not implement.

## Caller-side error-code partition (our servers)

Quotes are from the live spec markdown on `raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main`, path `docs/specification/2024-11-05/server/`, fetched 2026-10-05; line numbers are in those files.

| Case | We return | Spec citation |
| --- | --- | --- |
| Unknown resource / unknown prompt name | `-32602` | `prompts.mdx:242` "Invalid prompt name: `-32602` (Invalid params)" |
| Missing required prompt argument | `-32602` | `prompts.mdx:243` "Missing required arguments: `-32602` (Invalid params)" |
| Missing required request field (`uri`, `name`), non-object `arguments`, invalid pagination cursor | `-32602` | `utilities/pagination.mdx:94` "Invalid cursors **SHOULD** result in an error with code -32602 (Invalid params)"; the other cases are grouped here because they are all caller-side `params` faults, and `prompts.mdx:243` / `resources.mdx` treat a missing required field as Invalid params |
| Genuine host failure (tool handler throws) | `-32603` | `prompts.mdx:244` "Internal errors: `-32603` (Internal error)" — reserved for this case only |
| Unknown tool | `-32602` | `tools.mdx:232` lists "Unknown tools" under protocol errors; `tools.mdx:248-249` shows `"code": -32602, "message": "Unknown tool: ..."` |
| `inputSchema` violation | in-band `{ content, isError: true }`, **not** a protocol error | `tools.mdx:236` "Tool Execution Errors: Reported in tool results with `isError: true`", example at `tools.mdx:267` (SEP-1303) |

Implementation: `packages/mcp/src/server-dispatch.ts` defines base `InvalidParamsError` with `InvalidLookupError extends InvalidParamsError`; the outer catch maps `err instanceof InvalidParamsError ? -32602 : -32603`, and schema refusals are returned as tool results so the model can self-correct, while the WS-026 `logger.warn` audit line is preserved. `elicitation.ts:494-497` (duplicate `elicitation/create` while one is awaiting the user; `INVALID_PARAMS` at `:495`) and `:518` (answer rejected by `validateElicitationContent`) answer `-32602` via the same `INVALID_PARAMS` constant; they are `return error(...)` calls, not throws, because the surrounding `catch` at `:520-521` converts a throw into `action: "cancel"` — which would misreport a refusal as a user cancel.

One honest drift note: for *resource not found* the page we implement prescribes `-32002` (`resources.mdx:337-338` keeps `-32002` / `-32603`); `-32602` for that case is the **current** revision's renumbering. We answer `-32602` deliberately, so a strict `2024-11-05` client checking for `-32002` sees a different code.

## Elicitation

A server's `elicitation/create` is answered by `ServerRequestResponder`
(`packages/mcp/src/elicitation.ts`), one per connection and shared by all three transports:

- **Schema.** Only the spec's flat form is accepted: string (with `format`, length bounds),
  number/integer (with bounds), boolean, single-select enums in every revision's shape (`enum` +
  `enumNames`, titled `oneOf`/`anyOf`) and multi-select arrays of enum values. Anything nested is
  answered `-32602`, never half-rendered.
- **Who is asked.** The form goes to the run whose tool call to that server is in flight (the newest
  one), through the same structured user-input channel as the `clarify` tool — so the TUI and WebUI
  show it without new UI. A request outside any call lands on the host's root session. With no
  surface attached (headless `-p`) the answer is `cancel`; dismissing the form is `decline`.
- **Validation.** Accepted content is checked against the schema (required fields, choices, bounds,
  integer-ness; numeric text is coerced). A rejected answer is asked again with the reason, a few
  times, before the request is cancelled.
- **Limits.** One open form per server (a second request is refused `-32602`); a form nobody answers
  is cancelled after 10 minutes; the server's `notifications/cancelled` closes it. During eternal or
  parallel autonomy a form nobody answers within the tool-approval wait (120 s) is cancelled then,
  and a `clarify` form takes its recommended answers — nobody is expected at the keyboard.
- **Timeouts.** While a form is open, the request timeout of the call that triggered it holds — the
  wait is the user typing, not the server stalling. The 10-minute cap still bounds the call.
- **URL mode.** A `mode: "url"` request (an `http(s)` URL and an `elicitationId`; any other
  scheme is refused `-32602`) is shown as a consent form: the server, the message, the full URL,
  the site, and warnings for a punycode host, plain HTTP off localhost, or credentials in the
  address. The user picks "open it in the browser on <machine>" (only where the host can open
  one), "I will open it myself" (the browser may be on another machine, as with `wstack
  remote`), or decline. Nothing is fetched or opened before that; `accept` carries no content.
  A `tools/call` answered with `-32042` puts each listed page to the same user, and the model is
  told which pages, what the user chose, and whether to call again.
  `notifications/elicitation/complete` is ignored, which the spec allows.
- **Streamable HTTP.** A `text/event-stream` reply is now read event by event, because the server
  puts its request ahead of our response in the same stream and waits for the answer; the answer is
  POSTed back on the session. We do not open the optional GET stream, so a request sent outside any
  in-flight POST is not received.

## Structured tool output

`outputSchema` is kept from `tools/list` (it also survives the lazy-server
manifest cache), and `structuredContent` is read from every `tools/call`
response through one parser shared by the three transports. The spec asks
servers to repeat the object as JSON in a text block, but many send only a
summary there. So the model gets the structured result appended whenever no
text block already carries the same JSON (compared ignoring key order). The
result is checked against the declared `outputSchema`. A mismatch is reported
in the tool output, naming up to three problems, and does not fail the call;
the content is still usable.

## Deprecated things we *do* implement

| Feature | Status | Note |
| --- | --- | --- |
| Dynamic client registration (RFC 7591) | Deprecated in `2026-07-28` (PR #2858) | Migration path is Client ID Metadata Documents. Still the right call today: hosted MCP servers overwhelmingly expect DCR, and earliest removal is 2027-07-28. CIMD is tracked as remaining work. |
| HTTP+SSE transport | Deprecated since `2025-03-26` | Streamable HTTP is also implemented and preferred; keeping SSE costs nothing and serves older servers. |

## Known declaration drift

The HTTP layer implements Streamable HTTP (`2025-03-26`), the `MCP-Protocol-Version` header and
OAuth resource indicators (`2025-06-18`), the client answers elicitation and reads structured tool
output (both `2025-06-18`), while negotiating `2024-11-05`. Elicitation rides on the declared client capability, which is what server
SDKs check before sending the request. These ride on the transport
and the 401 challenge rather than on the negotiated revision, so servers accept them. The
declaration is narrower than the behavior — accepted, and recorded here so it is not rediscovered as
a bug.

## Our own servers

`packages/mcp/src/server.ts` advertises `tools.listChanged: false`, and `resources`/`prompts` only
when non-empty, with `subscribe: false` and `listChanged: false`. That matches what it implements:
it declares nothing it cannot serve.
