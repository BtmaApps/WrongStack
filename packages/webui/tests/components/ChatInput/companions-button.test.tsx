import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const updatePrefs = vi.fn();

vi.mock('@/hooks/useWebSocket', () => ({ useWebSocket: () => ({ updatePrefs }) }));

const prefsState = {
  memoryCompanionEnabled: true,
  exploreCompanionEnabled: true,
  skillCompanionEnabled: true,
  set: vi.fn((patch: Record<string, boolean>) => {
    Object.assign(prefsState, patch);
  }),
};

vi.mock('@/stores/local-prefs', () => ({
  useLocalPrefs: Object.assign((selector: (state: unknown) => unknown) => selector(prefsState), {
    getState: () => prefsState,
    subscribe: () => () => {},
  }),
}));

import { CompanionsButton } from '../../../src/components/ChatInput/companions-button';

beforeEach(() => {
  updatePrefs.mockClear();
  prefsState.set.mockClear();
  prefsState.memoryCompanionEnabled = true;
  prefsState.exploreCompanionEnabled = true;
  prefsState.skillCompanionEnabled = true;
});

afterEach(cleanup);

describe('CompanionsButton', () => {
  it('shows all enabled summary by default', () => {
    render(<CompanionsButton />);
    expect(screen.getByTestId('composer-companions-button').textContent).toContain('3/3');
  });

  it('shows partial count when one companion is disabled', () => {
    prefsState.exploreCompanionEnabled = false;
    render(<CompanionsButton />);
    expect(screen.getByTestId('composer-companions-button').textContent).toContain('2/3');
  });

  it('opens the popover with individual switches for Memory, Explore, and Skill companions', () => {
    render(<CompanionsButton />);
    fireEvent.click(screen.getByTestId('composer-companions-button'));

    const memorySwitch = screen.getByTestId('composer-companion-switch-memoryCompanionEnabled');
    const exploreSwitch = screen.getByTestId('composer-companion-switch-exploreCompanionEnabled');
    const skillSwitch = screen.getByTestId('composer-companion-switch-skillCompanionEnabled');

    expect(memorySwitch.getAttribute('aria-checked')).toBe('true');
    expect(exploreSwitch.getAttribute('aria-checked')).toBe('true');
    expect(skillSwitch.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(exploreSwitch);
    expect(prefsState.set).toHaveBeenCalledWith({ exploreCompanionEnabled: false });
    expect(updatePrefs).toHaveBeenCalledWith({ exploreCompanionEnabled: false });
  });

  it('toggles all companions off and back on with the master button', () => {
    const { rerender } = render(<CompanionsButton />);
    fireEvent.click(screen.getByTestId('composer-companions-button'));

    fireEvent.click(screen.getByTestId('composer-companions-toggle-all'));
    expect(updatePrefs).toHaveBeenCalledWith({
      memoryCompanionEnabled: false,
      exploreCompanionEnabled: false,
      skillCompanionEnabled: false,
    });

    rerender(<CompanionsButton />);
    fireEvent.click(screen.getByTestId('composer-companions-toggle-all'));
    expect(updatePrefs).toHaveBeenLastCalledWith({
      memoryCompanionEnabled: true,
      exploreCompanionEnabled: true,
      skillCompanionEnabled: true,
    });
  });
});
