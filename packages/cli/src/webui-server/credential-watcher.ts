/**
 * Refresh provider panels, routing configuration and the display language when
 * config.json changes on disk. The live provider itself is rebuilt by the CLI
 * host's provider-runtime watcher (see the note in the callback).
 *
 * @module webui-server/credential-watcher
 */

import { TOKENS } from '@wrongstack/contracts/kernel';
import { watchProviderConfig } from '@wrongstack/core/storage';
import type { CliWebUIOptions } from '../webui-server-options.js';
import type { WSServerMessage } from './contracts.js';
import { getVault } from './provider-config.js';

export interface CredentialWatcherOptions {
  opts: CliWebUIOptions;
  profileConfigPath: string;
  broadcast: (msg: WSServerMessage) => void;
  broadcastSaved: (providers: Record<string, unknown>) => void;
}

export function startWebuiCredentialWatcher({
  opts,
  profileConfigPath,
  broadcast,
  broadcastSaved,
}: CredentialWatcherOptions): (() => void) | undefined {
  const watchConfigPath = profileConfigPath;
  if (!watchConfigPath || process.env['WRONGSTACK_DISABLE_CONFIG_WATCH'] === '1') {
    return undefined;
  }

  let lastUiLocale = opts.appConfig?.uiLocale;

  const watcher = watchProviderConfig(
    watchConfigPath,
    // Vault key lives at ~/.wrongstack/.key (derived from globalConfigPath),
    // not inside the profile directory — resolve via global root to stay correct.
    getVault(opts.globalConfigPath),
    (snapshot) => {
      const hadFallbackBridge = Boolean(opts.appConfig?.fallbackBridge?.trim());
      const effectiveProviders =
        snapshot.snapshotHasProviders === false
          ? (opts.appConfig?.providers ?? snapshot.providers)
          : snapshot.providers;
      // Refresh the in-memory appConfig via shallow clone so a frozen boot
      // Config from ConfigLoader.load() is updated too, and keep disabled/routing
      // slices in sync before broadcastSaved reads them.
      try {
        if (opts.appConfig) {
          const nextConfig = {
            ...opts.appConfig,
            providers: effectiveProviders,
            ...(snapshot.uiLocale ? { uiLocale: snapshot.uiLocale } : {}),
            ...(snapshot.fallbackModels !== undefined
              ? { fallbackModels: snapshot.fallbackModels }
              : {}),
            ...(snapshot.fallbackProfiles !== undefined
              ? { fallbackProfiles: snapshot.fallbackProfiles }
              : {}),
            ...(snapshot.favoriteModels !== undefined
              ? { favoriteModels: snapshot.favoriteModels }
              : {}),
            ...(snapshot.disabledModels !== undefined
              ? { disabledModels: snapshot.disabledModels }
              : {}),
            ...(snapshot.disabledProviders !== undefined
              ? { disabledProviders: snapshot.disabledProviders }
              : {}),
            ...(snapshot.favoriteModelsOnly !== undefined
              ? { favoriteModelsOnly: snapshot.favoriteModelsOnly }
              : {}),
            ...(snapshot.modelMatrix !== undefined
              ? {
                  modelMatrix: snapshot.modelMatrix as NonNullable<
                    import('@wrongstack/contracts/types').Config['modelMatrix']
                  >,
                }
              : {}),
            ...(snapshot.fallbackAuto !== undefined ? { fallbackAuto: snapshot.fallbackAuto } : {}),
          };
          if (snapshot.fallbackBridge !== undefined) {
            nextConfig.fallbackBridge = snapshot.fallbackBridge;
          } else {
            delete nextConfig.fallbackBridge;
          }
          opts.appConfig = nextConfig;
        }
      } catch {
        /* read-only opts — ignore */
      }
      // Propagate routing/config changes to ConfigStore so running workers
      // pick them up (independent of the provider-credential path below).
      const routingChanged =
        snapshot.fallbackModels !== undefined ||
        snapshot.fallbackBridge !== undefined ||
        hadFallbackBridge ||
        snapshot.fallbackProfiles !== undefined ||
        snapshot.favoriteModels !== undefined ||
        snapshot.disabledModels !== undefined ||
        snapshot.disabledProviders !== undefined ||
        snapshot.favoriteModelsOnly !== undefined ||
        snapshot.modelMatrix !== undefined ||
        snapshot.fallbackAuto !== undefined;
      if (routingChanged) {
        const configStore = opts.agent.container?.safeResolve?.(TOKENS.ConfigStore) as
          | import('@wrongstack/contracts/types').ConfigStore
          | undefined;
        configStore?.update({
          ...(snapshot.fallbackModels !== undefined
            ? { fallbackModels: snapshot.fallbackModels }
            : {}),
          fallbackBridge: snapshot.fallbackBridge ?? '',
          ...(snapshot.fallbackProfiles !== undefined
            ? { fallbackProfiles: snapshot.fallbackProfiles }
            : {}),
          ...(snapshot.favoriteModels !== undefined
            ? { favoriteModels: snapshot.favoriteModels }
            : {}),
          ...(snapshot.disabledModels !== undefined
            ? { disabledModels: snapshot.disabledModels }
            : {}),
          ...(snapshot.disabledProviders !== undefined
            ? { disabledProviders: snapshot.disabledProviders }
            : {}),
          ...(snapshot.favoriteModelsOnly !== undefined
            ? { favoriteModelsOnly: snapshot.favoriteModelsOnly }
            : {}),
          ...(snapshot.modelMatrix !== undefined ? { modelMatrix: snapshot.modelMatrix } : {}),
          ...(snapshot.fallbackAuto !== undefined ? { fallbackAuto: snapshot.fallbackAuto } : {}),
        } as never);
      }
      broadcastSaved(effectiveProviders);

      // Display language live-propagation: when another surface writes
      // Config.uiLocale (desktop shell, standalone WebUI, or another
      // embedded WebUI), push it through the same prefs path the frontend
      // already uses for instant i18n re-render.
      if (snapshot.uiLocale !== lastUiLocale) {
        lastUiLocale = snapshot.uiLocale;
        if (snapshot.uiLocale) {
          opts.agent.ctx.meta['uiLocale'] = snapshot.uiLocale;
          broadcast({ type: 'prefs.updated', payload: { uiLocale: snapshot.uiLocale } });
        }
      }

      // The live provider is NOT rebuilt here. opts.agent.ctx is the CLI host's
      // context, whose provider-runtime watcher rebuilds it from the same file
      // with every layer, the removed-account block and the WrongProxy/WrongTrace
      // rewrite. A second, bare rebuild racing it from this independent debounce
      // replaced the host's proxied provider with a direct one whenever it
      // landed last.
    },
    {
      warn: (m) =>
        console.warn(
          JSON.stringify({
            level: 'warn',
            event: 'webui.config_watcher',
            message: m,
            timestamp: new Date().toISOString(),
          }),
        ),
    },
  );
  return watcher.close;
}
