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

it('distinguishes blocked features from diagnostic evidence and sends explicit checks', () => {
  render(<JevSection />);
  const requestId = client.send.mock.calls[0]?.[0].payload.requestId;
  const settings = {
    status: 'ready',
    route: 'typesafe',
    keySource: 'config',
    endpoint: '',
    model: 'jev',
    requestTimeoutMs: 4000,
    features: { compaction: true },
    contextStrategy: 'hybrid',
    readiness: { compaction: { state: 'blocked', reason: 'selective-required' } },
  };
  const activity = {
    entries: [
      {
        id: 'diagnostic',
        at: 1,
        feature: 'compaction',
        purpose: 'self-test',
        outcome: 'answered',
        durationMs: 10,
      },
    ],
  };
  act(() => handlers.get('jev.state')?.({ payload: { requestId, settings, activity } }));
  expect(screen.getByTestId('jev-feature-compaction').textContent).toContain(
    'settings:jev.readiness.blocked',
  );
  expect(screen.getByTestId('jev-feature-compaction').textContent).toContain(
    'settings:jev.notObserved',
  );
  expect(screen.queryByText('diagnostic')).toBeNull();
  fireEvent.change(screen.getByLabelText('settings:jev.contextStrategy'), {
    target: { value: 'selective' },
  });
  fireEvent.click(screen.getByLabelText('settings:jev.recallTurnContext'));
  fireEvent.click(screen.getByText('settings:jev.checkAll'));
  const sent = client.send.mock.calls.at(-1)?.[0];
  expect(sent.type).toBe('jev.check');
  act(() =>
    handlers.get('jev.state')?.({
      payload: {
        requestId: sent.payload.requestId,
        settings,
        activity,
        checks: {
          running: false,
          report: {
            at: 1,
            model: 'jev',
            passed: 1,
            total: 1,
            cases: [
              {
                feature: 'compaction',
                name: 'case',
                actual: 'ok',
                expected: 'ok',
                ok: true,
                ms: 10,
              },
            ],
          },
        },
      },
    }),
  );
  expect(screen.getByTestId('jev-check-report').textContent).toContain('1/1');
  expect((screen.getByLabelText('settings:jev.contextStrategy') as HTMLSelectElement).value).toBe(
    'selective',
  );
  fireEvent.click(screen.getByText('settings:jev.save'));
  expect(client.send.mock.calls.at(-1)?.[0].payload.patch.contextStrategy).toBe('selective');
  expect(client.send.mock.calls.at(-1)?.[0].payload.patch.recallTurnContext).toBe(true);
});
