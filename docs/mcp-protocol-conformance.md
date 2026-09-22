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
| `ping` | Yes (server side) |
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

## Not implemented — genuine gaps

| Feature | Introduced | Note |
| --- | --- | --- |
| Per-request versioning + `server/discover` | `2026-07-28` | Architectural; not a list entry |
| `UnsupportedProtocolVersionError` | `2026-07-28` | Follows the above |
| **Elicitation** | `2025-06-18` | The only client feature in the current spec |
| Structured tool output (`outputSchema` / `structuredContent`) | `2025-06-18` | |
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

We advertise `capabilities: {}` as a client, which is honest: we offer the server nothing, so a
server cannot call something we do not implement.

## Deprecated things we *do* implement

| Feature | Status | Note |
| --- | --- | --- |
| Dynamic client registration (RFC 7591) | Deprecated in `2026-07-28` (PR #2858) | Migration path is Client ID Metadata Documents. Still the right call today: hosted MCP servers overwhelmingly expect DCR, and earliest removal is 2027-07-28. CIMD is tracked as remaining work. |
| HTTP+SSE transport | Deprecated since `2025-03-26` | Streamable HTTP is also implemented and preferred; keeping SSE costs nothing and serves older servers. |

## Known declaration drift

The HTTP layer implements Streamable HTTP (`2025-03-26`), the `MCP-Protocol-Version` header and
OAuth resource indicators (`2025-06-18`) while negotiating `2024-11-05`. These ride on the transport
and the 401 challenge rather than on the negotiated revision, so servers accept them. The
declaration is narrower than the behavior — accepted, and recorded here so it is not rediscovered as
a bug.

## Our own servers

`packages/mcp/src/server.ts` advertises `tools.listChanged: false`, and `resources`/`prompts` only
when non-empty, with `subscribe: false` and `listChanged: false`. That matches what it implements:
it declares nothing it cannot serve.
