/**
 * The pure model behind ReviewDiff: line numbers for diff rows, where a
 * comment anchors, and which comments still sit on the line they were
 * written against.
 */

import type { DiffRow } from '@wrongstack/tools/tool-diff';
import type { ReviewComment } from '@/stores/review-store';

export interface NumberedDiffRow extends DiffRow {
  oldLine?: number | undefined;
  newLine?: number | undefined;
}

/**
 * Attach 1-based line numbers: context lines advance both sides, removals the
 * old side, additions the new side.
 */
export function numberDiffRows(rows: readonly DiffRow[]): NumberedDiffRow[] {
  let oldLine = 0;
  let newLine = 0;
  return rows.map((row) => {
    if (row.kind === 'ctx') {
      oldLine += 1;
      newLine += 1;
      return { ...row, oldLine, newLine };
    }
    if (row.kind === 'del') {
      oldLine += 1;
      return { ...row, oldLine };
    }
    if (row.kind === 'add') {
      newLine += 1;
      return { ...row, newLine };
    }
    return { ...row };
  });
}

/** Where a comment on this row anchors: removed lines on the old side, the rest on the new. */
export function anchorFor(row: NumberedDiffRow): { side: 'old' | 'new'; line: number } | null {
  if (row.kind === 'del' && row.oldLine) return { side: 'old', line: row.oldLine };
  if ((row.kind === 'add' || row.kind === 'ctx') && row.newLine) {
    return { side: 'new', line: row.newLine };
  }
  return null;
}

export const anchorKey = (side: 'old' | 'new', line: number) => `${side}:${line}`;

/**
 * Split a file's comments into those still sitting on an identical line
 * (keyed by anchor) and those whose line changed underneath them.
 */
export function placeComments(
  rows: readonly NumberedDiffRow[],
  comments: readonly ReviewComment[],
): { byAnchor: Map<string, ReviewComment[]>; outdated: ReviewComment[] } {
  const textAt = new Map<string, string>();
  for (const row of rows) {
    const anchor = anchorFor(row);
    if (anchor) textAt.set(anchorKey(anchor.side, anchor.line), row.text);
  }
  const byAnchor = new Map<string, ReviewComment[]>();
  const outdated: ReviewComment[] = [];
  for (const comment of comments) {
    const key = anchorKey(comment.side, comment.line);
    if (textAt.get(key) === comment.lineText) {
      byAnchor.set(key, [...(byAnchor.get(key) ?? []), comment]);
    } else {
      outdated.push(comment);
    }
  }
  return { byAnchor, outdated };
}
