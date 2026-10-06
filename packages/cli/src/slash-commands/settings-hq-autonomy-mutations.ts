/** `/settings` mutations for HQ, autonomy pacing, config scope, filesystem access and the prompt refiner. */

import { color } from '@wrongstack/core/utils';
import {
  deriveFsAccessPair,
  persistAutonomySetting,
  persistConfigSetting,
} from '../settings-menu.js';
import { formatDelay } from '../utils/delay-format.js';
import type { SlashCommandContext } from './command-context.js';
import type { SettingsPersistDeps } from './settings-persist-deps.js';

/** HQ, autonomy, scope, filesystem-access and refiner keys. Returns undefined for a key it does not own. */
export async function executeHqAndAutonomySettings(
  sub: string,
  rest: string[],
  persistDeps: SettingsPersistDeps,
  opts: SlashCommandContext,
  activeProfile: string,
): Promise<{ message: string } | undefined> {
  if (sub === 'hq') {
    const raw = (rest[0] ?? '').toLowerCase();
    if (!['on', 'off'].includes(raw)) {
      return { message: `${color.amber('Usage:')} /settings hq on|off` };
    }
    const on = raw === 'on';
    await persistConfigSetting({ ...persistDeps, forceGlobal: true }, (cfg) => {
      const hq = (cfg.hq as Record<string, unknown> | undefined) ?? {};
      hq.enabled = on;
      cfg.hq = hq;
    });
    return {
      message: `${color.green('✓')} HQ publishing → ${on ? color.cyan('on') : color.dim('off')}`,
    };
  }

  if (sub === 'hq-url') {
    const raw = rest.join(' ').trim();
    if (!raw) return { message: `${color.amber('Usage:')} /settings hq-url <http://host:3499>` };
    try {
      const url = new URL(raw);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('bad protocol');
    } catch {
      return { message: `${color.red('Invalid URL')}: ${raw}` };
    }
    await persistConfigSetting({ ...persistDeps, forceGlobal: true }, (cfg) => {
      const hq = (cfg.hq as Record<string, unknown> | undefined) ?? {};
      hq.url = raw;
      hq.enabled = true;
      cfg.hq = hq;
    });
    return { message: `${color.green('✓')} HQ URL → ${color.cyan(raw)}` };
  }

  if (sub === 'hq-token') {
    const token = rest.join(' ').trim();
    if (!token) return { message: `${color.amber('Usage:')} /settings hq-token <client-token>` };
    if (!opts.vault) {
      return {
        message: `${color.red('✗')} Secure credential storage is unavailable; HQ token was not saved.`,
      };
    }
    await persistConfigSetting({ ...persistDeps, forceGlobal: true }, (cfg) => {
      const hq = (cfg.hq as Record<string, unknown> | undefined) ?? {};
      hq.token = token;
      hq.enabled = true;
      cfg.hq = hq;
    });
    return {
      message: `${color.green('✓')} HQ token saved ${color.dim('(active profile config)')}`,
    };
  }

  if (sub === 'hq-raw') {
    const raw = (rest[0] ?? '').toLowerCase();
    if (!['on', 'off'].includes(raw)) {
      return { message: `${color.amber('Usage:')} /settings hq-raw on|off` };
    }
    const on = raw === 'on';
    await persistConfigSetting({ ...persistDeps, forceGlobal: true }, (cfg) => {
      const hq = (cfg.hq as Record<string, unknown> | undefined) ?? {};
      hq.rawContent = on;
      cfg.hq = hq;
    });
    return {
      message: `${color.green('✓')} HQ raw content → ${on ? color.cyan('on') : color.dim('off')}`,
    };
  }

  if (sub === 'delay') {
    const raw = rest[0];
    if (raw === undefined) {
      return {
        message: `${color.amber('Usage:')} /settings delay <seconds>   ${color.dim('(0 disables)')}`,
      };
    }
    const value = raw.trim();
    const seconds = value ? Number(value) : Number.NaN;
    if (!Number.isFinite(seconds) || seconds < 0) {
      return {
        message: `${color.red('Invalid number')}: "${raw}". Enter seconds, e.g. /settings delay 30`,
      };
    }
    const ms = Math.round(seconds * 1000);
    await persistAutonomySetting(persistDeps, (autonomy) => {
      autonomy.autoProceedDelayMs = ms;
    });
    return { message: `${color.green('✓')} auto-proceed delay → ${formatDelay(ms)}` };
  }

  if (sub === 'mode') {
    const raw = (rest[0] ?? '').toLowerCase();
    const modes = ['off', 'suggest', 'auto'];
    if (!modes.includes(raw)) {
      return { message: `${color.amber('Usage:')} /settings mode off|suggest|auto` };
    }
    await persistAutonomySetting({ ...persistDeps, forceGlobal: true }, (autonomy) => {
      autonomy.defaultMode = raw as 'off' | 'suggest' | 'auto';
    });
    return { message: `${color.green('✓')} default autonomy → ${color.bold(raw)}` };
  }

  if (sub === 'debug-stream') {
    const raw = (rest[0] ?? '').toLowerCase();
    if (!['on', 'off'].includes(raw)) {
      return { message: `${color.amber('Usage:')} /settings debug-stream on|off` };
    }
    const on = raw === 'on';
    const { setDebugStreamEnabled } = await import('@wrongstack/providers');
    setDebugStreamEnabled(on);
    await persistConfigSetting(persistDeps, (cfg) => {
      (cfg as Record<string, unknown>).debugStream = on;
    });
    return {
      message: `${color.green('✓')} debug stream → ${on ? color.cyan('on') : color.dim('off')}   ${color.dim('raw SSE hex-dump to stderr')}`,
    };
  }

  if (sub === 'config-scope') {
    const raw = (rest[0] ?? '').toLowerCase();
    if (!['global', 'project'].includes(raw)) {
      return { message: `${color.amber('Usage:')} /settings config-scope global|project` };
    }
    await persistConfigSetting(persistDeps, (cfg) => {
      cfg.configScope = raw;
    });
    const label =
      raw === 'project'
        ? `${color.cyan('project')} — settings saved to <project>/.wrongstack/config.json`
        : `${color.cyan('global')} — settings saved to ~/.wrongstack/profiles/${activeProfile}/config.json`;
    return { message: `${color.green('✓')} config scope → ${label}` };
  }

  if (sub === 'fs-access') {
    const raw = (rest[0] ?? '').toLowerCase();
    if (!['unrestricted', 'project'].includes(raw)) {
      return { message: `${color.amber('Usage:')} /settings fs-access unrestricted|project` };
    }
    const restrict = raw === 'project';
    const fsAccess = deriveFsAccessPair({ restrictFsToRoot: restrict });
    await persistConfigSetting({ ...persistDeps, forceGlobal: true }, (cfg) => {
      const tools = (cfg.tools as Record<string, unknown> | undefined) ?? {};
      tools.restrictToProjectRoot = fsAccess!.restrictToProjectRoot;
      cfg.tools = tools;
      const features = (cfg.features as Record<string, unknown> | undefined) ?? {};
      features.allowOutsideProjectRoot = fsAccess!.allowOutsideProjectRoot;
      cfg.features = features;
    });
    const label = restrict
      ? `${color.cyan('project')} — file tools confined to the project root`
      : `${color.cyan('unrestricted')} — file tools may access paths outside the project root`;
    return {
      message: `${color.green('✓')} filesystem access → ${label}   ${color.dim('(restart or re-open the session to apply)')}`,
    };
  }

  if (sub === 'refine') {
    const raw = (rest[0] ?? '').toLowerCase();
    if (!['on', 'off'].includes(raw)) {
      return { message: `${color.amber('Usage:')} /settings refine on|off` };
    }
    const on = raw === 'on';
    await persistAutonomySetting(persistDeps, (autonomy) => {
      (autonomy as Record<string, unknown>).enhance = on;
    });
    if (opts.enhanceController) {
      opts.enhanceController.setEnabled(on);
    }
    return {
      message: `${color.green('✓')} refine → ${on ? color.cyan('on') : color.dim('off')}   ${color.dim(on ? 'prompts will be refined before sending' : 'prompts sent verbatim')}`,
    };
  }

  if (sub === 'refine-delay') {
    const raw = rest[0];
    if (raw === undefined) {
      return { message: `${color.amber('Usage:')} /settings refine-delay <seconds>` };
    }
    const value = raw.trim();
    const seconds = value ? Number(value) : Number.NaN;
    if (!Number.isFinite(seconds) || seconds < 0) {
      return {
        message: `${color.red('Invalid number')}: "${raw}". Enter seconds, e.g. /settings refine-delay 30`,
      };
    }
    const ms = Math.round(seconds * 1000);
    await persistAutonomySetting(persistDeps, (autonomy) => {
      (autonomy as Record<string, unknown>).enhanceDelayMs = ms;
    });
    return { message: `${color.green('✓')} refine-delay → ${formatDelay(ms)}` };
  }

  if (sub === 'refine-language') {
    const raw = (rest[0] ?? '').toLowerCase();
    if (!['original', 'english'].includes(raw)) {
      return {
        message: `${color.amber('Usage:')} /settings refine-language original|english`,
      };
    }
    await persistAutonomySetting(persistDeps, (autonomy) => {
      (autonomy as Record<string, unknown>).enhanceLanguage = raw;
    });
    const label =
      raw === 'original'
        ? `${color.cyan('original')} — use the language you wrote in`
        : `${color.cyan('english')} — translate to English`;
    return { message: `${color.green('✓')} refine-language → ${label}` };
  }

  if (sub === 'refiner-provider') {
    const raw = rest.join(' ').trim();
    const currentProvider = (opts.configStore.get().autonomy as Record<string, unknown> | undefined)
      ?.refinerProvider as string | undefined;
    if (!raw) {
      return {
        message: `${color.amber('Usage:')} /settings refiner-provider <providerId>   ${color.dim('(e.g. "openai", "anthropic")' + (currentProvider ? ` Current: ${currentProvider}` : ''))}`,
      };
    }
    await persistAutonomySetting(persistDeps, (autonomy) => {
      (autonomy as Record<string, unknown>).refinerProvider = raw;
    });
    return {
      message: `${color.green('✓')} refiner-provider → ${color.cyan(raw)}   ${color.dim('goal refinement will use this provider when refiner-model is also set')}`,
    };
  }

  if (sub === 'refiner-model') {
    const raw = rest.join(' ').trim();
    const currentModel = (opts.configStore.get().autonomy as Record<string, unknown> | undefined)
      ?.refinerModel as string | undefined;
    if (!raw) {
      return {
        message: `${color.amber('Usage:')} /settings refiner-model <modelId>   ${color.dim('(must be a favorite or the active model; e.g. "gpt-4o-mini")' + (currentModel ? ` Current: ${currentModel}` : ''))}`,
      };
    }
    await persistAutonomySetting(persistDeps, (autonomy) => {
      (autonomy as Record<string, unknown>).refinerModel = raw;
    });
    return {
      message: `${color.green('✓')} refiner-model → ${color.cyan(raw)}   ${color.dim('goal refinement will use this model when it passes favorites/active validation')}`,
    };
  }

  if (sub === 'refiner-fallback-profile') {
    const raw = rest.join(' ').trim();
    const currentProfile = (opts.configStore.get().autonomy as Record<string, unknown> | undefined)
      ?.refinerFallbackProfile as string | undefined;
    if (!raw) {
      return {
        message: `${color.amber('Usage:')} /settings refiner-fallback-profile <name>   ${color.dim('(e.g. "default")' + (currentProfile ? ` Current: ${currentProfile}` : ''))}`,
      };
    }
    await persistAutonomySetting(persistDeps, (autonomy) => {
      (autonomy as Record<string, unknown>).refinerFallbackProfile = raw;
    });
    return {
      message: `${color.green('✓')} refiner-fallback-profile → ${color.cyan(raw)}   ${color.dim('goal refinement will use the first valid entry from this profile chain')}`,
    };
  }

  if (sub === 'refiner-clear') {
    await persistAutonomySetting(persistDeps, (autonomy) => {
      (autonomy as Record<string, unknown>).refinerProvider = undefined;
      (autonomy as Record<string, unknown>).refinerModel = undefined;
      (autonomy as Record<string, unknown>).refinerFallbackProfile = undefined;
    });
    return {
      message: `${color.green('✓')} Refiner config cleared   ${color.dim('goal refinement will use the session provider+model')}`,
    };
  }
  return undefined;
}
