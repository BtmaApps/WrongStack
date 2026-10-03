import type { ProviderLiveModel } from '../provider-account-types.js';
import { oauthRequest, oauthSignal } from './http.js';

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
      const context = entry.context_window ?? entry.context_length;
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
