/** Leaf contracts shared by the tool implementation and its result guidance. */

export interface CodebaseStatsOutput {
  totalSymbols: number;
  totalFiles: number;
  byLang: Record<string, number>;
  byKind: Record<string, number>;
  lastIndexed: number | null;
  sizeBytes: number;
  indexPath: string;
  version: number;
  /** False when lifecycle state was returned without opening the SQLite index. */
  statsAvailable: boolean;
  /** Present while an index build or refresh is active. */
  indexing?:
    | {
        currentFile: number;
        totalFiles: number;
      }
    | undefined;
  /** Non-empty when the index is not ready or is still building. */
  indexStatus?: string | undefined;
  /** Next-step guidance: which tool answers the follow-up, or why the result is empty. */
  note?: string | undefined;
}
