import { afterEach, expect, it, vi } from 'vitest';
import { App } from '../src/app.js';
import type { Settings } from '../src/app-state.js';
import { SETTINGS_DEFAULTS } from '../src/components/settings-picker-model.js';
import { createAppJourney } from './helpers/app-journey-harness.js';
import { type RealTtyView, renderRealTty } from './helpers/real-tty.js';

it('serializes rapid mode clicks without losing a toggle', async () => {
  let persisted: Settings = {
    ...SETTINGS_DEFAULTS,
    fleetChatVerbosity: 'off',
    featureTokenSaving: 'off',
    lastSettingsField: 67,
  };
  const save = vi.fn(async (settings: Settings) => {
    persisted = settings;
    return null;
  });
  const tty = renderRealTty(
    <App {...createAppJourney().props} getSettings={() => persisted} saveSettings={save} />,
    { columns: 80, rows: 30 },
  );
  view = tty;
  await vi.waitFor(() => expect(tty.lastFrame()).toContain('[Block]'), { timeout: 5000 });
  const row = tty.lines().findIndex((line) => line.includes('[Block]')) + 1;
  tty.stdin.write(`\x1b[<0;4;${row}M\x1b[<0;4;${row}m\x1b[<0;4;${row}M\x1b[<0;4;${row}m`);
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls.map(([settings]) => settings.selectionMode)).toEqual(['text', 'block']);
  expect(persisted.selectionMode).toBe('block');
});

it('reports a failed preference save instead of pretending it was persisted', async () => {
  const persisted: Settings = {
    ...SETTINGS_DEFAULTS,
    fleetChatVerbosity: 'off',
    featureTokenSaving: 'off',
    lastSettingsField: 67,
  };
  const save = vi.fn(async () => 'Disk unavailable');
  const tty = renderRealTty(
    <App {...createAppJourney().props} getSettings={() => persisted} saveSettings={save} />,
    { columns: 80, rows: 30 },
  );
  view = tty;
  await vi.waitFor(() => expect(tty.lastFrame()).toContain('[Block]'), { timeout: 5000 });
  const row = tty.lines().findIndex((line) => line.includes('[Block]')) + 1;
  tty.stdin.write(`\x1b[<0;4;${row}M\x1b[<0;4;${row}m`);
  await vi.waitFor(() => expect(tty.lastFrame()).toContain('Could not save selection mode'));
  expect(tty.lastFrame()).toContain('[Block]');
});

let view: RealTtyView | undefined;
afterEach(() => {
  view?.unmount();
  view = undefined;
});

it('persists clicks on the app mode indicator and hydrates the same value in Settings', async () => {
  let persisted: Settings = {
    ...SETTINGS_DEFAULTS,
    fleetChatVerbosity: 'off',
    featureTokenSaving: 'off',
    lastSettingsField: 67,
  };
  const save = vi.fn(async (settings: Settings) => {
    persisted = settings;
    return null;
  });
  const journey = createAppJourney();
  const tty = renderRealTty(
    <App {...journey.props} getSettings={() => persisted} saveSettings={save} />,
    { columns: 80, rows: 30 },
  );
  view = tty;
  await vi.waitFor(() => expect(tty.lastFrame()).toContain('[Block]'), { timeout: 5000 });
  const row = tty.lines().findIndex((line) => line.includes('[Block]')) + 1;
  tty.stdin.write(`\x1b[<0;4;${row}M`);
  tty.stdin.write(`\x1b[<0;4;${row}m`);
  await vi.waitFor(() =>
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ selectionMode: 'text' })),
  );
  await vi.waitFor(() => expect(tty.lastFrame()).toContain('[Text]'));
  tty.stdin.write('/settings');
  await vi.waitFor(() => expect(tty.lastFrame()).toContain('/settings'));
  tty.stdin.write('\r');
  await vi.waitFor(() => expect(tty.lastFrame()).toContain('Chat selection'), { timeout: 5000 });
  tty.stdin.write('\x1b[C');
  await vi.waitFor(() =>
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ selectionMode: 'block' })),
  );
});
