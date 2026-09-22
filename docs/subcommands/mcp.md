# `wstack mcp` and `/mcp` — MCP Server Lifecycle

## What it does

Manages MCP server configurations in `config.json` and their runtime lifecycle.
There are two interfaces:

| Interface | Environment | Add/Remove/Enable/Disable | Restart |
|---|---|---|---|
| `wstack mcp` | CLI + REPL | ✅ writes to config | ⚠️ warns "REPL only" |
| `/mcp` | REPL + TUI | ✅ writes to config + runtime | ✅ runtime restart |

Servers are started automatically when WrongStack boots (REPL/TUI mode).

## CLI subcommands (`wstack mcp`)

| Usage | Effect |
|---|---|
| `wstack mcp` | List all configured servers |
| `wstack mcp list` | Same |
| `wstack mcp add <name>` | Add server preset to config (disabled by default) |
| `wstack mcp add <name> --enable` | Add and immediately enable |
| `wstack mcp remove <name>` | Remove a server from config |
| `wstack mcp restart <name>` | Print a warning that restart is REPL-only; use `/mcp restart` |
| `wstack mcp serve [--yolo] [--tools <csv>]` | Run WrongStack as an MCP server over stdio until stdin closes |

`serve` is a process mode, not management of one configured remote server. It exports WrongStack's tool surface to an MCP client.

## Slash commands (`/mcp`) — REPL/TUI only

| Usage | Effect |
|---|---|
| `/mcp` | List available and configured servers |
| `/mcp list` | Same |
| `/mcp add <name>` | Add server preset to config (disabled) |
| `/mcp add <name> --enable` | Add and immediately enable + start |
| `/mcp remove <name>` | Remove server from config + stop |
| `/mcp enable <name>` | Enable in config + start (runtime) |
| `/mcp disable <name>` | Disable in config + stop (runtime) |
| `/mcp restart <name>` | Stop and restart a running server |
| `/mcp auth login <name> [--client-id <id>] [--port <n>] [scopes...]` | One-step OAuth with dynamic client registration and a loopback redirect |
| `/mcp auth start <name> --redirect-uri <url> [--client-id <id>] [scopes...]` | Manual PKCE OAuth for an HTTP server |
| `/mcp auth complete <name> <callback-url>` | Complete OAuth and store encrypted tokens |
| `/mcp auth status <name>` | Show non-secret authorization state |
| `/mcp auth logout <name>` | Remove stored credentials for the server/resource |

OAuth authorization runs from the REPL/TUI slash command or the WebUI MCP panel's key button — not
as a `wstack mcp` process-level subcommand. The server must already be registered with an SSE or
streamable-HTTP URL. `/mcp auth login` needs no client ID: it reuses a stored identity or registers
one via RFC 7591. PKCE verifier/state remain in memory for at most ten minutes; completed
access/refresh tokens are stored under the project state through SecretVault and are never written
to `mcpServers` config.

## Config format

```jsonc
{
  "mcpServers": {
    "filesystem": {
      "enabled": true,
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    },
    "github": {
      "enabled": true,
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    },
    "context7": {
      "enabled": false,
      "transport": "streamable-http",
      "url": "https://server.context7.ai/mcp"
    }
  }
}
```

## Transport types

| Transport | Config needed | Notes |
|---|---|---|
| `stdio` | `command` (required), `args`, `env` | Child process via stdin/stdout |
| `sse` | `url` (required) | Server-sent events |
| `streamable-http` | `url` (required) | NDJSON over HTTP |

## Built-in server presets

All presets are available via `allServers()` and can be added with either
`wstack mcp add <name>` or `/mcp add <name>`:

| Name | Description | Permission |
|---|---|---|
| `filesystem` | Read/write/navigate local filesystem | `confirm` |
| `github` | GitHub API — issues, PRs, repos, search | `confirm` |
| `gitlab` | GitLab API — issues, merge requests, projects | `confirm` |
| `postgres` | PostgreSQL database access — schema inspection and queries | `confirm` |
| `sqlite` | SQLite database inspection and SQL queries | `confirm` |
| `git` | Git repository inspection — history, diffs, log, commit | `confirm` |
| `memory` | Knowledge Graph-based persistent memory | `auto` |
| `sequential-thinking` | Dynamic problem solving and structured reasoning | `auto` |
| `puppeteer` | Browser automation via Puppeteer (headless Chrome) | `confirm` |
| `playwright` | Browser automation via Microsoft Playwright | `confirm` |
| `context7` | Codebase-aware documentation (context7.ai) | `confirm` |
| `fetch` | Web page fetching and markdown conversion | `auto` |
| `brave-search` | Web search (requires `BRAVE_SEARCH_API_KEY`) | `confirm` |
| `docker` | Docker container, image, and log management | `confirm` |
| `aws` | AWS — EC2, S3, Lambda, CloudWatch (yawlabs/aws-mcp) | `confirm` |
| `google-maps` | Directions, geocoding, places | `confirm` |
| `slack` | Slack messaging, channels, search | `confirm` |
| `sentry` | Sentry error and crash tracking (requires `SENTRY_AUTH_TOKEN`) | `confirm` |
| `everart` | AI image generation (requires `EVERART_API_KEY`) | `confirm` |
| `zai-vision` | Image analysis and screenshot understanding | `auto` |
| `zai-web-search` | Z.AI Coding Plan web search (requires `Z_AI_API_KEY`) | `confirm` |
| `zai-web-reader` | Z.AI Coding Plan webpage extraction (requires `Z_AI_API_KEY`) | `confirm` |
| `minimax-vision` | MiniMax image understanding (read-only) | `auto` |
| `ssh` | Remote SSH management — execute commands, transfer files, tunnels, health checks | `confirm` |

### Playwright + Browser Agent

The Playwright MCP server pairs with the **browser** roster agent for isolated
browser tasks. Instead of cluttering the main agent's context with
screenshots and page HTML, delegate browser work to a dedicated subagent:

```bash
# Add and enable Playwright when browser automation is needed.
/mcp add playwright
/mcp enable playwright

# Delegate to the browser agent (lightweight: no bash/write)
/delegate browser "Open https://example.com, take a screenshot, extract the page title"

# Optional: stop Playwright when done
/mcp disable playwright
```

The **browser** agent is read-focused — it has Playwright tools + `read`/`grep`
+/`glob` but no `bash`, `exec`, `write`, or `edit`. For full end-to-end test
flows that need the build toolchain, use the **e2e** agent instead:
`/delegate e2e "test the login flow at https://... including backend assertions"`.

| Agent | Tools | Best for |
|---|---|---|
| `browser` | Playwright + read/grep/glob/fetch | Quick browser tasks: screenshot, scrape, form fill |
| `e2e` | Playwright + full build (bash, exec, test, …) | Full end-to-end scenarios across UI + API + CLI |

### SSH Manager + Remote Hosts

The `ssh` preset runs `mcp-ssh-manager`, which exposes remote SSH, SFTP,
tunnel, health-check, backup, database, and deployment tools. The preset is
**disabled by default** and `confirm`-gated because remote commands and file
transfers can mutate production systems.

```bash
# 1. Add the preset to config
wstack mcp add ssh

# 2. Configure remote hosts using mcp-ssh-manager's env/TOML format.
#    Prefer SSH keys or ssh-agent; do not store passwords in the repo.
#    Example env names:
#    SSH_SERVER_PRODUCTION_HOST=prod.example.com
#    SSH_SERVER_PRODUCTION_USER=deploy
#    SSH_SERVER_PRODUCTION_KEYPATH=~/.ssh/prod_deploy

# 3. Enable when needed
/mcp enable ssh

# 4. Delegate remote ops to DevOps or use MCP tools directly
/delegate devops "Check disk space and service health on production over SSH"

# 5. Disable when done
/mcp disable ssh
```

The server package also supports per-server security modes (`readonly` and
`restricted`) and audit logs. Use those upstream controls for production hosts;
WrongStack's preset only starts the MCP server and applies its normal tool
permission prompts.

## Connection states

```
idle → connecting → connected
                  ↘ reconnecting ↗
                  ↘ disconnected ↗  (auto-reconnect)
                  ↘ failed         (exhausted reconnect budget)
```

| State | Meaning |
|---|---|
| `idle` | Not yet started |
| `connecting` | First connection attempt |
| `connected` | Healthy, tools available |
| `reconnecting` | Connection lost, retry in progress |
| `disconnected` | Stopped or not started |
| `failed` | Reconnect budget exhausted |

## Reconnect behavior

When a server disconnects (child exit, HTTP transport flap), the registry
schedules exponential-backoff reconnect cycles:

- **Max cycles:** 5 before the slot goes `failed` and needs manual `/mcp restart`
- **Base delay:** 1 s, 2 s, 4 s, 8 s, 16 s (capped at 30 s)
- **Jitter:** ±20% to avoid reconnect stampedes
- **Attempts per cycle:** up to 3

A successful connect resets the cycle counter — future crashes get the full budget.

## Operational health

`/mcp` now shows an operational suffix for each running server: health state, cumulative
transport/protocol/tool failure counts, and tool-call p95 latency. The same bounded snapshot powers
WebUI Settings → MCP, `/health`, metrics, and HQ telemetry.

Operational health distinguishes `disabled`, `dormant`, `connecting`, `healthy`, `degraded`, and
`failed`. It also tracks connection/discovery/call latency, reconnect/wake/sleep/restart counts,
in-flight and peak calls, and the latest 32 lifecycle events. Event reasons are fixed WrongStack
codes; raw server errors, commands, URLs, tool names, arguments, and tokens are excluded.

Metrics use fixed-cardinality labels only (`state`, `operation`, `kind`, and `outcome`). Server names
are intentionally not metric labels.

## Per-server tool filtering

Use `allowedTools` in config to expose only a subset of a server's tools:

```jsonc
{
  "mcpServers": {
    "github": {
      "enabled": true,
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "allowedTools": ["createIssue", "listIssues"]
    }
  }
}
```

## TLS configuration (HTTP transports)

For HTTPS servers with custom certificates:

```jsonc
{
  "mcpServers": {
    "context7": {
      "enabled": false,
      "transport": "streamable-http",
      "url": "https://server.context7.ai/mcp",
      "tls": {
        "ca": "/path/to/ca.pem",
        "rejectUnauthorized": false
      }
    }
  }
}
```

## SSRF protection

MCP HTTP transports validate URLs to block internal/cloud-metadata targets:

- `localhost`, `0.0.0.0`, `::`, `[::1]` — allowed (local servers)
- `169.254.x.x` (IMDS / link-local) — blocked
- Other RFC1918 ranges — allowed (LAN MCP servers are legitimate)

## Graceful child shutdown

When closing a stdio transport, WrongStack sends SIGTERM first (800 ms
grace period), then SIGKILL if the server doesn't exit (Windows-safe via
`TerminateProcess`).

## Code reference

- `packages/cli/src/subcommands/handlers/mcp.ts` — CLI subcommand handler
- `packages/cli/src/slash-commands/mcp.ts` — `/mcp` slash command
- `packages/cli/src/slash-commands/mcp-utils.ts` — shared management logic
- `packages/mcp/src/client.ts` — `MCPClient`
- `packages/mcp/src/registry.ts` — `MCPRegistry` (start/stop/restart API)
- `packages/mcp/src/transport.ts` — `SSETransport`, `StreamableHTTPTransport`
- `docs/plugin-management.md`
