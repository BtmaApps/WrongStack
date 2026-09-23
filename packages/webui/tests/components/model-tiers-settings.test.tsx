import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelTiersSection } from '../../src/components/SettingsPanel/ModelTiersSection';
import { useLocalPrefs } from '../../src/stores/local-prefs';

const original = useLocalPrefs.getState().modelTiers;
afterEach(() => {
  // Unmount before restoring the pref: restoring while the section is still
  // mounted re-renders it outside act, and without cleanup mounts would leak
  // across tests.
  cleanup();
  useLocalPrefs.getState().set({ modelTiers: original });
});

describe('ModelTiersSection', () => {
  it('removes references when deleting the default and leader ceiling level', () => {
    useLocalPrefs.getState().set({
      modelTiers: {
        enabled: true,
        default: 'budget',
        levels: { budget: {}, premium: {} },
        routing: { review: 'budget', build: 'premium' },
        leader: { maxTier: 'budget' },
      },
    });
    const syncPref = vi.fn();
    render(<ModelTiersSection syncPref={syncPref} />);
    fireEvent.click(screen.getByTestId('model-tier-remove-budget'));
    expect(syncPref).toHaveBeenCalledWith(
      'modelTiers',
      expect.objectContaining({
        default: undefined,
        levels: { premium: {} },
        routing: { build: 'premium' },
        leader: { maxTier: undefined },
      }),
    );
  });

  it('prevents duplicate level names and rejects zero iteration ceilings', () => {
    useLocalPrefs.getState().set({ modelTiers: { levels: { budget: {} } } });
    const syncPref = vi.fn();
    render(<ModelTiersSection syncPref={syncPref} />);
    fireEvent.change(screen.getByTestId('model-tier-new-name'), { target: { value: 'budget' } });
    expect(screen.getByRole('button', { name: 'Add' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('iters'), { target: { value: '0' } });
    expect(syncPref).toHaveBeenCalledWith(
      'modelTiers',
      expect.objectContaining({ levels: { budget: { maxIterations: undefined } } }),
    );
  });
});
