/** Leaf contracts shared by the tool implementation and its result guidance. */
import type { SearchResult } from './schema.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CodebaseSearchInput {
  query: string;
  kind?: string | undefined;
  lang?: string | undefined;
  file?: string | undefined;
  limit?: number | undefined;
  lspKind?: number | undefined;
  /**
   * Deprecated compatibility hint. The built-in tool is index-only; the LSP
   * plugin exposes live workspace-symbol search as `codebase-lsp-search`.
   */
  preferLsp?: boolean | undefined;
}

export interface CodebaseSearchOutput {
  results: SearchResult[];
  total: number; // total candidates before limit
  query: string;
  /**
   * True when the project server served a previous generation's cached
   * answer during a refresh. Results are internally consistent but may lag
   * the files currently being indexed.
   */
  stale?: boolean | undefined;
  /** Advisory note when a stale previous-generation answer was served. */
  indexStatus?: string | undefined;
  /** Next-step guidance: which tool answers the follow-up, or why the result is empty. */
  note?: string | undefined;
}
