# `/acp` — drive installed ACP coding agents

Discover and assign tasks to the ACP-supporting coding CLIs already installed
on your machine (Claude Code, Codex CLI, Gemini CLI, OpenCode, …) — from inside
the WrongStack interface, without leaving it.

These external agents run as **subprocesses using their own login**, so you use
them without spending API credits in WrongStack. WrongStack sandboxes their
filesystem/terminal access to the project root and routes their permission
requests through the active permission policy.

## Usage

```
/acp                          List detected agents (✓ installed / ✗ missing)
/acp <agent-id> <task>        Run a task on ONE agent, inline + streamed
/acp <agent-id> --bg <task>   Run it as a background fleet subagent (see /agents)
/acp parallel <csv> <task>    Fan one task out to several agents at once
/acp probe [csv]              Handshake-test agents — shows what actually works
/acp bench [csv] [--fs]       End-to-end verify each agent + graded report
/acp sync                     Pull the official agentclientprotocol/registry
/acp help
```

## `probe` vs `bench`

- **`/acp probe`** is fast: it only runs the `initialize` handshake and reports
  ok/fail + latency. Use it to see which agents can speak ACP at all.
- **`/acp bench`** is the full verification: for each agent it runs handshake →
  `session/new` → a real `session/prompt` (echo a unique token) and grades the
  result **pass / partial / fail** with per-check detail and timings. Add
  `--fs` to also verify the `fs/read_text_file` callback channel (the agent is
  asked to read a sandboxed temp file). Defaults to all installed agents;
  pass a csv to bench specific ids. Each bench runs a real model turn, so it
  uses the agent's own login and takes longer than `probe`.

```
/acp bench                       # bench every installed agent
/acp bench gemini-cli,codex-cli  # bench specific agents
/acp bench --fs                  # also verify the fs callback channel
```

## Where the agent list comes from

The list has two sources, merged at resolution time (override → synced registry
→ bundled catalog):

1. **Official registry** — [`agentclientprotocol/registry`](https://github.com/agentclientprotocol/registry),
   an hourly-updated catalog of 37+ ACP agents published at
   `https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json`. Run
   `/acp sync` to fetch it into `~/.wrongstack/cache/acp-registry.json`. Once
   synced, you can run **any** registry agent by its id (`/acp factory-droid
   "…"`), and the authoritative ACP-entry commands are used.
2. **Bundled catalog** — a small offline fallback (`agents.catalog.ts`) so the
   command works before/without a sync. Our stable ids (`claude-code`,
   `gemini-cli`, `codex-cli`, `copilot`) alias to their registry ids
   (`claude-acp`, `gemini`, `codex-acp`, `github-copilot-cli`).

### Examples

```
/acp
/acp gemini-cli "explain src/agent.ts"
/acp claude-code --bg "refactor auth/session.ts and run the tests"
/acp parallel claude-code,gemini-cli,codex-cli "review this diff"
/acp probe
```

## Agent ids

`claude-code`, `gemini-cli`, `codex-cli`, `copilot`, `cline`, `goose`,
`openhands`, `qwen-code`, `kiro-cli`, `opencode`, `mistral-vibe`, `cursor`.
Run `/acp` to see which are detected on this host.

## Detection vs. handshake

`/acp` (list) only checks whether the binary is on `$PATH`. **Being installed
does not mean it speaks ACP.** Some CLIs need a specific entry flag or adapter
(e.g. Gemini's `--acp` flag, Claude Code's `@agentclientprotocol/claude-agent-acp`
adapter). Run `/acp probe` to actually run the `initialize` handshake against each
agent and see which truly respond.

## Fixing an agent that probes ✗

If an agent is detected but `probe` shows it failing, its catalog entry needs a
different ACP entry command. Override it in your **user** config
(the active profile config) — never in a repo-committed config, where it is
stripped as an arbitrary-command-exec risk:

```json
{
  "acp": {
    "agents": {
      "codex-cli": { "command": "codex", "args": ["acp"] },
      "claude-code": { "command": "npx", "args": ["-y", "@agentclientprotocol/claude-agent-acp"] }
    }
  }
}
```

Precedence when resolving an agent's command: **user override → synced registry →
legacy map → bundled catalog**.

## Inline vs. `--bg`

- **Inline** (default) runs the agent now, streams its tool calls / diffs into
  the chat, and returns the result. No director mode required.
- **`--bg`** dispatches the agent as a background fleet subagent (requires
  director mode — run `/director` first). Track it with `/agents`.

## The WrongStack bridge

A delegated worker keeps its own identity, tools and sign-in. WrongStack only tells it where it
works and gives it the project's coordination services:

- **MCP servers** in `session/new`, each launched as `wstack mcp serve <name> --project-root=<project>`:
  `wrongstack-index` (read-only code index with `--watch`, so files the worker edits stay
  searchable; `codebase_search`, `codebase_incoming_calls` and `codebase_read_symbol` load upfront
  instead of behind tool search), `wrongstack-sage` (memory: recall, propose with
  `memory_candidates`), `wrongstack-mailbox` (writable, actor = the worker's subagent id,
  `@session` = the session that delegated the task), `wrongstack-kanban` (writable, no destructive
  ops; `stats` gives whole-project totals), and optionally `wrongstack-intake`.
- **A short note appended to the agent's own system prompt** (`_meta.systemPrompt.append`, which
  the Claude ACP adapter forwards to the `claude_code` preset), saying it works inside WrongStack,
  how to report progress, and that its final reply returns to WrongStack.

It applies to inline runs, `--bg` dispatch and `wstack acp spawn`. Default: on for `claude-code`
with codebase-index, sage, mailbox and kanban. Configure it in the active profile config (never from in-project
config):

```json
{
  "acp": {
    "bridge": {
      "agents": ["claude-code"],
      "servers": ["sage", "mailbox", "kanban", "codebase-index"]
    }
  }
}
```

`"agents": []` or `"servers": []` turns it off. Agents that do not read the `_meta` extension still
get the MCP servers.

### Delegating from a session

When a bridged agent is installed (its CLI is on PATH, or `acp.agents` configures it), the
`delegate` tool names it to the session's model, which hands it work with
`delegate({ name: "claude-code", provider: "acp", … })`. Model lanes, `/setmodel` routes and tiers
never reroute such a task to a WrongStack model.

While the worker's turn runs, a `session_note` to it (by its subagent id or `claude-code`) is
injected into that turn through the agent's `_session/steering` extension, so the leader can
redirect it mid-task. Peers' `@session` broadcasts are not injected (a steer interrupts the
worker's generation); the leader's are. The worker reads such a message as a user message that
starts with `[WrongStack <kind> from <agent>]`.

The agent's own stderr stays off the screen (`WRONGSTACK_DEBUG=1` echoes it live); when the agent
crashes, its last lines are printed and its last line names the cause.

## Related

- `/ensemble <csv> <task>` — the original parallel fan-out (same engine as
  `/acp parallel`).
- `wstack acp {list,spawn,parallel,server}` — the CLI surface.
- [`docs/acp-ensemble.md`](../acp-ensemble.md) — architecture reference.
