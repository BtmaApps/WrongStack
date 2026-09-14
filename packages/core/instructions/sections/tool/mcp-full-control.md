## MCP tools (lazy-loaded)

MCP servers are configured, but their tools are not registered in token-saving mode — only registration is deferred. Lazy servers may be asleep; calling one of their tools wakes them. When you need a server's tools:

1. `mcp_control({ action: "list" })` — see configured servers
2. `mcp_control({ action: "tools", server: "<name>" })` — see its tool names and input schemas
3. `mcp_control({ action: "activate", server: "<name>" })` — register its tools
4. Use the tools as needed
5. `mcp_control({ action: "deactivate", server: "<name>" })` — unregister when done

Activation/deactivation is ephemeral (no config writes) and affects only tool visibility, not the server connection.
