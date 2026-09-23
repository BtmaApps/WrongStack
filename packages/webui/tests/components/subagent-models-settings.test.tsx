import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SubagentModelsSection } from '../../src/components/SettingsPanel/SubagentModelsSection';
import { useLocalPrefs } from '../../src/stores/local-prefs';

const original = useLocalPrefs.getState().subagentModelPlan;
afterEach(() => {
  // Unmount before restoring the pref: restoring while the section is still
  // mounted re-renders it outside act, and without cleanup mounts would leak
  // across tests.
  cleanup();
  useLocalPrefs.getState().set({ subagentModelPlan: original });
});

it('keeps pinned lanes when reducing the count', () => {
  useLocalPrefs.getState().set({
    subagentModelPlan: {
      enabled: true,
      lock: true,
      slots: [{}, {}, { provider: 'openai', model: 'example' }, {}],
    },
  });
  const syncPref = vi.fn();
  render(<SubagentModelsSection syncPref={syncPref} />);
  const count = screen.getByRole('spinbutton', { name: 'Lanes' });
  expect(count.getAttribute('min')).toBe('3');
  fireEvent.change(count, { target: { value: '1' } });
  expect(syncPref).toHaveBeenCalledWith(
    'subagentModelPlan',
    expect.objectContaining({
      slots: [{}, {}, { provider: 'openai', model: 'example' }],
    }),
  );
});
