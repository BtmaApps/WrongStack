import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { JevSection } from '../../src/components/SettingsPanel/JevSection';

const { client, handlers } = vi.hoisted(() => {
  const handlers = new Map<string, (msg: unknown) => void>();
  return {
    handlers,
    client: {
      send: vi.fn(),
      on: vi.fn((type: string, fn: (msg: unknown) => void) => {
        handlers.set(type, fn);
        return () => handlers.delete(type);
      }),
    },
  };
});
vi.mock('@/hooks/useWebSocket', () => ({ useWebSocket: () => ({ client }) }));
vi.mock('@/i18n', () => ({ useAppTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('keeps unsaved edits during polling, uses correlated saves and clears submitted secrets', () => {
  render(<JevSection />);
  const requestId = client.send.mock.calls[0]?.[0].payload.requestId;
  const settings = {
    status: 'ready',
    route: 'typesafe',
    keySource: 'config',
    endpoint: 'https://api.typesafe.ai/v1/systemone',
    model: 'jev-latest',
    requestTimeoutMs: 4000,
    features: { brain: true },
  };
  act(() =>
    handlers.get('jev.state')?.({ payload: { requestId, settings, activity: { entries: [] } } }),
  );
  fireEvent.change(screen.getByLabelText('settings:jev.model'), {
    target: { value: 'pinned-model' },
  });
  act(() =>
    handlers.get('jev.state')?.({ payload: { requestId, settings, activity: { entries: [] } } }),
  );
  expect((screen.getByLabelText('settings:jev.model') as HTMLInputElement).value).toBe(
    'pinned-model',
  );
  fireEvent.change(screen.getByLabelText('settings:jev.key'), { target: { value: 'secret' } });
  fireEvent.click(screen.getByText('settings:jev.save'));
  const sent = client.send.mock.calls.at(-1)?.[0];
  expect(sent.type).toBe('jev.set');
  expect(sent.payload.patch).toMatchObject({ apiKey: 'secret', model: 'pinned-model' });
  act(() =>
    handlers.get('jev.state')?.({
      payload: {
        requestId: sent.payload.requestId,
        settings: { ...settings, model: 'pinned-model' },
        message: 'Saved',
      },
    }),
  );
  expect((screen.getByLabelText('settings:jev.key') as HTMLInputElement).value).toBe('');
  act(() => handlers.get('jev.state')?.({ payload: { requestId, settings } }));
  expect(screen.getByText('Saved')).toBeTruthy();
});
