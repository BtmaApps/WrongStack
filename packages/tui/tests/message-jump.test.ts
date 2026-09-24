/**
 * Alt+↑ / Alt+↓ step through the user's own messages: the first Alt+↑ lands
 * on the newest, further steps stop at either end, and every step bumps the
 * scroll request even when the target does not change.
 */
import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../src/app-initial-state.js';
import { reducer } from '../src/app-reducer.js';
import type { State } from '../src/app-state.js';
import { EMPTY_KEY } from '../src/components/input.js';
import type { HistoryEntry } from '../src/history-entry.js';
import { validateAction } from '../src/input-validation.js';
import type { KeyRouteContext } from '../src/key-handler-context.js';
import { routeMessageJump } from '../src/key-routes/key-route-chat-search.js';

const entries: HistoryEntry[] = [
  { id: 1, kind: 'user', text: 'first ask' },
  { id: 2, kind: 'assistant', text: 'answer one' },
  { id: 3, kind: 'user', text: 'second ask' },
  { id: 4, kind: 'assistant', text: 'answer two' },
  { id: 5, kind: 'user', text: 'third ask' },
];

function stateWith(list: HistoryEntry[]): State {
  return {
    ...createInitialState({
      banner: false,
      model: 'test-model',
      cwd: '/project',
      restoredEntries: [],
      enhanceEnabled: false,
    }),
    entries: list,
  };
}

describe('messageJump', () => {
  it('walks the user messages newest first and clamps at both ends', () => {
    let s = stateWith(entries);
    const ids: Array<number | null> = [];
    for (const direction of [-1, -1, -1, -1, 1, 1, 1] as const) {
      s = reducer(s, { type: 'messageJump', direction });
      ids.push(s.messageJump.entryId);
    }
    expect(ids).toEqual([5, 3, 1, 1, 3, 5, 5]);
    expect(s.messageJump.seq).toBe(7);
  });

  it('does nothing without user messages', () => {
    const s = stateWith([{ id: 9, kind: 'assistant', text: 'hi' }]);
    expect(reducer(s, { type: 'messageJump', direction: -1 })).toBe(s);
  });

  it('is an accepted action with a ±1 direction only', () => {
    expect(validateAction({ type: 'messageJump', direction: -1 }).valid).toBe(true);
    expect(validateAction({ type: 'messageJump', direction: 2 } as never).valid).toBe(false);
  });

  it('Alt+↑ / Alt+↓ dispatch it; plain arrows stay with the composer', () => {
    const dispatch = vi.fn();
    const ctx = { dispatch } as unknown as KeyRouteContext;
    expect(routeMessageJump(ctx, '', { ...EMPTY_KEY, meta: true, upArrow: true })).toBe(true);
    expect(routeMessageJump(ctx, '', { ...EMPTY_KEY, meta: true, downArrow: true })).toBe(true);
    expect(routeMessageJump(ctx, '', { ...EMPTY_KEY, upArrow: true })).toBe(false);
    expect(dispatch.mock.calls.map((c) => c[0])).toEqual([
      { type: 'messageJump', direction: -1 },
      { type: 'messageJump', direction: 1 },
    ]);
  });
});
