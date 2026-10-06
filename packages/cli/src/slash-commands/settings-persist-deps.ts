/** Persistence target shared by every `/settings` mutation group. */

import { noOpVault } from '@wrongstack/core/security';
import type { SlashCommandContext } from './command-context.js';

export function buildSettingsPersistDeps(opts: SlashCommandContext, activeProfile: string) {
  return {
    configStore: opts.configStore,
    profileConfigPath: opts.paths!.profileConfig(activeProfile),
    inProjectConfigPath: opts.paths!.inProjectConfig,
    vault: opts.vault ?? noOpVault,
  };
}

export type SettingsPersistDeps = ReturnType<typeof buildSettingsPersistDeps>;
