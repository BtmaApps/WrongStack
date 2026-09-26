import { SlashCommandRegistry } from '@wrongstack/core/registry';
import { render } from 'ink-testing-library';
import { expect, it, vi } from 'vitest';
import type { Action } from '../src/app-action-type.js';
import { reducer } from '../src/app-reducer.js';
import type { Settings } from '../src/app-state.js';
import type { TuiSlashCommandOptions } from '../src/hooks/tui-slash-command-options.js';
import { useSettingsSlashCommands } from '../src/hooks/use-settings-slash-commands.js';
import { createTestState } from './helpers/create-test-state.js';
import { settle } from './helpers/real-tty.js';

/**
 * `/settings jev …` hands the remainder of the line to the shared `/jev`
 * command rather than rendering a screen of its own — that shared command is
 * what owns the `logContent` switch, so the content-logging toggle is reachable
 * from the TUI without touching the profile file.
 */
async function harness() {
  const registry = new SlashCommandRegistry();
  const jevRun = vi.fn(async (args: string) => ({ message: `jev:${args}` }));
  registry.register({ name: 'jev', description: 'jev', run: jevRun });
  let state = createTestState();
  const dispatch = (action: Action) => {
    state = reducer(state, action);
  };
  function Harness() {
    useSettingsSlashCommands(
      {
        slashRegistry: registry,
        state,
        getSettings: () => state.settingsPicker as unknown as Settings,
        saveSettings: async () => null,
        dispatch,
        openSettings: () => {},
      } as unknown as TuiSlashCommandOptions,
      'core',
    );
    return null;
  }
  const view = render(<Harness />);
  await settle();
  return {
    view,
    jevRun,
    run: (args: string) => registry.get('settings')!.run(args, {} as never),
  };
}

it('routes the content-logging toggle from /settings jev to the jev command', async () => {
  const h = await harness();
  try {
    await expect(h.run('jev logcontent on')).resolves.toEqual({ message: 'jev:logcontent on' });
    await expect(h.run('jev logcontent off')).resolves.toEqual({ message: 'jev:logcontent off' });
    expect(h.jevRun).toHaveBeenCalledTimes(2);
  } finally {
    h.view.unmount();
  }
});

it('bare /settings jev still opens the shared jev screen', async () => {
  const h = await harness();
  try {
    await expect(h.run('jev')).resolves.toEqual({ message: 'jev:' });
    expect(h.jevRun).toHaveBeenCalledWith('');
  } finally {
    h.view.unmount();
  }
});

it('says so plainly when the host registered no jev command', async () => {
  const registry = new SlashCommandRegistry();
  let state = createTestState();
  const dispatch = (action: Action) => {
    state = reducer(state, action);
  };
  function Harness() {
    useSettingsSlashCommands(
      {
        slashRegistry: registry,
        state,
        getSettings: () => state.settingsPicker as unknown as Settings,
        saveSettings: async () => null,
        dispatch,
        openSettings: () => {},
      } as unknown as TuiSlashCommandOptions,
      'core',
    );
    return null;
  }
  const view = render(<Harness />);
  await settle();
  try {
    const result = await registry.get('settings')!.run('jev logcontent on', {} as never);
    expect(result?.message).toContain('Jev settings unavailable');
  } finally {
    view.unmount();
  }
});
