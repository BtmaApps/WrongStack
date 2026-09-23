import { orderSessionTree, sessionTreePrefix } from '@wrongstack/core/storage';
import type { ResumeSessionEntry } from './app-state-core-types.js';

/**
 * Picker order for `/resume`: this worktree's sessions first, then each other
 * worktree of the repository in the host's order. Inside each group, forks
 * sit under their parent (see `orderSessionTree`) with a tree connector.
 */
export function orderResumeEntries(entries: readonly ResumeSessionEntry[]): ResumeSessionEntry[] {
  const groups = new Map<string, ResumeSessionEntry[]>([['', []]]);
  for (const entry of entries) {
    const key = entry.worktree?.root ?? '';
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  const ordered: ResumeSessionEntry[] = [];
  for (const group of groups.values()) {
    const rows = orderSessionTree(group);
    rows.forEach((row, i) => {
      const prefix = sessionTreePrefix(rows, i);
      ordered.push(prefix ? { ...row.session, treePrefix: prefix } : row.session);
    });
  }
  return ordered;
}
