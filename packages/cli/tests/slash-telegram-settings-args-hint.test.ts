import { describe, expect, it } from 'vitest';
import type { SlashCommandContext } from '../src/slash-commands/index.js';
import { buildTelegramSettingsCommand } from '../src/slash-commands/telegram-settings.js';

/**
 * Regression: `/telegram-settings all` is implemented, documented in the help
 * text, and advertised in the unknown-setting Valid list — but `argsHint`
 * (the surface command pickers show) omitted it. Same drift class as the
 * valid-list omissions fixed in /memory, /kanban, and /todos: every advertised
 * setting must appear on every user-facing surface, argsHint included.
 */

function telegramCtx(): SlashCommandContext {
  return {
    config: {} as never,
    container: {} as never,
    configStore: { get: () => ({ extensions: {} }) },
    paths: { globalConfig: 'global-config.json', profileConfig: () => 'profile-config.json' },
    vault: {},
  } as never as SlashCommandContext;
}

/** The advertised list is parsed from the dispatcher's own unknown-setting message. */
async function advertisedSettings(cmd: ReturnType<typeof buildTelegramSettingsCommand>) {
  const res = await cmd.run('frobnicate');
  const message = res?.message ?? '';
  expect(message).toContain('Unknown setting');
  const match = /Valid: ([^.]+)\./.exec(message);
  expect(match, 'unknown-setting message must carry a "Valid: …" list').toBeTruthy();
  return (match?.[1] ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

describe('buildTelegramSettingsCommand surface agreement', () => {
  it('argsHint surfaces every advertised (Valid-listed) setting', async () => {
    const cmd = buildTelegramSettingsCommand(telegramCtx());
    const advertised = await advertisedSettings(cmd);
    const argsHint = cmd.argsHint ?? '';
    for (const name of advertised) {
      expect(argsHint, `argsHint must surface advertised setting "${name}"`).toContain(name);
    }
  });
});
