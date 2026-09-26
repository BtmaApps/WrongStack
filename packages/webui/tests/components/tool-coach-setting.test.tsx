import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContextSettingsTab } from '../../src/components/SettingsPanel/ContextSettingsTab.js';
import { useLocalPrefs } from '../../src/stores/local-prefs.js';

afterEach(() => cleanup());

describe('Tool Coach WebUI setting', () => {
  it('is visible, on by default, and sends the off preference through syncPref', () => {
    useLocalPrefs.setState({ featureToolCoach: true });
    const syncPref = vi.fn();
    render(<ContextSettingsTab syncPref={syncPref} />);

    const toggle = screen.getByRole('switch', { name: /tool coach/i });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(syncPref).toHaveBeenCalledWith('featureToolCoach', false);
  });
});
