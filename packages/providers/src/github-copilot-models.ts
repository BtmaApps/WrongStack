import { COPILOT_HEADERS, copilotBaseUrlFromToken } from './github-copilot-token.js';
import type { ProviderLiveModel } from './provider-account-types.js';

export interface CopilotModelEntry {
  id?: unknown;
  name?: unknown;
  model_picker_enabled?: unknown;
  is_chat_default?: unknown;
  is_chat_fallback?: unknown;
  vendor?: unknown;
  supported_endpoints?: unknown;
  policy?: { state?: unknown } | undefined;
  capabilities?:
    | {
        type?: unknown;
        supports?: { tool_calls?: unknown } | undefined;
        limits?: { max_context_window_tokens?: unknown; max_prompt_tokens?: unknown } | undefined;
      }
    | undefined;
}

/** Account visibility and supported wire decide membership; model names never do. */
export function isUsableCopilotChatModel(item: CopilotModelEntry): boolean {
  if (typeof item.id !== 'string' || !item.id.trim()) return false;
  if (item.capabilities?.type !== 'chat' || item.capabilities.supports?.tool_calls !== true)
    return false;
  if (
    Array.isArray(item.supported_endpoints) &&
    !item.supported_endpoints.includes('/chat/completions')
  )
    return false;
  if (item.policy?.state === 'disabled' || item.vendor === 'Experimental') return false;
  // The default remains usable even when the account cannot choose alternatives.
  // A hidden fallback/internal entry is not a user-selectable model.
  if (item.model_picker_enabled === false && item.is_chat_default !== true) return false;
  return true;
}

export function copilotModelRank(item: CopilotModelEntry): number {
  return item.is_chat_default === true ? 0 : item.is_chat_fallback === true ? 1 : 2;
}

/** undefined = unavailable; [] = a successful catalog with no usable models. */
export async function fetchCopilotModels(
  token: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderLiveModel[] | undefined> {
  try {
    const response = await fetchImpl(`${copilotBaseUrlFromToken(token)}/models`, {
      headers: {
        ...COPILOT_HEADERS,
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2026-06-01',
      },
      redirect: 'error',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
        : AbortSignal.timeout(8000),
    });
    if (!response.ok) return undefined;
    const body: unknown = await response.json();
    const data = (body as { data?: unknown } | null)?.data;
    if (!Array.isArray(data)) return undefined;
    const seen = new Set<string>();
    return data
      .filter(
        (item): item is CopilotModelEntry =>
          !!item && typeof item === 'object' && isUsableCopilotChatModel(item),
      )
      .sort((a, b) => copilotModelRank(a) - copilotModelRank(b))
      .flatMap((item) => {
        const id = item.id as string;
        if (seen.has(id)) return [];
        seen.add(id);
        const context =
          item.capabilities?.limits?.max_context_window_tokens ??
          item.capabilities?.limits?.max_prompt_tokens;
        return [
          {
            id,
            name: typeof item.name === 'string' ? item.name : id,
            ...(typeof context === 'number' && Number.isFinite(context) && context > 0
              ? { maxContext: context }
              : {}),
          },
        ];
      });
  } catch (error) {
    if (signal?.aborted) throw error;
    return undefined;
  }
}
