// @vitest-environment jsdom

/**
 * Preset `<select>` controls must offer the value they are bound to.
 *
 * A `<select value={X}>` whose `<option>` list omits X does not render blank:
 * the DOM reports the FIRST option as the value. So a preset-only select
 * bound to a preference another surface can set to a non-preset silently
 * displays — and on re-pick, silently writes — a different value than the one
 * stored. For `refine.preRefineSeconds` that misreport is the worst possible
 * one: 0 renders as "Off — send immediately", so a 8-second countdown written
 * by the TUI's own presets displays as disabled.
 *
 * Reachable non-preset values are real, not hypothetical:
 *  - TUI  `PRE_REFINE_SECONDS_PRESETS = [0, 2, 3, 5, 8, 10]`
 *    (packages/tui/src/components/settings-picker-constants.ts) — 2 and 8 are
 *    absent from SimpleUI's [0, 3, 5, 10];
 *  - WebUI renders a `step={1}` slider over 0..10
 *    (packages/webui/src/components/SettingsPanel/DisplaySection.tsx), so any
 *    integer in range can be persisted;
 *  - the server accepts any finite number >= 0
 *    (NUMBER_PREF_BOUNDS.preRefineSeconds), so nothing clamps it back.
 */

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS, type SimplePrefs } from '../src/lib/prefs-model.js';
import { SettingsPanel } from '../src/settings-panel.js';

let container: HTMLDivElement;
let root: Root;

/** Render the panel and return the select bound to one setting row. */
function select(
  settingId: string,
  prefs: SimplePrefs,
  overrides: Partial<ComponentProps<typeof SettingsPanel>> = {},
): HTMLSelectElement | null {
  act(() =>
    root.render(
      <SettingsPanel
        open
        prefs={prefs}
        modes={[]}
        activeModeId=""
        palette="signal"
        connection="open"
        onClose={vi.fn()}
        onAutonomyChange={vi.fn()}
        onModeChange={vi.fn()}
        onPaletteChange={vi.fn()}
        onPrefChange={vi.fn()}
        onReset={vi.fn()}
        isAtDefaults={false}
        subagentPolicyLocked={false}
        {...overrides}
      />,
    ),
  );
  return container.querySelector<HTMLSelectElement>(`[data-setting-id="${settingId}"] select`);
}

/** The visible option labels, so "shows the wrong number" is provable. */
function optionLabels(sel: HTMLSelectElement | null): string[] {
  return [...(sel?.options ?? [])].map((option) => option.textContent ?? '');
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('preset selects offer the value they are bound to', () => {
  // 2 and 8 are in the TUI's PRE_REFINE_SECONDS_PRESETS but were missing from
  // SimpleUI's option list, so both displayed as 0 ("Off — send immediately").
  it.each([2, 8])('shows a pre-refine countdown of %i seconds', (seconds) => {
    const sel = select('refine.preRefineSeconds', { ...DEFAULT_PREFS, preRefineSeconds: seconds });
    expect(sel?.value).toBe(String(seconds));
    expect(optionLabels(sel)).toContain(`${seconds} seconds`);
  });

  it('shows any in-range value the WebUI slider can produce', () => {
    const sel = select('refine.preRefineSeconds', { ...DEFAULT_PREFS, preRefineSeconds: 7 });
    expect(sel?.value).toBe('7');
  });

  it('still renders the stored value as "Off" when it really is 0', () => {
    // Guards the fix from over-correcting: 0 is a legitimate value and must
    // keep its distinct label rather than be folded into the generic format.
    const sel = select('refine.preRefineSeconds', { ...DEFAULT_PREFS, preRefineSeconds: 0 });
    expect(sel?.value).toBe('0');
    expect(optionLabels(sel)[0]).toBe('Off — send immediately');
  });

  it('shows a stored poll interval that is not one of the presets', () => {
    // Same rule for the Telegram select, whose presets are [1, 2, 5, 10, 30, 60].
    const sel = select('telegram.pollInterval', { ...DEFAULT_PREFS, tgPollIntervalSec: 15 });
    expect(sel?.value).toBe('15');
  });

  // ── Catalog-driven selects ────────────────────────────────────────────
  // These bind to values that come from a *catalog* (provider/model options,
  // agent modes) rather than a fixed preset list. `modelOptions` is an
  // optional prop and `modes` comes from the agent-mode catalog, so a value
  // pinned on another surface (or before the catalog loads) can be absent from
  // the offered list. Without a passthrough the select reports its first
  // option — which for the refiner means falsely reporting "Session model".
  it('offers a pinned refiner model that the catalog does not contain', () => {
    const sel = select(
      'refine.refinerModel',
      { ...DEFAULT_PREFS, refinerProvider: 'anthropic', refinerModel: 'legacy-model' },
      { modelOptions: [{ provider: 'openai', model: 'gpt-5' }] },
    );
    expect(sel?.value).toBe('anthropic/legacy-model');
  });

  it('offers a pinned refiner model before the catalog loads', () => {
    const sel = select('refine.refinerModel', {
      ...DEFAULT_PREFS,
      refinerProvider: 'anthropic',
      refinerModel: 'legacy-model',
    });
    expect(sel?.value).toBe('anthropic/legacy-model');
  });

  it('offers an active agent mode the catalog no longer lists', () => {
    const sel = select('mode.agentMode', DEFAULT_PREFS, {
      activeModeId: 'retired-mode',
      modes: [
        { id: 'build', name: 'Build' },
        { id: 'review', name: 'Review' },
      ],
    });
    expect(sel?.value).toBe('retired-mode');
  });

  it('offers a lane pinned to a model the catalog does not contain', () => {
    const prefs: SimplePrefs = {
      ...DEFAULT_PREFS,
      subagentModelPlan: {
        ...DEFAULT_PREFS.subagentModelPlan,
        slots: [{ provider: 'anthropic', model: 'legacy-model' }],
      },
    };
    act(() =>
      root.render(
        <SettingsPanel
          open
          prefs={prefs}
          modes={[]}
          activeModeId=""
          palette="signal"
          connection="open"
          onClose={vi.fn()}
          onAutonomyChange={vi.fn()}
          onModeChange={vi.fn()}
          onPaletteChange={vi.fn()}
          onPrefChange={vi.fn()}
          onReset={vi.fn()}
          isAtDefaults={false}
          subagentPolicyLocked={false}
          modelOptions={[{ provider: 'openai', model: 'gpt-5' }]}
        />,
      ),
    );
    const lane = container.querySelector<HTMLSelectElement>('[aria-label="Lane 1 model"]');
    expect(lane?.value).toBe('anthropic/legacy-model');
  });
});
