# Core capabilities

WrongStack is standalone-sufficient — the capabilities below work with **no
plugins required**. The [README](../README.md#core-capabilities) summarizes them;
deep reference lives in [`reference.md`](reference.md).

- [Tools & code intelligence](#tools--code-intelligence)
- [Autonomy & goals](#autonomy--goals)
- [Multi-agent fleet + Director](#multi-agent-fleet--director)
- [Self-improving roster agents](#self-improving-roster-agents)
- [TypeSafe / Jev decisions](#typesafe--jev-decisions)
- [Inter-agent mailbox](#inter-agent-mailbox)
- [SAGE — persistent long-term memory](#sage--persistent-long-term-memory)
- [Tasks & Kanban — active work tracking](#tasks--kanban--active-work-tracking)
- [Spec-Driven Development (`/sdd`)](#spec-driven-development-sdd)
- [Plugin ecosystem](#plugin-ecosystem)
- [Providers & subscription sign-in](#providers--subscription-sign-in)
- [Model routing & fallbacks](#model-routing--fallbacks)
- [HQ — cross-machine command center](#hq--cross-machine-command-center)
- [CodeMap & visual views](#codemap--visual-views)
- [Chimera — automatic code review](#chimera--automatic-code-review)
- [WrongTrace guardrails — optional sibling daemon](#wrongtrace-guardrails--optional-sibling-daemon)
- [Security & privacy](#security--privacy)
- [Token-saving mode](#token-saving-mode)

## Tools & code intelligence

The 78-tool built-in toolbox spans filesystem edits, code quality (`lint`/`format`/
`typecheck`/`test`), execution, web search/fetch, git, packages, browser/E2E
controls, and a project-owned Codebase Index. The index combines SQLite/FTS5
substring search, local semantic ranking, content-hash invalidation, symbol and
call-graph navigation, and bounded parser workers for large repositories. Full map:
[reference → tools](reference.md#built-in-tools).

`dead-code-scan` adds independent TypeScript reachability analysis with finding
ids, confidence and planned diffs. `dead-code-fix` rechecks selected findings,
typechecks affected packages by default and rolls back failed verification.
Backups support undo with conflict reporting. Public API and dynamic entrypoints
can have consumers outside the visible graph; review them before cleanup.
See [dead-code workflows](tools/dead-code.md).

**[WrongStack ToolFlow](toolflow.md)** composes repeated or dependent tool
calls in sandboxed JavaScript and returns the findings needed for the next
decision. Intermediate results stay out of model context; each call keeps its
permission checks and session record. WebUI and TUI show the run's
purpose, call count, failure count, and measured output bytes.

In a reproducible 50-read fixture using the real Agent/ToolExecutor and a
scripted provider, batched direct calls send **551,040 bytes in 50 result blocks**;
ToolFlow sends **120 bytes in one result block** (over 99.9% less result text).
Both use **two provider requests**, including the final answer. Sequential direct
calls use 51; discovering ToolFlow first adds a request. These are fixture result
bytes and request counts, not live-model speed, token, or billing measurements.
Use `tools.data(name, input)` for validated structured results from tools with an
output schema, including built-in read, grep and glob. Existing text calls remain
available; file content reads expose `raw_text` with truncation metadata.

Use ToolFlow when you can filter or compute a small answer inside the script;
use direct calls for simple operations and small independent batches. Returning
raw data still relies on the executor's ordinary preview/artifact handling.
See the [comparison and reproduction guide](toolflow.md#measured-contribution)
and the [generated measurement snapshot](../website/src/data/toolflow-contribution.json).

Every tool is registered and callable at every setting. How many are *described*
to the model on each request depends on the token-saving tier: the default trims
that to a working set and keeps the rest one `tool_search` away, so a long
session does not pay for every schema on every turn. Set
`features.tokenSavingMode: "off"` to describe them all directly.

## Autonomy & goals

`wstack automation` runs persistent scheduled or signed GitHub jobs in copied
Docker workspaces. WebUI manages jobs, versioned templates and
portable definitions, and show structured results with usage, known estimated
cost and read-only patches. `present_artifact` presents text, images, diffs and
owned live browsers. See [automation](subcommands/automation.md),
[artifact presentation](present-artifact.md),
[offline quality experiments](subcommands/bench-experiments.md) and
[cloud routing profiles](subcommands/provider-cloud.md).

`/goal` locks a verifiable contract and the eternal / parallel engines — two
run modes that keep looping through plan → act → check — run until it's done,
surfacing a live stage chip (`⟳ DECIDE` / `⚡ EXECUTE` / `◎ REFLECT`).
The **Brain** governs risky decisions with deterministic rules, decision traces,
quality gates, and circuit breaking.
Its optional Jev System One tier handles bounded lower-risk choices; high-risk
questions can reach a multi-model Council. The Council **Judge** still resolves
ties or below-threshold votes. Critical Council failure escalates without a
single-model fallback. CLI/TUI and standalone WebUI share this chain and live
settings; interactive decisions use the existing human-input form. See
[Brain controls and Judge behavior](slash/brain.md).

For executable phase goals, `/goals` and WebUI **My Goals** provide a project
catalog with goal ids, owning sessions, task/phase progress and blockers.
Git-backed terminal goals run in separate checkouts and retain their goal
branches for review before integration. See [project goal tracking](architecture/project-goals.md).

Task progress and final verification are distinct: a completed checklist does
not establish a verified outcome. Another terminal's goal is read-only in My Goals;
send mutations through its owning terminal.

[`/nextsteps required [limit]`](slash/nextsteps.md) closes finished turns
with a concrete next action or completion marker. In `auto` autonomy, open todos
take priority; a configured limit pauses consecutive automatic turns for input.
Defaults are required next steps and unlimited continuation, with repetition
guards still active.

[`/yolo on`, `/yolo plus`, `/yolo off`](slash/yolo.md) choose confirmation
behavior independently from continuation. YOLO+ removes confirmation prompts
for a conversation and its subagents, while user-authored refusal rules and
tool-declared denials remain enforced. WebUI tabs are isolated, and
`--restricted` locks YOLO+ off. [`/solo`](slash/solo.md) controls whether a
TUI session admits workers or only read-only companions; choose it before work starts.

## Multi-agent fleet + Director

A specialist roster and smart dispatcher fan out under a Director (the leader
agent that splits your request into delegated tasks). Each subagent is isolated
with its own budget and a JSONL transcript — an append-only, replayable log of
everything it did — coordinated over a project-wide mailbox. See
[Director architecture](director-architecture.md) and [agents](agents.md).

## Self-improving roster agents

Every roster role has a base definition, but each **project can teach it**. Under
`.wrongstack/agents/<role>/`, the role keeps its identity, a structured learning
buffer, and skill-specific practice at `skills/<skill>.md`. A run can end with a
`## LEARNED [skill: testing]` directive (or let WrongStack route it from the
wording); the next matching spawn receives that project practice immediately below
the bundled skill it refines. `/agent-improve <role> capture`, `optimize`, and
`skills` make the loop visible, while automatic optimization distils safely in the
background. Useful skills gain affinity from usage and outcomes, can be pinned,
and rise into the role's bounded eager-load set — so your bug-hunter, reviewer,
and executor improve where it matters without turning every prompt into a dump of
old notes.

## TypeSafe / Jev decisions

Jev is off by default, even with a saved or environment API key. Enable it with
`/jev on` or **Settings → Jev → Enable Jev**; `/jev off` disables all consumers
and paid calls while preserving the key. HTTP 402 stops further automatic
requests for that account until restart or an account change.

Manage the decision provider, key and feature switches in **Settings → Jev** in
the WebUI, or **`/jev`** in the TUI. The WebUI includes a live activity view
with request timing, usage, answers and safe failure categories; `/jev logs`
exposes the same process history. See
[Jev settings and activity](jev-settings-and-activity.md).

Explicitly enabled, configured accounts also expose the `jev` decision tool: agents can request
yes/no probabilities, choose among alternatives, or score supplied evidence
against a rubric. `jev_status` checks local availability without a network
request. Control this independently with `/jev feature tool on|off` or
**Settings → Jev → Agent decision tool**.

Optional Jev integration suggests a relevant skill before a turn and classifies
ambiguous fleet dispatches; those two consumers remain separately opt-in. The
bounded judgment features are available when an account is ready and can each
be switched off independently. Jev supports a native TypeSafe API key or
OpenRouter's Decisions endpoint through
`wstack typesafe login --route typesafe` or `--route openrouter`;
`wstack typesafe test` checks the selected account. Jev is a typed decision
service, not a chat model.
See [account setup and coverage](typesafe-account.md),
[skill suggestion](skills-suggestion.md), and
[fleet classification](fleet-dispatch-classifier.md).

## Inter-agent mailbox

One project-wide coordination plane connects **every agent, across every client,
process, session, branch, and linked Git worktree** — CLI, TUI, WebUI, VibeUI,
and HQ alike. Agents send typed messages (`ask`, `assign`, `steer`,
`result`, `review`, `status`), hand off work, broadcast milestones, and see who is
online with live presence — so parallel agents cooperate instead of colliding.
HQ can even route mailbox traffic and steer connected clients through their own
guardrails. All production callers use a deterministic local IPC endpoint; one
elected project owner alone opens `_mailbox.sqlite`, serializes mutations, and
publishes health and presence. Clients never open the mailbox database directly.

## SAGE — persistent long-term memory

**SAGE** is WrongStack's project-local, structured long-term memory. It lives at
`.wrongstack/memories/` backed by **SQLite/FTS5** (legacy JSONL auto-migrates on
first open), and it is *indexed by default*. The agent uses `remember`,
`memory_search`, and `pin_add` to persist and recall knowledge across sessions —
and relevant memories are **auto-injected** into context every turn. The same
project-owned service is available to external MCP clients through
`wstack-sage-mcp`; it is read-only by default, while `--writable` enables the
confirm-class mutation tools.

Claude Code, Codex, Cursor and Antigravity connect with one command —
`wstack sage connect <client>` — and get read access plus the ability to
propose memories for review. With HQ enabled, project-level memories sync to
every machine carrying the same committed project identity (`wstack sage sync`
runs that bridge headless).

- **Typed knowledge** — facts, decisions, conventions, preferences, anti-patterns, bug root causes, and file/symbol/command notes, each with importance + confidence.
- **Rich anchors** — a memory can bind to almost anything concrete: a **file**, a **directory**, a **symbol** (function/class/method), a **command**, a **git commit or blob**, a **test**, or a **package**. Anchored memories are re-verified as those targets change (file existence, content hash, git blob, symbol presence) and auto-surface when you touch that location — so knowledge stays pinned to the code it describes instead of drifting.
- **Knowledge graph** — typed edges + BFS traversal relate memories, files, symbols, and commands.
- **Audience-scoped** — memories can target specific roles/modes so role-specific guidance never clutters general recall.
- **Curated, not chaotic** — a review queue and hygiene pipeline keep memory trustworthy; deletions are guarded.
- **Checked, not trusted blindly** — a read-only Memory Companion verifies injected memories against current source, agents record evidence-backed feedback after real use, and a memory can state when it applies.

See the current [SAGE system reference](sage/SYSTEM-REPORT.md).

## Tasks & Kanban — active work tracking

Work is tracked with real, durable structure — not throwaway checklists:

- **`todo`** — session-level step tracking for the task in flight.
- **`plan`** — a persistent strategic roadmap that survives turns; promote items into todos or tasks.
- **`task`** — structured, cross-session work items with types, priorities, and dependencies.
- **`kanban`** — durable project boards with columns, task **chains**, dependencies, and assignment snapshots. One project IPC owner serializes the authoritative `.wrongstack/kanbans/_kanban.sqlite` state and broadcasts daemon events; clients do not open the database directly. The `@wrongstack/kanban` package provides the storage + lifecycle layer (claim, recover stale assignments, verify completion) with **lease fencing** (an old worker's lease cannot overwrite
  a newer assignment) and cost guardrails for safe multi-agent execution.

Managed cards follow an explicit `Backlog → Todo → Running → Review → Done`
lifecycle, and **HQ** exposes a shared, project-scoped board that reconciles live
across every clone carrying the project identity.

**Atomic verification** keeps tasks honest. Cards carry success criteria, goal
metrics, and checks; the board can **assess atomicity** and either *propose* or
*auto* decompose non-atomic work (`atomicityMode: off | assess | enforce`).
Completion isn't a rubber stamp — `verify_completion` gates a card into Done only
when its acceptance criteria and evidence actually pass, so a worker finishing
means the card enters **Review**, not Done.

## Spec-Driven Development (`/sdd`)

Turn a spec into acceptance criteria, decompose into dependency-linked tasks,
implement one at a time, and validate against the spec before closing — spec,
tasks, and verification evidence stay linked in project-scoped SDD stores so
progress is auditable at any point.

## Plugin ecosystem

A collection of managed first-party plugins extends the agent with focused,
single-purpose capabilities, each auditable and individually disableable. See
[plugin management](plugin-management.md) and the
[plugin author guide](plugin-author-guide.md).

## Providers & subscription sign-in

Providers span several API-key wire families, plus OAuth sign-in with ChatGPT
plan API, legacy Codex, Copilot, xAI/Grok, Kimi Code, Meta, OpenRouter, and
Antigravity. Claude has no sign-in: use an Anthropic API key or an installed ACP
agent. Browse with `wstack models`. See [OAuth sign-in](oauth-signin.md).

Account model choices come from the provider's live account catalog and an
account-specific cache. Empty or unavailable catalogs never create hardcoded
model choices; generic catalogs only enrich IDs already known to the account.
ChatGPT plan API, Kimi, xAI and Meta discovery renew expiring account tokens
before fetching models and report the cause when discovery fails.

**Bring your own endpoint.** Beyond the catalog, you can point WrongStack at *any*
OpenAI-compatible endpoint: **local models** via one-command presets for
**Ollama** (no key), **vLLM**, and **LM Studio**; **custom providers** with your
own `baseUrl` and env-var keys; and proxy/router gateways like **OmniRoute**. Run
entirely on localhost if you want — the same tools, fleet, and memory work
against a model on your own machine.

## Model routing & fallbacks

Mix providers and models freely, per role and per phase. A **model-routing
matrix** assigns a provider/model — or a named **fallback profile** — to any agent
role, phase, or the fleet-wide default (exact role → phase → `*` → leader). When a
model is overloaded (429/5xx), WrongStack rotates through an ordered **fallback
chain** automatically, and `favoriteModelsOnly` keeps that rotation on models you
trust. So a leader, a reviewer, and a bug-hunter can each run on a different model
in the same session, each with its own safety net.

## HQ — cross-machine command center

`wstack --hq` is the control plane for a whole room. It aggregates **live
sessions, agents, fleets, mailbox state, cost, tools, Brain decisions, and
worktrees across multiple machines and clients** in one dashboard — running many
providers and models simultaneously — and can steer runs, send BTW notes, queue
prompts, route mailbox traffic, or stop connected clients through their own
guardrails. Browser and client tokens are separate and capability-scoped; in
token mode every `/api/*` route and WS upgrade is gated.

## CodeMap & visual views

The WebUI turns the SQLite codebase index into **code intelligence you can see**.
**CodeMap** renders an interactive dependency/symbol graph (server-side cached,
with visible-element virtualization for large graphs) so you can navigate the
project's structure and hotspots at a glance. Alongside it, live **fleet
topology** and an **Office view** visualize your running agents spatially — who is
active, what each is doing, and how the fleet is wired — turning multi-agent runs
into something you can actually watch. Office desks, subagent tabs and
transcripts name each agent's full provider/model, and the selected agent's
detail panel follows live updates.

**A file's whole story, traceable.** CodeMap streams live per-file activity —
every read / write / edit / delete / search / index / execute — tagged with the
**session**, **agent**, **tool**, trace id, timestamp, and the actual line
changes (added / removed, before / after). So from the file explorer you can
replay what happened to any file over time: *which task, which session, which
agent, which tool touched it, and what it did* — the full, attributed history of a
change and everything it reached.

## Chimera — automatic code review

**Chimera** is a post-session code guardian. The built-in auto-review plugin
detects every git-tracked file you changed during a session and dispatches a
review subagent that reads the diffs and reports real, severity-ranked findings
(Critical → Low) with `file:line` references and a one-line fix each — surgical
bug-catching, not style nagging. Paired **fixer** agents can act on the findings,
and reviews can fan out in parallel across many changed files. Trigger it
on-demand with `/chimera`.

## WrongTrace guardrails — optional sibling daemon

WrongStack can coordinate with the external **WrongTrace** daemon when it is
running locally (default `http://localhost:3444`) — and silently does nothing
when it is not. Two independent integrations share that origin: the
**observability guardrails** and **provider rerouting**. Every mutating tool
call (`edit`, `write`, `replace`, `patch`, `codebase-ast-replace`) passes a
fail-open lock gate — a file locked by another owner denies the edit with the
owner and TTL in the reason, fragile files get a surgical-edit nudge, and an
offline daemon never blocks anything. The same daemon optionally rewrites
provider base URLs through `/proxy/` when `tools.wrongProxy.enabled` is set.
Full details: [`wrongtrace.md`](wrongtrace.md).

## Security & privacy

Encrypted secrets at rest, a permission policy on every tool call, project-root
containment that YOLO can't weaken, and a typed observability event catalog.
Threat model: [`SECURITY.md`](../SECURITY.md).

## Token-saving mode

`--token-saving-mode` trims the tool surface and prompt to cut cost. The tier
resolves once at boot (`off | auto | minimal | light | medium | aggressive`);
set `features.tokenSavingMode: "off"` to describe every tool on every turn.
