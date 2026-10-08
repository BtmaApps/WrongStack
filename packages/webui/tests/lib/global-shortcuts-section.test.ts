import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_PANEL_DESC_KEY,
  ACTIVITY_PANEL_SHORTCUTS,
} from '../../src/lib/global-shortcuts-section';
import { ACTIVITY_SHORTCUT_BY_KEY } from '../../src/lib/view-navigation';

/**
 * ShortcutsOverlay renders its global panel-jump rows from
 * ACTIVITY_PANEL_SHORTCUTS, which must be a faithful derivation of the
 * ACTIVITY_SHORTCUT_BY_KEY handler table — one row per table entry, keys and
 * labels both derived, so documentation can never drift from the bindings.
 */
describe('global-shortcuts-section derivation', () => {
  it('has exactly one row per entry of ACTIVITY_SHORTCUT_BY_KEY', () => {
    expect(ACTIVITY_PANEL_SHORTCUTS).toHaveLength(Object.keys(ACTIVITY_SHORTCUT_BY_KEY).length);
  });

  it('derives keys (Ctrl + digit) and label mapping from the table', () => {
    const expected = Object.entries(ACTIVITY_SHORTCUT_BY_KEY).map(([digit, activity]) => ({
      keys: ['Ctrl', digit],
      descKey: ACTIVITY_PANEL_DESC_KEY[activity],
    }));
    expect(ACTIVITY_PANEL_SHORTCUTS).toEqual(expected);
  });

  it('every rendered row has a non-empty, distinct descKey', () => {
    const descKeys = ACTIVITY_PANEL_SHORTCUTS.map((s) => s.descKey);
    for (const key of descKeys) expect(key.trim().length).toBeGreaterThan(0);
    // Distinct labels keep the overlay rows unambiguous per panel.
    expect(new Set(descKeys).size).toBe(descKeys.length);
  });

  it('covers every activity with a display-label mapping (compile-checked table)', () => {
    // Record<Activity, string> guarantees completeness at the type level;
    // assert no blank entries sneaked in.
    for (const descKey of Object.values(ACTIVITY_PANEL_DESC_KEY)) {
      expect(descKey.trim().length).toBeGreaterThan(0);
    }
  });
});
