# HQ Command Center Enhancement — 2026-07

> Archived on 2026-10-06. Claims, counts and test results below are historical
> evidence or proposals; they are not current checkout certification. Use the
> [maintained documentation](../../README.md) and current source for runtime behavior.


**Feature:** Cross-machine HQ command center (`wstack --hq`, port 3499) — extreme improvement
**Status:** Backend complete (Phases 1-4, 6). Phase 5 (React dashboard, `packages/webui-hq`) SHIPPED,
then upgraded to WebUI-grade rendering in 2026-07 (see "Phase 5.5" below). Phase 7 remainder
(token hash-at-rest, rate limiting, browser password) still pending.
**Supersedes:** `docs/archive/plans/hq-command-center-2026-06.md` (the original planning blueprint)

---

## Summary

The 2026-06 HQ plan shipped a working read-only command center (telemetry
ingestion, inline HTML dashboard, token auth). This enhancement closes the
gaps to make HQ a **complete** multi-machine coordination + visualization
surface:

- **Telemetry coverage** — wire up the 5 defined-but-unwired signal families
  (fleet stats, brain decisions, worktree lifecycle, tool activity, granular cost).
- **Persistence** — survive restart with event log, snapshot checkpoint, and
  cost/activity time-series for trends.
- **Control plane** — two-directional (browser → client commands): steer, abort,
  spawn, broadcast, run-command (RCE-gated).
- **Alerting** — `hq.alert` rules engine (cost, stale, concurrency, failures).
- **Dashboard** — replace CDN-dependent inline HTML with an offline React app
  (Phase 5, pending).

---

## Completed phases

### Phase 1 — Telemetry coverage

Five new bridges in `packages/core/src/hq/`, all following the `agent-bridge.ts`
template (subscribe EventBus → `publishEvent`). Protocol extended with
`brain.event` + `worktree.event` types + payload guards in `parseHqEventPayload`.
`buildSnapshot` now populates `fleets[]` and `sessions[]` (were always empty).

| Bridge | Source | Target | Notes |
|---|---|---|---|
| `fleet-bridge.ts` | `coordinator.stats` (host EventBus) | `fleet.snapshot` | hash-dedup; `runId` = session id |
| `brain-bridge.ts` | `brain.*` (6 events) | `brain.event` | decision/intervention lifecycle |
| `worktree-bridge.ts` | `worktree.*` (6 events) | `worktree.event` | phase swim-lanes |
| `tool-bridge.ts` | `tool.started`/`tool.executed` | `tool.started`/`tool.completed` | input summarized via `summarizeHqToolArgs` |
| `cost-bridge.ts` | `token.accounted` | `session.usage` | granular per-call cost → trends |

Wired at 3 surfaces: `cli-main.ts`, `pre-context-services.ts`, `run-tui.ts`.
Publisher default capabilities now include `fleet.summary` + `session.summary`.

### Phase 2 — Persistence + trends

`packages/core/src/hq/persistence.ts`:
- `HqEventLog` — append-only JSONL (`events.jsonl`), rotated at 50K lines → keeps
  20K. FIFO write chain; `recent(limit, typeFilter)` newest-first.
- `HqSnapshotStore` — atomic checkpoint (`snapshot.json`) on every debounced
  broadcast. `load()` on boot re-seeds.
- `HqTimeseriesStore` — 5-min buckets (`timeseries.jsonl`), 1-week retention.
  `record()` folds cost/tool signals; `flush()` every 60s.

New HTTP APIs: `GET /api/events`, `GET /api/trends/cost`, `GET /api/commands`.
Restart hydration seeds in-memory rings from disk.

### Phase 3 — Control plane (server-side)

- `HqToken.capabilities?: string[]` + `tokenHasCapability()`. Backward-compat:
  absent = unrestricted. Known caps: `control.enqueue`, `control.execute`,
  `telemetry.publish`.
- `packages/core/src/hq/commands.ts` — typed union `HqCommand` (steer/abort/
  spawn/broadcast/run-command) + `validateHqCommand` + `HqCommandAuditLog`.
- Server: per-client `commandQueue` on `ConnectedClient`. `client.command_poll`
  drains the queue as `hq.command_batch`; `client.command_ack` updates the audit log.
- `POST /api/command` — browser enqueues; requires browser token +
  `control.enqueue` (or open mode); target client must advertise `control.receive`.
  `control.receive` capability recorded at hello, surface in snapshot via capabilities.
- `GET /api/commands` — audit history.

### Phase 4 — Control plane (client-side)

`packages/cli/src/hq-command-controller.ts` — mutable holder (mirrors
`interruptController` pattern) + `createHqCommandDispatcher`. Lazy-populated:
`director`/`interruptLeader`/fleet hooks come online after HQ-connect time.

| Command | Mechanism | Safety |
|---|---|---|
| `steer` | `brainMailbox.send({type:'steer'})` — agent folds at iteration boundary | inherits mailbox guardrails |
| `abort` (leader) | `interruptController.abortLeader()` | in-process immediate |
| `abort` (subagent) | `director.terminate(id)` | coordinator.stop |
| `abort` (fleet) | `director.remove()` per running agent | — |
| `spawn` | `director.spawn(cfg)` | rejects if no director |
| `broadcast` | `brainMailbox.send({to:'all'})` | — |
| `run-command` | **RCE-gated**: requires `--hq-allow-exec` + `control.execute`; even then routes as a steer (agent's permission policy still applies), never direct shell | default-deny |

### Phase 6 — Alerting

`packages/core/src/hq/alerts.ts` — `HqAlertEngine` evaluates the live snapshot
every 15s (unref'd) against 4 rules: fleet cost threshold ($50 default),
all-machines-stale (120s), high concurrency (disabled by default), fleet
failure spike (≥5 failed). Dedup via state machine — only cleared→firing
transitions emit. `toAlertMessage()` → `hq.alert` broadcast to browsers.
`GET /api/alerts` returns active + history.

---

## Phase 5 — React dashboard (SHIPPED)

`packages/webui-hq/` exists with 10 views (Cockpit, FleetMap, LiveConsole,
Mailbox, Cost, Brain, Worktrees, Trends, Alerts, Control), served by
`hq-static-serve.ts` with graceful fallback to inline HTML when unbuilt.
The planned `packages/webui-ui/` shared-primitives extraction was not needed —
shared logic lives in the browser-safe `@wrongstack/tools` subpaths instead.

### Phase 5.5 — WebUI-grade rendering (2026-07)

The dashboard was upgraded from dependency-free rendering to the main WebUI's
stack and quality:

- **Console**: full GFM markdown + `rehype-highlight` code blocks
  (react-markdown), collapsed thinking cards (`thinking` transcript role added
  to the HQ protocol + `transcript-mapper`), tool cards with lucide icons /
  status (running-pulse, ok, error) via `@wrongstack/tools/tool-icons`, real
  result views (LCS/unified diff via `@wrongstack/tools/tool-diff`, bash
  exit-code footer, numbered Read output, collapsible JSON, todo checklist),
  a session picker, and virtua-virtualized transcript with pinned follow +
  jump-to-latest.
- **Correctness**: `lib/transcript-store.ts` — exactly-once live batch
  consumption keyed on `fromSeq` (the old view re-appended the whole event
  ring on every event), live tool-result merging by `toolUseId`, and
  fetch/stream overlap dedup.
- **Backfill**: Brain + Worktrees seed from `GET /api/events?type=…`
  (persistence) instead of rendering blank until new events arrive.
- **Trends**: real SVG column charts (hover tooltips, validated dark palette)
  + KPI tiles + time-range filter. **Cost**: hero total, per-project share
  bars, per-session/model breakdown (click-through to Console).
- **Control**: `btw`, `queue`, and RCE-gated `run-command` composers added.
- **Theme**: graphite console theme aligned with the WebUI dark family
  (IBM Plex, signal-cyan accent, status-only colors); scanline/CRT gimmicks
  removed.

## Pending

### Phase 7 remainder — hardening

- Token hash-at-rest (SHA-256 in auth.json; raw token returned once on mint)
- Per-client rate limiting (mirror WebUI `WEBUI_RATE_LIMIT`)
- Optional password login for browser token mode

---

## Test coverage

226+ HQ tests across 20 files (all passing):
- Core `tests/hq/`: protocol (34), fleet-bridge (6), brain-bridge (8),
  worktree-bridge (7), tool-bridge (7), cost-bridge (5), persistence (11),
  commands (12), alerts (11), + existing (session-bridge, agent-bridge,
  publisher, auth-store, factory, redaction, mailbox-mapper, session-telemetry)
- CLI `tests/`: hq-server (28, incl. control-plane round-trip + fleet rollup),
  hq-command-controller (13), + existing

## Verification

- `pnpm -r typecheck` — 0 errors (excluding pre-existing untracked WIP files)
- `pnpm --filter core build` — clean
- `pnpm exec vitest run packages/core/tests/hq/ packages/cli/tests/hq-*.test.ts` — all green
