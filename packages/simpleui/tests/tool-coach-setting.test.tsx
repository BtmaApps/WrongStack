// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS } from '../src/lib/prefs-model.js';
import { SettingsPanel } from '../src/settings-panel.js';

describe('SimpleUI Tool Coach setting', () => {
  it('shows the default-on switch and sends an off preference', () => {
    const onPrefChange = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <SettingsPanel
          open
          prefs={DEFAULT_PREFS}
          modes={[]}
          activeModeId=""
          palette="signal"
          connection="open"
          onClose={vi.fn()}
          onAutonomyChange={vi.fn()}
          onModeChange={vi.fn()}
          onPaletteChange={vi.fn()}
          onPrefChange={onPrefChange}
          onReset={vi.fn()}
          isAtDefaults
          subagentPolicyLocked={false}
        />,
      ),
    );

    const toggle = container.querySelector<HTMLInputElement>(
      '[data-setting-id="session.toolCoach"] input',
    );
    expect(toggle?.checked).toBe(true);
    act(() => toggle?.click());
    expect(onPrefChange).toHaveBeenCalledWith({ featureToolCoach: false });
    act(() => root.unmount());
    container.remove();
  });
});
