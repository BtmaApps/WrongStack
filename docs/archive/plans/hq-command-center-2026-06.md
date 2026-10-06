# HQ Command Center Plan — 2026-06

> Archived on 2026-10-06. Claims, counts and test results below are historical
> evidence or proposals; they are not current checkout certification. Use the
> [maintained documentation](../../README.md) and current source for runtime behavior.


**Feature:** Cross-project, cross-client WrongStack HQ panel
**Command target:** `wstack --hq`
**Default endpoint:** `http://127.0.0.1:3499` / `ws://127.0.0.1:3499/ws`
**Primary goal:** Monitor and coordinate all WrongStack clients from one independent command center.
**Status:** Planning document / implementation blueprint
**Owner:** Maintainers + WebUI/TUI/Fleet contributors

---

## Executive Summary

WrongStack already has local bidirectional data flows between CLI/TUI/REPL sessions, WebUI, SimpleUI, fleet telemetry, and persistent inter-agent mailboxes. The HQ feature extends that model into a project-independent command center: one process, one port, one machine or VPS, and one dedicated WebUI surface that receives live telemetry from every WrongStack client and mailbox.

`wstack --hq` starts a standalone HQ server and a completely separate HQ web application. CLI/REPL, TUI, WebUI, SimpleUI, and Desktop clients can connect to it from any project and report activity. HQ can show a unified all-project overview or drill down project by project.

This is not a replacement for project-scoped WebUI. It is a higher-level observability and coordination layer for all running clients.

---

## Goals

1. **One command center:** `wstack --hq` opens a dedicated HQ panel.
2. **One machine, one port:** HTTP, WebSocket, and API traffic share a single configurable port, default `3499`.
3. **Project-independent:** HQ state lives outside project roots under the user/global WrongStack data directory.
4. **All clients report to HQ:** CLI/REPL, TUI, WebUI, SimpleUI, Desktop, and future clients publish telemetry to the same HQ endpoint.
5. **Mailbox visibility:** HQ monitors project mailboxes and inter-agent messages across projects, including unread/incomplete/high-priority counts, agent presence, and safe message previews.
6. **Live mailbox event feed:** when an HQ browser drilldown is open on a project, every new `mailbox.event` envelope (sent/read/completed, agent registered/heartbeat/offline) is appended to a per-project drawer feed in near-real-time, with a transient "live" status indicator and a 50-entry ring buffer per project.
7. **Cross-project visibility:** HQ groups data by project while also supporting an all-project global overview.
7. **Remote-capable:** clients on other local or remote machines can connect to an HQ server over LAN, VPN, VPS, or Cloudflare Tunnel.
8. **Access controlled:** remote access requires authentication, with optional password login and token-based client enrollment.
9. **Relay capable:** an HQ machine can act as the central relay/collector for multiple developer machines.
10. **Non-invasive:** projects continue to run normally if HQ is unavailable.
11. **Actionable roadmap:** implementation can be split into small, testable phases.
12. **Drawer auto-refresh:** the project drilldown re-fetches `/api/projects/:id` (debounced ~250 ms) when a global snapshot for the open project arrives, so mailbox counts, recent messages, and the event feed stay current without manual reload.

---

## Non-Goals

- HQ does **not** replace per-project session storage.
- HQ does **not** require every client to be online at startup.
- HQ does **not** need to execute arbitrary tools remotely in Phase 1.
- HQ does **not** require public internet exposure; localhost/LAN remains the default.
- HQ does **not** merge project configurations or secrets.
- HQ does **not** make different project agents share context.

---

## Current System Fit

Existing pieces this plan should build on:

| Existing piece | Current role | HQ reuse |
|---|---|---|
| `packages/webui` | Project-scoped React + WebSocket UI | Reuse server primitives and build tooling, but create a separate HQ app/shell |
| `wstack --webui` | CLI session + browser share one agent | Add optional HQ publisher from the same runtime events |
| TUI fleet monitor | In-process graphical fleet status | Publish normalized fleet events to HQ |
| `/fleet` + Director | Subagent orchestration and usage snapshots | Publish fleet snapshots, lifecycle events, cost/health summaries |
| Inter-agent mailbox | Project-level cross-session messaging and agent presence | Publish safe mailbox snapshots, unread/incomplete counts, agent status, and redacted message previews |
| Session JSONL | Durable per-session event log | HQ can ingest live events and optionally index summaries |
| WebUI instance registry | Tracks local WebUI instances | HQ should have a separate global client registry |

Important design choice: HQ observes and coordinates. It should not become a hidden global agent kernel. Each project/session still owns its own agent lifecycle.

---

## Proposed User Experience

### Start HQ locally

```bash
wstack --hq
```

Expected output:

```text
WrongStack HQ listening on http://127.0.0.1:3499
Client endpoint: ws://127.0.0.1:3499/ws/client
Browser endpoint: http://127.0.0.1:3499
Auth: local browser session established
```

Optional flags:

```bash
wstack --hq --host 0.0.0.0 --port 3499
wstack --hq --open
wstack --hq --password
wstack --hq --token-file ~/.wrongstack/hq/client-token
wstack --hq --data-dir ~/.wrongstack/hq
```

### Connect clients

Per-client command-line override:

```bash
wstack --hq-url http://localhost:3499
wstack --hq-url http://192.168.1.10:3499 --hq-token <token>
wstack --webui --hq-url http://localhost:3499
```

Environment variables:

```bash
WRONGSTACK_HQ_URL=http://localhost:3499
WRONGSTACK_HQ_TOKEN=<client-enrollment-token>
WRONGSTACK_HQ_PROJECT_ALIAS=wrongstack-core
```

Config file shape:

```jsonc
{
  "hq": {
    "enabled": true,
    "url": "http://localhost:3499",
    "token": "env:WRONGSTACK_HQ_TOKEN",
    "projectAlias": "wrongstack-core",
    "publish": {
      "sessionEvents": true,
      "fleetEvents": true,
      "toolEvents": true,
      "costEvents": true,
      "mailboxEvents": true,
      "logs": false
    }
  }
}
```

### Remote HQ / relay machine

LAN:

```bash
wstack --hq --host 0.0.0.0 --port 3499 --password
```

Cloudflare Tunnel:

```bash
wstack --hq --host 127.0.0.1 --port 3499 --password
cloudflared tunnel --url http://localhost:3499
```

VPS:

```bash
wstack --hq --host 0.0.0.0 --port 3499 --password --data-dir /var/lib/wrongstack-hq
```

Clients connect with:

```bash
WRONGSTACK_HQ_URL=https://hq.example.com wstack
```

---

## Architecture Overview

```text
┌────────────────────────────────────────────────────────────────────┐
│                         HQ Machine / VPS                          │
│                                                                    │
│  wstack --hq                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Single HTTP Server :3499                                     │  │
│  │                                                              │  │
│  │  GET  /                    HQ React app                      │  │
│  │  GET  /assets/*            static assets                     │  │
│  │  WS   /ws/browser           browser live stream/control       │  │
│  │  WS   /ws/client            client telemetry/control channel  │  │
│  │  POST /api/login            password login                    │  │
│  │  POST /api/clients/enroll   create/revoke client tokens       │  │
│  │  GET  /api/snapshot         current normalized state          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                     │
│                              ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ HQ Core                                                      │  │
│  │ - client registry                                            │  │
│  │ - project registry                                           │  │
│  │ - normalized event bus                                       │  │
│  │ - snapshot reducer                                           │  │
│  │ - persistence adapter                                        │  │
│  │ - access-control policy                                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
        ▲                     ▲                         ▲
        │                     │                         │
        │ WS /ws/client       │ WS /ws/client           │ WS /ws/client
        │                     │                         │
┌───────┴────────┐   ┌────────┴────────┐       ┌────────┴────────┐
│ TUI / REPL     │   │ Project WebUI    │       │ Remote Machine  │
│ project A      │   │ project B        │       │ project C       │
└────────────────┘   └─────────────────┘       └─────────────────┘
```

---

## Key Design Decisions

### 1. HQ is global; clients are project-scoped

HQ data must live under global WrongStack storage, not in any project:

```text
~/.wrongstack/hq/
  config.json
  auth.json
  clients.json
  projects.json
  events/
    2026-06-21.jsonl
  snapshots/
    latest.json
```

Each client sends its own project identity:

```ts
interface HqProjectIdentity {
  projectId: string;       // stable hash of realpath + optional remote machine id
  projectRoot: string;     // redacted or full depending on privacy setting
  projectName: string;     // basename or configured alias
  gitRemote?: string;
  gitBranch?: string;
  machineId: string;
  workspaceKind: 'git' | 'directory' | 'unknown';
}
```

### 2. Single port with path-based WebSockets

HQ should use one HTTP server and one port:

| Path | Purpose |
|---|---|
| `/` | HQ app shell |
| `/assets/*` | static assets |
| `/ws/browser` | HQ browser updates and UI commands |
| `/ws/client` | TUI/REPL/WebUI client telemetry |
| `/api/login` | browser login |
| `/api/snapshot` | initial state hydration |
| `/api/clients/*` | client enrollment management |

This keeps VPS, firewall, and Cloudflare Tunnel setup simple.

### 3. HQ WebUI is separate from project WebUI

The HQ app should be a distinct frontend entry point with its own visual system and navigation. It can reuse shared components where appropriate, but it should not be a route inside the current per-project WebUI.

Suggested package layout:

```text
packages/webui/src/hq/
  main.tsx
  App.tsx
  index.css
  components/
    HqShell.tsx
    GlobalOverview.tsx
    ProjectGrid.tsx
    ProjectDetail.tsx
    ClientRoster.tsx
    FleetOverview.tsx
    SessionTimeline.tsx
    CostPanel.tsx
  stores/
    hq-store.ts
  lib/
    hq-ws-client.ts

packages/webui/src/server/hq/
  hq-server.ts
  hq-auth.ts
  hq-client-registry.ts
  hq-event-store.ts
  hq-snapshot.ts
  hq-protocol.ts
```

Alternative: if the app grows large, split into `packages/hq` later. Start inside `packages/webui` to avoid premature package churn.

### 4. Clients publish normalized telemetry, not raw private context by default

Default HQ telemetry should be useful but safe:

- client lifecycle: connected, disconnected, heartbeat
- project identity: project name, stable id, branch, dirty status summary
- session lifecycle: started, idle, running, paused, completed, failed
- fleet events: subagent spawned, task assigned, tool started/completed, usage summary
- cost/token metrics: aggregate numbers
- tool metadata: tool name, status, duration, redacted args summary
- todo/plan/task summaries: title/status only by default
- mailbox summaries: message type/subject/priority/unread/completed state, agent presence, and short scrubbed previews

Raw prompts, assistant messages, full tool inputs/outputs, file contents, logs, and full mailbox bodies must be opt-in.

### 5. HQ degrades gracefully

If HQ is not reachable:

- client startup should not fail;
- the client should log a warning at most once per backoff window;
- reconnect should use exponential backoff with jitter;
- local TUI/REPL/WebUI behavior remains unchanged.

---

## Protocol Design

### Connection handshake

Client connects:

```text
GET /ws/client
Authorization: Bearer <client-token>
X-WrongStack-HQ-Protocol: 1
```

First frame:

```json
{
  "type": "client.hello",
  "protocolVersion": 1,
  "client": {
    "clientId": "machineA:pid12345:session789",
    "kind": "tui",
    "version": "0.1.x",
    "machineId": "machineA",
    "pid": 12345,
    "startedAt": "2026-06-21T12:00:00.000Z"
  },
  "project": {
    "projectId": "proj_abc123",
    "projectName": "WrongStack",
    "projectRoot": "D:/Codebox/PROJECTS/WrongStack",
    "gitBranch": "main",
    "workspaceKind": "git"
  },
  "capabilities": ["telemetry.publish", "session.summary", "fleet.summary", "mailbox.summary"]
}
```

HQ replies:

```json
{
  "type": "hq.welcome",
  "protocolVersion": 1,
  "serverTime": "2026-06-21T12:00:01.000Z",
  "acceptedCapabilities": ["telemetry.publish", "session.summary", "fleet.summary", "mailbox.summary"],
  "redactionPolicy": {
    "rawContent": false,
    "toolArgs": "summary",
    "paths": "project-relative"
  }
}
```

### Event envelope

All client-published events use a stable envelope:

```ts
interface HqEventEnvelope<TPayload = unknown> {
  id: string;
  type: string;
  schemaVersion: 1;
  timestamp: string;
  clientId: string;
  projectId: string;
  sessionId?: string;
  runId?: string;
  seq: number;
  payload: TPayload;
}
```

### Initial event types

| Event type | Producer | Payload summary |
|---|---|---|
| `client.hello` | all clients | client, machine, project identity |
| `client.heartbeat` | all clients | uptime, active session, load summary |
| `session.started` | TUI/REPL/WebUI | session id, provider/model, cwd/project |
| `session.status` | TUI/REPL/WebUI | idle/running/paused/error, current phase |
| `session.usage` | TUI/REPL/WebUI | tokens, cost, duration |
| `tool.started` | agent clients | tool name, risk/capability, redacted input summary |
| `tool.completed` | agent clients | status, duration, output summary, error class |
| `fleet.snapshot` | director-enabled clients | current subagents, queue, cost, health |
| `fleet.event` | director-enabled clients | subagent spawn/task/tool/completion events |
| `mailbox.snapshot` | clients with mailbox access | project mailbox rollup, agent presence, safe message previews |
| `mailbox.event` | clients with mailbox access | message sent/read/completed and agent heartbeat/offline events |
| `worklist.snapshot` | clients with todos/tasks/plans | counts and current active item |
| `git.snapshot` | clients in git repo | branch, dirty count, ahead/behind when cheap |

### Browser channel

HQ browser connects to `/ws/browser` after login. It receives:

- `hq.snapshot` on connect;
- `hq.event` for each normalized event;
- `hq.project.updated` when a project aggregate changes;
- `hq.client.updated` when a client aggregate changes;
- `hq.alert` for failures, auth events, rate limits, stale clients.

Phase 1 browser should be read-only. Later phases can add control commands.

---

## Data Model

### Client

```ts
interface HqClientRecord {
  clientId: string;
  kind: 'tui' | 'repl' | 'webui' | 'cli' | 'unknown';
  machineId: string;
  hostname?: string;
  pid?: number;
  version?: string;
  connected: boolean;
  connectedAt?: string;
  lastSeenAt: string;
  projectId: string;
  sessionId?: string;
  capabilities: readonly string[];
}
```

### Project

```ts
interface HqProjectRecord {
  projectId: string;
  projectName: string;
  projectRootDisplay: string;
  machineIds: readonly string[];
  gitBranch?: string;
  activeClients: number;
  activeSessions: number;
  activeSubagents: number;
  totalCostUsd: number;
  lastActivityAt: string;
  status: 'active' | 'idle' | 'stale' | 'error';
}
```

### Mailbox

```ts
interface HqMailboxSummary {
  mailboxId: string;
  projectId: string;
  scope: 'project' | 'global';
  messageCount: number;
  unreadCount: number;
  incompleteCount: number;
  highPriorityCount: number;
  onlineAgentCount: number;
  lastActivityAt: string;
}
```

Mailbox snapshots should include message metadata and scrubbed previews, not full bodies by default. HQ should be able to answer: "Which projects have unread/high-priority mail?", "Which agents are online?", and "Which assignments/results are waiting?"

### Global snapshot

```ts
interface HqSnapshot {
  generatedAt: string;
  clients: readonly HqClientRecord[];
  projects: readonly HqProjectRecord[];
  sessions: readonly HqSessionSummary[];
  fleets: readonly HqFleetSummary[];
  mailboxes: readonly HqMailboxSummary[];
  totals: {
    activeProjects: number;
    activeClients: number;
    activeSessions: number;
    activeSubagents: number;
    unreadMailboxMessages: number;
    incompleteMailboxMessages: number;
    totalCostUsd: number;
  };
}
```

---

## HQ Panel Design

The HQ panel should feel like a command center, not a chat UI.

### Top-level navigation

1. **Overview** — all projects and clients at once.
2. **Projects** — grouped project cards with filters.
3. **Fleets** — all active subagents across all projects.
4. **Mailbox** — unread/incomplete/high-priority inter-agent messages across all projects.
5. **Sessions** — timeline of active/recent sessions.
6. **Clients** — connected TUI/REPL/WebUI processes by machine.
7. **Events** — live event stream with filters.
8. **Settings** — auth, endpoint, retention, redaction policy.

### Overview screen

Required widgets:

- active projects count;
- connected clients count;
- active sessions count;
- active subagents count;
- unread/high-priority mailbox count;
- total tokens/cost today;
- global activity timeline;
- projects grid sorted by last activity;
- alerts panel for stale clients/errors/auth failures.

### Project detail screen

For a selected project:

- project identity and machine list;
- active clients in that project;
- active session(s);
- fleet roster and task queue;
- recent tools and errors;
- todo/plan/task progress summary;
- mailbox summary: unread/incomplete/high-priority messages, recent subjects, online agents;
- cost and token usage;
- link/open command for local project WebUI when available.

#### Project drilldown drawer (Phase 1)

The browser renders a right-side slide-in drawer opened by clicking a project
link in the mailboxes table (or by deep-linking to `?project=<id>` / `#<id>`).
The drawer fetches `/api/projects/:id` and renders:

- meta header — project id, scope pill (`project`/`global`), status, last
  activity, last-refreshed timestamp;
- mailboxes table — per-mailbox counts (messages / unread / open / high /
  agents);
- recent messages list — last 20 messages in that project, newest first, with
  scrubbed preview, priority pill, and state badge;
- clients table — connected clients in this project with capability chips;
- live mailbox event feed — a per-project 50-entry ring buffer of every
  `mailbox.event` envelope received for that project, regardless of whether
  the drawer is open or closed. The drawer renders the accumulated buffer
  immediately on open so events that arrived while the drawer was closed
  are visible. Each row shows action pill (color-coded: `message.sent` blue,
  `message.completed` / `agent.registered` green, `message.read` gray,
  `agent.offline` red, etc.), short summary (subject/from/to or agent
  identity), and timestamp. A "live" status indicator next to the section
  title pulses green for 1.5 s after each event, then reverts to "idle".
  Switching projects preserves each project's feed history.

The drawer auto-refreshes (debounced ~250 ms) when a new global `hq.snapshot`
containing the open project arrives, so counts and recent-message lists stay
current without manual reload. The event feed is preserved across refreshes
because it lives in a client-side `Map<projectId, event[]>`.

Press `Escape` or click the backdrop to close the drawer. The drawer also
closes when the URL hash is cleared.

### Unified fleet view

A global fleet table should merge subagents across projects:

| Project | Agent | Role | Status | Task | Tool | Runtime | Cost | Last activity |
|---|---|---|---|---|---|---|---|---|

This is the most important HQ differentiator: instead of one fleet per session, HQ sees every fleet everywhere.

### Unified mailbox view

A global mailbox table should merge project mailboxes without exposing full message bodies by default:

| Project | From | To | Type | Priority | Subject | State | Age | Agent status |
|---|---|---|---|---|---|---|---|---|

Required filters:

- project;
- sender/recipient;
- type (`ask`, `assign`, `status`, `result`, etc.);
- unread by current HQ viewer / unread by any active agent;
- incomplete assignments/questions;
- high priority;
- online/offline sender.

The mailbox view is how HQ becomes a true command center instead of only a metrics dashboard: it shows not just what is running, but what agents across projects are asking, assigning, reporting, and waiting on.

---

## Access Control and Security

### Threat model

HQ may run locally, on a LAN, through a tunnel, or on a VPS. It receives developer-machine telemetry and may eventually expose control commands. Treat it as sensitive infrastructure.

### Defaults

- Bind to `127.0.0.1` by default.
- Require authentication for browser and client channels when not loopback.
- Never expose raw prompt/tool/file content by default.
- Rate-limit WebSocket frames and HTTP endpoints.
- Cap frame size.
- Use explicit protocol version negotiation.
- Redact secrets in every event before publish.

### Browser auth

Phase 1:

- local loopback can bootstrap a browser session automatically;
- remote browser access requires password login;
- store password hash using a slow hash (`scrypt` or `argon2` if already available/approved);
- issue an HTTP-only session cookie for browser access.

Commands:

```bash
wstack --hq --password
wstack hq auth set-password
wstack hq auth reset
```

### Client auth

Clients should use enrollment tokens, not the browser password.

Commands:

```bash
wstack hq token create --name laptop-tui
wstack hq token list
wstack hq token revoke <id>
```

Token storage:

```text
~/.wrongstack/hq/auth.json
```

Recommended token model:

- generated random token shown once;
- store only token hash;
- token has id, label, createdAt, lastUsedAt, optional expiresAt;
- optional capability scope: `telemetry.publish`, `control.receive`.

### Cloudflare Tunnel guidance

Cloudflare Tunnel is supported as a deployment option, not a runtime dependency.

Recommended safe setup:

```bash
wstack --hq --host 127.0.0.1 --port 3499 --password
cloudflared tunnel --url http://localhost:3499
```

If using Cloudflare Access, HQ should still keep its own client token auth for `/ws/client`.

### VPS guidance

For VPS deployment:

- bind behind HTTPS reverse proxy or Cloudflare Tunnel;
- set a strong password;
- use client enrollment tokens;
- configure retention and data directory explicitly;
- avoid raw content publishing unless the VPS is trusted.

---

## Configuration

### CLI flags

| Flag | Default | Purpose |
|---|---|---|
| `--hq` | false | Start HQ mode |
| `--host <host>` | `127.0.0.1` | Bind host |
| `--port <port>` | `3499` | Single HQ HTTP/WS port |
| `--open` | false | Open browser after start |
| `--password` | false | Prompt/set password on first run |
| `--data-dir <path>` | `~/.wrongstack/hq` | HQ storage directory |
| `--strict-port` | false | Fail if port is taken |

### Client-side env vars

| Env var | Purpose |
|---|---|
| `WRONGSTACK_HQ_URL` | HQ base URL, e.g. `http://localhost:3499` |
| `WRONGSTACK_HQ_TOKEN` | client enrollment token |
| `WRONGSTACK_HQ_ENABLED` | force enable/disable publisher |
| `WRONGSTACK_HQ_PROJECT_ALIAS` | display name override |
| `WRONGSTACK_HQ_RAW_CONTENT` | opt-in raw content publishing, default false |

### Global config

Suggested path:

```text
~/.wrongstack/config.json
```

Suggested section:

```jsonc
{
  "hq": {
    "enabled": true,
    "url": "http://localhost:3499",
    "tokenRef": "env:WRONGSTACK_HQ_TOKEN",
    "publishRawContent": false,
    "projectAlias": null
  }
}
```

---

## Implementation Plan

### Phase 0 — Protocol and boundaries

**Objective:** Land the shared types and document the contract.

Tasks:

1. Add `HqEventEnvelope`, client identity, project identity, and snapshot types.
2. Decide whether these types live in `packages/core` or `packages/webui/server`.
3. Add a protocol version constant, e.g. `HQ_PROTOCOL_VERSION = 1`.
4. Add tests for event validation/redaction helpers.
5. Keep this phase runtime-neutral: no server yet.

Acceptance criteria:

- Type definitions compile under strict TypeScript.
- Event envelopes are serializable and versioned.
- Redaction helper removes obvious secret keys and raw content by default.

### Phase 1 — Local read-only HQ server

**Objective:** `wstack --hq` serves a separate HQ app on one local port.

Tasks:

1. Add CLI flag parsing for `--hq`, `--host`, `--port`, `--open`, `--strict-port`.
2. Implement `startHqServer()` with one HTTP server and two WS paths.
3. Serve a minimal HQ React entry point.
4. Implement `/api/snapshot` returning empty/default state.
5. Add browser WebSocket connection to `/ws/browser`.
6. Add smoke tests for port binding and static serve.

Acceptance criteria:

- `wstack --hq` opens `http://127.0.0.1:3499`.
- Browser shows a connected empty dashboard.
- No project root is required.
- Existing `--webui` behavior is unchanged.

### Phase 2 — Local client publisher

**Objective:** clients on the same machine can publish telemetry to HQ.

Tasks:

1. Implement `HqPublisher` in the shared CLI/runtime layer.
2. Wire publisher into REPL/TUI/WebUI session lifecycle.
3. Publish client heartbeat, session status, and basic project identity.
4. Add reconnect with exponential backoff.
5. Add opt-in config/env support: `WRONGSTACK_HQ_URL`.
6. Add tests with a fake HQ server.

Acceptance criteria:

- Starting HQ and then a TUI/REPL session shows a live client in HQ.
- Killing the client marks it stale/disconnected after heartbeat timeout.
- Starting clients from two project roots creates two project groups.
- Client startup succeeds when HQ is offline.

### Phase 3 — Fleet telemetry

**Objective:** HQ shows fleet/subagent state across all projects.

Tasks:

1. Map `subagent.*` / FleetBus events to `fleet.event`.
2. Publish periodic `fleet.snapshot` summaries.
3. Add unified fleet table to HQ UI.
4. Add project detail fleet panel.
5. Add cost/token rollups.
6. Add filters by project, status, role, machine.

Acceptance criteria:

- Active subagents from multiple projects appear in one global table.
- Project detail view shows only that project's fleet.
- Cost/token totals aggregate globally and per project.

### Phase 4 — Mailbox telemetry

**Objective:** HQ shows inter-agent mailbox state across all projects.

Tasks:

1. Map mailbox send/read/complete/heartbeat/offline updates to `mailbox.event`.
2. Publish periodic `mailbox.snapshot` summaries per project mailbox.
3. Add global mailbox rollups to overview cards.
4. Add unified mailbox table with project/type/priority/unread/incomplete filters.
5. Add project detail mailbox panel.
6. Redact full `body`/`outcome` fields by default and publish only scrubbed previews.
7. Server broadcasts each `mailbox.event` envelope to all connected browsers as
   an `hq.event` message; browsers fan out to a per-project drawer live feed
   (50-entry ring buffer, "live" status indicator that pulses for 1.5 s after
   each event, color-coded action pills).
8. Drawer auto-refresh — when an `hq.snapshot` arrives containing the open
   project, the project drilldown re-fetches `/api/projects/:id` (debounced
   ~250 ms) so counts and recent-message lists stay current; the event feed
   survives refreshes because it lives in a client-side `Map<projectId, event[]>`.
9. `?project=<id>` query deep-link (alongside the existing `#<id>` hash form)
   so a bookmark or external link can open a specific drilldown immediately.
10. Project picker dropdown in the dashboard toolbar so users can switch
    drilldown context without leaving the dashboard.

Acceptance criteria:

- Unread, incomplete, and high-priority mailbox counts aggregate globally and per project.
- Recent mailbox subjects/previews appear in HQ without full bodies by default.
- Online/offline mailbox agents appear per project and in the global mailbox view.
- A browser with a project drawer open receives new `mailbox.event` envelopes
  via `hq.event` and appends them to the per-project feed in <1 s.
- Switching to another project (via picker, link, or deep-link) preserves the
  previous project's feed history.
- Opening a project drawer for the first time (or re-opening after the drawer
  was closed) immediately renders the per-project event feed ring buffer
  accumulated while the drawer was closed — no events are dropped just
  because the user wasn't looking at the drawer when they arrived.
- Auto-refresh fires when a snapshot for the open project arrives, and the
  per-project feed ring buffer does not reset across refreshes.
- Assignments/questions waiting on agents are visible across projects.

### Phase 5 — Access control and remote clients

**Objective:** make HQ safe enough for LAN/VPS/tunnel usage.

Tasks:

1. Add password setup and login for browser access.
2. Add client token create/list/revoke commands.
3. Require tokens for non-loopback `/ws/client` connections.
4. Store token hashes, never plaintext tokens.
5. Add frame size limits and per-client rate limiting.
6. Add documentation for LAN, Cloudflare Tunnel, and VPS setups.

Acceptance criteria:

- Remote browser access requires login.
- Remote client connection without a token is rejected.
- Token revocation disconnects or rejects future connections.
- Cloudflare Tunnel setup works with the single-port server.

### Phase 6 — Persistence and retention

**Objective:** retain useful history without turning HQ into a giant log sink.

Tasks:

1. Persist normalized events to daily JSONL files.
2. Persist latest snapshot atomically.
3. Add retention config, e.g. 7 or 30 days.
4. Add startup restore from latest snapshot.
5. Add event compaction for high-volume tool streams.

Acceptance criteria:

- HQ restarts with the last known project/client list.
- Old event files are pruned by retention policy.
- High-volume sessions do not make the browser unusable.

### Phase 7 — Optional controlled actions

**Objective:** allow safe HQ-to-client actions after read-only observability is stable.

Possible actions:

- request client status refresh;
- open local project WebUI link;
- pause/resume a goal run;
- terminate a subagent;
- send a note/message to a client session.

Rules:

- keep all actions capability-scoped;
- require explicit client opt-in for control;
- show confirmation in HQ for destructive actions;
- log all commands to HQ event store.

Acceptance criteria:

- Read-only clients cannot receive control actions.
- Control-capable clients advertise `control.receive`.
- Destructive commands require confirmation and are audit logged.

---

## File and Package Impact

Likely touched areas:

| Area | Expected changes |
|---|---|
| `packages/cli` | `--hq` flag, HQ subcommands, client publisher wiring |
| `packages/webui` | HQ server primitives, separate HQ React entry point |
| `packages/core` | shared HQ protocol types, event normalization, redaction helpers |
| `packages/tui` | publish TUI lifecycle/fleet status to HQ |
| `docs/` | user and architecture docs |
| `e2e/` | HQ browser smoke tests |

Suggested initial files:

```text
packages/core/src/hq/protocol.ts
packages/core/src/hq/redaction.ts
packages/cli/src/hq-server.ts
packages/cli/src/hq-publisher.ts
packages/webui/src/server/hq/hq-server.ts
packages/webui/src/hq/main.tsx
packages/webui/src/hq/App.tsx
```

Exact placement can change during implementation, but keep protocol types in a package shared by CLI, TUI, and WebUI.

---

## Testing Strategy

### Unit tests

- protocol envelope validation;
- project id derivation;
- redaction policy;
- token hashing/verification;
- mailbox event/snapshot mapping;
- snapshot reducer;
- reconnect/backoff logic.

### Integration tests

- start HQ server on a random port;
- connect fake client over `/ws/client`;
- connect fake browser over `/ws/browser`;
- publish events and verify snapshot updates;
- publish mailbox events and verify global/project mailbox rollups;
- reject invalid protocol version;
- reject missing token for remote-mode server;
- **live event feed broadcast**: client sends a `mailbox.event` envelope after
  `client.hello`; browser receives the corresponding `hq.event` with the
  expected project id, action, and payload summary (this is what powers the
  drawer live feed);
- **/api/projects/:id drilldown**: client sends `mailbox.snapshot` with
  messages + agents; the endpoint returns the project record, clients, and
  mailboxes (full payloads); 404 path verified for an unknown project;
- **HTML dashboard structure**: server's static HTML contains the mailboxes
  table, clients table, drawer markup, project picker, and JS wiring for
  `renderMailboxes` / `renderClients` / `handleHqEvent` / `renderEventFeed`.

### E2E tests

- launch `wstack --hq --port <random>`;
- open browser and assert dashboard loads;
- start a fake or real client publisher;
- assert project/client card appears;
- publish fleet snapshot and assert global fleet table updates;
- publish mailbox snapshot and assert unread/high-priority mailbox cards update.

---

## Observability

HQ should produce structured server logs for:

- server started/stopped;
- browser login success/failure;
- client accepted/rejected;
- protocol mismatch;
- token revoked/expired;
- event ingestion errors;
- mailbox event mapping/redaction errors;
- persistence errors.

Do not log tokens, passwords, raw prompt text, raw tool args, full mailbox bodies, or full file paths when redaction is enabled.

Suggested event names:

```text
hq.server_started
hq.client_connected
hq.client_rejected
hq.browser_connected
hq.auth_failed
hq.event_ingested
hq.mailbox_event_ingested
hq.snapshot_persisted
hq.persistence_failed
```

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| HQ becomes too coupled to WebUI internals | hard to evolve | separate HQ app entry and protocol boundary |
| Remote exposure leaks sensitive data | high | loopback default, auth, redaction, raw content opt-in |
| Event volume overwhelms browser | medium | reducer snapshots, compaction, sampling, virtualized lists |
| Project identity leaks paths | medium | path redaction and aliases for remote/VPS mode |
| HQ outage breaks clients | high | non-blocking publisher with backoff |
| Protocol changes break older clients | medium | version negotiation and backward-compatible event parsing |
| Control commands become unsafe | high | read-only first; capability-scoped opt-in later |

---

## Open Questions

1. Should HQ live inside `packages/webui` initially, or should it start as `packages/hq`?
2. Should project identity include full realpath by default, or only a redacted display path?
3. Should local loopback browser access bypass password by default?
4. What is the retention default: 7 days, 30 days, or size-based?
5. Should embedded project WebUI publish to HQ directly, or should the shared CLI runtime publish on its behalf?
6. Should HQ support multi-user accounts in the first release, or only one admin password?
7. Which control actions, if any, are safe enough for Phase 7?

---

## Recommended MVP

The smallest valuable version is:

1. `wstack --hq --port 3499` starts an HQ app.
2. TUI/REPL clients connect via `WRONGSTACK_HQ_URL`.
3. HQ shows connected clients grouped by project.
4. HQ shows active sessions and basic status.
5. HQ shows global fleet snapshots when clients run Director/fleet mode.
6. HQ shows unread/incomplete/high-priority mailbox rollups across projects.
7. HQ browser drilldown renders a live mailbox event feed (per-project ring
   buffer, "live" status indicator, color-coded action pills) so mailbox
   activity surfaces in near-real-time while a project drawer is open. The
   drawer also renders the accumulated feed on open so events that arrived
   while the drawer was closed are visible immediately.
8. HQ remains read-only.
9. Remote access requires password + client token.

This MVP proves the architecture without taking on remote control, full log indexing, or multi-user administration.

---

## Success Criteria

- One HQ process can monitor clients from at least three different project roots.
- HQ can show both all-project overview and per-project details.
- TUI, REPL, and WebUI clients can all publish data through the same protocol.
- HQ can show mailbox status across projects without sending full message bodies by default.
- HQ runs on one port locally and behind Cloudflare Tunnel.
- Clients can connect from another machine with configured URL/token.
- HQ downtime does not break local client workflows.
- No raw sensitive content is sent by default.
- A browser with a project drawer open receives `mailbox.event` envelopes via
  `hq.event` and appends them to the per-project drawer feed within 1 s.
- Opening (or re-opening) a project drawer immediately renders the per-project
  event feed ring buffer that was accumulated while the drawer was closed;
  no events received in the interim are dropped.
- The project drawer auto-refreshes (debounced ~250 ms) when a global
  snapshot for the open project arrives, and the per-project event feed ring
  buffer is preserved across refreshes.
- `/api/projects/:id` returns the project record, clients, and mailboxes
  (with full message and agent payloads) for the requested project; 404 for
  unknown ids.
- The HTML dashboard exposes mailboxes/clients tables, drawer markup, project
  picker, and the JS wiring for live event rendering, so the live feed is
  exercised end-to-end in the browser.

---

## Suggested Follow-up Docs

- `docs/subcommands/hq.md` — user-facing command reference once flags are implemented.
- `docs/webui.md` — add a short section distinguishing project WebUI from HQ WebUI.
- `docs/configuration.md` — add HQ config/env variables.
- `SECURITY.md` — add HQ threat model and deployment guidance before remote control ships.
