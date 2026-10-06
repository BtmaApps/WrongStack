/** Provider routes context + credential hot-reload for the CLI-embedded WebUI host. */

import type { ProviderConfig } from '@wrongstack/core/types';
import {
  createEmbeddedProviderOperations,
  type EmbeddedProviderContext,
} from '@wrongstack/webui-server';
import type { CliWebUIOptions } from '../webui-server-options.js';
import { startWebuiCredentialWatcher } from './credential-watcher.js';
import { createProviderConfigStore } from './provider-config.js';
import type { WebuiTransport } from './transport.js';

export function createEmbeddedProviderPlane(input: {
  opts: CliWebUIOptions;
  profileConfigPath: string;
  send: WebuiTransport['send'];
  broadcast: WebuiTransport['broadcast'];
}) {
  const { opts, profileConfigPath, send, broadcast } = input;
  const wsHandlerCtx: EmbeddedProviderContext = {
    providerStore: createProviderConfigStore(
      profileConfigPath,
      () => (opts.appConfig?.providers as Record<string, ProviderConfig> | undefined) ?? {},
    ),
    modelsRegistry: opts.modelsRegistry,
    providerAuthRegistry: opts.providerAuthRegistry,
    getDisabledModels: () => opts.appConfig?.disabledModels ?? [],
    getDisabledProviders: () => opts.appConfig?.disabledProviders ?? [],
    send,
    broadcast,
    log: (m) => console.log(m),
  };
  const embeddedProviderOperations = createEmbeddedProviderOperations(wsHandlerCtx);

  const credentialWatcherClose: (() => void) | undefined = startWebuiCredentialWatcher({
    opts,
    profileConfigPath,
    broadcast,
    broadcastSaved: (providers) =>
      embeddedProviderOperations.broadcastSaved(providers as Record<string, ProviderConfig>),
  });
  return { wsHandlerCtx, credentialWatcherClose };
}
