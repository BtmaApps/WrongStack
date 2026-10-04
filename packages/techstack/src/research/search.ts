/**
 * TechStack — `searchTool` → {@link ResearchSearch} adapter.
 *
 * Wraps the built-in web search (`packages/tools/src/search.ts`) so the
 * researcher depends on a one-function port rather than the tool contract.
 *
 * Note on reliability: that tool scrapes DuckDuckGo/Google/Bing through
 * `guardedFetch` — there is no API key and no SLA. It can and does return
 * nothing. Every failure here resolves to `[]` so a dry search degrades a
 * finding to registry-only evidence instead of failing the analyze job.
 */

import type { Context } from '@wrongstack/core/agent';
import { searchTool } from '@wrongstack/tools';
import type { ResearchSearch, ResearchSearchResult } from './types.js';

const DEFAULT_NUM_RESULTS = 5;

/**
 * `searchTool` declares a `Context` parameter to satisfy the shared `Tool`
 * contract but never reads it — its implementation signature is
 * `executeStream(input, _ctx, opts)`. Research runs server-side with no agent
 * session to hand over, so we pass a placeholder rather than fabricate a
 * half-populated Context that would be more misleading than an obvious stub.
 */
const NO_CONTEXT = undefined as unknown as Context;

export interface SearchToolOptions {
  readonly numResults?: number | undefined;
  readonly source?: 'duckduckgo' | 'google' | 'bing' | undefined;
}

/** Build a {@link ResearchSearch} backed by the built-in `search` tool. */
export function createToolSearch(options: SearchToolOptions = {}): ResearchSearch {
  const numResults = options.numResults ?? DEFAULT_NUM_RESULTS;

  return async (query, opts): Promise<readonly ResearchSearchResult[]> => {
    if (opts.signal?.aborted) return [];
    try {
      const out = await searchTool.execute(
        {
          query,
          num_results: numResults,
          ...(options.source ? { source: options.source } : {}),
        },
        NO_CONTEXT,
        { signal: opts.signal ?? new AbortController().signal },
      );
      if (opts.signal?.aborted) return [];
      return out.results.map((result) => ({
        title: result.title,
        url: result.url,
        snippet: result.snippet,
      }));
    } catch {
      // Scraped search is best-effort. Interpretation without sources is still
      // better than no interpretation, and the finding's evidence list makes
      // the absence visible to the user.
      return [];
    }
  };
}
