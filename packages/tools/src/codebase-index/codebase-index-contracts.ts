/** Leaf contracts shared by the tool implementation and its result guidance. */

export interface CodebaseIndexOutput {
  filesIndexed: number;
  fileOutcomes?:
    | {
        parsed: number;
        skipped: number;
        empty: number;
        failed: number;
      }
    | undefined;
  symbolsIndexed: number;
  langStats: Record<string, number>;
  durationMs: number;
  errors: string[];
  /** Next-step guidance: which tool answers the follow-up, or why the result is empty. */
  note?: string | undefined;
}
