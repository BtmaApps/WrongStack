import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
const listeners = new Map<string, (message: { payload: unknown }) => void>();
const client = {
  send,
  on: (type: string, listener: (message: { payload: unknown }) => void) => {
    listeners.set(type, listener);
    return () => listeners.delete(type);
  },
};
vi.mock('@/lib/ws-client', () => ({ getWSClient: () => client }));

import { UserInstructionsSection } from '../../src/components/SettingsPanel/UserInstructionsSection';

beforeEach(() => {
  send.mockClear();
  listeners.clear();
});
afterEach(() => cleanup());

function reply(payload: unknown): void {
  act(() => listeners.get('user_instructions')?.({ payload }));
}

describe('UserInstructionsSection', () => {
  it('loads the file and saves an edit at the loaded revision', () => {
    render(<UserInstructionsSection />);
    expect(send).toHaveBeenCalledWith({ type: 'user_instructions.get' });
    reply({
      path: '/home/u/.wrongstack/AGENTS.md',
      displayPath: '~/.wrongstack/AGENTS.md',
      text: '# Rules',
      exists: true,
      mtimeMs: 123,
    });
    const box = screen.getByTestId('user-instructions-text') as HTMLTextAreaElement;
    expect(box.value).toBe('# Rules');
    expect(screen.getByText('~/.wrongstack/AGENTS.md')).toBeTruthy();

    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(box, { target: { value: '# Rules\n- Be brief.' } });
    fireEvent.click(save);
    expect(send).toHaveBeenCalledWith({
      type: 'user_instructions.save',
      payload: { text: '# Rules\n- Be brief.', baseMtimeMs: 123 },
    });

    reply({ text: '# Rules\n- Be brief.', exists: true, mtimeMs: 456, saved: true });
    expect(screen.getByRole('status').textContent).toBe('Saved.');
  });

  it('keeps the draft and shows the error when a save is refused', () => {
    render(<UserInstructionsSection />);
    reply({ displayPath: '~/.wrongstack/AGENTS.md', text: '', exists: false, mtimeMs: null });
    const box = screen.getByTestId('user-instructions-text') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(send).toHaveBeenLastCalledWith({
      type: 'user_instructions.save',
      payload: { text: 'draft', baseMtimeMs: null },
    });
    reply({ error: 'changed since it was loaded' });
    expect(screen.getByRole('alert').textContent).toContain('changed since it was loaded');
    expect(box.value).toBe('draft');
  });
});
