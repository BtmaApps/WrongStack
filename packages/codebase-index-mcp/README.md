# @wrongstack/codebase-index-mcp

Expose WrongStack's project-scoped Codebase Index daemon to any MCP client.
The MCP process is only a protocol adapter: search, stats, graphs, and index
updates still go through the existing named-pipe/Unix-socket IPC service, so
the detached project daemon remains the single SQLite owner.

## Usage

```sh
wstack-codebase-index-mcp --project-root /absolute/path/to/project
```

The default stdio surface is read-only:

- `codebase_context`
- `codebase_search`
- `codebase_stats`
- `codebase_package_graph`
- `codebase_file_graph`
- `codebase_symbol_graph`
- `codebase_incoming_calls`
- `codebase_outgoing_calls`
- `codebase_read_symbol`
- `codebase_skeleton`
- `codebase_impact_analysis`
- `codebase_repo_map`
- `codebase_invariant_check`
- `codebase_diff_impact`
- `codebase_flow_trace`
- `codebase_onboard`
- `dead_code_scan`

Add `--writable` to also expose index-refresh, surgical AST mutation, targeted testing, and dead-code cleanup tools (`codebase_index`, `codebase_ast_replace`, `codebase_targeted_test`, `dead_code_fix`):

```sh
wstack-codebase-index-mcp --project-root /absolute/path/to/project --writable
```

Loopback HTTP is also available:

```sh
wstack-codebase-index-mcp --project-root /absolute/path/to/project --http --port 8767
```

Non-loopback HTTP binds require `--token`; the shared MCP HTTP transport
rejects an unauthenticated public bind.

## MCP client configuration

```json
{
  "mcpServers": {
    "wrongstack-codebase-index": {
      "command": "wstack-codebase-index-mcp",
      "args": ["--project-root", "/absolute/path/to/project", "--writable"]
    }
  }
}
```
