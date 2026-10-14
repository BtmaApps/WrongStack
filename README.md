<div align="center">

# WrongStack

### Ships with a Brain, a Memory, and a full toolbox. Yours to run anywhere.

**A free, open-source AI coding agent that gets better at _your_ codebase over time. It reads code, runs tools, and coordinates specialist agents — with durable memory, visible permission boundaries, and no subscription required.**

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![tests](https://img.shields.io/badge/tests-passing-2f9e44?style=flat-square)](#status)
[![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![open source](https://img.shields.io/badge/open%20source-yes-ff3154?style=flat-square)](https://github.com/WrongStack/WrongStack)

---

macOS / Linux — one self-contained binary, no Node.js needed
```bash
curl -fsSL https://wrongstack.com/install.sh | sh
```

Windows
```powershell
irm https://wrongstack.com/install.ps1 | iex
```

</div>

---

WrongStack is **free, open source, and MIT licensed**. Give its leader a task:
It can work directly or delegate independent parts to specialist agents.
The **Brain** evaluates policy decisions; **SAGE** retains project knowledge
across sessions; **Kanban** tracks work and verification; the **mailbox** links
agents across clients; and **Chimera** reviews their diffs. Autonomous goal loops
and parallel workers use these same systems, rather than a separate agent engine.
Built-in tools, bundled skill playbooks, managed first-party plugins and a live
[models.dev](https://models.dev) provider catalog sit on a compact, swappable kernel.

The coding loop compares completed tool results when detecting repetition.
With the LSP plugin and hooks enabled, successful single and bulk file edits include bounded,
version-bound diagnostics or an explicit unverified notice. Research briefs
preserve API/version evidence and unresolved questions. See [agent feedback](docs/agent-feedback.md).

**Built from scratch, stands on its own.** WrongStack is not a plugin layer or an
orchestration kit bolted onto another coding tool — it's a complete agent written
top to bottom: its own compact kernel, its own provider transports with real SSE,
its own tool executor, permission policy, memory system, and multi-agent runtime.
Nothing here wraps a third-party CLI; everything works standalone.

### The scale of it

Not a thin wrapper — a real engine. The codebase is first-party,
TypeScript-strict source across a full monorepo, guarded by an extensive test
suite. Memory, tools, providers, permissions, and the multi-agent runtime are all
first-party and work together, on your machine, with no upstream agent to phone
home to.

### What's new in 1.1.4

- **ACP agents use the project's services:** an ACP agent leading a session or
  working as a delegated worker is told at the start of each task to use the
  project's index, memory, mailbox and board, and is told about new `/btw`
  notes and mail while its turn runs.
- **Mailbox inbox over MCP:** the mailbox MCP server reads the actor's own
  unread mail with one `inbox` action.
- **Clearer WebUI agent identity:** subagent tabs, transcripts, the Office view
  and the office map show each agent's full provider/model. The office map no
  longer draws expired idle workers as desks, and its detail panel follows live
  updates and fits narrow screens.
- **Correctness fixes:** delegation abort and auto-wake races, ACP output
  framing, shared WebUI quota reads, bounded index skeletons over MCP,
  BOM-prefixed MCP replies, and techstack Elixir, Go and Swift lookups.

Highlights from **1.1.3**, the previous release:

- **Claude Code as leader:** `wstack --provider acp --model claude-code` or
  [`/model acp/claude-code`](docs/slash/model.md) makes an installed ACP agent the
  session's leader, in the TUI or a WebUI tab. It can run WrongStack's workers,
  and resuming the session continues its own conversation.
- **Delegated Claude workers:** `delegate` hands tasks to an installed Claude
  Code worker that gets the project's MCP servers, answers to WrongStack's
  permission rules and shows its subscription quota.
- **Claude sign-in removed:** the `anthropic-oauth` login, which only worked by
  presenting WrongStack as Claude Code, is gone; use an Anthropic API key or ACP.

1.1.2 made file edits lossless, kept stores from overwriting files they cannot
parse, kept secrets out of history and sync and made safety refusals terminal;
1.1.1 added [`/browser allow loopback`](docs/slash/browser.md) and ChatGPT
quota readings; 1.1.0 added [request residency](docs/slash/context.md), last-request cache
readouts and leaner tool-error context; 1.0.37 added Bun-first development, browser setup, `codebase-read-symbol` and the
[Skill Companion](docs/skills-suggestion.md); 1.0.36 added phase-aware leader
effort, per-worker effort routing and audit-driven hardening; 1.0.35 hardened
command guards, secret redaction and dependency audits; 1.0.34 added [project goals](docs/architecture/project-goals.md),
[explicit continuation](docs/slash/nextsteps.md), [YOLO+](docs/slash/yolo.md)
and the [dead-code workflow](docs/tools/dead-code.md).

See the [release history](CHANGELOG.md) for earlier releases.

> **New here?** Jump to [Install](#install) → [Quick start](#quick-start).
> **Already running it?** Keep current with [`wstack update`](#staying-current).

---

## Table of contents

- [Why WrongStack](#why-wrongstack)
- [How WrongStack compares](#how-wrongstack-compares)
- [Requirements](#requirements)
- [Install](#install)
- [Staying current](#staying-current)
- [Quick start](#quick-start)
- [Surfaces](#surfaces)
- [Core capabilities](#core-capabilities)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Packages](#packages)
- [Status](#status)
- [Docs](#docs)
- [License](#license)

---

## Why WrongStack

- **It remembers your project.** **SAGE** keeps long-term memory in
  SQLite/FTS5, anchored to files, symbols, commands and commits and re-verified
  as they change.
- **A fleet that coordinates.** A Director splits work across a specialist
  roster, one project mailbox links every agent, client and worktree, and each
  role learns the practice that works in *this* repo.
- **Goals that end verified.** `/goal` loops until a locked contract passes,
  the **Brain** rules on risky calls, and Kanban cards reach Done only when
  their criteria pass.
- **Six surfaces, one engine.** REPL, TUI, WebUI, SimpleUI, Desktop and the
  cross-machine **HQ** share the same sessions and memory.
- **Any model, including local ones.** API keys or subscription sign-in, a
  models.dev catalog, Ollama / vLLM / LM Studio presets, and per-role routing
  with fallback chains.
- **Guarded where it counts.** Encrypted secrets and a permission policy on
  every tool call; opt-in project-root containment that neither YOLO nor a
  repo-committed config can turn off; **Chimera** reviews your diffs.

The full list is under [Core capabilities](#core-capabilities).

---

## How WrongStack compares

Most AI coding tools are either a single-agent CLI or an orchestration kit
around someone else's agent CLI. WrongStack is a complete agent written from
scratch:

| | Wrapper / orchestration-only tools | **WrongStack** |
|---|---|---|
| **Core** | Coordinates an external agent CLI | **Own kernel, provider transports and built-in tools** |
| **Memory** | Usually none, or bolted-on files | **SAGE** — code-anchored SQLite/FTS5 memory, recalled every turn |
| **Multi-agent** | Orchestrates external processes | **Native fleet + Director** with isolated budgets and one mailbox |
| **Local-only** | Needs the upstream tool and network | **Runs on localhost** with Ollama / vLLM / LM Studio presets |
| **Surfaces** | One terminal | **Six** — REPL, TUI, WebUI, SimpleUI, Desktop, HQ |
| **Safety** | Depends on the wrapped tool | **Per-call permission policy** and Chimera review of your diffs |

---

## Requirements

- **Standalone binary:** nothing — the executable carries its own runtime
  (Windows x64/arm64, macOS x64/arm64, Linux x64/arm64 incl. musl)
- **Bun install and development:** Bun ≥ 1.4.3; see the [Bun workflow](docs/bun.md)
- **Node package consumers:** Node.js ≥ 22.19.0 remains supported

---

## Install

### Standalone binary (recommended)

One executable per platform with the runtime, every surface and all bundled
assets inside — no Node.js, npm or `node_modules`:

```bash
# macOS / Linux
curl -fsSL https://wrongstack.com/install.sh | sh
```

```powershell
# Windows
irm https://wrongstack.com/install.ps1 | iex
```

The installers download the build for your OS/CPU (musl is detected on
Linux), verify it against the release `SHA256SUMS`, and install `wstack` plus a
`wrongstack` alias into `~/.wrongstack/bin`. The musl builds need the C++
runtime (`apk add libstdc++ libgcc` on Alpine). Set `WSTACK_VERSION=1.2.3` to pin a
release or `WSTACK_INSTALL_DIR` to install elsewhere. You can also download a
`wstack-<os>-<arch>` file from the
[releases page](https://github.com/WrongStack/WrongStack/releases) and put it on
your `PATH` yourself.

On first run the binary unpacks its assets (prompts, skills, design kits,
grammars, the WebUI/HQ/SimpleUI frontends) once into
`~/.wrongstack/runtime/<version>/`.

Not available in the binary: the WebUI terminal panel (needs the native
`node-pty` addon), the Electron desktop shell, and the browser tool unless
Playwright is installed separately. The HQ systemd installer (`wstack hq
service install`) manages an npm install; run `wstack hq` under your own
service manager instead.

### npm (legacy)

The npm packages (`wrongstack`, `@wrongstack/cli`) are legacy and no longer the
way to install WrongStack — GitHub Releases is the only supported channel. If
you installed through npm, pnpm, yarn or bun before, just run the installer
above: it finds those globals and uninstalls them (asking first on a terminal)
so they cannot shadow the binary.

The TUI is lazy-loaded behind `--tui`, so plain-REPL users pay no React/Ink cost
at startup. The browser UI, HQ, and Desktop shell are available through their
launch flags (see [Surfaces](#surfaces)).

For standalone CLI users, Desktop is a separate Electron application distributed
through GitHub Releases. `wstack --desktop` opens an installed application;
portable/custom locations use `WRONGSTACK_DESKTOP_EXECUTABLE`.
See [Desktop distribution](docs/desktop-distribution.md) for installation and release details.

Then just run:

```bash
wrongstack        # or the short alias: wstack
```

From a source checkout, the same built CLI can run directly on Bun:

```bash
bun run build
bun run start:bun
```

`bun run smoke:bun` verifies Bun's SQLite-backed SAGE path, heap watchdog,
WebUI server module graph, and CLI entry point. Node continues to use
`node:sqlite`; Bun selects `bun:sqlite` automatically.

To run HQ as a boot-persistent, auto-restarting systemd service with password
authentication and an optional IP/CIDR admission list, see
[HQ service](docs/hq-service.md).

---

## Staying current

Update the CLI in place from inside the tool:

```bash
wstack update                 # download + verify the latest release
wstack update --check-only    # is a newer release available?
```

`wstack update` pulls from GitHub Releases and checks the download against the
release `SHA256SUMS` before swapping the executable in place. Re-running the
install one-liner does the same thing.

Full flag reference: [CLI reference → Updating](docs/cli-reference.md#updating).

---

## Quick start

```bash
# First run — interactive auth/setup, then a launch menu on a TTY
wstack

# Add an API key or sign in with a ChatGPT/Codex subscription
wstack auth

# Skip the picker and pin a provider/model
wstack --provider anthropic --model claude-sonnet-4

# TUI with an explicit YOLO override
wstack --tui --yolo

# Director fleet orchestration
wstack --director

# Single-shot query (non-interactive)
wstack -p "explain packages/core/src/kernel"

# Resume a saved session
wstack --resume
```

First run walks you through authentication and model selection. No config? The
interactive provider/model picker launches automatically. Switch providers any
time at runtime with `/model`.

Full flag and subcommand reference: [`docs/cli-reference.md`](docs/cli-reference.md).

---

## Surfaces

| Surface | Launch | Best for |
|---------|--------|----------|
| **REPL** | `wstack` | Fast, dependency-light terminal use |
| **TUI** | `wstack --tui` | Rich full-screen terminal with panels |
| **WebUI** | `wstack --webui` | Browser chat + tool/diff/session panels |
| **SimpleUI** | `wstack --simpleui` | Fast, focused standalone browser chat (see below) |
| **Desktop** | `wstack --desktop` | Electron shell over a token-gated local WebUI |
| **HQ** | `wstack --hq` | Cross-machine command center for a whole team |

Plain `wstack` on a TTY opens a launch menu; add `--no-menu` to go straight to the
REPL. See [WebUI](docs/webui.md) for the browser surface details.

WebUI and SimpleUI keep their host terminal compact: repeated warnings share
one row, logs and finished workers disappear after 30 seconds, and live worker
rows fit the terminal. Use `WEBUI_VERBOSE=1` for full console output.

The WebUI's **Story** button opens [Session Story](docs/session-story.md): a visual
timeline of the selected tab and its subagents, with activity charts, team
branches, replay, and recorded file, memory, and mail evidence.
Its dashboard tabs expose measured tool averages/P95 and file read/edit/write
counts, with recorded source and diff line statistics where available.
The Models tab compares provider/model reliability, measured latency and spend,
and recorded work/quality signals across the leader and its subagents.
The secondary sidebar pins Story at the top and switches it to **Back to
session** when open. Chat sidebar sections collapse and reorder by dragging,
with keyboard/touch arrow controls and saved browser layout preferences.

**SimpleUI** is a full, independent chat surface (Vite + React), not a
stripped WebUI. It reuses the same WebSocket backend but ships its own bundle,
with a sticky composer, `@`-file picker, streaming markdown + syntax highlighting,
vision/image attachments, session switching, and a lazy-loaded Tools/Todo/Task/Plan
sidebar — deliberately minimal, fast, and focused.

---

## Core capabilities

WrongStack is standalone-sufficient — everything below works with **no plugins
required**. Each row links to its full write-up in
[Core capabilities](docs/capabilities.md); deep reference lives in
[`docs/reference.md`](docs/reference.md).

| Capability | What you get |
|------------|--------------|
| [Tools & code intelligence](docs/capabilities.md#tools--code-intelligence) | 73 built-in tools, a SQLite/FTS5 codebase index with call-graph navigation, dead-code cleanup with rollback, and [ToolFlow](docs/toolflow.md) for scripted tool batches |
| [Autonomy & goals](docs/capabilities.md#autonomy--goals) | Scheduled automation jobs, `/goal` loops governed by the Brain, project goal tracking, `/nextsteps`, YOLO/YOLO+ and `/solo` |
| [Multi-agent fleet + Director](docs/capabilities.md#multi-agent-fleet--director) | A specialist roster under a Director; each subagent has its own budget and a replayable transcript |
| [Self-improving roster agents](docs/capabilities.md#self-improving-roster-agents) | Roles learn project-specific practice per skill and load the useful parts on the next spawn |
| [TypeSafe / Jev decisions](docs/capabilities.md#typesafe--jev-decisions) | An opt-in typed decision service for skill suggestion, dispatch classification and the `jev` tool |
| [Inter-agent mailbox](docs/capabilities.md#inter-agent-mailbox) | One project-wide message plane across every client, process, session and worktree |
| [SAGE memory](docs/capabilities.md#sage--persistent-long-term-memory) | Project-local SQLite memory with code anchors, a knowledge graph, review and per-turn recall |
| [Tasks & Kanban](docs/capabilities.md#tasks--kanban--active-work-tracking) | `todo`, `plan`, `task` and durable boards with lease fencing and verified completion |
| [Spec-Driven Development](docs/capabilities.md#spec-driven-development-sdd) | Spec → acceptance criteria → linked tasks → validation against the spec |
| [Plugin ecosystem](docs/capabilities.md#plugin-ecosystem) | Managed first-party plugins, each auditable and individually disableable |
| [Providers & sign-in](docs/capabilities.md#providers--subscription-sign-in) | API-key providers, subscription sign-in, live account catalogs, local and custom endpoints |
| [Model routing & fallbacks](docs/capabilities.md#model-routing--fallbacks) | Per-role and per-phase models with automatic fallback chains |
| [HQ](docs/capabilities.md#hq--cross-machine-command-center) | A cross-machine dashboard that can steer connected clients through their guardrails |
| [CodeMap & visual views](docs/capabilities.md#codemap--visual-views) | Dependency graph, fleet topology, Office view and attributed per-file history |
| [Chimera](docs/capabilities.md#chimera--automatic-code-review) | Post-session review of changed files with severity-ranked findings |
| [WrongTrace guardrails](docs/capabilities.md#wrongtrace-guardrails--optional-sibling-daemon) | An optional daemon for file locks and provider rerouting; a no-op when absent |
| [Security & privacy](docs/capabilities.md#security--privacy) | Encrypted secrets, a permission policy on every tool call, project-root containment |
| [Token-saving mode](docs/capabilities.md#token-saving-mode) | Tiered trimming of the described tool surface and prompt |

---

## Configuration

| Scope | Location | Purpose |
|-------|----------|---------|
| Environment | env vars | Overrides and secrets injection |
| User config | `~/.wrongstack/config.json` | Providers, defaults, feature toggles |
| Project conventions | `<project>/.wrongstack/AGENTS.md` | Shared, committed repo conventions |
| Project instructions | `<project>/AGENTS.md` (or `CLAUDE.md`) | Loaded into the system prompt |
| Directory instructions | `<dir>/AGENTS.md` (or `CLAUDE.md`) | Sent once, when the agent first touches a path under `<dir>` |
| Project identity | `<project>/.wrongstack/project.json` | Repository-stable `proj_<ULID>` |

`apiKey`-like fields are auto-encrypted on first contact; plaintext keys in older
configs migrate transparently on boot. Full details:
[`docs/configuration.md`](docs/configuration.md).

---

## Architecture

```
CLI       → REPL, renderer, slash commands, subcommands
TUI       → Ink frontend (lazy-loaded behind --tui)
WebUI     → Browser UI + WS bridge (standalone or --webui)
Desktop   → Electron shell hosting a token-gated local WebUI
Runtime   → Default host assembly + WrongStackPack extension composition
Kernel    → Container · Pipeline · EventBus · RunController (the 4 primitives)
Provider  → Multiple wire families, factories built from ModelsRegistry, real SSE
Models    → models.dev/api.json fetched + cached + classified
Services  → deterministic local IPC → one owner each → SQLite-backed project state
```

**Four contracts** hold the design together:

1. **Minimal kernel** — the four primitives stay small enough to read end to end.
2. **Zero non-overridable behavior** — services bound through `Container`, pipelines as middleware, all extension points in registries.
3. **Standalone sufficiency** — works with the built-in tools and no plugins.
4. **Layered, not monolithic** — every feature composes over the kernel through registries; nothing above it is load-bearing.

Full walk-through: [`docs/architecture.md`](docs/architecture.md).

---

## Packages

| Package | Purpose |
|---------|---------|
| `@wrongstack/core` | Kernel, agent, types, registries, plugin contract |
| `@wrongstack/runtime` | Default runtime implementations + host composition |
| `@wrongstack/providers` | Anthropic/OpenAI/OpenAI-compatible/Google adapters + SSE |
| `@wrongstack/tools` | Built-in tools (incl. browser/E2E + SQLite codebase index) |
| `@wrongstack/mcp` | MCP server registry + reconnection logic |
| `@wrongstack/acp` | Agent Client Protocol client + agent support |
| `@wrongstack/bench` | Benchmark harness (Aider polyglot + SWE-bench Verified) |
| `@wrongstack/kanban` | Task-board primitives: queues, recovery, cost guardrails |
| `@wrongstack/sage` · `@wrongstack/persistence` | Project-local memory/anchors and shared persistence primitives |
| `@wrongstack/codebase-index-mcp` · `@wrongstack/kanban-mcp` · `@wrongstack/mailbox-mcp` · `@wrongstack/sage-mcp` | Project-service MCP servers with explicit capability tiers |
| `@wrongstack/requirement-intake` · `@wrongstack/requirement-intake-mcp` | Source-annotated requirement records and their project-scoped MCP surface |
| `@wrongstack/sdd` | Spec-Driven Development stores, trackers, workflow helpers |
| `@wrongstack/governance` · `@wrongstack/security-scanner` · `@wrongstack/techstack` | Workflow policy, security scanning, and dependency intelligence |
| `@wrongstack/cli` | REPL, subcommands, slash commands, terminal renderer |
| `@wrongstack/tui` | Ink-based TUI (lazy-loaded behind `--tui`) |
| `@wrongstack/webui` · `@wrongstack/webui-server` · `@wrongstack/webui-hq` · `@wrongstack/simpleui` | Browser UIs, shared backend, and HQ dashboard |
| `@wrongstack/desktop` | Electron desktop shell |
| `@wrongstack/plug-lsp` · `@wrongstack/telegram` | LSP and Telegram plugins |
| `@wrongstack/wrongtrace` | Client adapter for the optional WrongTrace daemon (file locks, health, friction, atlas) — HTTP/IPC/MCP, no-op when absent |
| `@wrongstack/plugins` | Official plugin collection via subpath exports |
| `wrongstack` | Published CLI app entry (`wrongstack` / `wstack`) |

---

## Status

- **v1.1.4** — current repository version; semver from 1.0.0 onward
- Full release verification: `bun run release:check` before publishing
- Coverage thresholds (root Vitest): ≥76% lines / ≥75% functions / ≥66% branches / ≥75% statements
- Packages and apps use TypeScript strict + `noUncheckedIndexedAccess`
- CI, dependency audit and Pages deployment are manually dispatched; pushes do not run them
- Node 22.19+ only, ESM-only, no CommonJS bundles
- Threat model: [`SECURITY.md`](SECURITY.md)

---

## Docs

| Doc | What it covers |
|-----|----------------|
| [Getting started](docs/getting-started.md) | First session and everyday workflow |
| [Documentation index](docs/README.md) | Maintained guides and dated archives |
| [CLI reference](docs/cli-reference.md) | Launch flags, subcommands, and `wstack update` |
| [Core capabilities](docs/capabilities.md) | Tools, autonomy, fleet, memory, boards, providers, HQ and review in depth |
| [Reference](docs/reference.md) | Tools, providers, slash commands, modes, skills at a glance |
| [Project Kit](docs/project-kit.md) | Reusable project tools with schemas, verification, revisions, and execution history |
| [Slash commands](docs/slash/) | Every built-in slash command |
| [Subcommands](docs/subcommands/) | Every `wstack <subcommand>` |
| [Configuration](docs/configuration.md) | Config files, env vars, project conventions |
| [Architecture](docs/architecture.md) | Kernel primitives, pipelines, agent lifecycle |
| [Project goals](docs/architecture/project-goals.md) | Goal ownership, checkouts, progress and verification |
| [Tool workflows](docs/tools/README.md) | Language tools, dead-code cleanup, codebase context and web evidence |
| [Typed client API](docs/client-api.md) | Integrating with the WebUI protocol and client |
| [SAGE memory](docs/sage/SYSTEM-REPORT.md) | Long-term memory: storage, anchors, knowledge graph, retrieval |
| [SAGE feedback lifecycle](docs/sage-feedback-lifecycle.md) | Memory Companion, validity conditions, evidence-based feedback |
| [OAuth sign-in](docs/oauth-signin.md) | Subscription authentication |
| [HQ service](docs/hq-service.md) | Always-on HQ under systemd |
| [Plugin author guide](docs/plugin-author-guide.md) | Building a plugin |
| [Director architecture](docs/director-architecture.md) | Fleet orchestration internals |
| [WrongTrace integration](docs/wrongtrace.md) | Optional daemon: guardrail hooks, file locks, proxy routing |
| [Troubleshooting](docs/troubleshooting.md) | Common issues |

---

## License

[MIT](LICENSE) © WrongStack contributors.

Contributor setup and migration dry-runs: [Bun workflow](docs/bun.md).
