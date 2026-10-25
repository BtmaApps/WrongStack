# Analysis Report: WrongStack Desktop v2 — From-Scratch Rebuild on Tauri

- **Status**: Proposed (analysis — no implementation authorized by this document)
- **Author**: WrongStack leader session (with Ersin KOÇ, product owner)
- **Date**: 2026-10-25
- **Deciders**: Product owner; desktop/platform engineering
- **Scope**: Decide whether a from-scratch desktop rebuild on Tauri is feasible; define what the
  desktop contains and how it works; identify what differentiates it from existing desktop
  coding-agent tools (Codex app, MiniMax Code, ZCode, editor-first IDEs).
- **Evidence basis**: live registry checks and web research performed 2026-10-25 (Appendix A/B);
  current `apps/desktop` structure verified from repo source during prior session rounds (§7);
  §7 file references and the core cost/usage fields re-verified against the working tree on
  2026-10-25; the report passes the repository docs gate (`bun scripts/check-docs.mjs`: 1501 local
  links, 0 missing).
- **Related**: `apps/desktop` (current Electron app), `packages/webui` (chat UI reuse candidate),
  `docs/architecture.md` (platform narrative).

---

**Contents**: 1 Summary · 2 Context · 3 Market landscape · 4 Goals & non-goals · 5 Solution
(5.1 product · 5.2 architecture · 5.3 feasibility · 5.4 capability map · 5.5 security ·
5.6 user journey · 5.7 wireframes) · 6 Requirements, gates & budgets · 7 Electron limits ·
8 Alternatives · 9 Migration, effort, rollback · 10 Risks & open questions · 11 Decision
checklist · Appendices A (versions) · B (sources) · C (glossary)

---

## 1. Executive summary

**Question asked**: *Can we build very good desktop software from scratch with Tauri?*

**Answer: Yes — with three named conditions, and one strategic warning.**

1. **The shell is a solved problem.** Tauri 2.12.5 is stable and mature; on Windows (primary
   target) the WebView2 integration is first-class; the terminal stack is verified
   (`portable-pty` 0.9.0 + xterm.js 6.0.0). The one open item — multi-webview inside one window —
   has a stable workaround (child-window webviews).
2. **The Rust core is a real team cost.** Keep the core deliberately small (sessions, registry,
   PTYs, browser panes); all product logic stays in the existing TypeScript workspace.
3. **The framework buys none of the differentiation.** The market already converged on the same
   picture observed by the product owner: chat + terminal + browser preview + diffs. Codex app,
   MiniMax Code, and ZCode all ship it. Rebuilding that paradigm on Tauri yields a faster clone of
   the same product.

**Strategic warning**: every competitor models the world as *one project + one chat + some panes*.
WrongStack's existing DNA — multi-project workspaces, agent fleets, sessions, kanban, mailbox,
worktrees, transcripts — is exactly the unowned position. The recommended desktop is a
**session-first operations console for a multi-project agent fleet**, not another IDE.

**Recommendation**: proceed, gated by a 1–2 week Phase 0 spike with explicit acceptance gates (§6.2).

---

## 2. Context & problem statement

**Current state.** `apps/desktop` is an Electron app in which the React sidebar shell and the
embedded agent WebUI are sibling native `WebContentsView`s, coordinated by hand-written focus
plumbing, HTTP-probe readiness heuristics, a global busy flag, and `node-pty` terminals inside the
Electron main process (details and file references in §7). Each new surface multiplies that glue.

**Problem.** (a) The runtime fights growth: every added pane (browser, kanban, fleet wall) costs
disproportionate integration work. (b) The product occupies no defensible position: as a
"coding desktop" it would enter a market where 2026's entrants already look identical. (c) The
platform's actual differentiators (fleet, sessions, coordination) have no desktop surface.

**Desired impact of this document.** A go/no-go on the rebuild, with a product definition that
escapes the sameness trap and acceptance gates that make the decision cheap to reverse.

---

## 3. Market landscape (live-checked 2026-10-25)

| Product | What it is | Paradigm | Notable mechanics |
|---|---|---|---|
| **OpenAI Codex app** | Desktop command center for running multiple Codex agents (Mac, Windows) | Delegation + review | Isolated git worktree per agent, reviewable diffs, review queue, plan/goal modes, skills, automations |
| **MiniMax Code** | Desktop agent app: chat, local project context, file ops, terminal sessions, browser previews, skills, memory, automation (desktop closed-source; TUI/CLI/ACP open) | Conversational workspace | Broad parity bid; single-project conversational flow |
| **ZCode (Z.ai)** | Desktop coding agent for Win/Mac/Linux (~July 2026) on GLM-5.2 | Goal-driven agent workspace | Goal system, remote control, SSH development, multi-agent coordination; local modes explicitly advertise "no Electron" |
| Cursor / Windsurf / VS Code + Copilot | AI-assisted editors | Editor + assistant | The AI is a sidebar; the editor remains the center of gravity |
| Wave Terminal / WezTerm | Terminal-first workspaces; Wave embeds a browser; WezTerm runs a session multiplexer ("mux") | Terminal | Session reattach done right; no agents |

### 3.1 Why they all look the same

1. **Converged feature set.** Chat + terminal + browser preview + diff review + skills/automations
   is now table stakes — all three 2026 entrants ship the same list.
2. **Inherited information architecture.** Nearly every tool copies VS Code's skeleton (activity
   bar / left tree / chat panel / center). Copying the skeleton guarantees the same look regardless
   of runtime.
3. **Single-project world model.** One repo, one chat, some panes. Multi-project fleet operations
   are unserved everywhere.
4. **Ephemeral operating state.** Restart the tool and the operating picture (what ran, what it
   cost, what was verified) is gone.
5. **Vendor tether.** The desktop is a front-end for one provider's models; the app is the lock-in.

### 3.2 The white space nobody owns

- **Fleet wall**: all projects × all sessions on one surface — live status (starting / running /
  waiting / blocked / done), token and cost meters, blockers. No competitor has it.
- **Restarter-proof sessions**: sessions as persistent, reattachable resources (the WezTerm mux
  model applied to agents and terminals).
- **Verification loop as a first-class object**: preview + test run + diff review inside one
  session workspace, wired into the agent's loop instead of scattered across terminals and an
  external browser.
- **Platform neutrality + agent-scriptable app**: multi-provider agents (WrongStack already is),
  and the desktop itself being *just another client* of the same core API the agents use.

---

## 4. Goals & explicit non-goals

**Goals**

- G-A: A desktop where resources (terminal sessions, agent sessions, browser panes, project
  registry) survive UI reloads and app restarts.
- G-B: A home screen that shows the whole operation (fleet wall), not one repository.
- G-C: A built-in verification loop (preview → tests → diff review) per agent session.
- G-D: Reuse of the existing React frontend and `@wrongstack/webui` chat surface.
- G-E: An IPC/API surface small enough that agents themselves can drive the app.

**Explicit non-goals**

- N-1: **No full editor.** A read-only diff viewer at most. Competing with VS Code/Cursor/Zed on
  editing is the trap that homogenized the market; files appear inside sessions, never as the home
  screen.
- N-2: No plugin marketplace in v1 — extensibility stays config-driven via the existing WrongStack
  skill/plugin system.
- N-3: No cloud dependency; local-first storage and transcripts.
- N-4: No macOS/Linux work in the first phase (Windows-first; see risk §10).
- N-5: No in-app Chrome-extension support; CDP-level automation stays with the out-of-app
  Playwright browser capability the platform already owns.

---

## 5. Proposed solution & architecture

### 5.1 Product definition — what's inside, how it works

**Core objects**

```
Project (repo root, settings)
  └── Workdir[] (path, env overlay — includes linked git worktrees)
        └── Session[] (kind: terminal | agent | browser | review)
              └── Pane[] (attached UI surfaces)
```

Every object has a stable ID and is persisted: SQLite registry + JSONL transcript per session.
Session lifecycle is **attach / detach**: closing a pane detaches; only an explicit kill ends a
session. App restart enumerates live sessions and reattaches panes.

**Two-level information architecture (the differentiating one)**

- **Level 1 — Fleet wall (mission control).** The home screen. Cards per session across all
  projects: status, tokens/cost, last activity, blocked-on; a mailbox inbox; a kanban mini-board.
  This level does not exist in any competitor — it gives WrongStack's existing backend services a
  face.
- **Level 2 — Session workspace.** Opened per session. Tabs, not a file-tree IDE:
  `Chat (reused @wrongstack/webui) · Terminal · Preview (browser) · Diff/Review · Files (read-mostly)`.

**Multi-window**: one window per project or per session; any pane pops out. Layout wireframes:
§5.7.

**The four loops made first-class**

1. **Delegate loop** — pick project → create session → brief the agent (chat) → watch live output
   → intervene via the session terminal.
2. **Verify loop** — agent finishes → embedded preview opens the dev server → tests pane → diff
   review with accept / request-changes → kanban card moves. The loop competitors leave to the
   user's memory becomes a UI state machine.
3. **Coordinate loop** — cross-session mailbox, handoffs, mentions: surfaces the IPC mailbox the
   platform already runs.
4. **Audit loop** — every session is a JSONL transcript → timeline replay, per-project token/cost
   analytics (requires core instrumentation — open question, §10).

**The five differentiators**

1. Session-first, not editor-first.
2. Fleet wall with multi-project status and cost/token observability.
3. Native verification loop in one workspace.
4. Restarter-proof sessions — the operating picture survives restarts.
5. Agent-scriptable app — humans and agents use the same core API.

### 5.2 Technical architecture

```
┌───────────────────────────────────────────────────────────┐
│ Windows (any number) — Shell UI: React 19 + Tailwind 4    │
│   fleet wall · session workspaces · panes                 │
│   disposable: reload/quit loses nothing                   │
│        ▲ typed commands (JSON-RPC) + binary events        │
│ Workspace Core (Rust, Tauri main process)                 │
│   SessionManager   PTYs, agent sessions, attach/detach    │
│   BrowserManager   WebView2 child-webview panes, 0 caps   │
│   ProjectRegistry  SQLite + JSONL transcripts             │
│   watchers · settings · secrets (OS keyring)              │
└───────────────────────────────────────────────────────────┘
```

Trait-bound the core (`SessionHost`, `BrowserHost`) so extracting it into a standalone daemon
(named-pipe JSON-RPC server) later is mechanical — the precondition for differentiator #5.

**Component picks** (versions verified live 2026-10-25, Appendix A)

| Concern | Pick |
|---|---|
| Shell | Tauri 2.12.5 + `@tauri-apps/cli` 2.12.4 |
| Terminal backend | `portable-pty` 0.9.0 (ConPTY on Windows); output coalesced ~16 ms; binary frames, never JSON bytes |
| Terminal frontend | xterm.js 6.0.0 (+ fit / search / webgl / serialize addons) |
| Browser pane v1 | iframe preview for `localhost:*` dev servers |
| Browser pane v2 | WebView2 child webviews, zero capabilities, per-pane DevTools |
| Data | SQLite (rusqlite) + JSONL transcripts |
| Secrets | `keyring` crate → Windows Credential Manager |
| Updates | `tauri-plugin-updater`, signed |

**IPC surface (kept deliberately small, ~15 commands)**: `project.*`, `workdir.*`,
`session.{open,attach,detach,kill,write,resize,snapshot,list}`, `browser.{open,navigate,close}`,
`settings.*`. TS bindings generated from Rust (tauri-specta or ts-rs — chosen at scaffold time).
Events: `session://<id>/output` (binary), `session://<id>/exit`, `fs://changed`.

**Security & reliability**: the UI webview holds the capability set; browser panes hold none;
strict CSP on the UI; no Node runtime anywhere; workdir path validation at the core boundary (the
core is a trust boundary, treated like a server). Failure modes: a crashed pane never takes down
the core; PTY output applies backpressure via a bounded channel (drop-oldest for terminal bytes);
core panics are contained per session.

### 5.3 Feasibility — is Tauri good enough?

**What Tauri 2 gives**: stable core (2.12.5) with a mature plugin ecosystem (updater,
window-state, tray, global shortcut, clipboard, notifications, deep-link); WebView2 Evergreen
runtime on Windows that we neither ship nor patch; per-webview capability/ACL security (a
structural property Electron never had); a Rust core for the resource-heavy parts; ~10 MB-class
installers with no bundled Chromium.

**Honest limits**: multi-webview in one window is still behind Tauri's `unstable` Cargo flag
(verified — upstream announcement + open layout issues); browser panes use child-window webviews
until it stabilizes. Cross-platform later means WKWebKit on macOS — planned for explicitly, not
today. No in-app Chrome-extension story (by non-goal N-5). Rust competence is required for the
core — mitigated by keeping the core small.

---

### 5.4 Capability mapping — what the desktop will contain (full inventory)

**Method.** Inventories below are read from the actual surfaces on 2026-10-25:
`packages/webui/src/components/**` (120+ components), `packages/tui/src/components/**` (80+
components), `packages/cli/src/slash-commands/*` (120+ commands). Guiding principle: **the desktop
hosts platform capabilities; it does not re-implement them.** Every row reaches the desktop through
the same cross-surface plane the other surfaces already share (`~/.wrongstack/projects/<slug>/`:
mailbox, SessionRegistry, kanban, SAGE, sessions).

#### 5.4.1 Inherited from WebUI (component-level reuse)

| Capability | Verified components (`packages/webui/src/components/`) | Desktop manifestation |
|---|---|---|
| Agent chat + streaming | `ChatView/`, `ChatInput`, `MessageBubble/` suite, `StreamMeter/`, `ThinkingBubble` | Chat pane in every agent session (the G5 reuse path) |
| Session management | `SessionTabBar`, `SidePanel/SessionPanel`, `SessionInspectView`, `AgentTranscript`, `SessionWatchPanel` | Session workspace tabs + transcript/replay viewer |
| Kanban | `KanbanView`, `KanbanBoardChrome`, `KanbanTaskTree`, `KanbanRunControls`, `KanbanVerificationDashboard`, `KanbanDecompositionPanel`, `KanbanBoundaryEditor`, `KanbanAgentRunPanel`, `TaskCard`, `TaskRiskPanel`, `TaskExecutionAttempts` | Kanban pane per project + fleet-wall mini-board; lease/dispatch lifecycle unchanged |
| SDD | `SddWizard`, `SddTaskDrawer`, `SddKanbanView`, `SddFlowGraph`, `SddActivityFeed` | Spec / task-graph / flow panes inside the project window |
| Codebase Atlas / map | `CodeMap`, `CodeMapVisuals`, `CodeMapRelations`, `CodeMapRelationInspector`, `CodeMapSelectedNodeSummary`, `CodeMapCanvasToolbar`, `CodeMapActivityStreamPanel`, `CodeMapSearchResults`, `DependencyGraph` | **Atlas map pane** — PageRank hubs, Louvain communities, click-to-open a session at a symbol. No competitor's desktop has a living code map tied to agent sessions |
| Embedded browser | `BrowserLivePane`, `BrowserElementSelection` | Already prototyped in WebUI; desktop upgrades it to the capability-less WebView2 pane (Phase 3, gate G3) |
| Diff review | `DiffView`, `SidePanel/ChangesPanel` | Review tab of the verification loop |
| Model / provider UX | `ModelPicker`, `ModelSelectDialog`, `ModelPickDialog`, `SettingsPanel/ModelCatalogPicker`, `SettingsPanel/ModelSchemaEditor`, `SettingsPanel/ProviderSavedProfiles`, `SetupScreen/ModelEditor`, `SetupScreen/CustomProviderSection`, `FallbackSuggestionsPanel` | Settings surfaces reused as-is (see 5.4.3) |
| Skills | `SidePanel/SkillsList`, `SkillDetailView`, `SkillInstallDialog`, `SkillCreateDialog` | Skills pane + install/create flows |
| Automations & cron | `AutomationView`, `AutomationEnvironment`, `AutomationRunParts`, `AutomationPullRequestPanel`, `CronJobsPanel`, `CronTrigger` | Automations pane per project; global "scheduled" tray surface |
| Worktrees | `WorktreeLanes`, `WorktreeTimeline` | Workdir/worktree visualization per project (maps onto the Workdir model in 5.1) |
| Tech-stack security | `TechStackView/` suite (`DependencyTable`, `DependencyDetail`, `FindingsPanel`, `RemediationTab`, `TrendsTab`, `AnalyzeControls`) | Project dependency/security pane |
| Context UX | `ContextBar`, `ContextMemoryMonitor`, `ContextModePicker` | Context meters in pane headers |
| Office / self-learning | `OfficeMapCanvas/`, `OfficeMapSettingsPanel`, `SelfLearningDetail`, `AvailabilityCalendarEditor` | v1.x backlog pane |
| Shell furniture | `CommandPalette`, `SearchOverlay`, `CostChip`, `AnalyticsDashboard`, `GoalView`, `UserInputDialog`, `CollabPanel`, `WorkspaceDock`, `WelcomeScreen`, `UpdateBanner`, `ChimeraReviewsHeader` | Reused directly inside the new shell |

#### 5.4.2 Promoted from TUI/CLI (feature parity, new rendering)

Verified TUI panels: `fleet-panel`, `agents-monitor`, `kanban-panel`, `brain-panel` +
`brain-decision-prompt`, `subagent-models-panel`, `fallback-overlay`, `context-panel` (+
cache/residency), `sessions-panel`, `worktree-panel`/`worktree-monitor`, `audit-panel`,
`skill-picker`, `model-picker`, `mcp-picker`, `plugin-picker`, `prompt-picker`, sidebar panels
(project, coordinator, fleet, connections, agents, workspace).

| TUI/CLI capability | Evidence | Desktop rendering |
|---|---|---|
| Fleet & agents monitors | `fleet-panel.tsx`, `agents-monitor.tsx`, `/fleet *` | The fleet wall (Level 1) — cross-project aggregation is the genuinely new part |
| Brain decisions | `brain-panel.tsx`, `brain-decision-prompt.tsx`, `/brain`, `/brain-council` | Native decision/approval center with risk-tier setting (`/brain risk`) |
| Subagent model lanes | `subagent-models-panel.tsx`, `/subagent-models` | Live routing visualization per session (lane acquisition/release on Director add/remove) |
| Fallback chain | `fallback-overlay.tsx`, `/fallback`, `/fallback-chain-view`, `/provider-status` | Live provider-health + fallback-hop indicator (`provider.fallback` events) |
| 120+ slash commands | `packages/cli/src/slash-commands/*` | Command palette entries, scoped session → project → global; no command loses reachability |
| Audit & journaling | `audit-panel.tsx`, `/audit` | Session journal / replay viewer over JSONL transcripts |
| Collab debug | `/collab`, `CollabPanel` | Fleet event stream pane (bug-hunt / review cascades) |

#### 5.4.3 Platform subsystem → desktop surface

| Subsystem | Existing state (verified) | Desktop surface | Priority |
|---|---|---|---|
| Providers & model routing | Anthropic/OpenAI/Google/OpenAI-compatible adapters; `modelMatrix`; session lanes; `/setmodel`, `/models`, `/modelcaps`, `/tier`, `/effort` | Routing settings reuse + per-session model chip | P1 |
| Fallback | `fallbackModels` chain, cooldown/half-open probing, `provider.fallback` events | Chain-status indicator per session | P1 |
| Memory (SAGE) | SQLite store, FTS5, graph, injection middleware, hygiene | Memory browser/review pane, injection preview | P2 (v1.x) |
| Kanban | IPC-backed board, lease-fenced dispatch, Backlog→Done lifecycle | Board pane + fleet-wall mini-board | P1 (Phase 4) |
| Codebase Atlas | CodeMap suite + `/codebase-map`, `/codebase-reindex`, `.wrongstack/atlas/` freshness | Atlas pane | P2 (v1.x) |
| Permissions / YOLO | Per-call approval, nine `DestructiveKind`s, deny rules, `autonomy.yoloConfirm` | **Approval center**: native permission prompts, YOLO status, confirm flows | P1 |
| Sessions | JSONL events, cross-process SessionRegistry, `costUsd`/`tokensIn`/`tokensOut` | Transcript replay + restarter-proof reattach | P0 |
| MCP | Registry, lazy connect, management core | Settings pane (`MCPSection`, `MCPServerDialog`, `MCPTasksPanel`) | P1 |
| ACP | Client + agent (Zed/JetBrains/VSCode) | Connections pane (TUI connections parity) | P2 |
| Skills / plugins / prompts | Skill loader + registry; 90-entry plugin catalog; prompt library | Skills pane P1; plugin manager P2; prompts P2 | P1–P2 |
| Observability | Metrics/Traces/Health, Prometheus/OTLP | Diagnostics pane (`/health`, `/metrics`, `/doctor` parity) | P2 |
| Telegram | Bridge plugin | Settings toggle only | P2 |

#### 5.4.4 Desktop-only additions (no surface has these today)

1. **Fleet wall** — cross-project aggregation (Level 1, §4.2).
2. **Pane/layout engine + reattachable panes** — sessions as restorable window state.
3. **Verification loop state machine** — preview → tests → diff → kanban transition, driven by the agent's own loop.
4. **Approval center** — permission prompts as native notifications instead of terminal inline prompts.
5. **Cross-project command palette & search.**
6. **Tray / notification-center presence.**

#### 5.4.5 Net assessment

The desktop is roughly **80% assembly of existing, verified capabilities** (5.4.1–5.4.3) and
**20% genuinely new surface work** (5.4.4). This is why the Phase-0 gates (§6.2) test the new
20% — PTY plumbing, reattach, capability isolation, WebUI reuse — and not the 80% that already
runs today. It also quantifies the differentiation risk in reverse: any competitor must rebuild
this platform inventory before the desktop even starts; WrongStack only has to arrange it.

### 5.5 Security & trust model

The desktop inherits the platform's security identity — per-call approval and project-root
containment — and adds three boundaries of its own:

1. **The core is the trust boundary.** It executes PTYs, filesystem access, and process control.
   It validates every request (workdir containment, path checks) like a server, regardless of
   which client asked — the human UI or an agent.
2. **Browser panes are fully untrusted.** Zero IPC capabilities (ACL), separate webview, own
   user-data directory. A malicious page can neither discover nor call the core.
3. **The desktop consumes the existing permission system; it does not create a second one.** The
   approval center (5.4.4) renders the same `PermissionPolicy` decisions — including the nine
   `DestructiveKind` confirmations and the locked `agent-state` / `credential-bind` kinds — as
   native UI. The UI can never flip autonomy gates without the same confirmations the CLI
   enforces.

Additional invariants: the IPC surface authenticates its clients (single-owner IPC is already
proven by the project mailbox boundary); the desktop core stays loopback-only — remote access goes
through HQ's token/capability scopes, the platform's only deliberate cross-machine surface;
project config remains untrusted (the same allow-list sanitizer applies — the desktop never reads
provider keys from project config); secrets stay in the per-machine secret vault / OS keyring,
never plaintext; peer presence remains coordination metadata, never an authorization signal.

### 5.6 A working day (how it works, end to end)

1. Morning: the fleet wall shows two overnight automations finished and one session blocked on
   approval — the notification center has already surfaced it.
2. Approve from the wall (approval center); the session resumes; the cost/token chip shows where
   the night's budget went.
3. Open a project window: the SDD flow graph shows the task graph; the kanban mini-board shows two
   cards in Review.
4. Brief a new agent in the session chat; it acquires a model lane; the routing chip shows the
   resolved provider/model; the fallback indicator is green.
5. The agent finishes → verification loop: preview pane opens the dev server, the tests pane runs
   the target suite, diff review shows the worktree changes → request one change → the agent
   iterates → accept → the kanban card moves to Done.
6. The laptop dies mid-afternoon → relaunch → every terminal and agent session reattaches with its
   transcript tail; nothing is lost.
7. Evening: analytics show the per-project cost trend; audit replay walks the blocked session's
   timeline; one memory is flagged for review in the SAGE browser (v1.x).

### 5.7 Layout concept (wireframes)

**Level 1 — Fleet wall (the landing surface)**

```
┌──────────────────────────────────────────────────────────────────────┐
│ WrongStack — Fleet wall            [⌘K palette]  [settings]  3 runs  │
├────────────┬─────────────────────────────────────────────────────────┤
│ PROJECTS 4 │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │
│ ● wrongst. │ │ wrongstack   │ │ vibeui       │ │ website      │      │
│ ○ vibeui   │ │ session 8f2  │ │ session a1c  │ │ session 77b  │      │
│ ○ website  │ │ agent·running│ │ ⏸ waiting    │ │ ✓ done       │      │
│ ○ docs-inf │ │ $1.42 · 38kt │ │ $0.31 · 9kt  │ │ $2.10 · 61kt │      │
│ INBOX (2)  │ └──────────────┘ └──────────────┘ └──────────────┘      │
│ KANBAN min │ ┌──────────────┐ ┌────────────────────────────┐         │
│            │ │ docs-infra   │ │ ⚠ blocked: approval needed │         │
├────────────┴─┴──────────────┴─┴────────────────────────────┴─────────┤
│ 3 running · 1 blocked · today: $3.83 / 108k tokens                   │
└──────────────────────────────────────────────────────────────────────┘
```

**Level 2 — Session workspace (one tab set per session)**

```
┌──────────────────────────────────────────────────────────────────────┐
│ ◀ wall │ wrongstack · session 8f2 · agent (provider·lane-2)    ⏸ ✕  │
├──────────────────────────────────────┬───────────────────────────────┤
│ Chat (reused WebUI)                  │ Terminal — workdir: pkgs/webui│
│  user: fix the flaky telegram test…  │ $ bun test telegram           │
│  agent: editing tests/…  [tool ✓]    │ 201 passed                    │
├──────────────────────────────────────┼───────────────────────────────┤
│ Diff — worktree wt/fix-telegram  +41 −9   [Review ▸ accept / changes]│
├──────────────────────────────────────┴───────────────────────────────┤
│ Preview ▸ localhost:5173   Tests ▸ vitest   Kanban ▸ wstack-12       │
└──────────────────────────────────────────────────────────────────────┘
```

Reading notes: the wall's cards are live projections of the same session objects the windows show;
the workspace's bottom strip is the verification-loop state machine (§5.4.4 item 3); every chip
(routing, fallback, cost, context) is a read path over existing core data (§5.4.3).

---

## 6. Requirements & acceptance criteria

### 6.1 Requirements

- `[critical]` Core owns PTY sessions; a terminal pane's output/scrollback survives webview reload
  and app restart (reattach by session ID).
- `[critical]` Session registry persisted (SQLite) with JSONL transcripts per session.
- `[critical]` Agent chat via reused `@wrongstack/webui` inside a Tauri webview, talking to the core.
- `[high]` Browser pane with zero IPC capabilities; per-pane DevTools.
- `[high]` Multi-project registry with workdir overlays; one window per project supported.
- `[high]` Fleet wall reading live session status from the core.
- `[medium]` Diff/review pane over a session's worktree changes.
- `[medium]` Token/cost meters per session/project (core fields already exist: cumulative
  `costUsd` / `tokensIn` / `tokensOut` per agent in `packages/core/src/session-catalog/session-registry-types.ts`,
  `usage: Usage` on the session record in `packages/contracts/src/types/session.ts`; only a desktop
  read path is needed).
- `[low]` Window-state persistence, global shortcut, tray.

### 6.2 Phase 0 spike — acceptance gates (go/no-go contract; all must pass)

| Gate | Observable check |
|---|---|
| G1 | PTY terminal pane: resize + scrollback work; pane survives webview reload with state intact |
| G2 | 3 concurrent sessions at ~10k lines/s with no dropped frames (measured; numbers recorded) |
| G3 | Browser pane as child webview with zero capabilities; DevTools opens per pane |
| G4 | App restart → sessions reattach from the registry with transcript tail |
| G5 | `@wrongstack/webui` loads inside a Tauri webview and reaches the core (reuse contract proven) |

A gate that fails twice gets a root-cause writeup before any workaround.

### 6.3 Non-functional budgets (targets validated at the gates — not claims)

| Metric | Target | Validated by |
|---|---|---|
| Cold start | ≤ 2.0 s to interactive fleet wall | Phase 1 |
| Idle RAM | ≤ 150 MB (Electron baseline measured side-by-side first) | Phase 1 |
| Installer size | ≤ 15 MB | Phase 5 |
| PTY throughput | ≥ 10,000 lines/s × 3 concurrent sessions, no dropped frames | G2 |
| Reattach after restart | ≤ 500 ms per session | G4 |
| Pane input latency | < 1 frame (16 ms) end-to-end | Phase 1 |

### 6.4 Product success metrics (v1 judgment — baselines measured first)

| Question | Metric | Target (hypothesis to validate) |
|---|---|---|
| Do blocked sessions get unblocked faster? | Median time-in-blocked per session | −50% vs terminal-only baseline (measured month 1) |
| Do sessions actually survive? | % sessions reattached with intact state on restart | ≥ 99% |
| Is the verification loop used? | % accepted changes that passed preview+tests+diff | ≥ 60% within 2 months |
| Is the wall the home screen? | Share of launches landing on the fleet wall | ≥ 80% |
| Is cost visible? | Sessions with cost chip consulted before continue/abort | Qualitative review, first quarter |

---

## 7. Why the current Electron app can't evolve there

Observed in `apps/desktop` during prior verified sessions (source-checked memory, symbol level):
shell and embedded WebUI are sibling native `WebContentsView`s (`main.ts`,
`webui/controller.ts`) glued by manual focus-boundary handoffs (`shared/focus-boundary.ts`,
`preload-focus.ts`, `DesktopWebuiController.routeFocus`); runtime readiness relies on HTTP-probe
heuristics (`runtime-process.ts waitForHttpReady` had a false-ready class of bugs); renderer state
includes a global busy flag (`shell store.ts withBusy`); PTYs (`node-pty`) live in the Electron
main process. These are structural properties of "the window is the app": each additional pane
(browser, kanban, fleet wall) multiplies the plumbing. The rebuild changes the topology instead of
adding more glue.

---

## 8. Evaluated alternatives & trade-offs

| Alternative | What it means | Verdict | Trade-off rationale |
|---|---|---|---|
| **A. Evolve the current Electron app** | Add panes incrementally inside the existing topology | Rejected | Every new surface costs disproportionate glue (§7); session persistence and capability isolation are structural, not incremental; the runtime pain that motivated this analysis remains |
| **B. Tauri 2 rebuild, session-first product** *(recommended)* | New shell + Rust core; React frontend carries over; dual-build during migration | **Proceed, gated by Phase 0** | Solves topology (§7) and enables the unowned product position (§3.2); costs: Rust competence, child-window browser panes until multiwebview stabilizes |
| **C. Wails v3 (Go)** | Same topology, Go core | Held as fallback | v3.0.0-beta.34 — still beta; smaller ecosystem; correct only if the team refuses Rust |
| **D. Stay on Electron, invest only in product** | Fleet wall etc. inside current app | Rejected as primary | Product position is achievable, but every new pane still pays the §7 glue tax; capability isolation for browser content remains weak |
| **E. Wait for Tauri multiwebview / other runtimes** | Defer | Rejected | The unstable API is not on the critical path (child windows suffice); waiting forfeits the open market position |
| Editor-first designs (Cursor-like) | Full editor + agent sidebar | Rejected | Direct collision with the strongest incumbents; produces exactly the sameness the product owner observed (N-1) |

**Framework comparison note**: Electron's residual advantages — bundled Chromium consistency and
the Node ecosystem — are real but do not address the structural problems; the verified alternatives
table in Appendix A supports B over C/E on maturity.

---

## 9. Migration, rollout & rollback strategy

**Rollout (dual-build, no point of no return until Phase 5)**

| Phase | Content | Depends on |
|---|---|---|
| **0 — Spike** | Gates G1–G5 | — (1–2 weeks) |
| **1 — Core + parity** | Registry, sessions, PTY, transcripts; shell with project/workdir tree + terminal | G1–G4 |
| **2 — Agent sessions** | Chat panes (reuse WebUI), reattach, transcript tail | Phase 1, G5 |
| **3 — Verification loop** | Browser panes, diff/review, tests surface | Phase 2 |
| **4 — Fleet wall** | Cross-project status, kanban, mailbox views | Phase 2 (core API only); parallel with Phase 3 |
| **5 — Ship** | Updater, packaging, multi-window polish; delete Electron app | Phases 3–4 |

During Phases 1–4 a `PlatformAdapter` (TS interface) wraps every shell-specific touchpoint
(IPC, PTY, `shell.openExternal`, app paths) so the Electron and Tauri builds coexist; the React
frontend is shared. The Electron app ships to users until the Phase 5 parity checklist is signed
off (terminal IO, resize, clipboard, links, drag-drop, tray, notifications, updater).

**Rough effort envelope** (single team, sequential; planning input only — Phase 0 recalibrates
these): Phase 1 core+parity 3–5 wk; Phase 2 agent sessions 2–3 wk; Phase 3 verification loop
3–4 wk; Phase 4 fleet wall 2–3 wk (overlaps Phase 3 — core-API-only dependency); Phase 5 ship
1–2 wk. Calendar total ≈ 11–17 weeks.

**Rollback / abort criteria**

- Any gate failing twice without a root-cause fix → stop the spike; stay on Electron; revisit in
  two quarters or when multiwebview stabilizes.
- G5 failure specifically (WebUI won't run outside Electron) → fall back to Alternative D
  (product-only investment in the current app) while keeping the analysis on file.
- No user data is at risk: the registry format is additive; the Electron app's project/session
  data is imported once by a migration script, never destroyed.

---

## 10. Open questions & reader testing

**Hardest reviewer questions (cold-reader pass)**

1. *"Why not just keep improving Electron — what's the quantified payoff?"* — Qualitative today:
   §7 lists structural costs that scale with every pane. The spike (G2) produces the first hard
   numbers (throughput, memory, installer size) before any commitment; treat missing numbers as a
   reason to run Phase 0, not to skip it.
2. *"What happens to existing desktop users during migration?"* — Nothing changes until Phase 5;
   both shells build from the same frontend via `PlatformAdapter`; cutover requires a signed parity
   checklist; registry import is additive.
3. *"Is session persistence worth core complexity?"* — It is the differentiator competitors lack
   (§3.2 items 2–3) and the platform already produces the underlying assets (JSONL transcripts,
   session registries); the incremental core cost is one SQLite schema plus file handles.

**Resolved during review (2026-10-25)**

- *Does `@wrongstack/core` already expose per-session token/cost stats?* **Yes — verified.**
  `packages/core/src/session-catalog/session-registry-types.ts` carries cumulative `costUsd`,
  `tokensIn`, and `tokensOut` per agent/session; the session record in
  `packages/contracts/src/types/session.ts` carries `usage: Usage`; and the HQ event envelope
  (`packages/webui-protocol/src/projections.ts`, `packages/cli/src/hq-server.ts`) already
  broadcasts cost events cross-surface. Phase 4's fleet-wall meters need **no new core
  instrumentation** — only a desktop read path over existing data.

**Risk register**

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Rust capacity gap in team | M | H | Core kept minimal (sessions + registry only); Phase 0 validates before any commitment; contractor fallback |
| Multiwebview stays `unstable` long-term | M | M | Child-window panes are the plan of record; no architectural dependency on the API |
| G5 fails (WebUI won't run outside Electron) | L–M | H | WebUI couples at the protocol level only; abort path → Alternative D (§8) |
| Scope creep toward an IDE | M | H | N-1 is a hard non-goal; product review gate at each phase boundary |
| Early macOS requirement | L | M | Trait-bound core keeps rendering behind one seam; WebView deltas documented in Phase 1 |
| Budget gaming on §6.3 targets | L | M | Budgets are gate-checked with recorded numbers against a side-by-side Electron baseline |

**Unresolved open questions**

- Team Rust capacity: who owns the core long-term?
- Does any current user require macOS before Phase 5?

---

## 11. Decision checklist

1. Approve the paradigm: operations console (session-first) instead of IDE clone?
2. Approve Tauri 2 + Rust core, accepting the team-cost condition?
3. Fund Phase 0 with gates G1–G5 as the go/no-go contract?
4. Confirm Windows-first; state if/when macOS is required?

---

## Appendix A — verified versions (live registries, 2026-10-25)

| Package / fact | Version / status | Source |
|---|---|---|
| `tauri` (Rust) | 2.12.5 (newest = max stable) | crates.io API |
| `@tauri-apps/cli` | 2.12.4 | registry.npmjs.org |
| `portable-pty` | 0.9.0 | crates.io API |
| `@xterm/xterm` | 6.0.0 | registry.npmjs.org |
| `wails/v3` (alternative) | v3.0.0-beta.34 — still beta | proxy.golang.org |
| Tauri multiwebview-in-one-window | `unstable` Cargo flag, open layout issues | upstream docs/issues (#10420, #2975) |
| Wails v3 status | "beta software with a stable desktop API" | v3.wails.io |

## Appendix B — landscape sources (checked 2026-10-25)

- Codex app: openai.com product pages as reviewed by intuitionlabs.ai and vibecoding.app
  (multi-agent orchestration, worktrees, review queue, plan/goal modes).
- MiniMax Code: agent.minimax.io/docs/code/welcome; github.com/MiniMax-AI/minimax-code
  (TUI/CLI/ACP open, desktop app closed-source).
- ZCode: windowsforum.com launch note (July 2026, Win/Mac/Linux, GLM-5.2);
  github.com/zai-org/ZCode (clients + agent runtime; local modes advertise no Electron);
  aimadetools.com feature overview.
- Tauri multiwebview status: v2.tauri.app beta announcement; tauri-apps/tauri issues.

## Appendix C — Glossary

| Term | Meaning in this document |
|---|---|
| PTY | Pseudo-terminal — the kernel object behind a real terminal session; ConPTY is Windows' implementation |
| ACL | Tauri's per-webview capability list deciding which IPC commands a webview may call |
| IPC | Inter-process communication between the UI webviews and the Rust core |
| Mux | Session multiplexer — a server that owns sessions so clients can attach/detach (WezTerm model) |
| Worktree | A linked second checkout of the same git repository; used for agent isolation |
| Lane | A session-scoped provider/model slot a subagent holds and releases (§5.4.3) |
| SDD | Spec-driven development workflow (spec → task graph → execution) |
| SAGE | The platform's structured memory store (SQLite + graph + FTS5 search) |
| YOLO | The platform's reduced-approval autonomy mode; explicitly not blanket auto-approval |
| ACP | Agent Client Protocol (Zed / JetBrains / VSCode integrations) |
| MCP | Model Context Protocol (external tool servers) |
| JSONL | One JSON object per line — the transcript file format |
| CDP | Chrome DevTools Protocol (browser automation — out of scope per N-5) |
