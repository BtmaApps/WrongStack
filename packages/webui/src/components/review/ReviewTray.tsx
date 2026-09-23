/**
 * ReviewTray — every review comment in the project, grouped by file, with the
 * two ways out: send the whole review to the chat composer as one message, or
 * discard it.
 *
 * "Send to chat" inserts into the composer rather than submitting, so the
 * user picks how it goes out (a normal send when idle; queue or `btw` while a
 * run is going) through the composer's existing send-mode handling.
 */

import { MessageSquareText, Send, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { useAppTranslation } from '@/i18n';
import { showPanel } from '@/lib/view-navigation';
import { useUIStore } from '@/stores';
import { formatReviewMessage, scopedComments, useReviewStore } from '@/stores/review-store';
import { confirmModal } from '../ConfirmModal';

export function useScopedReviewComments(scope: string) {
  const comments = useReviewStore((s) => s.comments);
  return useMemo(() => scopedComments(comments, scope), [comments, scope]);
}

export function ReviewTray({
  scope,
  onOpenFile,
}: {
  scope: string;
  onOpenFile: (path: string) => void;
}) {
  const { t } = useAppTranslation();
  const comments = useScopedReviewComments(scope);

  const sendToChat = () => {
    const message = formatReviewMessage(comments);
    if (!message) return;
    useUIStore.getState().requestPromptInsert(message);
    useReviewStore.getState().clearScope(scope);
    showPanel('chat');
  };

  const clearAll = async () => {
    const ok = await confirmModal({
      title: t('activity:review.confirmClearTitle'),
      message: t('activity:review.confirmClearMsg'),
      confirmLabel: t('common:action.discard'),
      danger: true,
    });
    if (ok) useReviewStore.getState().clearScope(scope);
  };

  const byFile = new Map<string, typeof comments>();
  for (const c of comments) byFile.set(c.path, [...(byFile.get(c.path) ?? []), c]);

  return (
    <section
      aria-label={t('activity:review.trayTitle')}
      className="flex max-h-[40%] shrink-0 flex-col border-t border-border/70 bg-card/60"
    >
      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <MessageSquareText className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold">{t('activity:review.trayTitle')}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={clearAll}
            disabled={comments.length === 0}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> {t('common:action.clear')}
          </button>
          <button
            type="button"
            onClick={sendToChat}
            disabled={comments.length === 0}
            title={t('activity:review.sendToChatTitle')}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" /> {t('activity:review.sendToChat')}
          </button>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-2">
        {comments.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('activity:review.empty')}</p>
        ) : (
          [...byFile.entries()].map(([path, list]) => (
            <div key={path} className="mb-2">
              <button
                type="button"
                onClick={() => onOpenFile(path)}
                className="truncate font-mono text-[11px] text-primary hover:underline"
                title={path}
              >
                {path}
              </button>
              <ul className="mt-0.5 space-y-0.5">
                {list.map((c) => (
                  <li key={c.id} className="flex gap-2 text-xs">
                    <span className="w-14 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                      {c.side === 'old' ? `-${c.line}` : c.line}
                    </span>
                    <span className="min-w-0 flex-1 truncate" title={c.body}>
                      {c.body}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
