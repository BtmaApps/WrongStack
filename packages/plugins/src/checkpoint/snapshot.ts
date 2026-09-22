// ---------------------------------------------------------------------------
// Snapshot representation
// ---------------------------------------------------------------------------
//
// This lives in its own leaf module rather than in `index.ts` because both
// `state.ts` and `storage.ts` need it: importing it from the plugin entry
// pulled them back into a type-level module cycle with that entry, which the
// architecture health gate reports as an unexcepted SCC. `index.ts` re-exports
// `Snapshot` so the public plugin surface is unchanged.

export interface Snapshot {
  id: string;
  createdAt: string;
  /** What triggered the capture: 'auto:write', 'auto:edit', or 'manual'. */
  origin: string;
  files: Array<{
    path: string;
    /** null = file did not exist at capture time. */
    content: string | null;
    /** Binary data is retained losslessly as base64. Text remains UTF-8. */
    encoding?: 'base64' | undefined;
    /** Permission bits used when recreating a captured file that has since been deleted. */
    mode?: number | undefined;
    bytes: number;
  }>;
}
