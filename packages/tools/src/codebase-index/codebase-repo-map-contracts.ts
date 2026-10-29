/** Leaf contracts shared by the tool implementation and its result guidance. */
import type { RepoMapResult } from './repo-map.js';

export interface CodebaseRepoMapOutput extends RepoMapResult {
  status: 'ok';
  /** Next-step guidance: which tool answers the follow-up, or why the result is empty. */
  note?: string | undefined;
}
