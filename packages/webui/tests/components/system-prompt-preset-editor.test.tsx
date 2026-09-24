import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
const listeners = new Map<string, (message: { payload: unknown }) => void>();
vi.mock('@/lib/ws-client', () => ({
  getWSClient: () => ({
    send,
    on: (type: string, listener: (message: { payload: unknown }) => void) => {
      listeners.set(type, listener);
      return () => listeners.delete(type);
    },
  }),
}));

import { SystemPromptPresetEditor } from '../../src/components/SystemPromptPresetEditor';

beforeEach(() => {
  send.mockClear();
  listeners.clear();
});
afterEach(() => cleanup());

describe('SystemPromptPresetEditor', () => {
  it('copies the selected base and saves a validated edit at its revision', () => {
    render(<SystemPromptPresetEditor currentVariant="pro" />);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'system_prompt.presets.get' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy Pro' }));
    expect(send).toHaveBeenCalledWith({
      type: 'system_prompt.presets.create',
      payload: { name: 'Pro custom', baseVariant: 'pro' },
    });
    act(() =>
      listeners.get('system_prompt.presets')?.({
        payload: {
          selectedId: 'id',
          active: {},
          presets: [
            {
              id: 'id',
              name: 'Pro custom',
              baseVariant: 'pro',
              baseHash: 'hash',
              baseText: '# Base',
              currentBaseText: '# Base',
              text: '# Base',
              revision: 1,
              sourceChanged: false,
            },
          ],
        },
      }),
    );
    fireEvent.change(screen.getByLabelText('Prompt template'), { target: { value: '# Edited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    expect(send).toHaveBeenCalledWith({
      type: 'system_prompt.presets.save',
      payload: {
        id: 'id',
        revision: 1,
        name: 'Pro custom',
        text: '# Edited',
        reviewedCurrentSource: false,
      },
    });
    act(() =>
      listeners.get('system_prompt.presets')?.({
        payload: {
          selectedId: 'id',
          active: {},
          projectActive: {},
          presets: [
            {
              id: 'id',
              name: 'Pro custom',
              baseVariant: 'pro',
              baseHash: 'hash',
              baseText: '# Base',
              currentBaseText: '# Base',
              text: '# Edited',
              revision: 2,
              sourceChanged: false,
            },
          ],
        },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use in this project' }));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'system_prompt.presets.activate',
        payload: expect.objectContaining({ id: 'id', scope: 'project', baseVariant: 'pro' }),
      }),
    );
  });
});
