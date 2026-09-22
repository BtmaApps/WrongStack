# /mcp - MCP Server Management

Manages Model Context Protocol server presets and project configuration from
inside the REPL. The slash command delegates to the same MCP management helper
used by the CLI subcommand.

## Usage

| Command | Effect |
|---|---|
| `/mcp` | List available presets and configured servers |
| `/mcp list` | Same as `/mcp` |
| `/mcp add <name>` | Add a server preset to config, disabled by default |
| `/mcp add <name> --enable` | Add a preset and enable it immediately |
| `/mcp remove <name>` | Remove a configured server |
| `/mcp enable <name>` | Enable a configured server and start it |
| `/mcp disable <name>` | Disable a configured server and stop it |
| `/mcp restart <name>` | Restart a running server in the current REPL session |
| `/mcp auth login <name> [--client-id <id>] [--port <n>] [scopes...]` | One-step OAuth: registers a client if needed, hosts the loopback redirect |
| `/mcp auth start <name> --redirect-uri <url> [--client-id <id>] [scopes...]` | Manual PKCE authorization for surfaces that host their own redirect |
| `/mcp auth complete <name> <callback-url>` | Exchange the one-time callback and save encrypted credentials |
| `/mcp auth status <name>` | Show non-secret authorization state, scopes, and expiry |
| `/mcp auth logout <name>` | Remove the server/resource credential binding |

Alias: `/mcp-servers`.

## Surfaces

MCP servers can be managed from every surface, all backed by the active profile
config (`mcpServers` key) and the **same** in-process `MCPRegistry`:

- **REPL / TUI** — the `/mcp` command above (`mcp-utils.ts`).
- **WebUI** — Settings → MCP panel in `wstack --webui`. Add/remove/enable/
  disable/restart/discover and live status + tool names are wired to a real
  registry. SSE / streamable-http servers (e.g. `context7`) persist their `url`.
- **Engine / LLM** — the `mcp_control` / `mcp_use` tools.

The WebUI servers translate WebSocket messages over the shared management core
`packages/mcp/src/manage.ts` (`addMcp`/`enableMcp`/`listMcp`/…), so all surfaces
behave identically and cannot drift.

## Lazy connect (on-demand spawn)

A server can be marked **lazy** (`MCPServerConfig.lazy: true`, or the "Lazy
connect" checkbox in the WebUI dialog). A lazy server is **not spawned at boot**:

- Its tools are registered from a cached manifest (discovered on the first ever
  connect, stored at `~/.wrongstack/cache/mcp-tools/<server>.json`), so the model
  still sees them.
- The process spawns only when one of its tools is actually called (transparent,
  single-flight), shown as **Sleeping** (`dormant`) until then.
- After an idle window (default 5 min) with no calls, the process is stopped
  automatically and re-woken on the next call.

The first-ever connection of a brand-new lazy server does one cold discovery
connect to learn + cache its tools; every later boot is fully cold until first
use. Non-lazy servers are unchanged (eager connect at boot).

## Health and operations

The list output includes operational health, transport/protocol/tool failure counts, and call p95
latency. The registry keeps bounded connection/discovery/call latency summaries, lifecycle
counters, call saturation, and recent safe lifecycle events. WebUI, HealthRegistry, MetricsSink,
and HQ consume the same snapshot. Metric labels never include server/tool names, arguments, URLs,
or tokens.

## OAuth for remote HTTP servers

Registered SSE and streamable-HTTP servers sign in with a single command:

```text
/mcp auth login private-api
# Open the returned URL; the redirect lands on a loopback listener we host.
/mcp auth status private-api
```

`login` needs no client ID. It reuses the identity already stored for that server, and otherwise
registers one through RFC 7591 dynamic client registration — which is how most hosted MCP servers
(Notion, Linear, Sentry, …) expect a native client to identify itself. Pass `--client-id` when the
server issues preregistered IDs instead, and `--port` when it only accepts one fixed loopback
redirect URI. The command returns as soon as the URL exists, so the REPL stays usable while you
approve access in the browser; the outcome arrives as an `mcp.server.auth_state` event.

Use `start` + `complete` when a surface hosts its own redirect, or when no loopback port can be
bound:

```text
/mcp auth start private-api --redirect-uri http://127.0.0.1:43123/callback tools:read
/mcp auth complete private-api http://127.0.0.1:43123/callback?code=...&state=...
```

The pending PKCE verifier and state are memory-only, bounded, and expire after ten minutes. The
authorization code is consumed once. The loopback listener binds `127.0.0.1` only, answers exactly
one path, and closes as soon as the redirect arrives. Access and refresh tokens — and a client
secret, if the server issued a confidential client despite our public-client request — are
resource-bound and encrypted in the non-repository project state; they never enter `config.json` or
MCP capability manifests. `/mcp auth logout` removes that exact server/resource binding locally
(token revocation at the provider is not yet implemented).

When a stored credential expires and cannot be refreshed, the server emits
`mcp.server.auth_state: reauth_required`: the CLI logs it and the WebUI MCP panel badges the server,
instead of every call failing with an opaque 401.

## Examples

```text
/mcp
/mcp add filesystem --enable
/mcp enable github
/mcp restart brave-search
/mcp auth status private-api
```

## Code Reference

- `packages/cli/src/slash-commands/mcp.ts`
- `packages/cli/src/slash-commands/mcp-utils.ts`
- `packages/cli/src/subcommands/handlers/mcp.ts`
- `packages/core/src/infrastructure/mcp-servers.ts`
- `packages/mcp/src/manage.ts` — shared management core (used by both WebUI servers)
- `packages/mcp/src/authorization-manager.ts` — bounded PKCE/manual authorization coordinator
- `packages/webui/src/server/mcp-handlers.ts` — WebUI WS ↔ manage.ts translator
