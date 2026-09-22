# Goal architecture and remaining work (2026-09-22)

## Current ownership

| Concern | Authority | Consumers |
| --- | --- | --- |
| Persistent mission, deliverables, journal | `core/storage/goal-store.ts`, canonical per-project `goal.json` | CLI `/goal`, TUI, WebUI, eternal/parallel engines |
| Phase graph and tasks | `core/goal/PhaseStore`, `autophase/*.json` | CLI Goal host, WebUI Goal host, TUI monitor, WebUI board |
| Phase scheduling and terminal outcome | `core/goal/PhaseOrchestrator` | Both Goal hosts, `GoalRunner` |
| Phase/final project verification | `core/goal/project-verifier.ts` | Both Goal hosts |
| Live browser projection | WebUI server Goal routes and protocol | WebUI Goal view and slash router |

The mission and phase graph have different lifetimes. Setting a mission does not
start a phase run; `/goal start` plans and executes a phase graph. Both hosts
share the canonical project paths and a project-wide run lease. Core emits a
single terminal graph result after queued merges and final verification settle.

## Completed contract repairs

- CLI/TUI `/goal` and WebUI slash routing distinguish mission commands from
  phase-run commands. WebUI `save`, `list`, and `load` now reach phase-run
  controls rather than overwriting the mission.
- Mission replacement uses `replaceGoalMission` in Core. It resets prior run
  evidence, preserves existing project links, and records refined text plus
  deliverables. The provider/model selector, prompt, parser, and heuristic
  fallback are shared in Core. WebUI uses the requesting session's provider,
  tries a configured refiner profile first, and exposes `/goal refine` with a
  visible pending state. A unique mission id prevents late responses from
  changing a replaced or cleared mission.
- Phase task outcomes, graph identity, verification status, and terminal state
  travel through persistence and the TUI/WebUI projections. Task execution is
  isolated per subagent and verification runs against the integrated base tree.
- Both hosts now enable the project verifier by default. WebUI repair work
  runs through an isolated agent in the failed phase's worktree and is followed
  by another verification attempt.
- Core completes or fails a graph deterministically; `GoalRunner` starts and
  clears progress/deadline timers during the actual run.
- Resume preflight, ordered persistence, run leases, graph scheduling, and
  verifier policy now live in Core. CLI and WebUI keep adapters for their
  distinct agents, transports, and UI projections. A stopped graph restores
  paused phases and adopts its recorded managed worktree. The base commit for
  a possible revert is persisted across restarts. Stop retains the run lease
  until the in-flight worker settles and the last graph snapshot is saved.

## Completion proof

- An isolated temporary Git project test covers lease contention, partial
  worktree edits, stop, persisted graph reload, worktree adoption, remaining
  task execution, squash merge, final base-tree verification, and reload of
  the completed graph.
- WebUI browser smoke renders real React/CSS at `1440x900`, `390x844`, and
  `390x300`, checks the saved-run Resume control and mission-refinement state,
  and checks horizontal overflow and page errors.
- A real TUI PTY smoke renders the Goal phase monitor and resizes from `80x24`
  to `62x12`; component/event tests cover the phase counts and task state.
- Focused Core, CLI, TUI, WebUI server, and WebUI Goal suites are the relevant
  regression gates. A whole-monorepo release gate remains a separate release
  decision in this concurrently edited checkout.

Do not combine `goal.json` with phase graphs: their consumers and retention
rules differ. Preserve the narrow Goal verifier policy independently of normal
tool execution permissions.
