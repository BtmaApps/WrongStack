# MCP protocol conformance

**Last verified against the published spec: 2026-09-22.**
Source of truth: <https://modelcontextprotocol.io/specification/latest> and the
[deprecated features registry](https://modelcontextprotocol.io/specification/2026-07-28/deprecated).
This file records what we actually implement. It is not a plan — the plan lives in
`competitive-roadmap-2026-2027/09-mcp-authentication-and-sampling.md`.

## Short answer

We are **not** fully conformant with the current revision. We implement the `2024-11-05` revision,
declared in `SUPPORTED_PROTOCOL_VERSIONS` (`packages/mcp/src/constants.ts`). The current revision is
`2026-07-28`. Revisions in between: `2025-03-26`, `2025-06-18`, `2025-11-25`.

This is a deliberate, documented position rather than an accident: the constant carries a rule that
a revision is listed only once its wire requirements are met, because the version sent in
`initialize` is a promise about what the peer may then use.

## What changed in 2026-07-28 (the reason this is not just "a few versions behind")

The current revision replaced the `initialize` handshake with a different model:

- every request declares its version in `_meta` under `io.modelcontextprotocol/protocolVersion`,
  and the server accepts or rejects each request independently;
- `server/discover` is a **mandatory** RPC returning supported versions, capabilities and identity;
- a version mismatch is answered with `UnsupportedProtocolVersionError` listing supported versions.

We speak none of this. The spec keeps a backward-compatibility path for handshake-based clients
(`2025-11-25` and earlier), which is why we still interoperate — at `2024-11-05` feature level.
That path is permissive, not guaranteed: it exists only where the *peer* also implements the
handshake. Against a modern-only server we are the "Legacy client × Modern server = Fails" row of
the spec's own compatibility matrix, and we now fail fast rather than limping along (see below).

## Version adoption is enforced on both sides

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

## Not implemented — genuine gaps

| Feature | Introduced | Note |
| --- | --- | --- |
| Per-request versioning + `server/discover` | `2026-07-28` | Architectural; not a list entry |
| `UnsupportedProtocolVersionError` | `2026-07-28` | Follows the above |
| Resource links in tool results | `2025-06-18` | |
| `completion/complete` | `2025-03-26` | Argument autocompletion |
| Progress (`notifications/progress`, `progressToken`) | `2024-11-05` | Cancellation is done; progress is not |
| Extensions: Tasks, MCP Apps, Skills over MCP | `2026-07-28` | Opt-in by design; skipping is fine |

## Not implemented — and that is correct

These are **Deprecated** in `2026-07-28` (SEP-2577), with new implementations told not to adopt
them. Earliest removal is the first revision on or after 2027-07-28.

| Feature | Why we are right to skip it |
| --- | --- |
| **Sampling** (`sampling/createMessage`) | Deprecated; migration path is "integrate directly with LLM provider APIs". We answer `-32601` and never advertise the capability. |
| **Roots** | Deprecated; migration path is tool parameters, resource URIs or server config. |
| **Logging** (`logging/setLevel`, `notifications/message`) | Deprecated; migration path is stderr for stdio, OpenTelemetry for observability. |

As a client we advertise `capabilities: { elicitation: { form: {}, url: {} } }` when the host passes an elicitation
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
