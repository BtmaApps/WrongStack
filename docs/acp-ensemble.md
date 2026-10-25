# ACP Ensemble Architecture

WrongStack is a first-class peer in the [Agent Client Protocol v1](https://agentclientprotocol.com/get-started/introduction) — both as a **client** that drives external agents (Claude Code, Gemini CLI, Codex CLI, OpenCode, Cline, and more) and as a **server** that external editors (Zed, JetBrains Junie, VS Code ACP) can drive. The "ensemble" feature is the user-facing fan-out: one task, multiple agents, parallel execution, aggregated results.

This document is the top-level design reference. See [`docs/subcommands/acp.md`](subcommands/acp.md) for the CLI surface and [`docs/slash/ensemble.md`](slash/ensemble.md) for the in-REPL slash command.

---

## Table of contents

1. [Goals & non-goals](#1-goals--non-goals)
2. [Why ACP](#2-why-acp)
3. [Package layout](#3-package-layout)
4. [Discovery layer](#4-discovery-layer)
5. [Client side: driving external agents](#5-client-side-driving-external-agents)
6. [Server side: being driven by an editor](#6-server-side-being-driven-by-an-editor)
7. [Ensemble orchestrator](#7-ensemble-orchestrator)
8. [Failure modes](#8-failure-modes)
9. [What ships today vs. roadmap](#9-what-ships-today-vs-roadmap)

---

## 1. Goals & non-goals

**Goals**

- **Detect** ACP-capable agents already installed on `$PATH` (Claude Code, Gemini CLI, Codex CLI, Cline, Goose, OpenHands, Copilot, Cursor, Kiro, Qwen Code, OpenCode, Mistral Vibe).
- **Drive** each as a first-class subagent with the same `SubagentRunner` interface as native WrongStack subagents.
- **Implement a v1-correct client** — `initialize` → `session/new` → `session/prompt` → stream `session/update` → `stopReason`.
- **Implement a v1-correct server** — full method set, correct `content` blocks, `tool_call` lifecycle, `session/cancel` propagation.
- **Fan out a single task** to multiple agents concurrently and aggregate the results. This is the user-facing ensemble.

**Non-goals (v1)**

- Cross-agent session sharing. Each external agent keeps its own session.
- Live multi-tab TUI streaming. Today's `/ensemble` is fully blocking; per-agent live updates are a roadmap item.
- Built-in synthesis step. `/ensemble` doesn't fold the per-agent results into a single answer — the user (or a follow-up agent run) does that.

---

## 2. Why ACP

The user's original request was: "use together all the ACP-supporting agentic tools (e.g. Claude Code, Gemini CLI, etc.) that are already installed on our system." The `wstack acp` subcommand and `/ensemble` slash command are the answer.

ACP is the right fit because:

- **It's the cross-vendor standard.** Editor vendors (Zed, JetBrains, VS Code ACP) and agent vendors (Anthropic, Google, OpenAI, community) are converging on it. v1 is stable; v2 is in RFD.
- **It models the conversation, not the tool call.** Each agent exposes its own tool surface via `session/prompt`; we don't need to translate a generic tool schema per vendor.
- **It carries the session state.** `session/load` lets an editor resume a session with another agent; the protocol makes that explicit. (We don't use `session/load` in v1, but we don't block it either.)
- **It has a real spec, not a de-facto standard.** [agentclientprotocol.com](https://agentclientprotocol.com) publishes the wire format with versioned RFDs. We can pin to a version and rely on the spec.

What ACP doesn't give us: streaming-token-by-token is not a v1 requirement; `agent_message_chunk` is meant for batching, not token-level streaming. We batch.

---

## 3. Package layout

The integration lives in `packages/acp/`. It depends only on `@wrongstack/core` (for the `SubagentRunner` shape and the `Agent` class the server uses). The CLI consumes it via `@wrongstack/cli`; the TUI consumes it via the same `runEnsemble` import (no TUI-specific code — the slash command is in the CLI package and the TUI inherits it).

```
packages/acp/
  src/
    types/
      acp-messages.ts          internal legacy draft envelope (public only via `/legacy`)
      acp-v1.ts                v1 type definitions — branded IDs, content blocks,
                               tool-call lifecycle, discriminated SessionUpdate union
                               (11 stable kinds + 2 escape hatches)
    v1.ts                      stable v1 public type entry point
    legacy.ts                  deprecated pre-v1 compatibility entry point
    sdk.ts                     official upstream SDK entry point
    registry/
      agents.catalog.ts        13-entry static catalog (one entry per agent)
      ensemble-registry.ts     EnsembleRegistry class — $PATH probe + 5s cache
      acp-registry-fetch.ts    Official agentclientprotocol/registry (37+ agents)
    client/                    v1 client (WrongStack drives external agents)
      acp-session.ts           v1 state machine
      file-server.ts           fs/read_text_file, fs/write_text_file (sandboxed)
      terminal-server.ts       terminal/create, output, kill, release
      permission.ts            PermissionPolicy interface + default impls
      tool-translator.ts       pure helpers
      websocket-transport.ts   WebSocket transport for remote agents
    agent/                     v1 server (external editors drive WrongStack)
      protocol-handler.ts      v1 method set: initialize, session/new, session/prompt, …
      wrongstack-acp-agent.ts  the bootstrap binary (no-op echo by default)
      server-agent-turn.ts     ACPServerAgentTurn adapter — real Agent wiring
      stdio-transport.ts       JSON-RPC 2.0 over stdio (used by both sides)
      tools-registry.ts        WrongStack Tool → ACP ToolDefinition
    integration/
      acp-subagent-runner.ts   single-agent runner (delegates to ACPSession)
      ensemble-runner.ts       multi-agent orchestrator (used by /ensemble + wstack acp parallel)
      acp-bench.ts             end-to-end per-agent verification + report
    index.ts                   public surface
  tests/                       14 files, 153+ tests, 1 skipped (live probe)
  scripts/acp-smoke-test.mts   end-to-end v1 server smoke harness
```

---

## 4. Discovery layer

**`agents.catalog.ts`** — 13 entries, one per agent. Each entry is a typed object:

```ts
export interface ACPAgentDescriptor {
  id: string;                                    // 'claude-code', 'gemini-cli', …
  displayName: string;                           // 'Claude Code'
  vendor: 'anthropic' | 'google' | 'openai' | 'github' | 'community';
  /** argv[0] probe: `claude --version` etc. */
  probe: { command: string; args?: readonly string[] };
  /** argv to start ACP mode. */
  acp: { command: string; args?: readonly string[]; env?: Record<string, string> };
  supports: { loadSession: boolean; promptImages: boolean; terminal: boolean; fs: boolean };
  integration: 'native' | 'adapter' | 'community' | 'experimental';
  docs: string;                                  // https://…
}
```

Integration levels:
- `native` — Agent ships with a documented ACP entry flag (e.g. `gemini --acp`, `opencode acp`).
- `adapter` — Runs through an official ACP adapter wrapper (e.g. `@agentclientprotocol/claude-agent-acp` for Claude Code, `@agentclientprotocol/codex-acp` for Codex CLI).
- `community` — Community-maintained wrapper (e.g. `cline` via `npx -y cline --acp`).
- `experimental` — Listed by ACP but no public ACP entry yet; entry may not work.

**The 13-agent catalog** (as registered in `agents.catalog.ts`):

| id | Display Name | Vendor | Integration | ACP Entry Command |
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
| `mistral-vibe` | Mistral Vibe | Community | experimental | `vibe` |
| `cursor` | Cursor | Community | experimental | `cursor-agent acp` |
| `kimi` | Kimi Code CLI | Moonshot | native | `kimi acp` |

**Bundled fallback + live sync.** `agents.catalog.ts` is the *offline
fallback*. The official [`agentclientprotocol/registry`](https://github.com/agentclientprotocol/registry)
(hourly-updated, 37+ agents) is fetched on demand by `wstack acp sync` /
`/acp sync` (`acp-registry-fetch.ts` → CDN snapshot), cached at
`~/.wrongstack/cache/acp-registry.json`, and supersedes the bundled catalog at
resolution time. Precedence: user override (`config.acp.agents`) → synced
registry → legacy map → bundled catalog. Our stable ids alias to registry ids
via `REGISTRY_ID_ALIASES`. No network is required at runtime — resolution
degrades to the bundled catalog when no cache exists.

**`EnsembleRegistry`** — probes all entries in parallel via `Promise.allSettled`, caches the result for 5 seconds, returns a `DetectedAgent[]` with `installed`, `version`, `path`, and `reason` fields.

Two Windows-specific quirks the live probe handles:

- `shell: true` for the probe spawn so `.cmd` shims under `AppData\Roaming\npm\` are found.
- Detection of cmd.exe's "`<command>` is not recognized" message so the probe correctly distinguishes "binary exists, runs, prints version" from "binary not on disk".

---

## 5. Client side: driving external agents

**`ACPSession`** is the v1 client. State machine:

```
idle → initializing → ready → prompting → streaming → done
                                              ↘ failed
                                              ↘ cancelled
```

Per session:

1. **Start** — spawn the agent child process via `ClientTransport` (stdio) or `WebSocketClientTransport` (remote), send `initialize { protocolVersion: 1, clientCapabilities: {fs, terminal}, clientInfo }`, assert the response `protocolVersion === 1`.
2. **Prompt** — send `session/new { cwd, mcpServers: [] }`, get `sessionId`, send `session/prompt { sessionId, prompt: [{type: 'text', text}] }`.
3. **Stream pump** — listen for `session/update` notifications:
   - `agent_message_chunk` → bridge text delta
   - `tool_call` → bridge tool start
   - `tool_call_update` → bridge tool end
   - `plan` → bridge plan entries
   - `usage_update` → bridge token/cost counters
   - `_unstable_*` / unknown kinds → log + drop
4. **Answer agent requests:**
   - `fs/read_text_file`, `fs/write_text_file` → `FileServer` (sandboxed to `projectRoot`)
   - `terminal/create`, `terminal/output`, `terminal/release`, `terminal/wait_for_exit`, `terminal/kill` → `TerminalServer` (per-process timeout, 1 MiB output cap with UTF-8-safe FIFO truncation)
   - `session/request_permission` → `PermissionPolicy`
5. **Cancel** — on parent's `AbortSignal`, send `session/cancel` **notification** (no response expected), wait for `stopReason: 'cancelled'`, tear down. Per spec, agents MAY keep sending updates after the cancel — we accept them.

The **stable v1 set is 11** session update kinds. The union in `acp-v1.ts` covers those 11 plus two escape hatches:

- `UnstableSessionUpdate` — for v2-RFD kinds real agents emit before the spec stabilizes them (`_unstable_next_edit_suggestions`, `_unstable_elicitation`, …).
- `UnknownSessionUpdate` — fallback for forward-compat. Code that switches on the discriminator never has to re-narrow after an unrecognized string.

**`makeACPSubagentRunner`** — thin adapter that takes the agent id (or a direct `{command, args, env}`), resolves it through `EnsembleRegistry` + the catalog fallback, opens a `ClientTransport`, hands it to a new `ACPSession`, and returns a `SubagentRunner` function: `(task, ctx) => TaskResult`. Cancellation, error-kind mapping, and session lifecycle are all delegated to `ACPSession`.

**ACP transport options:**

- **Stdio** (`ClientTransport`) — The standard transport. Agent runs as a child process over stdin/stdout JSON-RPC 2.0.
- **WebSocket** (`WebSocketClientTransport`) — For remote agents. Connects via WebSocket to an agent bridge. Exported as `WebSocketClientTransport`.

---

## 6. Server side: being driven by an editor

**`WrongStackACPServer`** is the v1 server. The bootstrap binary is `wstack acp server`; it reads JSON-RPC 2.0 from stdin and writes to stdout.

The v1 method set:

| Method | Direction | Notes |
|---|---|---|
| `initialize` | request → result | Negotiates `protocolVersion: 1`, returns `agentCapabilities` |
| `authenticate` | request → result | Optional. Returns "unauthenticated" if a gated tool is needed |
| `session/new` | request → result | Creates a new session; emits `current_mode_update` notification + returns `{sessionId, modes, configOptions}` |
| `session/load` | request → result | Loads a prior session; only enabled if `loadSession: true` |
| `session/prompt` | request → result | Starts a turn; streams `session/update` notifications, returns `{stopReason}` |
| `session/cancel` | notification | No response; cancels in-flight turn + active tool calls |
| `session/set_mode` | request → result | Switches mode, emits `current_mode_update` |
| `session/set_config_option` | request → result | Updates config, emits `config_option_update` |
| `session/list` | request → result | Lists persisted sessions |

Notifications emitted **to the client**:

| Notification | Trigger |
|---|---|
| `session/update` with `agent_message_chunk` | Streamed text from the runTurn |
| `session/update` with `tool_call` / `tool_call_update` | Tool execution lifecycle |
| `session/update` with `plan` | Plan entry changes |
| `session/update` with `usage_update` | Token/cost counters |
| `session/update` with `current_mode_update` | Mode change |
| `session/update` with `config_option_update` | Config change |
| `session/update` with `available_commands_update` | Slash commands change |
| `session/update` with `session_info_update` | Session metadata |

Concurrency is **per-session** (single-threaded per session, with proper `AbortController`-based cancellation). Multiple sessions can run in parallel.

The actual agent loop is delegated to a caller-provided `runTurn` callback: `({ sessionId, prompt, signal }) → { stopReason, text?, plan?, usage? }`. This keeps the handler unit-testable without coupling it to a core `Agent` instance.

**`ACPServerAgentTurn`** — `makeACPServerAgentTurn({ agentFor })` returns a `RunTurn` function. The factory takes an `agentFor(sessionId, cwd) → Agent` callback and lazily creates one `Agent` per session on the first `session/prompt` turn. The agent is reused across turns on the same session.

Per turn:

- Converts the ACP `ContentBlock[]` prompt to a single user-message string. Text blocks are concatenated; non-text blocks become bracketed placeholders (`[image: mime=…]`, `[audio: mime=…]`, `[resource: …]`) — full multimodal support is a future PR.
- Calls `agent.run(userMessage, { signal })` with the parent `AbortSignal` so `session/cancel` propagates correctly.
- Captures the agent's final text and emits it as a single `agent_message_chunk` notification.
- Returns `{ stopReason }` — `cancelled` on abort, `end_turn` otherwise.

The default bootstrap uses a no-op echo `runTurn` so the binary is a useful connectivity smoke test. Programmatic users pass the result of `makeACPServerAgentTurn({ agentFor: ... })` as `WrongStackACPServerOptions.runTurn`.

**`scripts/acp-smoke-test.mts`** — Node harness that spawns the bootstrap, walks a full session (initialize → authenticate → session/new → session/prompt → session/cancel → exit), and asserts on every response. Wired as `bun run --filter @wrongstack/acp smoke`.

---

## 7. Ensemble orchestrator

**`runEnsemble()`** is the user-facing fan-out engine. Pure orchestrator: takes a comma-list of agent ids + a task, returns an `EnsembleResult` with per-agent outcomes (`success` / `failed` / `skipped` / `cancelled`), a roll-up summary, iteration/tool counts, and a total duration. Honours an optional `signal` for cancellation and an optional `progress` callback for live updates.

```ts
export interface EnsembleResult {
  task: string;
  requested: string[];
  results: EnsembleAgentResult[];
  summary: { succeeded: number; failed: number; skipped: number; cancelled: number };
}

export interface EnsembleAgentResult {
  agentId: string;
  status: 'success' | 'failed' | 'skipped' | 'cancelled';
  result?: string;
  error?: { kind: string; message: string };
  reason?: string;            // for skipped (e.g. "binary not found")
  durationMs: number;
  iterations: number;         // agent-reported iteration count
  toolCalls: number;          // agent-reported tool call count
}
```

Flow:

1. Parse `agentIds` (split on `,`, trim, dedup).
2. For each id, resolve a command via `defaultEnsembleCmdResolver` (legacy `ACP_AGENT_COMMANDS` first, catalog fallback). If unresolved, mark `skipped` with reason.
3. `Promise.allSettled` — for each installed agent, run `ACPSession.start()` → `session.prompt(task)` with a shared `AbortSignal`.
4. Classify each result into `success` / `failed` / `cancelled` based on the error kind.
5. Render via `renderEnsembleText()` (or caller's own renderer).

Three entry points consume the same `runEnsemble`:

- **`wstack acp parallel <csv> <task>`** — CLI. Renderer is the formatted text block.
- **`/ensemble <csv> <task>`** — TUI/REPL slash command. Renderer is the same text block, returned to chat history.
- **Programmatic** — `import { runEnsemble } from '@wrongstack/acp'; await runEnsemble({...})` — any script or test.

**ACP Bench** (`acp-bench.ts`) — end-to-end verification that runs a standard task against every installed agent and produces a structured pass/fail report. Exported as `runAcpBench()` and `renderAcpBenchText()`. Wired as `wstack acp bench` / `/acp bench`.

---

## 8. Failure modes

| Mode | Behavior |
|---|---|
| Agent not installed | `runEnsemble` marks it `skipped` with reason `binary not found`. The CLI prints a warning and continues with the other agents. |
| Agent installed but predates ACP support | The probe's `installed: false, reason: 'binary predates ACP support'`. Same skip path. |
| Agent dies mid-turn | `transport` emits `close`; `ACPSession` reports `TaskResult.status = 'failed'` with `error.kind = 'bridge_failed'`. |
| User aborts (`Ctrl-C`) | `AbortSignal` fires → `runEnsemble` sends `session/cancel` notification to each running agent → waits for `stopReason: 'cancelled'` → marks them `cancelled`. Spec-compliant. |
| Permission prompt from external agent | `session/request_permission` arrives mid-stream → `ACPSession` calls `PermissionPolicy.request({tool, args, reason})` → user accepts/denies → reply with `outcome`. |
| `fs/read_text_file` for a path outside the project sandbox | `FileServer` refuses with JSON-RPC error `-32602`. Does not leak other paths' existence. Sibling-prefix attack (`/project-evil` vs `/project`) is also blocked. |
| Agent returns v2-RFD-only updates | `UnstableSessionUpdate` accepts `_unstable_*` discriminator. Logged at debug, not rejected. |
| Agent returns an unknown discriminator | `UnknownSessionUpdate` accepts. Logged, never crashes the session. |
| `wstack acp spawn` for an agent id in the catalog but not the legacy `ACP_AGENT_COMMANDS` map | The catalog fallback in `defaultEnsembleCmdResolver` resolves it. |

---

## 9. What ships today vs. roadmap

**Ships today:**

- v1 client + server (both spec-compliant, smoke-tested)
- 12-agent static catalog with live `$PATH` probe
- `/acp probe` — test connectivity to installed agents
- `/acp list` — live detection with version and integration status
- `/acp spawn <id> <task>` / `wstack acp spawn` — single agent dispatch
- `/acp parallel <csv> <task>` / `wstack acp parallel` — multi-agent fan-out
- `/ensemble <csv> <task>` — TUI/REPL slash command (same `runEnsemble` engine)
- `/acp sync` — fetch latest ACP registry (37+ agents) for offline caching
- `/acp server` / `wstack acp server` — start WrongStack as an ACP server
- `makeACPServerAgentTurn` adapter (real `Agent` → server)
- `makeACPSubagentRunner` / `makeACPSubagentRunnerWithStop` — single-agent runner
- ACP bench (`runAcpBench`) — end-to-end per-agent verification
- WebSocket transport (`WebSocketClientTransport`) for remote agents
- End-to-end smoke test (`bun run --filter @wrongstack/acp smoke`)

**Roadmap (not started):**

- **Phase 4 — Ensemble UX.** Live tabbed TUI panel for parallel runs; synthesis step that runs a fourth subagent to fold results; save/load "ensemble presets" in `~/.wrongstack/ensembles/*.json`.
- **Token-level streaming** in the server (capture `Agent`'s `Renderer` deltas, emit multiple `agent_message_chunk`).
- **Multimodal content blocks** — images, audio, embedded resources in the v1 `ContentBlock[]` prompt.
- **`session/load`** support in the server (resume a prior session).
- **ACP Registry HTTP API** integration for live catalog refresh (when the RFD stabilizes).

---

## Code reference (full)

### Public API surface (`@wrongstack/acp` index)

| Export | Kind | Use |
|---|---|---|
| `EnsembleRegistry` | class | Live detection |
| `AGENTS_CATALOG`, `findAgentDescriptor` | const + fn | Static catalog |
| `fetchAcpRegistry`, `ACP_REGISTRY_URL` | fn + const | Live registry sync (37+ agents) |
| `ACPSession`, `ACPSessionError` | class + class | v1 client |
| `FileServer`, `FsError` | class + class | Sandboxed filesystem |
| `TerminalServer` | class | Sandboxed terminals |
| `defaultPermissionPolicy`, `readOnlyPermissionPolicy`, `makePermissionPolicy` | const/const/fn | Permission UX presets |
| `makeACPSubagentRunner`, `makeACPSubagentRunnerWithStop` | fn + fn | Single-agent runner |
| `resolveAcpAgentCommand`, `probeAcpAgents` | fn + fn | Agent resolution |
| `makeACPServerAgentTurn` | fn | Real Agent → server adapter |
| `WrongStackACPServer` | class | v1 server bootstrap |
| `StdioTransport`, `ClientTransport` | class + class | JSON-RPC 2.0 over stdio |
| `WebSocketClientTransport` | class | WebSocket transport for remote agents |
| `runEnsemble`, `renderEnsembleText`, `defaultEnsembleCmdResolver` | fn × 3 | Multi-agent orchestrator |
| `runAcpBench`, `renderAcpBenchText` | fn × 2 | End-to-end per-agent verification |
| `EnsembleResult`, `EnsembleAgentResult`, `EnsembleRunnerOptions` | types | Ensemble types |
| `DetectedAgent`, `ACPAgentDescriptor` | types | Catalog types |

### Slash command and CLI handler

- `packages/cli/src/slash-commands/ensemble.ts` — `/ensemble`
- `packages/cli/tests/slash-ensemble.test.ts` — 10 unit tests
- `packages/cli/src/subcommands/handlers/acp.ts` — `wstack acp {list,spawn,parallel,server,sync}`

---

## Related docs

- [`docs/subcommands/acp.md`](subcommands/acp.md) — CLI surface reference
- [`docs/slash/ensemble.md`](slash/ensemble.md) — `/ensemble` slash command
- [ACP v1 spec](https://agentclientprotocol.com/get-started/introduction) — the protocol itself
