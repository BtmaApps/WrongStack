# MCP Authentication and Legacy Sampling Compatibility

**Priority:** P1  
**Horizon:** 3–6 months  
**Status:** In progress

## Outcome

Support authenticated remote MCP servers while retaining safe default-deny compatibility for the
now-deprecated server-initiated sampling protocol.

## Standards correction — 2026-07-13

MCP SEP-2577 deprecated `sampling/createMessage`. WrongStack will not build a new
provider/Brain/cost execution pipeline for a deprecated client capability. Legacy sampling requests
remain unadvertised, strictly separated from responses, and denied by default. The active
investment in this plan is OAuth authorization for HTTP transports.

### Verified against the published spec — 2026-09-22

Checked against the deprecated-features registry for revision `2026-07-28` rather than restated
from this file:

- **Sampling is Deprecated, not removed.** SEP-2577 landed it in revision `2026-07-28` (this file
  previously said "accepted in April 2026"), earliest removal is the first revision on or after
  2027-07-28, and the migration path is "integrate directly with LLM provider APIs". Our
  default-deny stance matches the policy's "new implementations SHOULD NOT adopt it". A server that
  still issues `sampling/createMessage` is answered `-32601`, which remains correct.
- **Roots and Logging were deprecated by the same SEP.** Not implementing them is alignment, not a
  gap; this plan should not schedule them.
- **Dynamic client registration is itself now Deprecated** (PR #2858, revision `2026-07-28`), with
  Client ID Metadata Documents (CIMD) as the migration path. The DCR support added below is still
  the right call for today's deployed servers — deprecated is not removed, earliest removal is
  2027-07-28, and hosted MCP servers overwhelmingly expect DCR — but CIMD is the forward path and
  belongs in the remaining work.
- **HTTP+SSE has been deprecated since `2025-03-26`** in favour of Streamable HTTP. We implement
  both, so this costs nothing today.

## Scope

- Standards-aligned OAuth discovery, authorization, refresh, revocation, and token storage for HTTP transports.
- Per-server authentication state and actionable reauthentication events.
- Protocol-correct default denial for legacy `sampling/createMessage` requests without advertising
  the capability.

## Security model

- Tokens live in the secret vault, never project config or MCP manifest caches.
- Redirect listeners bind loopback only and validate state, issuer, and redirect URI.
- Deprecated sampling content is never sent to a provider.

## Delivery plan

1. Persist server capabilities and authentication metadata.
2. Implement OAuth for streamable HTTP with a headless/manual fallback.
3. Retain strict request/response separation and a default-deny legacy sampling handler.
4. Add WebUI/Desktop auth UX and full transport/security tests.

## Implementation progress

### 2026-07-12 — Protocol boundary and default-deny stdio slice

- Stdio response handling now validates response envelopes before consulting the pending-request
  map. A server request whose ID collides with a client request can no longer complete that client
  request.
- Server-initiated `sampling/createMessage` requests over stdio receive a protocol-correct
  JSON-RPC `-32601` response explaining that sampling is disabled by policy. Other unsupported
  server requests receive method-not-found with their original numeric or string ID.
- Streamable HTTP response extraction now separates responses from notifications and server
  requests, including when multiple envelopes share an ID in NDJSON or SSE-framed bodies.
- Added stdio collision, default-deny sampling, unknown-method, strict-response, extraction, and
  streamable HTTP collision regression coverage.

### 2026-07-13 — Vault bridge, challenge/retry, and automatic rotation foundation

- Added a host-owned authorization-provider contract so HTTP transports request access tokens at
  send time. Persistence is instantiated by the host with its SecretVault and project-state path;
  access or refresh tokens never enter MCP server config or capability manifests.
- Tokens are bound to the exact canonical MCP resource URI, limited to Bearer semantics, checked
  for expiry and header injection, and cannot be replayed to a different MCP server.
- Added bounded `WWW-Authenticate: Bearer` challenge parsing for protected-resource metadata and
  authoritative scopes. A host may refresh/discover/reauthorize and request exactly one retry;
  repeated 401 responses never loop.
- Added RFC 9728 protected-resource and RFC 8414/OIDC discovery candidate generation plus strict
  metadata validation: exact resource/issuer binding, bounded authorization-server and scope lists,
  HTTPS-only endpoints outside loopback development, and mandatory PKCE `S256` advertisement.
- Added guarded discovery orchestration across those candidates. DNS is resolved once per request,
  every returned address is validated, and the HTTP(S) socket connects directly to the selected IP
  while preserving TLS SNI/Host. Private or mixed DNS answers, redirects, non-JSON responses,
  oversized bodies, timeouts, and aborts fail closed; only exact loopback development resources may
  use loopback discovery endpoints.
- Added the public-client PKCE S256 lifecycle: cryptographically random verifier/state generation,
  authorization URL construction, exact redirect and constant-time state verification, guarded
  authorization-code exchange, and guarded refresh-token rotation. RFC 8707 `resource` is mandatory
  in the authorization URL, code exchange, and refresh exchange; returned access tokens are bound
  locally to that same canonical resource. Token responses are bounded and reject unsupported token
  types, invalid expiry, malformed scopes, injection characters, redirects, and private DNS.
- Registry hosts can inject a per-server provider factory, enabling SecretVault-backed state
  without adding secret fields to `MCPServerConfig`. Static stdio credential handling is unchanged.
- Added a versioned, bounded, file-locked token store under the non-repository project state. Both
  access and refresh tokens must be SecretVault ciphertext at rest; plaintext and no-op vaults fail
  closed. Entries are keyed by server plus exact canonical resource so concurrent CLI/WebUI hosts
  cannot overwrite unrelated credentials.
- Added a shared refresh provider that proactively rotates near-expiry tokens, single-flights
  concurrent refresh attempts, preserves rotated refresh tokens atomically, and revalidates the
  resource/token/authorization-server binding after reload. CLI and standalone WebUI now install
  this provider factory; Desktop inherits the standalone backend path.
- Added a surface-neutral authorization manager with a bounded ten-minute in-memory PKCE session,
  one-shot callback/code consumption, safe status projection, and exact-binding logout. The registry
  exposes these operations only for configured HTTP servers. REPL/TUI users can now run `/mcp auth
  start|complete|status|logout`; status and completion output never includes access or refresh
  tokens.
- HTTP requests after initialize now carry the negotiated `MCP-Protocol-Version` header.

### 2026-09-22 — Identity, managed redirect, auth state, and WebUI controls

The 2026-07-13 slice was standards-complete but unusable against a real hosted server: it demanded a
preregistered client ID that those servers do not issue, required copying the callback URL out of
the address bar by hand, had no WebUI surface at all, and dropped its own `reauth_required` signal
on the floor.

- Added RFC 7591 dynamic client registration. The discovered `registration_endpoint` was validated
  and persisted but never called; a client is now registered as a public client
  (`token_endpoint_auth_method: "none"`) when no identity is available. A server that answers with a
  confidential client is honored — the secret is vault ciphertext at rest and is sent with the code
  and refresh exchanges — and an already-expired secret is refused.
- Identity precedence is explicit id → the id already stored for that server → per-issuer cache →
  fresh registration. Issuers are compared as URLs, not strings: an origin-only issuer round-trips
  through the store as `https://host/` and the raw comparison silently re-registered every login.
  The registration cache is keyed by redirect URI as well, because RFC 8252 §7.3 port flexibility is
  not universally honored.
- Added a managed loopback callback listener bound to `127.0.0.1` only, answering exactly one path,
  with a bounded request count, a timeout, and abort support. `beginLogin` returns as soon as the
  authorization URL exists so a surface can show it without blocking, and settles separately.
- Wired `onStateChange` in both hosts onto the `mcp.server.auth_state` event. The refresh provider
  already detected a permanently rejected grant and emitted `reauth_required`; nothing listened, so
  an expired server just failed every call with an opaque 401. The CLI logs it with the command to
  run; the WebUI forwards it to the MCP panel.
- Added WebUI controls: `mcp.auth.status`, `mcp.auth.login` and `mcp.auth.logout` over the same
  surface-neutral manager the REPL uses, with the panel badging authorization state. `login` and
  `logout` go through the trust boundary like the spawn-capable mutations — the listener binds a
  port on the host, not in the browser.
- `/mcp auth login` in the REPL/TUI, with `--client-id`, `--port` and scopes. The legacy positional
  `start <server> <client-id> <redirect-uri>` form still parses.

Remaining work: Client ID Metadata Documents (the migration path now that DCR is deprecated), token
revocation (RFC 7009) at logout, SecretVault key-rotation migration for the token file,
re-registration when a cached client is rejected mid-flow, and Desktop-specific controls beyond the
inherited WebUI backend.

## Acceptance criteria

- Expired credentials recover without exposing refresh tokens.
- Deprecated sampling never consumes provider tokens or cost.
- Denied or unsupported sampling returns a protocol-correct error.
- Authentication and sampling can be disabled independently per server.
