import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExecutionSettingsTab } from '../../src/components/SettingsPanel/ExecutionSettingsTab';
import { syncSettingsPreference } from '../../src/components/SettingsPanel/sync-settings-preference';
import { useLocalPrefs } from '../../src/stores/local-prefs';

vi.mock('../../src/components/AvailabilityCalendarEditor', () => ({
  AvailabilityCalendarEditor: () => null,
}));

afterEach(cleanup);
beforeEach(() => useLocalPrefs.setState({ maxIterations: 100, autoProceedMaxIterations: 25 }));

it.each(['maxIterations', 'autoProceedMaxIterations'] as const)(
  '%s supports unlimited, exact positive limits and persisted zero',
  (key) => {
    const updatePrefs = vi.fn();
    const view = render(
      <ExecutionSettingsTab
        fallbackCandidates={[]}
        syncPref={(name, value) =>
          syncSettingsPreference(useLocalPrefs.getState(), updatePrefs, vi.fn(), name, value)
        }
      />,
    );
    const index = key === 'maxIterations' ? 0 : 1;
    const input = screen.getAllByRole('spinbutton')[index] as HTMLInputElement;
    const row = input.parentElement!;
    fireEvent.click(within(row).getByRole('button', { name: 'Unlimited' }));
    expect(useLocalPrefs.getState()[key]).toBe(0);
    expect(updatePrefs).toHaveBeenLastCalledWith({ [key]: 0 });
    expect(input.value).toBe('0');
    expect(within(row).getByRole('button').getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(input, { target: { value: '7' } });
    expect(updatePrefs).toHaveBeenLastCalledWith({ [key]: 7 });
    updatePrefs.mockClear();
    for (const invalid of ['-1', '1.5', '']) {
      fireEvent.change(input, { target: { value: invalid } });
    }
    expect(updatePrefs).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '5000' } });
    expect(updatePrefs).toHaveBeenLastCalledWith({ [key]: 5000 });
    fireEvent.change(input, { target: { value: '0' } });
    expect(updatePrefs).toHaveBeenLastCalledWith({ [key]: 0 });
    view.unmount();
    render(<ExecutionSettingsTab fallbackCandidates={[]} syncPref={vi.fn()} />);
    expect((screen.getAllByRole('spinbutton')[index] as HTMLInputElement).value).toBe('0');
  },
);
