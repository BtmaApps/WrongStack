import { DEFAULT_WALK_IGNORE_DIRS } from '@wrongstack/core/utils';

export type GrepOutputMode = 'content' | 'files_with_matches' | 'count';

export type GrepEngine = 'rg' | 'native';

export type GrepBackend = GrepEngine;

export interface GrepInput {
  pattern: string;
  path?: string | undefined;
  glob?: string | undefined;
  output_mode?: GrepOutputMode | undefined;
  context_lines?: number | undefined;
  case_insensitive?: boolean | undefined;
  limit?: number | undefined;
}

export interface GrepOutput {
  matches: string[];
  count: number;
  truncated: boolean;
  used: GrepEngine;
}

/** Set-backed for O(1) `has()` in the per-entry native walk loop. */
export const DEFAULT_IGNORE: ReadonlySet<string> = new Set(DEFAULT_WALK_IGNORE_DIRS);
