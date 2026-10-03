/**
 * Regression test: opening the /settings picker with Ctrl+S must hydrate the
 * right-sidebar master switch from the persisted config, not reset it.
 *
 * `routeSettingsOverlayKey` (src/overlay-key-router.ts) builds the
 * `settingsOpen` payload field-by-field from `getSettings()`, and
 * `reduceSettingsPanel` (src/reducers/settings-panel.ts) seeds the picker with
 * `showSidebar: action.showSidebar ?? true`.
 *
 * The payload omitted `showSidebar`, so a user who had persisted
 * `showSidebar: false` (via `/sidebar off` or `/settings sidebar off`) saw the
 * sidebar reappear the moment they opened the picker — and the next auto-save
 * (`useSettingsAutoSave`, which persists `sp.showSidebar`) wrote the flipped
 * value back to disk, silently overriding their own setting.
 *
 * This drives the REAL route function and the REAL reducer — no mocks.
 */
import { describe, expect, it } from 'vitest';
import { reducer } from '../src/app-reducer.js';
import { routeSettingsOverlayKey } from '../src/overlay-key-router.js';
import { DEFAULT_PANEL_POSITIONS } from '../src/ui-contracts.js';

/** Minimal State carrying only what the route + reducer read. */
function makeState(): never {
  return {
    settingsPicker: {
      open: false,
      field: 0,
      lastSettingsField: 0,
      thinkingWordEditing: false,
      thinkingWordDraft: '',
      wrongProxyUrlEditing: false,
      wrongProxyUrlDraft: '',
      panelPositions: DEFAULT_PANEL_POSITIONS,
      showSidebar: true,
      showAgentSwarmPanel: 'bottom',
    },
  } as never;
}

/**
 * A persisted config with every panel on 'bottom' (so the pin rule permits
 * hiding the sidebar) and the sidebar master switch explicitly OFF.
 */
function configWithSidebar(showSidebar: boolean): never {
  return {
    mode: 'off',
    delayMs: 0,
    panelPositions: { ...DEFAULT_PANEL_POSITIONS },
    showSidebar,
  } as never;
}

/** Drive the real Ctrl+S open path, then reduce the real `settingsOpen`. */
function openPickerAndReadHydration(config: unknown): {
  showSidebar: boolean;
  routedToSidebar: boolean;
} {
  const state = makeState();
  const dispatched: Array<Record<string, unknown>> = [];
  routeSettingsOverlayKey(
    {
      state: state as never,
      getSettings: () => config as never,
      saveSettings: (() => Promise.resolve()) as never,
      lastEnterAt: { current: 0 },
      dispatch: (action: unknown) => {
        dispatched.push(action as Record<string, unknown>);
      },
    },
    's',
    { ctrl: true } as never,
    false,
  );
  const open = dispatched.find((a) => a['type'] === 'settingsOpen');
  expect(open, 'Ctrl+S must dispatch settingsOpen').toBeDefined();
  const next = reducer(state, open as never);
  return {
    showSidebar: next.settingsPicker.showSidebar,
    routedToSidebar: Object.values(next.settingsPicker.panelPositions).some((p) => p === 'sidebar'),
  };
}

describe('settingsOpen hydration: right sidebar master switch', () => {
  it('preserves a persisted showSidebar: false when the picker opens', () => {
    const result = openPickerAndReadHydration(configWithSidebar(false));
    // Precondition: no panel is routed, so hiding the sidebar is legal.
    expect(result.routedToSidebar).toBe(false);
    expect(result.showSidebar).toBe(false);
  });

  it('preserves a persisted showSidebar: true when the picker opens', () => {
    expect(openPickerAndReadHydration(configWithSidebar(true)).showSidebar).toBe(true);
  });

  it('defaults to visible when an older config omits the key entirely', () => {
    const legacy = { mode: 'off', delayMs: 0 } as never;
    expect(openPickerAndReadHydration(legacy).showSidebar).toBe(true);
  });
});
