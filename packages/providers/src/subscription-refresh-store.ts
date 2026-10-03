import type { ProviderApiKey, ProviderConfig } from '@wrongstack/core/types';
import { ProviderError } from '@wrongstack/core/types';

type Renewal = (credential: ProviderApiKey) => Promise<ProviderApiKey>;
export type SubscriptionRefreshTransaction = (
  providerId: string,
  source: ProviderApiKey,
  renew: Renewal,
) => Promise<ProviderApiKey>;
type ProviderMutator = (
  mutator: (providers: Record<string, ProviderConfig>) => Promise<void>,
) => Promise<void>;

let transaction: SubscriptionRefreshTransaction | undefined;

/** Hosts supply their existing encrypted-config transaction; libraries stay in-memory. */
export function setSubscriptionRefreshTransaction(
  value: SubscriptionRefreshTransaction | undefined,
): void {
  transaction = value;
}
export function hasSubscriptionRefreshTransaction(): boolean {
  return transaction !== undefined;
}

export function renewSubscriptionCredential(
  providerId: string,
  source: ProviderApiKey,
  renew: Renewal,
): Promise<ProviderApiKey> {
  return transaction ? transaction(providerId, source, renew) : renew(source);
}

/** Re-read, exchange and persist under the SAME host file lock, including across processes. */
export function createSubscriptionRefreshTransaction(
  mutate: ProviderMutator,
): SubscriptionRefreshTransaction {
  return async (providerId, source, renew) => {
    let result: ProviderApiKey | undefined;
    await mutate(async (providers) => {
      const provider = Object.hasOwn(providers, providerId) ? providers[providerId] : undefined;
      const current = provider?.apiKeys?.find((key) => key.label === source.label);
      if (
        current?.authMethod !== 'oauth' ||
        current.oauthStrategyId !== source.oauthStrategyId ||
        current.oauthClientId !== source.oauthClientId ||
        current.oauthSubject !== source.oauthSubject
      ) {
        throw new ProviderError(
          `The OAuth account "${providerId}/${source.label}" changed or was removed. Select the account again.`,
          401,
          false,
          providerId,
        );
      }
      const changed =
        current.apiKey !== source.apiKey || current.refreshToken !== source.refreshToken;
      const expiry = current.expiresAt ? Date.parse(current.expiresAt) : 0;
      // A sibling already rotated this account, or the user reauthorized it.
      // An unchanged token still renews on an explicit 401 refresh.
      if (changed && Number.isFinite(expiry) && expiry > Date.now() + 60_000) {
        result = { ...current };
        return;
      }
      const renewed = await renew({ ...current });
      result = { ...renewed, label: current.label, createdAt: current.createdAt };
      provider!.apiKeys = provider!.apiKeys!.map((key) =>
        key.label === current.label ? result! : key,
      );
    });
    if (!result) throw new Error('OAuth renewal did not return a credential.');
    return result;
  };
}
