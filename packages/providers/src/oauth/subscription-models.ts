import type { ProviderLiveModel } from '../provider-account-types.js';
import { codexClientVersion } from './codex-protocol.js';
import { oauthRequest, oauthSignal } from './http.js';

/**
 * Model-list path, relative to the account's API base, for one OAuth strategy.
 *
 * The ChatGPT plan API serves the SAME version-gated catalog as the Codex
 * backend: without `client_version` it answers with the oldest model set
 * (verified live 2026-10-05 -- 5 models bare, 8 with the current Codex
 * version). So it advertises the same Codex version the Codex transport does.
 */
export function subscriptionModelsPath(strategy: string | undefined): string {
  if (strategy === 'xai') return 'language-models';
  if (strategy === 'chatgpt-api')
    return `models?client_version=${encodeURIComponent(codexClientVersion())}`;
  return 'models';
}

/** Account-scoped catalogs, including the public ChatGPT plan catalog's slug/visibility shape. */
export async function fetchSubscriptionModels(
  baseUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
  path = 'models',
): Promise<ProviderLiveModel[] | undefined> {
  try {
    const { response, body } = await oauthRequest(
      fetchImpl,
      `${baseUrl.replace(/\/+$/, '')}/${path}`,
      {
        headers: { accept: 'application/json', authorization: `Bearer ${apiKey}` },
        signal: oauthSignal(signal, 8_000),
      },
    );
    if (!response.ok) return undefined;
    const list = Array.isArray(body.models) ? body.models : body.data;
    if (!Array.isArray(list)) return undefined;
    const models: ProviderLiveModel[] = [];
    const seen = new Set<string>();
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const entry = raw as Record<string, unknown>;
      if (entry.visibility !== undefined && entry.visibility !== 'list') continue;
      const id = entry.slug ?? entry.id;
      if (typeof id !== 'string' || !id.trim() || seen.has(id)) continue;
      seen.add(id);
      // ChatGPT account catalogs publish two windows: `context_window` is the
      // default, `max_context_window` the largest one the model accepts. The
      // account is what we drive, so its ceiling is the larger one -- the same
      // reading discovery (`mapCompatibleModel`) and the Codex transport use.
      // Reading only the default reported 272K for models the plan serves at 872K.
      const context = entry.max_context_window ?? entry.context_window ?? entry.context_length;
      models.push({
        id,
        name: typeof entry.display_name === 'string' ? entry.display_name : id,
        ...(typeof context === 'number' && Number.isFinite(context) && context > 0
          ? { maxContext: context }
          : {}),
      });
    }
    return models;
  } catch (error) {
    if (signal?.aborted) throw error;
    return undefined;
  }
}
