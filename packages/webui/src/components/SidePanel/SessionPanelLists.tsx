/**
 * The list-shaped sections of {@link SessionPanel}: the agent's plan, pinned
 * answers, and recent sessions. Pagination state stays in the panel so a
 * collapsed section keeps its page.
 */
import { CheckCircle2, Circle, CircleDot } from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';
import type { usePagination } from '@/hooks/usePagination';
import { useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import { getWSClient } from '@/lib/ws-client';
import { useConfigStore, useSessionTabStore } from '@/stores';
import type { TodoItem } from '@/stores/session-lanes';
import type { ChatMessage, SessionHistoryEntry } from '@/stores/types';

export function SessionPlanList({
  todos,
  todoPage,
}: {
  todos: TodoItem[];
  todoPage: ReturnType<typeof usePagination<TodoItem>>;
}) {
  const { t } = useAppTranslation();
  return (
    <>
      {/* ── Plan / todos ── */}
      {todos.length > 0 &&
        (() => {
          const done = todos.filter((t) => t.status === 'completed').length;
          const running = todos.filter((t) => t.status === 'in_progress').length;
          const pct = Math.round((done / todos.length) * 100);
          const allDone = done === todos.length;
          return (
            <div className="space-y-1.5 px-3 pb-2.5">
              <div
                className={cn(
                  'relative h-1.5 w-full overflow-hidden rounded-full bg-muted',
                  running > 0 && 'bar-sweep',
                )}
                title={t('activity:sessionPanel.planComplete', { pct })}
              >
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    allDone ? 'bg-success' : 'bg-primary',
                  )}
                  style={{ width: `${Math.max(pct, running > 0 ? 4 : 0)}%` }}
                />
              </div>
              <ul className="space-y-0.5 max-h-56 overflow-y-auto pr-1 -mx-1">
                {todoPage.pageItems.map((t) => {
                  const Icon =
                    t.status === 'completed'
                      ? CheckCircle2
                      : t.status === 'in_progress'
                        ? CircleDot
                        : Circle;
                  const active = t.status === 'in_progress';
                  const tone =
                    t.status === 'completed'
                      ? 'text-success line-through opacity-60'
                      : active
                        ? 'text-foreground'
                        : 'text-muted-foreground';
                  return (
                    <li
                      key={t.id}
                      className={cn(
                        'flex items-start gap-2 text-xs leading-snug rounded-md px-1.5 py-1 transition-colors',
                        active && 'bg-primary/10 ring-1 ring-inset ring-primary/20',
                        tone,
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-3.5 w-3.5 mt-0.5 shrink-0',
                          active && 'text-primary animate-pulse',
                        )}
                      />
                      <span className="break-words">
                        {active && t.activeForm ? t.activeForm : t.content}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <Pagination
                page={todoPage.page}
                pageSize={todoPage.pageSize}
                totalItems={todoPage.totalItems}
                onPageChange={todoPage.setPage}
                compact
                itemLabel="todos"
              />
            </div>
          );
        })()}
    </>
  );
}

export function SessionPinnedList({
  pinnedRows,
  pinnedPage,
}: {
  pinnedRows: ChatMessage[];
  pinnedPage: ReturnType<typeof usePagination<ChatMessage>>;
}) {
  return (
    <>
      {/* ── Pinned answers ── */}
      {pinnedRows.length > 0 && (
        <div className="space-y-1.5 px-3 pb-2.5">
          <ul className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {pinnedPage.pageItems.map((m) => {
              const preview = m.content.replace(/\s+/g, ' ').slice(0, 80);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.querySelector(`[data-message-id="${m.id}"]`);
                      if (!el) return;
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      el.classList.add('ring-2', 'ring-warning/60');
                      setTimeout(() => {
                        el.classList.remove('ring-2', 'ring-warning/60');
                      }, 1600);
                    }}
                    className="w-full text-left text-xs px-2 py-1.5 rounded bg-muted/40 hover:bg-muted/70 border border-warning/20 leading-snug"
                    title={m.content.slice(0, 400)}
                  >
                    {preview}
                    {m.content.length > 80 ? '…' : ''}
                  </button>
                </li>
              );
            })}
          </ul>
          <Pagination
            page={pinnedPage.page}
            pageSize={pinnedPage.pageSize}
            totalItems={pinnedPage.totalItems}
            onPageChange={pinnedPage.setPage}
            compact
            itemLabel="pinned answers"
          />
        </div>
      )}
    </>
  );
}

export function SessionHistoryList({
  historyEntries,
  fullChrome,
}: {
  historyEntries: SessionHistoryEntry[];
  fullChrome: boolean;
}) {
  const { t } = useAppTranslation();
  return (
    <>
      {/* ── History / recent sessions ── */}
      {(() => {
        const recent = historyEntries.slice(0, 8);
        if (recent.length === 0) return null;
        return (
          <div className="space-y-1 px-3 pb-2.5">
            <div className={cn('space-y-0.5', fullChrome && 'max-h-40 overflow-y-auto')}>
              {recent.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    const client = getWSClient(useConfigStore.getState().wsUrl);
                    useSessionTabStore.getState().openTab(entry.id, {
                      resumeSession: (id) => client?.resumeSession?.(id),
                    });
                  }}
                  className={cn(
                    'w-full text-left px-2 py-1.5 rounded text-xs leading-snug transition-colors',
                    entry.isCurrent
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground',
                  )}
                >
                  <div className="font-medium truncate">
                    {entry.title || t('chat:empty', 'Untitled')}
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 font-mono truncate">
                    {entry.provider}/{entry.model} · {entry.tokenTotal.toLocaleString()} tok
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })()}
    </>
  );
}
