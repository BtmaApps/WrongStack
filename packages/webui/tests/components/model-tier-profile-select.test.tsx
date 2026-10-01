import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelTiersSection } from '../../src/components/SettingsPanel/ModelTiersSection';
import { useLocalPrefs } from '../../src/stores/local-prefs';

/**
 * A `<select value={X}>` whose `<option>` list omits X does not render blank:
 * the DOM reports the FIRST option as the value. A select bound to a value
 * outside its offered list therefore silently displays — and on re-pick,
 * silently writes — a different value than the one stored.
 *
 * The tier profile picker is bound to `level.fallbackProfile` but offers only
 * `Object.keys(prefs.fallbackProfiles)`. `fallbackProfiles` is user-editable, so
 * a tier can reference a profile that no longer exists (deleted, renamed, or
 * narrowed from another surface). The picker then shows "profile: (none)",
 * falsely claiming no profile is pinned — and touching it writes `undefined`,
 * dropping the reference for good.
 *
 * Contrast: the same file's other selects and BrainSection's council-persona
 * picker already handle this, so the omission is a local defect rather than a
 * pattern the codebase considers acceptable.
 */

const originalTiers = useLocalPrefs.getState().modelTiers;
const originalProfiles = useLocalPrefs.getState().fallbackProfiles;

afterEach(() => {
  // Unmount before restoring prefs: restoring while still mounted re-renders
  // outside act() (mirrors model-tiers-settings.test.tsx).
  cleanup();
  useLocalPrefs.getState().set({
    modelTiers: originalTiers,
    fallbackProfiles: originalProfiles,
  });
});

const profileSelect = (id: string) =>
  screen.getByTestId(`model-tier-profile-${id}`) as HTMLSelectElement;

describe('ModelTiersSection — profile picker offers its bound value', () => {
  it('keeps showing a profile that was deleted from fallbackProfiles', () => {
    useLocalPrefs.getState().set({
      modelTiers: {
        enabled: true,
        default: 'budget',
        levels: { budget: { fallbackProfile: 'deleted-profile' } },
        routing: {},
      },
      fallbackProfiles: { 'other-profile': ['openai/gpt-5'] },
    });
    render(<ModelTiersSection syncPref={vi.fn()} />);

    // Must not collapse to the first option ("profile: (none)").
    expect(profileSelect('budget').value).toBe('deleted-profile');
  });

  it('offers a bound profile alongside the profiles that do exist', () => {
    useLocalPrefs.getState().set({
      modelTiers: {
        enabled: true,
        default: 'budget',
        levels: { budget: { fallbackProfile: 'deleted-profile' } },
        routing: {},
      },
      fallbackProfiles: { 'other-profile': ['openai/gpt-5'] },
    });
    render(<ModelTiersSection syncPref={vi.fn()} />);

    const values = [...profileSelect('budget').options].map((option) => option.value);
    expect(values).toContain('deleted-profile');
    expect(values).toContain('other-profile');
  });

  it('still offers "none" for a tier with no profile pinned', () => {
    useLocalPrefs.getState().set({
      modelTiers: {
        enabled: true,
        default: 'budget',
        levels: { budget: {} },
        routing: {},
      },
      fallbackProfiles: { 'other-profile': ['openai/gpt-5'] },
    });
    render(<ModelTiersSection syncPref={vi.fn()} />);

    // The unchanged happy path: unpinned tier shows the empty "(none)" option.
    expect(profileSelect('budget').value).toBe('');
  });
});
