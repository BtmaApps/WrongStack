import * as fs from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { PluginConfig } from '@wrongstack/core/types';
import { updateJsonObjectFile } from '@wrongstack/core/utils';
import { backupCurrent } from './config-history.js';
import type { PluginManagementDeps, PluginManagementResult } from './plugin-management-types.js';

export async function readConfig(file: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function pluginName(p: string | PluginConfig): string {
  return typeof p === 'string' ? p : p.name;
}

function pluginEntry(spec: string, enabled: boolean, path?: string): string | PluginConfig {
  if (path !== undefined) return { name: spec, path, enabled };
  return enabled ? spec : { name: spec, enabled: false };
}

export async function upsertPlugin(
  spec: string,
  opts: { enabled: boolean; path?: string },
  deps: PluginManagementDeps,
  verb: string,
): Promise<PluginManagementResult> {
  let plugins: Array<string | PluginConfig> = [];
  let features: Record<string, unknown> = {};
  await updateJsonObjectFile(deps.configPath, async (existing) => {
    await backupCurrent(undefined, deps.configPath);
    plugins = Array.isArray(existing.plugins)
      ? (existing.plugins as Array<string | PluginConfig>)
      : [];
    const idx = plugins.findIndex((p) => pluginName(p) === spec);
    const nextEntry = pluginEntry(spec, opts.enabled, opts.path);
    if (idx >= 0) plugins[idx] = nextEntry;
    else plugins.push(nextEntry);
    features = {
      ...(isRecord(deps.config.features) ? deps.config.features : {}),
      ...(isRecord(existing.features) ? existing.features : {}),
      plugins: true,
    };
    existing.plugins = plugins;
    existing.features = features;
  });
  const restartRequired = spec === 'branch-guard' && !opts.enabled ? undefined : true;
  return {
    code: 0,
    level: 'info',
    message:
      `${verb} "${spec}" (${opts.enabled ? 'enabled' : 'disabled'}). Config written to ${deps.configPath}.` +
      (spec === 'branch-guard' && !opts.enabled
        ? ' The running branch-guard hook will disable itself on config update.'
        : ''),
    patch: { plugins, features },
    restartRequired,
  };
}

export function errorResult(message: string): PluginManagementResult {
  return { code: 1, level: 'error', message };
}

// ---------------------------------------------------------------------------
// External plugin trust (TOFU re-pin / listing)
// ---------------------------------------------------------------------------

export function globalPluginsRoot(deps: PluginManagementDeps): string {
  return join(deps.globalRoot ?? join(homedir(), '.wrongstack'), 'plugins');
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
