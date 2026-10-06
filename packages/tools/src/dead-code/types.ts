/**
 * Dead-code engine — shared types.
 *
 * The engine works on a precise module graph built from the TypeScript parser
 * (syntax only, no type check), not on the codebase-index symbol graph: that
 * graph resolves references by name and has no edges for member calls, so a
 * reachability walk over it called most of a healthy repository dead.
 */

/**
 * What a finding claims. Ordered from the strongest claim (a whole file
 * nothing can reach) to the narrowest one (a manifest entry).
 */
export type DeadCodeCategory =
  /** No import / dynamic import / path reference from any entry reaches the file. */
  | 'unreachable-file'
  /** Reached only through test files — production never loads it. */
  | 'test-only-file'
  /** Exported, imported nowhere, and not used inside its own file: delete it. */
  | 'dead-export'
  /** Exported and imported nowhere, but used inside its own file: drop `export`. */
  | 'unused-export'
  /** A barrel re-export (`export { x } from './m'`) nothing imports through. */
  | 'unused-reexport'
  /** Imported only by test files. */
  | 'test-only-export'
  /** A top-level, non-exported declaration nothing references. */
  | 'unused-local'
  /** A package.json dependency no file of the package imports or runs. */
  | 'unused-dependency'
  /** Exported from a published package's public entry, but no in-repo consumer. */
  | 'unused-public-export';

export type DeadCodeConfidence = 'high' | 'medium' | 'low';

/** How the engine would remove a finding. Absent = manual only. */
export type DeadCodeFixAction =
  | 'delete-file'
  | 'remove-declaration'
  | 'remove-export-keyword'
  | 'remove-reexport'
  | 'remove-dependency';

export interface DeadCodeFinding {
  /** Stable across scans while the finding's identity holds (category + file + name). */
  id: string;
  category: DeadCodeCategory;
  confidence: DeadCodeConfidence;
  /** Project-relative, `/`-separated. */
  file: string;
  line?: number | undefined;
  endLine?: number | undefined;
  /** Symbol, re-exported name, or dependency name. */
  name?: string | undefined;
  /** function | class | const | type | interface | enum | namespace | default | re-export | dependency */
  kind?: string | undefined;
  typeOnly?: boolean | undefined;
  /** Owning workspace package name, when the file belongs to one. */
  package?: string | undefined;
  /** One sentence: why the engine believes this is dead. */
  reason: string;
  /** Present when the engine can remove it mechanically. */
  fix?: DeadCodeFixAction | undefined;
  /** Why the engine refuses to fix it automatically, when `fix` is absent. */
  manualReason?: string | undefined;
}

export interface DeadCodeScanOptions {
  /** Restrict reported findings to these project-relative path prefixes. Analysis stays whole-repo. */
  paths?: readonly string[] | undefined;
  /** Extra entry files / globs (project-relative). */
  entries?: readonly string[] | undefined;
  /** Extra globs excluded from analysis entirely. */
  ignore?: readonly string[] | undefined;
  /** Report exports of published packages' public entries that nothing in the repo imports. */
  includePublicApi?: boolean | undefined;
  /** Skip the per-project parse cache (always re-parse). */
  noCache?: boolean | undefined;
}

export interface DeadCodeScanStats {
  files: number;
  testFiles: number;
  entryFiles: number;
  reachableFiles: number;
  exports: number;
  parsedFiles: number;
  cachedFiles: number;
  durationMs: number;
}

export interface DeadCodeScanResult {
  projectRoot: string;
  findings: DeadCodeFinding[];
  /** Counts per category (after the `paths` filter). */
  byCategory: Partial<Record<DeadCodeCategory, number>>;
  /** Things the engine could not see through; each one may hide a false positive. */
  warnings: string[];
  stats: DeadCodeScanStats;
  /** Content hash per analysed file at scan time — fixes refuse files that changed since. */
  fileHashes: Record<string, string>;
}
