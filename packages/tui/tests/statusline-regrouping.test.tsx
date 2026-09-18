import { effectiveLine, type StatuslineOrder } from '@wrongstack/core/statusline';
import { useReducer } from 'react';
import { describe, expect, it } from 'vitest';
import { reducer } from '../src/app-reducer.js';
import { EMPTY_KEY } from '../src/components/input.js';
import { MonitorViewportProvider } from '../src/components/monitor-shell.js';
import {
  navigableFields,
  STATUSLINE_ITEMS,
  StatuslinePicker,
} from '../src/components/statusline-picker.js';
import { tryToolsSettingsPickerKeys } from '../src/hooks/use-picker-keys-tools-settings.js';
import type { PickerKeysHost } from '../src/hooks/use-picker-keys-types.js';
import { useInput } from '../src/ink.js';
import { createTestState } from './helpers/create-test-state.js';
import { renderRealTty, settle } from './helpers/real-tty.js';

const customOrder: StatuslineOrder = ['yolo', 'project', 'autonomy', 'working_dir', 'git'];

function initial() {
  const state = createTestState();
  state.statuslinePicker = {
    ...state.statuslinePicker,
    open: true,
    field: STATUSLINE_ITEMS.indexOf('working_dir'),
    order: customOrder,
  };
  return state;
}

function Harness({ rows = 80, columns = 120 }: { rows?: number; columns?: number }) {
  const [state, dispatch] = useReducer(reducer, undefined, initial);
  useInput((input, key) => {
    tryToolsSettingsPickerKeys(
      { state, dispatch } as PickerKeysHost,
      input,
      { ...EMPTY_KEY, ...key },
      key.return,
      () => false,
    );
  });
  return (
    <MonitorViewportProvider value={{ columns, rows }}>
      <StatuslinePicker {...state.statuslinePicker} />
    </MonitorViewportProvider>
  );
}

function sectionRows(frame: string): {
  headers: number[];
  groups: Map<number, string[]>;
  selected: string | undefined;
} {
  const headers: number[] = [];
  const groups = new Map<number, string[]>();
  let group = 0;
  let selected: string | undefined;
  for (const line of frame.split('\n')) {
    const header = line.match(/LINE ([1-4]) ·/);
    if (header) {
      group = Number(header[1]);
      headers.push(group);
      if (!groups.has(group)) groups.set(group, []);
      continue;
    }
    if (!group) continue;
    const row = line.match(/(› )?\s*(\w+)\s+(?:on|off|auto)\s+.*#\d+/);
    if (!row) continue;
    groups.get(group)?.push(row[2]!);
    if (row[1]) selected = row[2];
  }
  return { headers, groups, selected };
}

describe('statusline live regrouping', () => {
  it('moves the chip into the destination group and saved order on 1–4, retaining focus', async () => {
    const view = renderRealTty(<Harness />, { columns: 120, rows: 80 });
    try {
      await settle();
      for (const target of [3, 4, 2, 1]) {
        view.stdin.write(String(target));
        await settle();
        const parsed = sectionRows(view.lastFrame());
        expect(parsed.headers).toEqual([1, 2, 3, 4]);
        expect(parsed.groups.get(target)).toContain('working_dir');
        expect(
          [...parsed.groups.entries()]
            .filter(([line]) => line !== target)
            .flatMap(([, chips]) => chips),
        ).not.toContain('working_dir');
        expect(parsed.selected).toBe('working_dir');
        if (target === 3) {
          expect(parsed.groups.get(3)?.slice(0, 3)).toEqual(['yolo', 'autonomy', 'working_dir']);
          view.stdin.write('O');
          await settle();
          const reordered = sectionRows(view.lastFrame());
          expect(reordered.groups.get(3)?.slice(0, 3)).toEqual(['yolo', 'working_dir', 'autonomy']);
          expect(reordered.selected).toBe('working_dir');
          view.stdin.write('o');
          await settle();
        }
      }
    } finally {
      view.unmount();
    }
  });

  it.each([
    [120, 24],
    [120, 16],
    [52, 16],
    [52, 8],
  ])('keeps the relocated selection visible at %ix%i', async (columns, rows) => {
    const view = renderRealTty(<Harness rows={rows} columns={columns} />, { columns, rows });
    try {
      await settle();
      for (const target of [4, 2, 3, 1]) {
        view.stdin.write(String(target));
        await settle();
        const parsed = sectionRows(view.lastFrame());
        expect(parsed.selected).toBe('working_dir');
        expect(parsed.groups.get(target)).toContain('working_dir');
      }
    } finally {
      view.unmount();
    }
  });

  it('arrow navigation follows the regrouped neighbors after changing a line', () => {
    const state = reducer(initial(), { type: 'statuslineSetLine', item: 'working_dir', line: 3 });
    expect(STATUSLINE_ITEMS[state.statuslinePicker.field]).toBe('working_dir');
    const up = reducer(state, { type: 'statuslineFieldMove', delta: -1 });
    expect(STATUSLINE_ITEMS[up.statuslinePicker.field]).toBe('autonomy');
    const down = reducer(state, { type: 'statuslineFieldMove', delta: 1 });
    expect(
      effectiveLine(STATUSLINE_ITEMS[down.statuslinePicker.field]!, state.statuslinePicker.lines),
    ).toBe(3);
  });

  it('filter fallback picks the first visible chip in the same grouped custom order', () => {
    const state = initial();
    state.statuslinePicker.lines = { cost: 1 };
    state.statuslinePicker.order = ['cost', 'tokens'];
    const filtered = reducer(state, { type: 'statuslineFilter', text: 'token' });
    expect(STATUSLINE_ITEMS[filtered.statuslinePicker.field]).toBe('cost');
  });

  it('keeps the grouped saved order when a filter has no matches', () => {
    const fields = navigableFields('no-matching-chip', customOrder, { working_dir: 3 });
    expect(fields).toEqual(navigableFields('', customOrder, { working_dir: 3 }));
    expect(new Set(fields).size).toBe(STATUSLINE_ITEMS.length);
  });
});
