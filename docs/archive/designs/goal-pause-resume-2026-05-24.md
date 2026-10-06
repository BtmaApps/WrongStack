# `/goal pause` / `/goal resume` + Iteration Stage Reporting

> Archived on 2026-10-06. Claims, counts and test results below are historical
> evidence or proposals; they are not current checkout certification. Use the
> [maintained documentation](../../README.md) and current source for runtime behavior.


## Status: Implemented

### Implementation summary (2026-05-24)

All features from this design are fully implemented:

- **`goalState: 'paused'`** - added to the `GoalState` type in `goal-store.ts`
- **`/goal pause` / `/goal resume`** - implemented in `slash-commands/goal.ts`
  - Writes `goalState: 'paused'` to `goal.json`; the engine exits the loop gracefully through the existing `missionState !== 'active'` guard
  - `/goal resume` clears `goalState: 'active'`, and the loop continues from the next iteration
- **`onStage` callback** - `EternalAutonomyEngine` fires it at each phase transition (`idle` -> `decide` -> `execute` -> `reflect` -> `sleep` / `paused` / `stopped`)
- **`state.eternalStage`** - plumbed through `app.tsx` via `subscribeEternalStage` -> reducer -> `StatusBar`
- **`EternalStageChip`** - renders in status bar line 2 after the autonomy chip, showing phase-specific labels:
  - `idle`, `decide: {reason}`, `execute({task})`, `reflect: {status}`, `sleep {N}s`, `paused`, `stopped`, `error: {message}`
- **`formatGoal`** - updated to show `State: {stateLabel} (iteration #{n})` instead of `Mission:`

## Original Design

When running `/autonomy eternal` with a goal, the engine loops through a
sense-decide-execute-reflect cycle. The user has no visibility into which
stage the engine is in between iterations, and cannot easily pause the loop
mid-goal without killing the current iteration through Ctrl+C or `/autonomy stop`,
which aborts the in-flight `agent.run`.

## Problem Statement

1. **No visibility between iterations** - The user cannot see which stage the engine is in
   (`sense` / `decide` / `execute` / `reflect`).
2. **Stopping means interrupting** - `/autonomy stop` and Ctrl+C forcibly cancel the current
   iteration through `AbortController`, leaving the work half-finished.
3. **Only a full stop exists** - There is no pause/resume flow; `/goal clear` exists, but it deletes the goal.

## Design

### 1. `/goal pause` - pause without interrupting

Pause as soon as the next iteration finishes. Do not interrupt the current iteration.
Write `goalState: 'paused'` to the goal file as a new state alongside the existing
`active | completed | abandoned` states.

```
User types /goal pause
  -> Engine finishes current iteration
  -> Writes goalState = 'paused' to goal.json
  -> Loop exits gracefully (runOneIteration sees non-'active' state)
  -> Returns "Goal paused. /goal resume to continue."
```

The engine does not need a `pauseRequested` flag. Writing directly to `goal.json` is
enough because `runOneIteration` already checks `goal.goalState` at the beginning:

```ts
if (missionState !== 'active') {
  this.stopRequested = true;
  return false;
}
```

In this condition, `'paused' !== 'active'` evaluates to true, so the loop stops.

### 2. `/goal resume`

Write `goalState: 'active'` so the loop can continue. `/autonomy eternal` already sets
`state = 'running'` through `prime()`, so the existing engine does not do any additional
work until it calls `runOneIteration` again. User-facing message: "Goal resumed."

### 3. Iteration stage reporting (TUI)

Send an event to the TUI at the start of each iteration and at each phase transition.
This information is displayed in the status bar or in a dedicated panel.

New callback on `EternalAutonomyEngine`:

```ts
onStage?: (stage: IterationStage) => void;

type IterationStage =
  | { phase: 'idle' }
  | { phase: 'sense'; detail: string }
  | { phase: 'decide'; detail: string }
  | { phase: 'execute'; task: string }
  | { phase: 'reflect'; status: 'success' | 'failure' | 'aborted' }
  | { phase: 'sleep'; ms: number }
  | { phase: 'paused' }
  | { phase: 'stopped' };
```

The TUI receives these stage events, writes them to `state.eternalStage`, and renders
them from that state.

### 4. TUI Status Bar Extension

Add this next to the existing status bar, or next to the autonomy chip:

```
[ETERNAL:decide->todo:fix-auth-bug]  <- stage info
```

### 5. New information in `/goal status` output

```
Goal: "fix auth bug"
   State: active (iteration #14)
   Stage: execute (todo: fix the redirect URI)
   Sources: todo(3) | git(0) | brainstorm(0)
   Failures: 1 consecutive | 0 total
   [paused | running] indicator
```

## File Changes

| File | Change |
|------|--------|
| `packages/core/src/storage/goal-store.ts` | Add `paused` to the `GoalState` type; update `formatGoal` output |
| `packages/core/src/execution/eternal-autonomy.ts` | Add `onStage` callback; call it at each phase transition |
| `packages/cli/src/slash-commands/goal.ts` | Add `pause` and `resume` verbs |
| `packages/tui/src/app.tsx` | Add `eternalStage` state; wire `onStage` from the engine; render in the status bar |
| `packages/tui/src/components/status-bar.tsx` | Add `eternalStage` prop; add `EternalStageChip` component |

## Backward Compatibility

- `goalState: 'paused'` is a new variant. Old `goal.json` files with
  `goalState: undefined` or `'active'` work unchanged.
- The engine's existing `missionState !== 'active'` guard handles `'paused'`
  without any conditionals; the loop just stops, which is correct behavior.
- `/goal pause` outside eternal mode saves `goalState: 'paused'` and returns success.
  If the user later runs `/autonomy eternal`, the engine immediately sees `paused`
  and refuses to start; the user must run `/goal resume` first.

## Edge Cases

- `/goal pause` during an iteration -> waits for the current iteration to finish
- `/goal clear` during an iteration -> marks the goal abandoned and aborts in-flight work via `stopRequested`; the current `agent.run` receives an `AbortSignal`
- `/goal pause` when already paused -> no-op, returns "Already paused."
- `/goal resume` when not paused -> no-op, returns "Not paused."
- TUI not mounted when stage events fire -> events are fire-and-forget; no crash
- Restarting the TUI while the engine is running -> the engine is in `core` and survives the TUI restart; the TUI reconnects via `subscribeEternalIteration`
