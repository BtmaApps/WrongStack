// @vitest-environment jsdom

/**
 * Regression: opening the `/settings` picker must hydrate the right-sidebar
 * master switch from persisted config, never reset it to its default.
 *
 * `usePanelControllers().openSettings()` (hooks/use-panel-controllers.ts:157)
 * builds the `settingsOpen` payload that hydrates the whole picker. The
 * reducer reads `showSidebar: action.showSidebar ?? true`
 * (reducers/settings-panel.ts:97) and `useSettingsAutoSave` persists
 * `sp.showSidebar` on the next value change
 * (hooks/use-settings-auto-save.ts:84).
 *
 * So a dispatch that omits `showSidebar` does not merely render the wrong
 * row: it flips the user's persisted choice back ON and writes it to disk.
 * A user who had run `/sidebar off` lost that setting simply by typing
 * `/settings`.
 *
 * The Ctrl+S open path in `overlay-key-router.ts` had the identical omission
 * and is pinned by `settings-open-sidebar-hydration.test.ts`. These two
 * `settingsOpen` dispatch sites are the picker's only hydration boundaries,
 * so they must stay in lock-step: when a field is added to `Settings`, both
 * have to carry it or it silently resets on open.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { reducer, type Action } from '../src/app-reducer.js';
import { usePanelControllers } from '../src/hooks/use-panel-controllers.js';

type SettingsOpenAction = Extract<Action, { type: 'settingsOpen' }>;

/** Minimal State: the hook reads only a few flags; the rest is never touched. */
function makeState(): Parameters<typeof reducer>[0] {
  return {
    sessionsPanelOpen: false,
    pluginPicker: { open: false },
    mcpPicker: { open: false },
    toolsPicker: { open: false },
    settingsPicker: { open: false },
  } as never as Parameters<typeof reducer>[0];
}

/** Stubs for the ~23 collaborators the hook needs but this test never exercises. */
function harness(dispatch: (action: Action) => void, getSettings: () => unknown) {
  const state = makeState();
  return renderHook(() =>
    usePanelControllers({
      state,
      stateRef: { current: state },
      dispatch,
      getSettings: getSettings as never,
      getPickableProviders: vi.fn(() => []),
      getProjectPickerItems: vi.fn(() => []),
      getLiveSessions: vi.fn(),
      onPanelOpen: vi.fn(),
      openStatuslinePicker: vi.fn(),
      openAuthPanel: vi.fn(() => true),
      openModePicker: vi.fn(),
      openBrainPanel: vi.fn(),
      openShadowPanel: vi.fn(),
      openHelpPanel: vi.fn(),
      getPluginItems: vi.fn(() => []),
      onPluginToggle: vi.fn(),
      getMcpServers: vi.fn(() => []),
      onMcpToggle: vi.fn(),
      onMcpRestart: vi.fn(),
      getToolsItems: vi.fn(() => []),
      onToolToggle: vi.fn(),
      setLiveToolCount: vi.fn(),
    } as never),
  );
}

/** A persisted config with the sidebar in the given state and nothing routed. */
function config(sidebar: boolean): Record<string, unknown> {
  return {
    showSidebar: sidebar,
    // Nothing routed to the sidebar: the pin rule must not force `true`.
    panelPositions: {},
    showAgentSwarmPanel: 'bottom',
    mode: 'off',
    delayMs: 0,
    thinkingWord: 'thinking',
  };
}

/** Drive the REAL openSettings, then reduce its REAL action. */
function openAndRead(configValue: Record<string, unknown>): {
  showSidebar: boolean;
  action: SettingsOpenAction;
} {
  const dispatched: Action[] = [];
  const state = makeState();
  const { result } = harness(
    (action) => {
      dispatched.push(action);
    },
    () => configValue,
  );
  result.current.openSettings();

  const action = dispatched.find((a) => a.type === 'settingsOpen') as
    | SettingsOpenAction
    | undefined;
  if (!action) throw new Error('openSettings did not dispatch a settingsOpen action');

  return { showSidebar: reducer(state, action).settingsPicker.showSidebar, action };
}

describe('settingsOpen hydration: right sidebar master switch (slash-command path)', () => {
  it('preserves a persisted showSidebar: false when the picker opens', () => {
    const result = openAndRead(config(false));
    // Precondition: no panel routed, so hiding the sidebar is legal here.
    expect(result.action.panelPositions).toBeTruthy();
    expect(result.showSidebar).toBe(false);
  });

  it('preserves a persisted showSidebar: true', () => {
    expect(openAndRead(config(true)).showSidebar).toBe(true);
  });

  it('defaults a legacy config without showSidebar to a visible sidebar', () => {
    expect(openAndRead({ panelPositions: {}, showAgentSwarmPanel: 'bottom' }).showSidebar).toBe(
      true,
    );
  });
});
