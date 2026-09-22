import { describe, expect, it, vi } from 'vitest';
import type { Action } from '../src/app-action-type.js';
import { createInitialState } from '../src/app-initial-state.js';
import { reducer } from '../src/app-reducer.js';
import type { State } from '../src/app-state.js';
import { EMPTY_KEY, type KeyEvent } from '../src/components/input.js';
import type { HistoryEntry } from '../src/history-entry.js';
import type { KeyRouteContext } from '../src/key-handler-context.js';
import { routeChatSearch } from '../src/key-routes/key-route-chat-search.js';
import {
  findTranscriptMatches,
  stepTranscriptMatch,
  transcriptMatchSnippet,
} from '../src/transcript-search.js';

const entries: HistoryEntry[] = [
  { id: 1, kind: 'user', text: 'Please fix the Parser bug' },
  { id: 2, kind: 'thinking', text: 'the parser fails on tabs' },
  { id: 3, kind: 'assistant', text: 'Looking at it.\nThe parser drops the last token.' },
  {
    id: 4,
    kind: 'tool',
    name: 'grep',
    durationMs: 3,
    ok: true,
    output: 'src/parser.ts:12: export function parse',
  },
  { id: 5, kind: 'confirm', toolName: 'bash', input: { parser: true }, suggestedPattern: '' },
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

describe('findTranscriptMatches', () => {
  it('matches lowercase queries in any case, oldest first, one per entry', () => {
    const matches = findTranscriptMatches(entries, 'parser', { includeReasoning: true });
    expect(matches.map((m) => m.entryId)).toEqual([1, 2, 3, 4]);
    expect(matches[2]).toMatchObject({
      line: 'The parser drops the last token.',
      column: 4,
      length: 6,
    });
  });

  it('is case-sensitive once the query has a capital letter', () => {
    const matches = findTranscriptMatches(entries, 'Parser', { includeReasoning: true });
    expect(matches.map((m) => m.entryId)).toEqual([1]);
  });

  it('skips hidden reasoning and raw-JSON-only cards', () => {
    const matches = findTranscriptMatches(entries, 'parser', { includeReasoning: false });
    expect(matches.map((m) => m.entryId)).toEqual([1, 3, 4]);
  });

  it('searches tool names as well as tool output', () => {
    const matches = findTranscriptMatches(entries, 'grep', { includeReasoning: true });
    expect(matches.map((m) => m.entryId)).toEqual([4]);
  });

  it('returns nothing for a blank query', () => {
    expect(findTranscriptMatches(entries, '   ', { includeReasoning: true })).toEqual([]);
  });
});

describe('stepTranscriptMatch', () => {
  const matches = findTranscriptMatches(entries, 'parser', { includeReasoning: false });

  it('moves older and newer with wrap-around', () => {
    expect(stepTranscriptMatch(matches, 3, -1)).toBe(1);
    expect(stepTranscriptMatch(matches, 1, -1)).toBe(4);
    expect(stepTranscriptMatch(matches, 4, 1)).toBe(1);
  });

  it('restarts from the newest match when the selection is gone', () => {
    expect(stepTranscriptMatch(matches, 99, -1)).toBe(4);
    expect(stepTranscriptMatch([], 1, -1)).toBeNull();
  });
});

describe('transcriptMatchSnippet', () => {
  it('returns the whole line when it fits', () => {
    expect(transcriptMatchSnippet({ line: 'a hit b', column: 2, length: 3 }, 40)).toEqual({
      before: 'a ',
      hit: 'hit',
      after: ' b',
    });
  });

  it('keeps the hit visible in a long line and marks both cuts', () => {
    const line = `${'x'.repeat(100)}NEEDLE${'y'.repeat(100)}`;
    const snippet = transcriptMatchSnippet({ line, column: 100, length: 6 }, 30);
    expect(snippet.hit).toBe('NEEDLE');
    expect(snippet.before.startsWith('…')).toBe(true);
    expect(snippet.after.endsWith('…')).toBe(true);
    expect((snippet.before + snippet.hit + snippet.after).length).toBeLessThanOrEqual(30);
  });
});

describe('chat search reducer', () => {
  it('opens on the newest match and bumps the jump sequence', () => {
    const next = reducer(stateWith(entries), {
      type: 'chatSearchOpen',
      query: 'parser',
      includeReasoning: true,
    });
    expect(next.chatSearch).toEqual({ query: 'parser', selectedEntryId: 4, jumpSeq: 1 });
  });

  it('steps older and re-requests a jump each time', () => {
    let state = reducer(stateWith(entries), {
      type: 'chatSearchOpen',
      query: 'parser',
      includeReasoning: false,
    });
    state = reducer(state, { type: 'chatSearchStep', delta: -1, includeReasoning: false });
    expect(state.chatSearch).toMatchObject({ selectedEntryId: 3, jumpSeq: 2 });
  });

  it('opens empty without selecting or jumping', () => {
    const next = reducer(stateWith(entries), { type: 'chatSearchOpen', includeReasoning: true });
    expect(next.chatSearch).toEqual({ query: '', selectedEntryId: null, jumpSeq: 0 });
  });

  it('closes, and ignores queries while closed', () => {
    const open = reducer(stateWith(entries), { type: 'chatSearchOpen', includeReasoning: true });
    expect(reducer(open, { type: 'chatSearchClose' }).chatSearch).toBeNull();
    const closed = stateWith(entries);
    expect(
      reducer(closed, { type: 'chatSearchSetQuery', query: 'x', includeReasoning: true }),
    ).toBe(closed);
  });
});

describe('routeChatSearch', () => {
  function route(state: State, input: string, key: Partial<KeyEvent>) {
    const dispatch = vi.fn<(action: Action) => void>();
    const ctx = {
      state,
      dispatch,
      getSettings: () => ({ showModelReasoning: false }),
    } as unknown as KeyRouteContext;
    const consumed = routeChatSearch(ctx, input, { ...EMPTY_KEY, ...key });
    return { consumed, actions: dispatch.mock.calls.map(([a]) => a) };
  }
  const open = (query = 'pa') => ({
    ...stateWith(entries),
    chatSearch: { query, selectedEntryId: 3, jumpSeq: 1 },
  });

  it('opens on Alt+F and ignores other keys while closed', () => {
    expect(route(stateWith(entries), 'f', { meta: true }).actions).toEqual([
      { type: 'chatSearchOpen', includeReasoning: false },
    ]);
    expect(route(stateWith(entries), 'f', {}).consumed).toBe(false);
  });

  it('types into the query instead of the composer', () => {
    const { consumed, actions } = route(open(), 'r', {});
    expect(consumed).toBe(true);
    expect(actions).toEqual([
      { type: 'chatSearchSetQuery', query: 'par', includeReasoning: false },
    ]);
  });

  it('drops control characters and escape sequences from typed text', () => {
    expect(route(open(), '\x1b[A', {}).actions).toEqual([]);
    expect(route(open(), 'a\x07b', {}).actions).toEqual([
      { type: 'chatSearchSetQuery', query: 'paab', includeReasoning: false },
    ]);
  });

  it('navigates, edits and closes', () => {
    expect(route(open(), '', { upArrow: true }).actions[0]).toMatchObject({ delta: -1 });
    expect(route(open(), '', { return: true }).actions[0]).toMatchObject({ delta: -1 });
    expect(route(open(), '', { downArrow: true }).actions[0]).toMatchObject({ delta: 1 });
    expect(route(open(), '', { backspace: true }).actions[0]).toMatchObject({ query: 'p' });
    expect(route(open(), 'u', { ctrl: true }).actions[0]).toMatchObject({ query: '' });
    expect(route(open(), '', { escape: true }).actions).toEqual([{ type: 'chatSearchClose' }]);
  });

  it('leaves scrolling, function keys and Ctrl+C on their normal routes', () => {
    expect(route(open(), '', { pageUp: true }).consumed).toBe(false);
    expect(route(open(), '', { fn: 3 }).consumed).toBe(false);
    expect(route(open(), 'c', { ctrl: true }).consumed).toBe(false);
  });

  it('swallows other chords so they cannot edit the hidden draft', () => {
    const { consumed, actions } = route(open(), 'a', { ctrl: true });
    expect(consumed).toBe(true);
    expect(actions).toEqual([]);
  });
});
