import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/app-initial-state.js';
import { reducer } from '../src/app-reducer.js';

const initial = () =>
  createInitialState({
    banner: false,
    model: 'm',
    cwd: '.',
    restoredEntries: [],
    enhanceEnabled: false,
  });
const mention = { start: 0, end: 4, query: 'tes' };
const entries = [
  {
    name: 'testing',
    source: 'bundled' as const,
    path: '/testing/SKILL.md',
    scope: [],
    trigger: 'Test software',
  },
];

describe('skill mention async results', () => {
  it('does not reopen a picker dismissed while the catalog was loading', () => {
    const loading = reducer(initial(), { type: 'skillPickerOpen', entries: [], mention });
    const closed = reducer(loading, { type: 'skillPickerClose' });
    expect(reducer(closed, { type: 'skillMentionResults', entries, mention })).toBe(closed);
  });
  it('ignores stale queries and preserves the draft when populating the picker', () => {
    const state = { ...initial(), buffer: '$tes', cursor: 4 };
    const loading = reducer(state, { type: 'skillPickerOpen', entries: [], mention });
    expect(
      reducer(loading, {
        type: 'skillMentionResults',
        entries,
        mention: { ...mention, query: 'old' },
      }),
    ).toBe(loading);
    const ready = reducer(loading, { type: 'skillMentionResults', entries, mention });
    expect(ready.buffer).toBe('$tes');
    expect(ready.skillPicker.entries).toEqual(entries);
  });
});
