/**
 * Antigravity model discovery — `POST /v1internal:fetchAvailableModels`.
 *
 * Antigravity is not in models.dev and its model ids are Google's to change,
 * so there is no catalog to fall back on: whatever this returns is the entire
 * answer to "what can I select". That is why discovery runs at sign-in — a
 * credential stored with an empty model list leaves a user with a connected
 * provider and nothing to point it at.
 *
 * Response shape — a map keyed by model id, not a list:
 *
 *   { models: { "gemini-3-pro": { isInternal?, quotaInfo?: {...}, ... } } }
 *
 * `isInternal` models are Google's own; they are filtered out because they are
 * not part of any subscription and selecting one produces a 403 that reads as
 * a broken login.
 *
 * The quota numbers this endpoint also carries are deliberately NOT read here.
 * It is a catalog view: its `quotaInfo` reflects eligibility and can keep
 * reporting a full bucket after real usage. `retrieveUserQuota` is the
 * consumption signal, and having two sources write the same store would make
 * a stale full bucket overwrite a true one.
 *
 * @module google-antigravity-models
 */

import {
  ANTIGRAVITY_MODELS_PATH,
  ANTIGRAVITY_RUNTIME_HOSTS,
  antigravityHeaders,
} from './google-antigravity-protocol.js';

interface ModelEntry {
  isInternal?: unknown;
}

/** Pull the selectable model ids out of a `fetchAvailableModels` body. */
export function parseAntigravityModels(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) return [];
  const models = (body as { models?: unknown }).models;
  if (typeof models !== 'object' || models === null || Array.isArray(models)) return [];
  const out: string[] = [];
  for (const [id, raw] of Object.entries(models as Record<string, unknown>)) {
    const modelId = id.trim();
    if (modelId.length === 0) continue;
    if (typeof raw === 'object' && raw !== null && (raw as ModelEntry).isInternal === true) {
      continue;
    }
    out.push(modelId);
  }
  // Stable order: the response is an object, and object key order is not a
  // contract we should hand to a model picker that a user reads top to bottom.
  return out.sort();
}

/**
 * Ask Cloud Code which models this account may use.
 *
 * Resolves to an empty array rather than throwing. The caller is a sign-in
 * flow, and failing a completed OAuth exchange over a catalog lookup would
 * discard a working credential — a user can select a model by name, but they
 * cannot recover a token that was thrown away.
 */
export async function fetchAntigravityModels(opts: {
  accessToken: string;
  project: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<string[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  for (const host of ANTIGRAVITY_RUNTIME_HOSTS) {
    try {
      const res = await doFetch(`${host}${ANTIGRAVITY_MODELS_PATH}`, {
        method: 'POST',
        headers: antigravityHeaders(opts.accessToken),
        body: JSON.stringify({ project: opts.project }),
        signal: opts.signal
          ? AbortSignal.any([opts.signal, AbortSignal.timeout(15_000)])
          : AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const json: unknown = await res.json();
      const models = parseAntigravityModels(json);
      if (models.length > 0) return models;
    } catch {
      // Try the next host.
    }
  }
  return [];
}
