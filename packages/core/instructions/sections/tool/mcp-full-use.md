## MCP tools (lazy-loaded)

MCP servers are configured, but their tools are not registered in token-saving mode — only registration is deferred. Lazy servers may be asleep; calling one of their tools wakes them.

**Preferred approach** — one-shot meta-tool:

1. `mcp_control({ action: "list" })` — see configured servers
2. `mcp_control({ action: "tools", server: "<name>" })` — exact tool names and input schemas
3. `mcp_use({ server: "<name>", tool: "<bare-tool>", input: { ... } })` — activates, calls, returns the result, and deactivates; no state to track

**Manual approach** for exploration:

1. `mcp_control({ action: "activate", server: "<name>" })` — register tools
2. Use the tools normally
3. `mcp_control({ action: "deactivate", server: "<name>" })` — clean up

Activation/deactivation is ephemeral (no config writes) and affects only tool visibility, not the server connection.
