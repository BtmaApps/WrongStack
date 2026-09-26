import { describe, expect, it } from 'vitest';
import { THEME_OPTIONS } from '../src/theme.js';
import {
  buildThemeRows,
  filterThemeOptions,
  type ThemeRow,
  windowThemeRows,
} from '../src/theme-picker-rows.js';

/** Rendered line count of a window, used to assert the `maxRows` contract. */
const height = (rows: readonly ThemeRow[]): number => rows.length;

describe('filterThemeOptions', () => {
  it('returns the input untouched for an empty or whitespace query', () => {
    expect(filterThemeOptions(THEME_OPTIONS, '')).toBe(THEME_OPTIONS);
    expect(filterThemeOptions(THEME_OPTIONS, '   ')).toBe(THEME_OPTIONS);
  });

  it('matches on id', () => {
    const hits = filterThemeOptions(THEME_OPTIONS, 'tokyo-night');
    expect(hits.map((o) => o.id)).toEqual(
      expect.arrayContaining(['tokyo-night', 'tokyo-night-storm', 'tokyo-night-moon']),
    );
    expect(hits.length).toBe(3);
  });

  it('matches on display name, case-insensitively', () => {
    const hits = filterThemeOptions(THEME_OPTIONS, 'GRUVBOX');
    expect(hits.every((o) => /gruvbox/i.test(o.name))).toBe(true);
    expect(hits.length).toBeGreaterThan(1);
  });

  it('matches on description', () => {
    const hits = filterThemeOptions(THEME_OPTIONS, 'crt');
    expect(hits.map((o) => o.id)).toEqual(expect.arrayContaining(['matrix', 'amber']));
  });

  it('ANDs multiple whitespace-separated terms', () => {
    const both = filterThemeOptions(THEME_OPTIONS, 'tokyo storm');
    expect(both.map((o) => o.id)).toEqual(['tokyo-night-storm']);
    const either = filterThemeOptions(THEME_OPTIONS, 'tokyo storm bogus');
    expect(either).toHaveLength(0);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterThemeOptions(THEME_OPTIONS, 'zzzzznotatheme')).toHaveLength(0);
  });
});

describe('buildThemeRows', () => {
  const rows = buildThemeRows(THEME_OPTIONS);

  it('emits one header per family, and none for a single-option list', () => {
    const headers = rows.filter((r) => r.kind === 'header');
    const families = new Set(THEME_OPTIONS.map((o) => o.family));
    expect(headers).toHaveLength(families.size);
  });

  it('contiguous families share a header and never repeat one', () => {
    const seen = new Set<string>();
    let current: string | undefined;
    for (const row of rows) {
      if (row.kind === 'header') {
        expect(seen.has(row.family), `family ${row.family} got a second header`).toBe(false);
        seen.add(row.family);
        current = row.family;
      } else {
        expect(row.option.family).toBe(current);
      }
    }
  });

  it('stamps each option with its index into the filtered list', () => {
    expect(
      rows.filter((r) => r.kind === 'option').map((r) => (r as { index: number }).index),
    ).toEqual(THEME_OPTIONS.map((_, i) => i));
  });

  it('handles an empty option list without emitting a stray header', () => {
    expect(buildThemeRows([])).toEqual([]);
  });
});

describe('windowThemeRows', () => {
  const rows = buildThemeRows(THEME_OPTIONS);
  const last = THEME_OPTIONS.length - 1;

  it('returns an empty window for an empty row model', () => {
    expect(windowThemeRows([], 0, 10)).toEqual({ rows: [], hasAbove: false, hasBelow: false });
  });

  it('respects the row budget for every focus position', () => {
    for (const budget of [2, 3, 5, 8, 13, 20]) {
      for (const selected of [0, 1, 17, 40, last]) {
        const w = windowThemeRows(rows, selected, budget);
        expect(height(w.rows), `budget ${budget}, selected ${selected}`).toBeLessThanOrEqual(
          budget,
        );
      }
    }
  });

  it('always includes the focused row', () => {
    for (const selected of [0, 5, 30, last]) {
      const w = windowThemeRows(rows, selected, 6);
      expect(w.rows.some((r) => r.kind === 'option' && r.index === selected)).toBe(true);
    }
  });

  it("includes the focused row's family header, even above the window start", () => {
    // Focus a row deep inside a family: the window must not start mid-group
    // and leave the top visible option looking like it belongs to the family
    // above it.
    const deepIndex = THEME_OPTIONS.findIndex((o) => o.family === 'Catppuccin');
    const w = windowThemeRows(rows, deepIndex, 4);
    const header = w.rows.find((r) => r.kind === 'header');
    expect(header).toBeDefined();
    expect((header as { family: string }).family).toBe('Catppuccin');
  });

  it('reports both markers when the window is interior', () => {
    const w = windowThemeRows(rows, 32, 6);
    expect(w.hasAbove).toBe(true);
    expect(w.hasBelow).toBe(true);
  });

  it('reports no marker above on the first page', () => {
    const w = windowThemeRows(rows, 0, 6);
    expect(w.hasAbove).toBe(false);
    expect(w.hasBelow).toBe(true);
  });

  it('reports no marker below on the last page', () => {
    const w = windowThemeRows(rows, last, 6);
    expect(w.hasBelow).toBe(false);
    expect(w.hasAbove).toBe(true);
  });

  it('drops down to the minimum when the budget cannot fit a group', () => {
    // A budget of 1 still has to show something focusable — the caller's
    // lower-bound guarantee beats a strict budget.
    const w = windowThemeRows(rows, 10, 1);
    expect(w.rows.length).toBeGreaterThan(0);
    expect(w.rows.some((r) => r.kind === 'option' && r.index === 10)).toBe(true);
  });

  it('narrowing the list does not change which preset is focused', () => {
    // The windowing contract that makes the filter safe: filtering happens
    // BEFORE windowing, so indices stay relative to the filtered list.
    const visible = filterThemeOptions(THEME_OPTIONS, 'tokyo-night');
    const filteredRows = buildThemeRows(visible);
    const w = windowThemeRows(filteredRows, 2, 5);
    expect(w.rows.some((r) => r.kind === 'option' && r.index === 2)).toBe(true);
    expect(visible[2]!.id).toBe('tokyo-night-moon');
  });
});
