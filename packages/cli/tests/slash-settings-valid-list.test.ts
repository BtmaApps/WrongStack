import { describe, expect, it } from 'vitest';
import type { SlashCommandContext } from '../src/slash-commands/index.js';
import { executeSettingsSubcommand } from '../src/slash-commands/settings-mutations.js';
import { SETTINGS_HELP } from '../src/slash-commands/settings-view.js';

/**
 * Regression: ALL_SETTINGS_KEYS (the advertised "Valid:" list for unknown
 * /settings subcommands) omitted nine implemented, help-documented settings —
 * hq, hq-url, hq-token, hq-raw, nextsteps-tool, autothin, autothin-idle,
 * autothin-min, autothin-boot — so `/settings <typo>` advertised a Valid list
 * that denied settings the help text and the current-settings view both
 * document. Largest instance of the valid-list drift class previously fixed in
 * /memory (gather; compact-log+diagnostics), /todos (rm), and
 * /telegram-settings (argsHint `all`).
 *
 * Both surfaces are read from production source at test time: the documented
 * set from the `/settings <name>` lines in SETTINGS_HELP, the advertised set
 * from the dispatcher's own unknown-setting message. Adding a documented
 * setting without advertising it fails here.
 */

function settingsCtx(): SlashCommandContext {
  return {
    config: {} as never,
    container: {} as never,
    configStore: { get: () => ({ activeProfile: 'default' }) },
    paths: { profileConfig: () => 'profile-config.json', inProjectConfig: 'in-project.json' },
  } as never as SlashCommandContext;
}

function helpDocumentedSettings(): string[] {
  return [...new Set([...SETTINGS_HELP.matchAll(/\/settings ([a-z0-9-]+)/g)].map((m) => m[1] ?? ''))];
}

describe('buildSettingsCommand valid-list drift', () => {
  it('unknown-setting help advertises every help-documented setting', async () => {
    const documented = helpDocumentedSettings();
    expect(documented.length).toBeGreaterThan(40);

    const res = await executeSettingsSubcommand('frobnicate', [], settingsCtx());
    const message = res.message;
    expect(message).toContain('Unknown setting "frobnicate"');

    const match = /Valid: ([^.]+)\./.exec(message);
    expect(match, 'unknown-setting message must carry a "Valid: …" list').toBeTruthy();
    const advertised = (match?.[1] ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);

    for (const name of documented) {
      expect(advertised, `Valid list must advertise help-documented setting "${name}"`).toContain(
        name,
      );
    }
  });
});
