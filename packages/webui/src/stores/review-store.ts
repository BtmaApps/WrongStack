import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * A line comment left on the working-tree diff in the Changes view. Comments
 * are project-scoped (`scope` = project root): the diff is the repository's,
 * not a chat session's, so switching tabs keeps them and switching projects
 * hides them.
 */
export interface ReviewComment {
  id: string;
  scope: string;
  /** Repo-relative path, as the Changes panel lists it. */
  path: string;
  /** `new` for added/context lines, `old` for removed lines. */
  side: 'old' | 'new';
  /** 1-based line number on `side`. */
  line: number;
  /** The line's text when the comment was written — quoted in the review. */
  lineText: string;
  body: string;
  createdAt: number;
}

/** Bounds on what reaches localStorage: comments are notes, not documents. */
const REVIEW_MAX_COMMENTS = 200;
const REVIEW_MAX_BODY_CHARS = 4_000;
const LINE_TEXT_MAX_CHARS = 400;

interface ReviewState {
  comments: ReviewComment[];
  add: (comment: Omit<ReviewComment, 'id' | 'createdAt'>) => ReviewComment | null;
  update: (id: string, body: string) => void;
  remove: (id: string) => void;
  /** Drop every comment in `scope` (after the review went to the composer). */
  clearScope: (scope: string) => void;
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return `rc-${Date.now().toString(36)}-${seq}`;
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set) => ({
      comments: [],
      add: (input) => {
        const body = input.body.trim().slice(0, REVIEW_MAX_BODY_CHARS);
        if (!body) return null;
        const comment: ReviewComment = {
          ...input,
          body,
          lineText: input.lineText.slice(0, LINE_TEXT_MAX_CHARS),
          id: nextId(),
          createdAt: Date.now(),
        };
        // Oldest comments fall off first once the cap is reached.
        set((state) => ({ comments: [...state.comments, comment].slice(-REVIEW_MAX_COMMENTS) }));
        return comment;
      },
      update: (id, body) => {
        const trimmed = body.trim().slice(0, REVIEW_MAX_BODY_CHARS);
        set((state) => ({
          comments: trimmed
            ? state.comments.map((c) => (c.id === id ? { ...c, body: trimmed } : c))
            : state.comments.filter((c) => c.id !== id),
        }));
      },
      remove: (id) => set((state) => ({ comments: state.comments.filter((c) => c.id !== id) })),
      clearScope: (scope) =>
        set((state) => ({ comments: state.comments.filter((c) => c.scope !== scope) })),
    }),
    {
      name: 'wrongstack-review-comments',
      version: 1,
      partialize: (state) => ({ comments: state.comments.slice(-REVIEW_MAX_COMMENTS) }),
    },
  ),
);

/** Comments in `scope`, ordered by file then line — the order the review reads in. */
export function scopedComments(comments: readonly ReviewComment[], scope: string): ReviewComment[] {
  return comments
    .filter((c) => c.scope === scope)
    .sort((a, b) =>
      a.path === b.path ? a.line - b.line || a.createdAt - b.createdAt : a.path < b.path ? -1 : 1,
    );
}

/**
 * The review as one message the agent can act on: each comment names its file
 * and line, quotes the line it was written against, then the comment.
 */
export function formatReviewMessage(comments: readonly ReviewComment[]): string {
  if (comments.length === 0) return '';
  const lines = [
    comments.length === 1
      ? 'Code review of the working tree — please address this comment:'
      : `Code review of the working tree — please address these ${comments.length} comments:`,
    '',
  ];
  comments.forEach((c, i) => {
    const where = `${c.path}:${c.line}${c.side === 'old' ? ' (removed line)' : ''}`;
    lines.push(`${i + 1}. ${where}`);
    if (c.lineText.trim()) lines.push(`   > ${c.lineText.trim()}`);
    for (const bodyLine of c.body.split('\n')) lines.push(`   ${bodyLine}`);
    lines.push('');
  });
  return lines.join('\n').trimEnd();
}
