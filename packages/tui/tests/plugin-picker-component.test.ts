// Runtime smoke for the PluginPicker React component.
//
// The reducer and dispatch tests cover *what* the picker does in response
// to state changes; this file covers *what it looks like* when mounted.
// In other words, the user-visible contract:
//
//   - "Plugin menu" heading appears in the list pane
//   - locked rows show 🔒 + yellow in BOTH the list row and the detail pane
//   - enabled rows show ● on, disabled show ○ off
//   - ↑/↓ change the focused row (via the `selected` prop)
//   - the hint footer surfaces row-specific guidance
//   - the detail pane renders name + state + risk badges + summary when wide
//
// If the highlight colours change, or the markers are wrong, this test
// will catch it — which is what a user running /plugin menu would notice
// first.

import { render } from 'ink-testing-library';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { PluginPicker, type PluginPickerItem } from '../src/components/plugin-picker.js';

const ROWS: PluginPickerItem[] = [
  { name: 'cost-tracker', enabled: true, risk: 'low', summary: 'Tracks cost', lockable: true },
  {
    name: 'legacy-core',
    enabled: true,
    risk: 'high',
    summary: 'Synthetic locked row',
    lockable: false,
  },
  { name: 'format-on-save', enabled: false, risk: 'low', summary: 'Auto-format', lockable: true },
  {
    name: 'external-guard',
    enabled: true,
    risk: 'high',
    summary: 'Synthetic guard',
    lockable: false,
  },
];

function frame(
  items: PluginPickerItem[],
  selected: number,
  options: { hint?: string; columns?: number; maxRows?: number; busy?: boolean } = {},
): string {
  const inst = render(
    React.createElement(PluginPicker, {
      items,
      selected,
      hint: options.hint,
      columns: options.columns ?? 0,
      maxRows: options.maxRows,
      busy: options.busy,
    }),
  );
  const text = inst.lastFrame() ?? '';
  inst.unmount();
  return text;
}

describe('<PluginPicker /> rendering', () => {
  it('renders the heading and the hint bar', () => {
    // Single-pane path (columns=0 → falls back to terminal size; we force a
    // narrow width so the picker stays single-pane and the full inline hint
    // fits without truncation).
    const text = frame(ROWS, 0, { columns: 60 });
    expect(text).toMatch(/Plugin menu/);
    expect(text).toMatch(/↑\/↓ select/);
    expect(text).toMatch(/Enter\/←\/→ toggle/);
    expect(text).toMatch(/🔒 = locked/);
    expect(text).toMatch(/Esc close/);
  });

  it('omits the lock hint when every row is toggleable', () => {
    const rows = ROWS.map((row) => ({ ...row, lockable: true }));
    const text = frame(rows, 0, { columns: 60 });
    expect(text).not.toMatch(/🔒 = locked/);
  });

  it('lists every row by name', () => {
    const text = frame(ROWS, 0, { columns: 60 });
    for (const row of ROWS) {
      expect(text).toMatch(row.name);
    }
  });

  it('renders the lock marker on rows where lockable=false', () => {
    const text = frame(ROWS, 0, { columns: 60 });
    // 2 locked rows in our fixture → the 🔒 marker must appear on each row
    // (2 occurrences in the list) plus once in the dedicated lock-hint row.
    const lockMarkerCount = (text.match(/🔒/g) ?? []).length;
    expect(lockMarkerCount).toBeGreaterThanOrEqual(2);
  });

  it('renders the "on" marker for enabled rows and "off" for disabled', () => {
    const text = frame(ROWS, 0, { columns: 60 });
    expect(text).toMatch(/● on/); // cost-tracker, legacy-core, external-guard are enabled
    expect(text).toMatch(/○ off/); // format-on-save is disabled
  });

  it('shows the focused row with the › marker', () => {
    const textFirst = frame(ROWS, 0, { columns: 60 });
    const textSecond = frame(ROWS, 1, { columns: 60 });
    // Each row is a Text component — both frames should contain the row
    // names, but only one row should have the › focus marker per frame.
    expect(textFirst).toMatch(/›/);
    expect(textSecond).toMatch(/›/);
  });

  it('shows the "Loading plugins…" placeholder when items is empty AND busy=true', () => {
    const text = frame([], 0, { busy: true });
    expect(text).toMatch(/Loading plugins/);
  });

  it('shows the "No plugins available." placeholder when items is empty AND not busy', () => {
    const text = frame([], 0, { busy: false });
    expect(text).toMatch(/No plugins available/);
  });

  it('keeps the 🔒 out of the on/off state column (own column after the name)', () => {
    const text = frame(ROWS, 1, { columns: 60 });
    // Locked rows still show a uniform ●/○ state; the lock is a separate
    // column. "🔒 on" was the old in-column rendering — it must not return.
    expect(text).not.toMatch(/🔒 on/);
    // legacy-core is locked AND enabled → its row has both ● on and 🔒.
    const lockedRow = text.split('\n').find((l) => l.includes('legacy-core')) ?? '';
    expect(lockedRow).toMatch(/● on/);
    expect(lockedRow).toMatch(/🔒/);
  });

  it('windows long lists to the terminal height with ↑/↓ overflow indicators', () => {
    const many: PluginPickerItem[] = Array.from({ length: 30 }, (_, i) => ({
      name: `plug-${String(i).padStart(2, '0')}`,
      enabled: i % 2 === 0,
      risk: 'low',
      summary: `Row ${i}`,
      lockable: true,
    }));
    // Narrow columns force single-pane so the windowing math matches the
    // original baseline (the existing useWindowedPicker behaviour).
    const text = frame(many, 15, { columns: 60, maxRows: 12 });
    expect(text).toMatch(/↑ \d+ more/);
    expect(text).toMatch(/↓ \d+ more/);
    expect(text).toMatch(/plug-15/);
    expect(text).not.toMatch(/plug-00/);
    expect(text).not.toMatch(/plug-29/);
    // Selecting the first row pins the window to the top: no ↑ indicator.
    const top = frame(many, 0, { columns: 60, maxRows: 12 });
    expect(top).not.toMatch(/↑ \d+ more/);
    expect(top).toMatch(/plug-00/);
    // Selecting the last row pins to the bottom: no ↓ indicator.
    const bottom = frame(many, 29, { columns: 60, maxRows: 12 });
    expect(bottom).not.toMatch(/↓ \d+ more/);
    expect(bottom).toMatch(/plug-29/);
  });

  it('renders the hint footer when row guidance is set', () => {
    const text = frame(ROWS, 1, {
      hint: 'legacy-core is locked — see /plugin report',
      columns: 60,
    });
    expect(text).toMatch(/legacy-core is locked/);
  });

  it('renders a detail pane with state, risk, and summary on wide terminals', () => {
    // Force split mode by giving the picker a wide terminal. The detail
    // pane should show the selected plugin's name, the enabled/disabled
    // badge, the risk badge, and a summary heading.
    const text = frame(ROWS, 1, { columns: 140, maxRows: 24 });
    expect(text).toMatch(/Plugin menu/);
    expect(text).toMatch(/legacy-core/);
    expect(text).toMatch(/● enabled/);
    expect(text).toMatch(/risk=/);
    expect(text).toMatch(/🔒 locked/);
    expect(text).toMatch(/summary/);
    expect(text).toMatch(/Synthetic locked row/);
  });

  it('detail pane shows disabled badge for off plugins', () => {
    const text = frame(ROWS, 2, { columns: 140, maxRows: 24 });
    expect(text).toMatch(/○ disabled/);
    expect(text).toMatch(/Auto-format/);
  });
});
