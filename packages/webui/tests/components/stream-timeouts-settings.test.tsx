import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StreamTimeoutsSection } from '../../src/components/SettingsPanel/StreamTimeoutsSection';
import { useLocalPrefs } from '../../src/stores/local-prefs';

const original = useLocalPrefs.getState().streamTimeouts;
afterEach(() => {
  cleanup();
  useLocalPrefs.getState().set({ streamTimeouts: original });
});

function input(testId: string): HTMLInputElement {
  return screen.getByTestId(testId) as HTMLInputElement;
}

describe('StreamTimeoutsSection', () => {
  it('shows both fields empty (= built-in default) and names the defaults', () => {
    useLocalPrefs.getState().set({ streamTimeouts: {} });
    render(<StreamTimeoutsSection syncPref={vi.fn()} />);
    expect(input('stream-timeout-hangTimeoutMs').value).toBe('');
    expect(input('stream-timeout-headersTimeoutMs').value).toBe('');
    expect(screen.getByText(/Empty = 60 s \(240 s for MiniMax and Z\.AI\)/)).toBeTruthy();
    expect(screen.getByText(/Empty = 60 s \(180 s for MiniMax and Z\.AI\)/)).toBeTruthy();
  });

  it('shows stored milliseconds as seconds and 0 as off, with the off warning', () => {
    useLocalPrefs
      .getState()
      .set({ streamTimeouts: { hangTimeoutMs: 300_000, headersTimeoutMs: 0 } });
    render(<StreamTimeoutsSection syncPref={vi.fn()} />);
    expect(input('stream-timeout-hangTimeoutMs').value).toBe('300');
    expect(input('stream-timeout-headersTimeoutMs').value).toBe('off');
    expect(screen.getByTestId('stream-timeout-headersTimeoutMs-off').textContent).toMatch(
      /never detected/,
    );
    expect(screen.queryByTestId('stream-timeout-hangTimeoutMs-off')).toBeNull();
  });

  it('commits seconds as milliseconds on blur, sending the whole pair', () => {
    useLocalPrefs.getState().set({ streamTimeouts: { headersTimeoutMs: 30_000 } });
    const syncPref = vi.fn();
    render(<StreamTimeoutsSection syncPref={syncPref} />);
    const field = input('stream-timeout-hangTimeoutMs');
    fireEvent.change(field, { target: { value: '300' } });
    expect(syncPref).not.toHaveBeenCalled();
    fireEvent.blur(field);
    expect(syncPref).toHaveBeenCalledWith('streamTimeouts', {
      headersTimeoutMs: 30_000,
      hangTimeoutMs: 300_000,
    });
  });

  it('accepts off / 0 as disabled, like /settings stream-watchdog', () => {
    useLocalPrefs.getState().set({ streamTimeouts: {} });
    const syncPref = vi.fn();
    render(<StreamTimeoutsSection syncPref={syncPref} />);
    const field = input('stream-timeout-hangTimeoutMs');
    fireEvent.change(field, { target: { value: 'off' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(syncPref).toHaveBeenCalledWith('streamTimeouts', { hangTimeoutMs: 0 });
  });

  it('clears a field back to the default when emptied', () => {
    useLocalPrefs.getState().set({
      streamTimeouts: { hangTimeoutMs: 300_000, headersTimeoutMs: 30_000 },
    });
    const syncPref = vi.fn();
    render(<StreamTimeoutsSection syncPref={syncPref} />);
    const field = input('stream-timeout-hangTimeoutMs');
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.blur(field);
    expect(syncPref).toHaveBeenCalledWith('streamTimeouts', { headersTimeoutMs: 30_000 });
  });

  it.each(['0.5', '3601', 'abc', '-5'])('refuses %s and does not send it', (raw) => {
    useLocalPrefs.getState().set({ streamTimeouts: {} });
    const syncPref = vi.fn();
    render(<StreamTimeoutsSection syncPref={syncPref} />);
    const field = input('stream-timeout-headersTimeoutMs');
    fireEvent.change(field, { target: { value: raw } });
    fireEvent.blur(field);
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(/Must be 1–3600 seconds/)).toBeTruthy();
    expect(syncPref).not.toHaveBeenCalled();
  });
});
