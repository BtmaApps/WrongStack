import type { Tool } from '@wrongstack/core/types';

export interface ToolSearchInput {
  query?: string | undefined;
  tags?: string[] | undefined;
  permission?: 'auto' | 'confirm' | 'deny' | undefined;
  mutating?: boolean | undefined;
  limit?: number | undefined;
}

export interface ToolSearchOutput {
  tools: {
    name: string;
    description: string;
    /** Exact schema required by tool_use for an on-demand invocation. */
    inputSchema: Tool['inputSchema'];
    usageHint?: string | undefined;
    /** Runtime family, suitable for passing back through the `tags` filter. */
    category?: string | undefined;
    /** Fine-grained runtime capabilities, when the tool declares them. */
    capabilities?: readonly string[] | undefined;
    permission: string;
    mutating: boolean;
  }[];
  total: number;
  truncated: boolean;
  /** Guidance returned when a query matched nothing. */
  hint?: string | undefined;
  /** Total count of tools in the registry (for "no results" hints). */
  _available?: number;
}

export const toolSearchTool: Tool<ToolSearchInput, ToolSearchOutput> = {
  name: 'tool_search',
  category: 'Meta',
  description:
    'Search the catalog of available tools by name or description. Use this to discover which tool to use for a task, ' +
    'including tools whose schemas were withheld from this request to save tokens. Results include the exact input schema needed by tool_use.',
  usageHint:
    'SELF-DISCOVERY TOOL:\n\n' +
    '- Use when you need to find the right tool for a job.\n' +
    '- `query` searches names and descriptions.\n' +
    '- You can filter by `tags` (category, capability, or name terms), `permission`, or `mutating`.\n' +
    '- The catalog searched here is the full registry, not just the tools listed in this request.\n' +
    '- Once you find the right tool name, invoke it with `tool_use`.\n' +
    'Call this before concluding a capability is unavailable.',
  permission: 'auto',
  mutating: false,
  timeoutMs: 1_000,
  capabilities: ['tool.meta'],
  icon: 'meta',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query for tool name or description',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by tags (e.g. "filesystem", "network", "dev")',
      },
      permission: {
        type: 'string',
        enum: ['auto', 'confirm', 'deny'],
        description: 'Filter by required permission level',
      },
      mutating: {
        type: 'boolean',
        description: 'Filter by mutating flag (true=filters that modify, false=read-only)',
      },
      limit: {
        type: 'integer',
        description: 'Maximum results to return (default: 20)',
        minimum: 1,
        maximum: 100,
      },
    },
  },
  async execute(input, ctx) {
    const rawLimit =
      typeof input.limit === 'number' && Number.isFinite(input.limit) ? input.limit : 20;
    const limit = Math.max(1, Math.min(Math.floor(rawLimit), 100));
    const tools = ctx.catalogTools ?? ctx.tools;
    const query = input.query?.toLowerCase() ?? '';
    const scores = new Map<Tool, number>();

    const filtered = tools.filter((t: Tool) => {
      if (query) {
        const score = queryScore(t, query);
        if (score === 0) return false;
        scores.set(t, score);
      }
      if (input.tags && input.tags.length > 0) {
        // Tool historically exposed only a broad `category`, even though the
        // input called this filter `tags`. Include category, declared
        // capabilities, and name segments so callers can make a useful
        // semantic selection without already knowing a tool's exact family.
        const searchableTags = [
          t.category ?? '',
          ...(t.capabilities ?? []),
          ...t.name.split(/[_-]/),
        ].map((value) => value.toLowerCase());
        const requestedTags = input.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
        if (
          requestedTags.length > 0 &&
          !requestedTags.some((tag) =>
            searchableTags.some((candidate) => candidate.includes(tag) || tag.includes(candidate)),
          )
        ) {
          return false;
        }
      }
      if (input.permission && t.permission !== input.permission) {
        return false;
      }
      if (typeof input.mutating === 'boolean' && t.mutating !== input.mutating) {
        return false;
      }
      return true;
    });

    // Best match first; ties keep registry order.
    if (query) filtered.sort((x, y) => (scores.get(y) ?? 0) - (scores.get(x) ?? 0));
    const results = filtered.slice(0, limit).map((t: Tool) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      ...(t.usageHint ? { usageHint: t.usageHint } : {}),
      ...(t.category ? { category: t.category } : {}),
      ...(t.capabilities?.length ? { capabilities: t.capabilities } : {}),
      permission: t.permission,
      mutating: t.mutating,
    }));

    // When no tools match, give the model actionable guidance so it
    // doesn't spiral through random queries. Tell it how many tools exist and
    // how to list them, so the next call narrows instead of guessing again.
    const totalAvailable = tools.length;
    // Tools the query found that `tags` / `permission` / `mutating` then
    // dropped. Saying "no tools matched" there sent models hunting for a tool
    // that was in the catalog all along (an `image_generate` search with
    // `permission: 'auto'` hid a confirm-gated tool).
    const excludedByFilters = results.length === 0 && query ? scores.size : 0;
    const hint =
      excludedByFilters > 0
        ? `${excludedByFilters} tool(s) match "${input.query}" but the tags/permission/mutating filters excluded them; search again without those filters.`
        : results.length === 0 && query
          ? `No tools matched "${input.query}". ${totalAvailable} tools are available; try a broader query, or call tool_search with no query and limit up to 100.`
          : undefined;

    return {
      tools: results,
      total: filtered.length,
      truncated: filtered.length > limit,
      ...(hint ? { hint } : {}),
      _available: totalAvailable,
    };
  },
};

/** Words that carry no signal about which tool is meant. */
const QUERY_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'to',
  'of',
  'for',
  'with',
  'from',
  'into',
  'in',
  'on',
  'or',
  'by',
  'that',
  'this',
  'tool',
  'tools',
  'use',
  'using',
]);

/**
 * How well a tool answers a query. The whole query found in the name or
 * description wins outright. Otherwise the query is split into words and a
 * tool must contain at least half of them (a word in the name counts double):
 * models describe what they need in phrases such as "generate image with
 * prompt and path", which as one literal substring matched nothing.
 */
function queryScore(t: Tool, query: string): number {
  const name = t.name.toLowerCase();
  const text = `${name} ${t.description.toLowerCase()} ${(t.usageHint ?? '').toLowerCase()}`;
  if (name.includes(query) || t.description.toLowerCase().includes(query)) return 1_000;
  const terms = [
    ...new Set(
      query
        .split(/[^a-z0-9_-]+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 1 && !QUERY_STOP_WORDS.has(w)),
    ),
  ];
  if (terms.length < 2) return 0;
  let hits = 0;
  let score = 0;
  for (const term of terms) {
    if (name.includes(term)) {
      hits++;
      score += 2;
    } else if (text.includes(term)) {
      hits++;
      score += 1;
    }
  }
  return hits * 2 >= terms.length ? score : 0;
}
