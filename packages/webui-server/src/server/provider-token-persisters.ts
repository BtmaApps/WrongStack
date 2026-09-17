import type { ProviderConfig } from '@wrongstack/core/types';
import {
  applyProviderOAuthRefresh,
  matchesActiveProviderCredential,
  setOAuthTokenPersister,
  setProviderModelPersister,
} from '@wrongstack/providers';

/** Standalone hosts must persist rotations as well as interactive login outcomes. */
export function installWebuiProviderPersisters(args: {
  mutate: (mutator: (providers: Record<string, ProviderConfig>) => void) => Promise<void>;
  warn: (message: string) => void;
}): void {
  setOAuthTokenPersister((id, creds, source) => {
    void args
      .mutate((providers) => {
        if (Object.hasOwn(providers, id)) applyProviderOAuthRefresh(providers[id]!, creds, source);
      })
      .catch(() =>
        args.warn(
          `OAuth token refresh for "${id}" could not be saved. Sign-in may be required next session.`,
        ),
      );
  });
  setProviderModelPersister((id, models, source) => {
    if (!models.length) return;
    void args
      .mutate((providers) => {
        const provider = Object.hasOwn(providers, id) ? providers[id] : undefined;
        if (!provider || (source && !matchesActiveProviderCredential(provider, source))) return;
        provider.models = models.map((model) => model.id);
      })
      .catch(() => args.warn(`Model discovery for "${id}" could not be saved.`));
  });
}
