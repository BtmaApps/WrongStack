import { Bot, Brain, Crosshair, Gauge, Info, Terminal, User } from 'lucide-react';
import { useAppTranslation } from '@/i18n';
import { PERF_RUN_METRIC_LABELS, PERF_RUN_MODE_LABELS } from '@/lib/perf-run-message';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/stores';

/** The role avatar beside a bubble; a continuation keeps only its width. */
export function MessageAvatar({
  isContinuation,
  isUser,
  isTool,
  isSystem,
  isThinkingLog,
}: {
  isContinuation: boolean;
  isUser: boolean;
  isTool: boolean;
  isSystem: boolean;
  isThinkingLog: boolean;
}) {
  return (
    <>
      {isContinuation ? (
        <div className="flex-shrink-0 w-8 h-8" aria-hidden />
      ) : (
        <div
          className={cn(
            'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
            'ring-1 ring-offset-2 ring-offset-background',
            isUser
              ? 'bg-primary text-primary-foreground ring-primary/20'
              : isTool
                ? 'bg-secondary text-secondary-foreground ring-secondary/20'
                : isSystem
                  ? 'bg-muted/60 text-muted-foreground ring-border/40'
                  : isThinkingLog
                    ? 'bg-primary/10 text-primary ring-primary/20'
                    : 'bg-accent text-accent-foreground ring-accent/20',
          )}
        >
          {isUser ? (
            <User className="h-4 w-4" />
          ) : isTool ? (
            <Terminal className="h-4 w-4" />
          ) : isSystem ? (
            <Info className="h-4 w-4" />
          ) : isThinkingLog ? (
            <Brain className="h-4 w-4" />
          ) : (
            <Bot className="h-4 w-4" />
          )}
        </div>
      )}
    </>
  );
}

/** The card a bug-hunt round prints in place of its instruction text. */
export function BugHuntCard({ bugHunt }: { bugHunt: ChatMessage['bugHunt'] }) {
  const { t } = useAppTranslation();
  return (
    <div className="min-w-[15rem]">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Crosshair className="h-4 w-4 text-primary" />
        <span>{t('activity:message.bugHunterTitle')}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-1">
          {t('activity:message.bugHuntRoundOf', {
            current: bugHunt?.currentRound ?? 1,
            max: bugHunt?.maxBugs,
          })}
        </span>
        <span
          className="max-w-full truncate rounded-full border border-border bg-background/60 px-2 py-1"
          title={bugHunt?.scope || t('activity:message.wholeProject')}
        >
          {bugHunt?.scope
            ? t('activity:message.scopeAndBelow', { scope: bugHunt.scope })
            : t('activity:message.wholeProject')}
        </span>
      </div>
    </div>
  );
}

/** The card a performance round prints in place of its instruction text. */
export function PerfRunCard({ perfRun }: { perfRun: NonNullable<ChatMessage['perfRun']> }) {
  return (
    <div className="min-w-[15rem]">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Gauge className="h-4 w-4 text-primary" />
        <span>{PERF_RUN_MODE_LABELS[perfRun.mode]}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <span
          className="max-w-full truncate rounded-full border border-border bg-background/60 px-2 py-1"
          title={perfRun.scope || 'Whole project'}
        >
          {perfRun.scope ? `${perfRun.scope} and below` : 'Whole project'}
        </span>
        {perfRun.metric && (
          <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-1">
            {PERF_RUN_METRIC_LABELS[perfRun.metric]}
          </span>
        )}
      </div>
    </div>
  );
}
