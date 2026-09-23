import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DisplaySection } from '../../src/components/SettingsPanel/DisplaySection';
import { useLocalPrefs } from '../../src/stores/local-prefs';

vi.mock('@/i18n', () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

describe('Display thinking word', () => {
  beforeEach(() => {
    useLocalPrefs.getState().set({ thinkingWord: 'thinking' });
  });

  it('keeps a draft until commit and rejects a value the TUI would discard', () => {
    const syncPref = vi.fn();
    render(<DisplaySection syncPref={syncPref} />);
    const input = screen.getByLabelText('settings:display.thinkingWordLabel') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello!' } });
    expect(syncPref).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('settings:display.thinkingWordInvalid');
    expect(syncPref).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'Merhaba_1' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(syncPref).toHaveBeenCalledWith('thinkingWord', 'Merhaba_1');
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });
});
