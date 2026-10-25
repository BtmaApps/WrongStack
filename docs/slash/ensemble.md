# /ensemble — Fan a task out to multiple ACP agents

## What it does

`/ensemble` runs a single task on **multiple ACP-supporting agents in parallel** and reports each agent's outcome. The agents are independent external processes that WrongStack talks to over the [Agent Client Protocol v1](https://agentclientprotocol.com/get-started/introduction).

Each agent runs in its own process. Agents that are not installed on the host are **skipped with a warning** rather than failing the whole command. The command waits for all agents to finish and prints a per-agent section followed by a roll-up summary with iteration and tool call counts.

This is the TUI/REPL counterpart of `wstack acp parallel` on the command line — both wrap the same `runEnsemble()` orchestrator from `@wrongstack/acp`.

## Usage

```
/ensemble <agent-ids-csv> <task description>
```

The first whitespace-separated token is the comma-separated list of agent ids; everything after it is the task description. Surrounding matched `"..."` or `'...'` around the task are stripped, so the natural form works:

```
/ensemble claude-code,gemini-cli "review this diff"
/ensemble claude-code,codex-cli 'refactor auth/session.ts'
/ensemble claude-code,gemini-cli,codex-cli "explain the v1 protocol"
```

Single-agent form is equivalent to `wstack acp spawn`:

```
/ensemble opencode "summarize this file"
```

Without the agent list, the command prints usage and a hint to run `wstack acp list`:

```
Usage: /ensemble <agent-ids-csv> <task description>

Examples:
  /ensemble claude-code,gemini-cli "review this diff"
  /ensemble claude-code,codex-cli "refactor auth/session.ts"

Run `wstack acp list` to see which agents are detected on this host.
```

## Catalog and discovery

The 13 agents currently in the catalog, with their integration status and ACP entry:

| id | Display Name | Vendor | Integration | ACP Entry |
|---|---|---|---|---|
| `claude-code` | Claude Code | Anthropic | adapter | `npx -y @agentclientprotocol/claude-agent-acp` |
| `gemini-cli` | Gemini CLI | Google | native | `gemini --acp` |
| `codex-cli` | Codex CLI | OpenAI | adapter | `npx -y @agentclientprotocol/codex-acp` |
| `copilot` | GitHub Copilot CLI | GitHub | experimental | `npx -y @github/copilot --acp` |
| `cline` | Cline | Community | community | `npx -y cline --acp` |
| `qwen-code` | Qwen Code | Community | experimental | `qwen --acp` |
| `kiro-cli` | Kiro CLI | Community | experimental | `kiro` |
| `opencode` | OpenCode | Community | native | `opencode acp` |
| `goose` | Goose | Community | experimental | `goose acp` |
| `openhands` | OpenHands | Community | experimental | `openhands` |
| `mistral-vibe` | Mistral Vibe | Community | experimental | `vibe-acp` |
| `cursor` | Cursor | Community | experimental | `cursor-agent acp` |
| `kimi` | Kimi Code CLI | Moonshot AI | native | `kimi acp` |

**Integration levels:**
- `native` — Agent ships with a documented ACP entry flag.
- `adapter` — Runs through an official ACP adapter wrapper (e.g. `@agentclientprotocol/claude-agent-acp`).
- `community` — Community-maintained wrapper.
- `experimental` — Listed by ACP but no verified public ACP entry yet; may not work.

Run `wstack acp list` (or the binary's `acp list` subcommand) to see which are installed on the current host. Run `wstack acp sync` to fetch the latest ACP registry (37+ agents) for offline caching.

## Output

The command returns a single text block to the TUI/REPL chat history. Each agent gets a `=== <id> ===` header and one of four status lines:

```
=== claude-code ===
[success] Reviewed auth/session.ts for null-deref bugs …
[claude-code] succeeded  8421ms | 1 iter, 0 tools

=== gemini-cli ===
[success] Same review from Gemini's perspective …
[gemini-cli] succeeded  7218ms | 1 iter, 0 tools

=== opencode ===
[bridge_failed] opencode: initialize timed out after 30000ms
[opencode] failed  30210ms

=== goose ===
(skipped — binary not found)

Ensemble summary: 2 succeeded, 1 failed, 0 cancelled, 1 skipped. (31203ms total)
```

| Status | When |
|---|---|
| `success` | Agent returned a `stopReason: 'end_turn'` result text |
| `failed` | Agent errored, timed out, or returned a non-success `stopReason` |
| `cancelled` | The command's `AbortSignal` fired (Ctrl-C in the REPL aborts all running agents) |
| `skipped` | Agent id was in the request but the binary is not installed on the host |

The error kind in `[…]` is the structured `SubagentErrorKind` from `@wrongstack/core` (e.g. `bridge_failed`, `aborted_by_parent`, `agent_exited_unexpectedly`, `timeout`, `unsupported_capability`).

## When to use it

Use `/ensemble` when you want multiple perspectives on the same task in one turn:

- **Code review** — run the same review prompt on multiple agents to triangulate findings. Each model catches different things; a synthesis step can be added later.
- **Migration planning** — have multiple agents propose a migration plan, then pick the strongest parts of each.
- **Documentation drafts** — generate parallel drafts of a README or ADR section, pick the best.
- **Cross-IDE smoke testing** — when implementing an ACP client, point `/ensemble` at your test fixtures and see how each agent handles them.

For tasks that don't benefit from multiple perspectives, `/spawn` (single WrongStack subagent) or `wstack acp spawn <id>` (single external agent) is the right tool.

## Cancellation

The command honors the REPL's Ctrl-C signal. When the user aborts, `runEnsemble` sends a `session/cancel` notification to each running agent and waits for the spec-compliant `stopReason: 'cancelled'` before tearing down. The summary footer reflects the cancellation count.

## Known limitations

- **Real v1 agents are still early days.** Some agents require trust/initialization on first use. Check `wstack acp list` for per-agent integration status and probe results.
- **Single text block, not a live panel.** The command is fully blocking — you don't see partial agent output as it arrives. A future PR can add a tabbed TUI panel that streams each agent's session/update notifications live.
- **No synthesis step.** `/ensemble` doesn't fold the per-agent results into a single answer. You (or a follow-up agent run) does that synthesis. Adding a built-in synthesis step is on the roadmap.

## Related commands

- `wstack acp list` — live detection of installed agents
- `wstack acp spawn <id> <task>` — single agent dispatch
- `wstack acp parallel <csv> <task>` — CLI ensemble (same engine)
- `wstack acp sync` — fetch latest ACP registry
- `wstack acp bench` — end-to-end per-agent verification

## Code reference

- `packages/cli/src/slash-commands/ensemble.ts` — the slash command
- `packages/cli/tests/slash-ensemble.test.ts` — 10 unit tests
- `packages/acp/src/integration/ensemble-runner.ts` — the orchestrator (`runEnsemble`, `renderEnsembleText`, `defaultEnsembleCmdResolver`)
- `packages/acp/src/registry/agents.catalog.ts` — the 12-agent catalog
- `packages/acp/src/registry/ensemble-registry.ts` — `$PATH` probe
- `packages/acp/src/client/acp-session.ts` — the v1 client state machine
- `packages/acp/src/integration/acp-bench.ts` — end-to-end agent verification
- `packages/cli/src/subcommands/handlers/acp.ts` — `wstack acp` subcommand
- [ACP Ensemble Architecture](../acp-ensemble.md) — top-level architecture doc
