import { describe, expect, it } from 'vitest';
import { reducer } from '../src/app.js';
import type { Action } from '../src/app-action-type.js';
import type { State } from '../src/app-state.js';

/**
 * Regression: `/clear` must reset the boot-resume slice.
 *
 * `useAppSessionState` memos `restoredEntries` / `restoredCheckpoints` from
 * `restoredMessages` / `restoredToolCalls` / `restoredEvents` once at mount
 * and feeds them to `createInitialState`, which seeds:
 *   - `historyBudget`   = `TUI_RESUME_HISTORY_BUDGET` when resumed, `undefined` otherwise.
 *   - `autoProceedHold` = `true` when resumed (so the user sees the transcript
 *     before auto-proceed fires), `false` otherwise.
 *   - `nextId`          = `max(restoredEntry.id) + 1`, offsetting id allocation
 *     past the restored tail.
 *
 * Pre-fix, the `clearHistory` reducer case wiped `entries` but never reached
 * the boot-resume slice — so a TUI launched with `wstack --resume <id>` then
 * `/clear`'d kept the widened budget, the auto-proceed hold, and the offset
 * `nextId`. The bug surfaced as "old-session state leaks through `/clear`".
 *
 * The surgical fix:
 *   1. Extend the `clearHistory` action payload with three nullable props:
 *      `restoredMessages` / `restoredToolCalls` / `restoredEvents`.
 *   2. When ALL THREE are explicitly `null`, the reducer also resets the
 *      boot-resume slice to the fresh-boot values.
 *   3. When the three are omitted (existing `session.rewound` /
 *      `project.switched` callers), the existing resume-derived behavior is
 *      preserved — verified by the second test below.
 *
 * The host's `onClearHistory` (in `packages/cli/src/execution.ts`) dispatches
 * the payload with all three set to `null` for `/clear`. The event-bridge
 * callers for `session.rewound` / `project.switched` omit them.
 */
function resumedState(): State {
  return {
    entries: [
      { kind: 'banner', id: 0, model: 'm', provider: 'p' } as never,
      { kind: 'user', id: 1, text: 'old question' } as never,
      { kind: 'assistant', id: 2, text: 'old answer' } as never,
    ],
    buffer: 'leftover draft',
    cursor: 0,
    streamingText: '',
    toolStream: null,
    status: 'idle',
    interrupts: 0,
    steeringPending: false,
    steerSnapshot: null,
    hint: '',
    brain: { state: 'idle' },
    nextId: 42, // Off-set by the resume path (banner 0 + restored tail).
    historyGen: 7,
    picker: { open: false, query: '', matches: [], selected: 0 },
    slashPicker: { open: false, query: '', matches: [], selected: 0 },
    runningTools: new Map(),
    queue: [],
    nextQueueId: 1,
    confirmQueue: [],
    clearConfirm: null,
    slashConfirm: null,
    brainPrompt: null,
    debugStreamStats: null,
    historyScrolled: false,
    archiveLoading: false,
    // Resume-derived slice — these three fields are exactly what
    // `createInitialState` sets from `restoredEntries.length > 0`.
    historyBudget: { maxEntries: 800, maxBytes: 256_000, maxEntryBytes: 32_000 } as never,
    autoProceedHold: true,
    resumeLoad: null,
    bashMode: false,
  } as unknown as State;
}

describe('/clear resets the boot-resume slice', () => {
  it('nulls all three restored-props → historyBudget, autoProceedHold, nextId reset to fresh values', () => {
    const before = resumedState();
    expect(before.historyBudget).toBeDefined();
    expect(before.autoProceedHold).toBe(true);
    expect(before.nextId).toBe(42);

    const action: Action = {
      type: 'clearHistory',
      model: 'm',
      provider: 'p',
      restoredMessages: null,
      restoredToolCalls: null,
      restoredEvents: null,
    };
    const out = reducer(before, action);

    // Resume-derived slice collapses to the fresh-boot values.
    expect(out.historyBudget).toBeUndefined();
    expect(out.autoProceedHold).toBe(false);
    // Banner id is 0; `createInitialState` re-seeds nextId from surviving
    // entries with a floor of 1 — re-seeding prevents collisions on the
    // first post-clear `addEntry`.
    expect(out.nextId).toBe(1);

    // Transcript still resets correctly (preserved banner, no old entries).
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]).toMatchObject({ kind: 'banner', id: 0 });

    // historyGen still bumps so <Static> remounts.
    expect(out.historyGen).toBe(before.historyGen + 1);
  });

  it('omitting the three restored-props preserves the existing resume-derived behavior', () => {
    // `session.rewound` and `project.switched` dispatch without the three new
    // fields. The reducer MUST leave the resume slice alone for that path —
    // changing it would silently alter the rewind/switch flows.
    const before = resumedState();
    const action: Action = { type: 'clearHistory', cwd: '/x', sessionId: 's' };
    const out = reducer(before, action);

    expect(out.historyBudget).toBe(before.historyBudget);
    expect(out.autoProceedHold).toBe(true);
    expect(out.nextId).toBe(42);
  });

  it('nulling only some of the three restored-props is a no-op for the resume slice', () => {
    // The contract is "all three nulled → reset; otherwise leave alone".
    // A partial-null payload is malformed for `/clear` (the host sends all
    // three) but must not crash or silently half-reset.
    const before = resumedState();
    const partial: Action = {
      type: 'clearHistory',
      restoredMessages: null,
    };
    const out = reducer(before, partial);

    expect(out.historyBudget).toBe(before.historyBudget);
    expect(out.autoProceedHold).toBe(true);
    expect(out.nextId).toBe(42);
  });
});
