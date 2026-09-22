# Goal mission state (`goal.json`)

> `/goal-state` is a WebUI compatibility/read-only route, not a registered CLI
> slash command. In CLI/TUI use `/goal set`, `/goal status`, `/goal pause`,
> `/goal resume`, `/goal clear`, and `/goal journal`.

## What it does

Sets, inspects, pauses, resumes, or clears the long-running mission used by
`/autonomy eternal`. Goals persist at
`~/.wrongstack/projects/<slug>/goal.json` across sessions, surviving process
restarts.

## Storage format

`goal.json`:
```json
{
  "version": 1,
  "goal": "string",
  "missionId": "unique id for this mission generation",
  "refinedGoal": "refined mission text",
  "deliverables": ["verifiable outcome"],
  "setAt": "ISO timestamp",
  "lastActivityAt": "ISO timestamp",
  "engineState": "idle | running | stopped",
  "goalState": "active | paused | completed | abandoned",
  "iterations": 0,
  "journal": [
    {
      "iteration": 1,
      "task": "what the agent attempted",
      "status": "success | failure | aborted | skipped",
      "source": "brainstorm | todo | git | manual | resume | parallel",
      "note": "optional note",
      "tokens": { "input": 0, "output": 0 },
      "costUsd": 0.00,
      "at": "ISO timestamp"
    }
  ]
}
```

### `goalState` lifecycle

| Value | Meaning |
|-------|---------|
| `active` (default) | Goal is live; engine will run iterations against it |
| `paused` | User ran `/goal-state pause`; engine exits loop gracefully after current iteration finishes. Run `/goal-state resume` to continue. |
| `completed` | Engine detected `[GOAL_COMPLETE]` + verification passed; engine refuses to restart |
| `abandoned` | User ran `/goal-state clear`; engine stops on next iteration check |

Once `goalState` is not `active`, the engine refuses to run further iterations — this protects against accidental restarts burning API quota after work is done.

### Stale goal guard

`/autonomy eternal` refuses to start if the existing goal has `iterations > 0` or `engineState === 'running'`. The user must `/goal-state clear` first to consciously start a fresh mission.

## Usage

| Usage | Effect |
|---|---|
| `/goal` or `/goal status` | Show the active phase run, or this mission when no phase run is active |
| `/goal set <text>` | Set or replace the mission |
| `/goal refine` | Re-refine the existing mission without resetting its journal |
| `/goal <text>` | Alias for `/goal set <text>` |
| `/goal clear` | Delete goal.json and stop the eternal loop immediately |
| `/goal journal [N]` | Show recent journal entries |
| `/goal pause` | Pause the active phase run; with no phase run, pause this mission |
| `/goal resume` | Resume the active phase run; with no phase run, resume this mission |

CLI and WebUI use the same refinement prompt and parser. WebUI saves a new
mission immediately with heuristic deliverables, then applies the LLM result
when it arrives. A late result cannot overwrite a newer mission or a clear.
The Goal panel shows refinement progress; a configured refiner profile is
tried before the requesting session's provider/model.

## Pause / Resume

When no phase run is active, `/goal pause` writes `goalState: 'paused'` to goal.json. The engine finishes the current iteration then exits the loop cleanly via the existing `missionState !== 'active'` guard — no AbortController, no work lost.

`/goal resume` clears `goalState: 'active'` and the loop continues from the next iteration. If there is no active `/autonomy eternal` running, the state change is persisted and the next `/autonomy eternal` call picks up where it left off.

**Edge cases:**
- `/goal pause` when already paused → no-op, returns "Already paused."
- `/goal resume` when not paused → no-op, returns "Not paused."
- `/goal pause` when no goal exists → returns "No goal set — nothing to pause."
- `/goal pause` while an iteration is in-flight → loop exits after that iteration completes

## Journal entry format

Each iteration writes a journal entry with emoji status indicator:
- ✅ `success` (green checkmark)
- ✗ `failure` (red cross)
- ⊘ `aborted` (amber circle)
- · (dim dot) for unknown status

## Code reference

- `packages/cli/src/slash-commands/goal.ts`
- `packages/core/src/storage/goal-store.ts`
- `packages/core/src/execution/eternal-autonomy.ts`
