import type { Config, Provider, ProviderConfig } from '@wrongstack/contracts/types';
import type { ProviderRegistry } from '@wrongstack/core/registry';

/**
 * Build a provider by id from the saved `config.providers` entry, for host
 * background callers (Brain engine, SAGE consolidation) that need a provider
 * other than the session's.
 *
 * The legacy top-level key/baseUrl belong to the primary only (same rule as the
 * CLI's resolveRawProviderConnection). Handing them to every provider sent the
 * primary's key to other vendors, and to any base URL `provider_manage`
 * repointed (WS-2026-09-26-01).
 */
export function buildSavedProvider(
  providerRegistry: ProviderRegistry,
  config: Config,
  providerId: string,
): Provider {
  const savedCfg: Partial<ProviderConfig> = config.providers?.[providerId] ?? {};
  const isAccountAlias = savedCfg.type !== undefined && savedCfg.type !== providerId;
  const inheritsPrimary =
    !isAccountAlias && (config.provider === undefined || config.provider === providerId);
  // The VULN-006 sentinel (`endpointCredentialsSuppressed` in @wrongstack/providers).
  const repointed = Array.isArray(savedCfg.envVars) && savedCfg.envVars.length === 0;
  // `type` names the provider; the factory is the saved type (an alias
  // `work` is built by the `anthropic` factory, not looked up as `work`).
  return providerRegistry.create(
    {
      ...savedCfg,
      apiKey: savedCfg.apiKey ?? (inheritsPrimary && !repointed ? config.apiKey : undefined),
      baseUrl: savedCfg.baseUrl ?? (inheritsPrimary ? config.baseUrl : undefined),
      type: providerId,
    } as never,
    savedCfg.type ?? providerId,
  );
}
