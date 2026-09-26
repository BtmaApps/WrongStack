/**
 * The VULN-006 endpoint sentinel, read in one place.
 *
 * `provider_manage` writes `envVars: []` whenever it points an entry at a base
 * URL the user did not choose at a keyboard (a new provider with a `baseUrl`,
 * or a changed one). Present-but-empty means "no credential from the
 * environment, the catalog preset, or the legacy top-level `apiKey` reaches
 * this endpoint": only a key stored on the entry itself does.
 *
 * Every path that can hand a credential to a provider has to honour it —
 * `makeProvider`'s env lookup, the native SDKs (which read their own env vars
 * and credential chains when given no key), and the hosts' primary-key
 * inheritance (cli `resolveRawProviderConnection`, webui-server Brain's
 * `resolveProvider`, which inline this check). Missing any one of them
 * re-opens WS-2026-09-26-01.
 *
 * @module endpoint-credentials
 */

/** True when the entry carries the "no inherited credential" sentinel. */
export function endpointCredentialsSuppressed(
  cfg: { envVars?: unknown } | undefined | null,
): boolean {
  return Array.isArray(cfg?.envVars) && cfg.envVars.length === 0;
}
