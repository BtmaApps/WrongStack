# `/goal` — Autonomous Phase-Based Workflow

## What it does

`/goal` owns one user-facing Goal workflow with two durable parts:

- a persistent **mission** (`goal.json`) consumed by eternal/parallel autonomy;
- one or more executable **phase runs** (`autophase/*.json`).

Starting a phase run turns a free-text goal into a real, LLM-driven build:

1. **Plans** — a one-shot subagent decomposes the goal into a dependency-ordered
   list of **phases**, where each phase holds **many concrete todos**
   (`GoalPlanner`).
2. **Builds the graph** — the plan is materialized into a `PhaseGraph` with a
   populated `TaskGraph` per phase, persisted as per-project JSON.
3. **Runs autonomously** — the `PhaseOrchestrator` drives the graph in the
   background. Each todo is executed by a **fresh subagent with full tool
   access** (read/edit/write/bash/…). In the CLI, todos run sequentially within
   a phase to avoid concurrent writes to the same worktree. When git-worktree
   isolation is enabled, independent/parallelizable phases can run concurrently
   and are merged back sequentially.
4. **Verifies the integrated result** — after every phase worktree has merged,
   the host runs a final base-tree verification before reporting the graph as
   complete. A failed final gate leaves the run failed with its evidence saved.

The verifier is on by default in CLI and WebUI. It runs the project's configured
typecheck/lint scripts when available. The WebUI control can disable verification
for a run; a failed phase gate launches a repair worker in that phase's worktree.

Only one Goal run may own a project at once. CLI and WebUI share a process-aware
lease in the canonical `autophase` directory; a crashed process's stale lease is
reclaimed automatically on the next start.

This is "SDD logic but different": phased, persisted task-lists like SDD, but
driven by the autonomous orchestrator + concurrent subagents rather than
single-thread turn injection. Live progress is shown in the TUI PhaseMonitor.

## Usage

```
/goal                        → Show the active phase run, or the persistent mission
/goal set <mission>          → Set/refine the eternal/parallel mission
/goal refine                 → Re-refine the mission without resetting its journal
/goal <mission text>         → Back-compatible shorthand for /goal set
/goal start <goal>           → Plan + start an autonomous phase build
/goal start Build a CSV import wizard with validation
/goal pause                  → Pause (in-flight todos finish; no new ones start)
/goal resume                 → Resume a paused run
/goal stop                   → Stop and abort in-flight todos
/goal save                   → Persist the current phase graph
/goal list                   → List saved goal projects
/goal load [--resume] [title] → Load a saved project
/goal clear                  → Clear the persistent mission
/goal journal [N]            → Show persistent mission activity
```

## Architecture

```
┌─────────────┐     ┌───────────────┐     ┌──────────────┐
│  PhaseStore  │────▶│GoalWebSocket  │◀───▶│  WebUI Board  │
│  (JSON on   │     │   Handler     │     │  (GoalView)   │
│   disk)     │◀────│               │────▶│               │
└─────────────┘     └───────┬───────┘     └──────────────┘
                            │
                    ┌───────▼───────┐
                    │PhaseOrchestrator│
                    │                │
                    │ ┌────────────┐ │
                    │ │ Goal  │ │
                    │ │  Planner   │ │
                    │ └────────────┘ │
                    └───────┬───────┘
                            │ executes todos via
                    ┌───────▼───────┐
                    │  LLM agent    │
                    │  (subagent    │
                    │   per task)   │
                    └───────────────┘
```

## State ownership

`goal.json` is not a phase graph. It stores the mission, deliverables, progress,
and eternal-engine journal. `autophase/*.json` stores phase/task execution runs.
Both live below `~/.wrongstack/projects/<slug>/`; clients must not create a
second repo-local Goal store.

## Naming

The phase runner was originally called **AutoPhase**, which is why the durable
directory remains named `autophase` for compatibility. User-facing surfaces
use **Goal**, while the mission and phase run remain distinct data types.

## Subcommands

### `start <goal>`
Send your goal prompt. The CLI or WebUI plans phases and starts executing them.

### `pause`
Pause the current run. In-flight tasks finish; no new ones start.

### `resume`
Resume a paused run.

### `stop`
Stop the current run immediately — in-flight tasks are aborted.

### `save`
Persist the current phase graph to disk.

### `list`
List all saved goal projects with status and timestamps.

### `load [--resume] [title]`
Load a previously saved goal project. Use `--resume` to restart execution in
CLI/TUI or WebUI. The WebUI board also exposes **Resume** for a stopped run.
An interrupted phase reuses its saved managed worktree; if an older graph has
unmerged work without a recorded phase-to-worktree identity, resume refuses
instead of running in a different checkout. Failed tasks must be requeued first.

## Related

- `/plan` — Todos/tasks/plan dashboard
- `/worktree` — Git worktree isolation for phases
- The TUI shows live goal progress via `PhaseMonitor`
