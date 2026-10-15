# `wstack tools` / `wstack skills`

## `wstack tools`

Lists all registered tools with their owner package and declared permission.

```text
wstack tools
  read                         [@wrongstack/tools] auto
  write                        [@wrongstack/tools] confirm
  bash                         [@wrongstack/tools] confirm
  grep                         [@wrongstack/tools] auto
```

Columns: name, owner package, and permission level. The subcommand does not currently render mutability, description, or risk tier; use `/tools` in-session for mutability and tool help/source for deeper audits.

## Calling tools from outside a session

`list`, `describe`, `run`, `batch` and `agent-guide` let any script or external agent (Claude
Code, Codex, a CI job) call WrongStack's built-in tools from its shell, without MCP and without an
agent loop. They share one execution core with `wstack mcp serve` (`packages/cli/src/tool-gateway.ts`),
so exposure, permissions and project-root containment are identical on both surfaces.

```sh
wstack tools list [--json]                         # tools callable here, one line each
wstack tools describe codebase-search [--json]     # description, capabilities, input schema
wstack tools run read --input '{"path":"a.ts","limit":20}'
wstack tools run read -- --path a.ts --limit 20    # schema fields after `--`, typed by the schema
echo '{"pattern":"TODO"}' | wstack tools run grep --input --json   # bare --input reads stdin
wstack tools run read --input @call.json           # JSON from a file
wstack tools batch < calls.jsonl                   # one {"tool","input","id"} per line, one process
wstack tools agent-guide >> AGENTS.md              # a short guide for an agent's instruction file
```

- **Permissions.** Read-only by default. `--allow fs.write,shell.exec` grants named capabilities
  on top (an unknown name is an error, never a silent no-op); `--yolo` grants every capability.
  The subagent locks still refuse deleting outside the project, history-rewriting git and
  download-and-run commands, and the user's deny rules always apply.
- **Not exposed one-shot:** tools that need an agent session (`clarify`, `todo`, `plan`,
  `tool_use`, `tool_script`, `tool_search`, `present_artifact`) and the `browser_*` suite, whose
  sessions live in the serving process — use `wstack mcp serve` for those.
- **Fresh index.** The project index daemon only watches the disk while a watching client is
  connected, so before the first index-reading call in a process (and after any mutating call)
  the index is caught up incrementally — about 0.3 s on an unchanged 11k-file repository.
- **Output.** stdout is the tool result; `--json` wraps it as `{ok, tool, settlement, durationMs,
  content}`. `batch` always prints one JSON line per call, echoing `id`, and does not stop on a
  failing call (max 500 calls).
- **Exit codes:** 0 ok · 1 tool failed · 2 bad input · 3 not exposed or denied · 4 needs an
  interactive confirmation. A batch exits with its first failing call's code.

Measured on this repository (≈ chars/4): `agent-guide` is ≈ 520 tokens, against ≈ 5,400 for the
`tools/list` that `wstack mcp serve` hands an MCP client up front; one `describe` is ≈ 370 tokens
and is paid only when asked.

## `wstack tools serve` — the same tools over REST

For an external agent that wants WrongStack's tools as its own: it lists them once, registers each
as a local tool whose `execute` POSTs here, and hands its model the response body.

```sh
wstack tools serve --port 0 [--allow fs.write | --yolo] [--tools read,grep] [--allow-remote-callbacks]
# first stdout line: {"url":"http://127.0.0.1:50570/","token":"…","mode":"safe","tools":22}
```

| Route | Answer |
|---|---|
| `GET /health` (no auth) | `{ "ok": true }` |
| `GET /v1/tools` | `{ mode, capabilities, tools: [{ name, description, input_schema, capabilities, mutating }] }` |
| `GET /v1/tools/<name>` | one tool, or `404 { ok:false, error:"not_exposed", message }` naming the grant it needs |
| `POST /v1/tools/<name>/call` `{ input, call_id?, workdir?, callback? }` | `200 { call_id, tool, ok, settlement, duration_ms, content }` |

- A tool outcome — success, tool error, invalid input, policy refusal — is HTTP 200 with `ok` and
  `settlement`: to the calling model it is a tool result. Transport problems use 400 / 401 / 403 /
  404 / 413 (4 MiB) / 415 (JSON only) / 429 (16 calls at once).
- `workdir` (WrongForge sends its task's) becomes that call's working directory when it lies inside
  the served project after resolving symlinks; outside it, or missing, the call is refused with
  `400 bad_workdir`. Without it, relative paths resolve against the project root.
- WrongForge's built-in gateway client works as is with `list_path: "/v1/tools"` and
  `call_path: "/v1/tools/{name}/call"`.
- `callback: { url, token? }` answers `202 { call_id, status: "accepted" }` and POSTs the same result
  body to `url` (loopback only unless `--allow-remote-callbacks`; one attempt, 30 s).
- A bearer token is always required (`WRONGSTACK_TOOLS_TOKEN`, or generated and printed once);
  loopback bind by default; the same Origin / Host guards as `wstack mcp serve --http`.
- Session-bound tools are withheld; process-bound ones (the `browser_*` suite, when registered)
  stay, since the server is a long-lived process. Every index-reading call first catches the index up with the disk, because the caller edits the tree
  with its own tools. Tools run in the server's project root, confined to it.
- Closing the HTTP connection does not stop a running tool; it ends at its own timeout
  (`tools.maxToolTimeoutMs`, default 300 s). Use a callback for long tools such as `test`.

## `wstack skills`

Lists all available skills across all scopes.

```text
wstack skills
  api-design        (bundled)  Use when: REST API design, error codes, pagination
  bug-hunter        (bundled)  Use when: systematic bug and code smell detection
  acme-conventions  (project)  Use when: writing code in the acme-web repository
  my-skill          (user)     Use when: ...
```

Each entry shows name, scope (`bundled`, `project`, or `user`), and the trigger description.

## Code reference

- `packages/cli/src/subcommands/handlers/tools-skills.ts`
- `packages/cli/src/subcommands/handlers/tools-cli.ts`, `tools-cli-args.ts`
- `packages/cli/src/tool-gateway.ts` (shared with `wstack mcp serve`)
- `packages/core/src/registry/tool-registry.ts`
- `packages/core/src/execution/skill-loader.ts`
