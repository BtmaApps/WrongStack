/** Leaf contracts shared by the tool implementation and its result guidance. */
import type { CallSite } from './schema.js';

export interface OutgoingCallsOutput {
  symbol: string;
  calls: CallSite[];
  total: number;
  /**
   * True when the project server served a previous generation's cached
   * answer during a refresh. Results are internally consistent but may lag
   * the files currently being indexed.
   */
  stale?: boolean | undefined;
  /** Advisory note when the symbol was not found, or unresolved refs exist. */
  note?: string | undefined;
}
