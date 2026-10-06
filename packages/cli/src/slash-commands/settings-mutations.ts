import { color, toErrorMessage } from '@wrongstack/core/utils';
import type { SlashCommandContext } from './command-context.js';
import { unknownSubcommand } from './helpers.js';
import { executeContextSettings } from './settings-context-mutations.js';
import { executeFeatureAndUiSettings } from './settings-feature-ui-mutations.js';
import { executeHqAndAutonomySettings } from './settings-hq-autonomy-mutations.js';
import { ALL_SETTINGS_KEYS } from './settings-keys.js';
import { executeLimitsSettings } from './settings-limits-mutations.js';
import { buildSettingsPersistDeps } from './settings-persist-deps.js';
import { executeSettingsReset } from './settings-reset.js';
import {
  executeBreakerSettings,
  executeModelRuntimeSettings,
} from './settings-runtime-mutations.js';

export async function executeSettingsSubcommand(
  sub: string,
  rest: string[],
  opts: SlashCommandContext,
): Promise<{ message: string }> {
  const activeProfile = opts.configStore.get().activeProfile ?? 'default';
  const persistDeps = buildSettingsPersistDeps(opts, activeProfile);

  try {
    const hqAutonomy = await executeHqAndAutonomySettings(
      sub,
      rest,
      persistDeps,
      opts,
      activeProfile,
    );
    if (hqAutonomy) return hqAutonomy;
    const breaker = await executeBreakerSettings(sub, rest, persistDeps, opts, activeProfile);
    if (breaker) return breaker;
    const executeContextSettingsResult = await executeContextSettings(sub, rest, persistDeps);
    if (executeContextSettingsResult) return executeContextSettingsResult;
    const limitsResult = await executeLimitsSettings(
      sub,
      rest,
      persistDeps,
      persistDeps.configStore.get().limits,
    );
    if (limitsResult) return limitsResult;
    const modelRuntime = await executeModelRuntimeSettings(
      sub,
      rest,
      persistDeps,
      opts,
      activeProfile,
    );
    if (modelRuntime) return modelRuntime;
    const featureUi = await executeFeatureAndUiSettings(
      sub,
      rest,
      persistDeps,
      opts,
      activeProfile,
    );
    if (featureUi) return featureUi;

    if (sub === 'reset') {
      return executeSettingsReset(rest, persistDeps, opts, activeProfile);
    }

    return {
      message: `${color.red('Unknown setting')} "${sub}". ${unknownSubcommand(sub, ALL_SETTINGS_KEYS, 'settings')}`,
    };
  } catch (err) {
    return {
      message: `${color.red('Settings error')}: ${toErrorMessage(err)}`,
    };
  }
}
