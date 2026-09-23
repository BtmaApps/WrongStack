/**
 * ReviewDiff — the Changes view's unified diff with line comments.
 *
 * Same row model and look as DiffView (shared `computeLineDiff`), plus a
 * line-number gutter and a per-line "+" that opens an inline comment editor.
 * Comments live in the project-scoped review store; a comment whose line no
 * longer reads the same is listed above the diff as outdated instead of being
 * pinned to whatever text now occupies that line number.
 */

import { computeLineDiff } from '@wrongstack/tools/tool-diff';
import { MessageSquarePlus, Pencil, Trash2 } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import { type ReviewComment, useReviewStore } from '@/stores/review-store';
import { anchorFor, anchorKey, numberDiffRows, placeComments } from './review-diff-model';

function CommentEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const { t } = useAppTranslation();
  const [body, setBody] = useState(initial);
  return (
    <div className="mx-2 my-1 rounded-md border border-primary/40 bg-card p-2 font-sans">
      <textarea
        // biome-ignore lint/a11y/noAutofocus: the editor opens on an explicit click
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (body.trim()) onSave(body);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder={t('activity:review.placeholder')}
        aria-label={t('activity:review.placeholder')}
        rows={3}
        className="w-full resize-y rounded border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary/60"
      />
      <div className="mt-1.5 flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="h-7 rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-muted"
        >
          {t('common:action.cancel')}
        </button>
        <button
          type="button"
          disabled={!body.trim()}
          onClick={() => onSave(body)}
          className="h-7 rounded-md bg-primary px-2 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {t('common:action.save')}
        </button>
      </div>
    </div>
  );
}

export function CommentCard({
  comment,
  outdated,
}: {
  comment: ReviewComment;
  outdated?: boolean | undefined;
}) {
  const { t } = useAppTranslation();
  const update = useReviewStore((s) => s.update);
  const remove = useReviewStore((s) => s.remove);
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <CommentEditor
        initial={comment.body}
        onSave={(body) => {
          update(comment.id, body);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }
  return (
    <div
      className={cn(
        'group/comment mx-2 my-1 rounded-md border bg-card px-2 py-1.5 font-sans text-xs',
        outdated ? 'border-warning/50' : 'border-border',
      )}
    >
      {outdated && (
        <div className="mb-1 text-[10px] text-warning">
          {t('activity:review.outdated')} · {comment.path}:{comment.line}
          {comment.lineText.trim() && (
            <span className="ml-1 font-mono text-muted-foreground">
              “{comment.lineText.trim()}”
            </span>
          )}
        </div>
      )}
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-foreground">
          {comment.body}
        </p>
        <div className="flex shrink-0 gap-0.5 opacity-60 group-hover/comment:opacity-100">
          <button
            type="button"
            onClick={() => setEditing(true)}
            title={t('common:action.edit')}
            aria-label={t('common:action.edit')}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => remove(comment.id)}
            title={t('common:action.delete')}
            aria-label={t('common:action.delete')}
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

export const ReviewDiff = memo(function ReviewDiff({
  path,
  scope,
  oldText,
  newText,
}: {
  path: string;
  scope: string;
  oldText: string;
  newText: string;
}) {
  const { t } = useAppTranslation();
  const rows = useMemo(() => {
    const raw = computeLineDiff(oldText, newText);
    return raw ? numberDiffRows(raw) : null;
  }, [oldText, newText]);
  const allComments = useReviewStore((s) => s.comments);
  const add = useReviewStore((s) => s.add);
  const [draftAt, setDraftAt] = useState<string | null>(null);

  const fileComments = useMemo(
    () => allComments.filter((c) => c.scope === scope && c.path === path),
    [allComments, scope, path],
  );
  const placed = useMemo(
    () => (rows ? placeComments(rows, fileComments) : null),
    [rows, fileComments],
  );

  if (rows === null || placed === null) {
    return (
      <div className="px-3 py-2 text-xs italic text-muted-foreground">
        {t('activity:diff.tooLarge')}
      </div>
    );
  }

  const adds = rows.filter((r) => r.kind === 'add').length;
  const dels = rows.filter((r) => r.kind === 'del').length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background/40 text-xs">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 font-mono text-[11px]">
        <span className="truncate text-muted-foreground">{path}</span>
        <span className="ml-auto flex items-center gap-2">
          {adds > 0 && <span className="text-success">+{adds}</span>}
          {dels > 0 && <span className="text-destructive">-{dels}</span>}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto font-mono leading-relaxed">
        {placed.outdated.length > 0 && (
          <div className="border-b border-warning/30 bg-warning/5 py-1">
            <div className="px-3 text-[10px] font-semibold uppercase text-warning">
              {t('activity:review.outdatedHeader')}
            </div>
            {placed.outdated.map((c) => (
              <CommentCard key={c.id} comment={c} outdated />
            ))}
          </div>
        )}
        {rows.map((r, idx) => {
          const anchor = anchorFor(r);
          const key = anchor ? anchorKey(anchor.side, anchor.line) : null;
          const comments = key ? (placed.byAnchor.get(key) ?? []) : [];
          return (
            <div key={idx}>
              <div
                className={cn(
                  'group/row flex items-start',
                  r.kind === 'add' && 'bg-success/10',
                  r.kind === 'del' && 'bg-destructive/10',
                  r.kind === 'meta' && 'bg-muted/60',
                )}
              >
                <span
                  aria-hidden
                  className="w-9 shrink-0 select-none pr-1 text-right text-[10px] text-muted-foreground/60"
                >
                  {r.oldLine ?? ''}
                </span>
                <span
                  aria-hidden
                  className="w-9 shrink-0 select-none pr-1 text-right text-[10px] text-muted-foreground/60"
                >
                  {r.newLine ?? ''}
                </span>
                <span className="flex w-5 shrink-0 justify-center">
                  {anchor && (
                    <button
                      type="button"
                      onClick={() => setDraftAt(key)}
                      title={t('activity:review.addComment')}
                      aria-label={`${t('activity:review.addComment')}: ${
                        anchor.side === 'old' ? `${t('activity:review.removedLine')} ` : ''
                      }${anchor.line}`}
                      className="mt-px rounded text-primary opacity-0 hover:bg-primary/15 focus:opacity-100 group-hover/row:opacity-100"
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    'w-4 shrink-0 select-none text-center',
                    r.kind === 'add' && 'text-success',
                    r.kind === 'del' && 'text-destructive',
                    (r.kind === 'ctx' || r.kind === 'meta') && 'text-muted-foreground/70',
                  )}
                >
                  {r.kind === 'add' ? '+' : r.kind === 'del' ? '-' : r.kind === 'meta' ? '@' : ' '}
                </span>
                <pre
                  className={cn(
                    'flex-1 whitespace-pre-wrap break-all px-2',
                    (r.kind === 'ctx' || r.kind === 'meta') && 'text-muted-foreground/70',
                  )}
                >
                  {r.text || ' '}
                </pre>
              </div>
              {comments.map((c) => (
                <CommentCard key={c.id} comment={c} />
              ))}
              {anchor && draftAt === key && (
                <CommentEditor
                  initial=""
                  onSave={(body) => {
                    add({
                      scope,
                      path,
                      side: anchor.side,
                      line: anchor.line,
                      lineText: r.text,
                      body,
                    });
                    setDraftAt(null);
                  }}
                  onCancel={() => setDraftAt(null)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
