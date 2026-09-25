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
- **Limits.** One open form per server (a second request is refused `-32603`); a form nobody answers
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
