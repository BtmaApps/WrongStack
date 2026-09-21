/**
 * TechStack — `Provider` → {@link ResearchLlm} adapter.
 *
 * Mirrors the capability-probing pattern established by the WebUI completion
 * handler (`packages/webui-server/src/server/completion-handlers.ts`,
 * `loadLlmSuggestions`): prefer strict structured output, fall back to JSON
 * mode, fall back again to prompt-only discipline. Providers differ, and a
 * research pass must not be exclusive to the ones with schema support.
 *
 * @see docs/specs/techstack-sdd.md §4.2
 */

import type { Provider, Request } from '@wrongstack/core/types';
import type { ResearchLlm, ResearchLlmRequest } from './types.js';

/** How the caller reaches a live provider. A getter, not a captured value —
 * the user can switch model or rotate credentials mid-session, and a snapshot
 * of the provider would silently go stale. */
export type LlmAccessor = () => { provider: Provider; model: string } | undefined;

const DEFAULT_TIMEOUT_MS = 45_000;

/**
 * Build a {@link ResearchLlm} from a provider accessor, or `undefined` when no
 * provider is currently wired — which is the signal `TechStackEngine` uses to
 * skip the research stage entirely and stay a deterministic tool.
 */
export function createProviderLlm(
  accessor: LlmAccessor,
  options: { readonly timeoutMs?: number | undefined } = {},
): ResearchLlm | undefined {
  if (!accessor()) return undefined;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async (req: ResearchLlmRequest): Promise<string> => {
    // Re-resolve per call so a mid-session model switch takes effect.
    const llm = accessor();
    if (!llm) throw new Error('TechStack research: no provider available');

    const request: Request = {
      model: llm.model,
      system: [{ type: 'text', text: req.system }],
      messages: [{ role: 'user', content: req.prompt }],
      maxTokens: req.maxTokens,
    };

    if (llm.provider.capabilities.structuredOutput) {
      request.responseFormat = {
        type: 'json_schema',
        jsonSchema: { name: req.schemaName, strict: false, schema: req.schema },
      };
    } else if (llm.provider.capabilities.jsonMode) {
      request.responseFormat = { type: 'json_object' };
    }

    const timer = new AbortController();
    const onAbort = () => {
      timer.abort(new Error('TechStack research: cancelled'));
    };
    req.signal?.addEventListener('abort', onAbort, { once: true });
    const to = setTimeout(() => {
      timer.abort(new Error('TechStack research: LLM timeout'));
    }, timeoutMs);
    to.unref?.();

    try {
      const res = await llm.provider.complete(request, { signal: timer.signal });
      return res.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();
    } finally {
      req.signal?.removeEventListener('abort', onAbort);
      clearTimeout(to);
      timer.abort();
    }
  };
}

// ── Response parsing ──────────────────────────────────────────────────────

/** Strip one outer Markdown fence without touching inner fences. */
function stripOuterFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:[a-z0-9_-]+)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
  return (match?.[1] ?? trimmed).trim();
}

/**
 * Pull the outermost JSON object out of a response.
 *
 * Even with `json_object` set, models prepend prose often enough that a bare
 * `JSON.parse` is a coin flip. Same salvage the completion handler does
 * (`extractJson`).
 */
/** Index just past the `}` matching the `{` at `start`, or undefined when unbalanced. */
function balancedEnd(text: string, start: number): number | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return index + 1;
  }
  return undefined;
}

/**
 * Pull the outermost JSON object out of a response.
 *
 * Every `{` is tried in turn and the first BALANCED object that parses wins:
 * prose around the object has braces of its own ("see the range {>=1.0}"), and
 * both the old early return (`startsWith('{')` → the whole text, so ANY trailing
 * prose broke the parse) and the first-`{`/last-`}` slice pulled that prose into
 * the slice. `JSON.parse` then failed, `parseResearchJson` returned null, and the
 * whole cluster's findings were dropped without a trace.
 */
function extractJsonObject(text: string): string {
  const trimmed = stripOuterFence(text);
  for (let start = trimmed.indexOf('{'); start !== -1; start = trimmed.indexOf('{', start + 1)) {
    const end = balancedEnd(trimmed, start);
    if (end === undefined) break;
    const candidate = trimmed.slice(start, end);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // Braces in prose are not JSON — try the next `{`.
    }
  }
  return trimmed;
}

/**
 * Parse a research response into a plain object, or `null` when the model
 * returned something unusable.
 *
 * Never throws: an unparseable research response degrades that cluster to zero
 * findings, it does not fail the analyze job.
 */
export function parseResearchJson(text: string): Record<string, unknown> | null {
  if (!text.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(extractJsonObject(text));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
