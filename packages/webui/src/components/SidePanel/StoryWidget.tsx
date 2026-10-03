import { ArrowLeft, ArrowUpRight, ChartNoAxesCombined } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import { EMPTY_LANE, useChatLanes } from '@/stores/chat-lanes';
import { useFleetStore } from '@/stores/fleet-store';
import { useActiveSessionId, useSessionLanes } from '@/stores/session-lanes';
import { useUIStore } from '@/stores/ui-store';

function age(start: number | null | undefined, now: number): string {
  if (!start || !Number.isFinite(start) || start > now) return '—';
  const seconds = Math.floor((now - start) / 1000);
  return seconds < 60
    ? `${seconds}s`
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m`
      : `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/** Retained tab snapshot only: no journal polling or project-wide counter inference. */
export function StoryWidget({ collapseOnOpen = false }: { collapseOnOpen?: boolean }) {
  const { t } = useAppTranslation();
  const sessionId = useActiveSessionId();
  const executions = useChatLanes(
    (state) => state.lanes[sessionId ?? '']?.executions ?? EMPTY_LANE.executions,
  );
  const loading = useChatLanes((state) => state.lanes[sessionId ?? '']?.isLoading ?? false);
  const startedAt = useSessionLanes(
    (state) =>
      state.lanes[sessionId ?? '']?.session?.startedAt ?? state.lanes[sessionId ?? '']?.startTime,
  );
  const agents = useFleetStore((state) => state.agents);
  const currentView = useUIStore((state) => state.currentView);
  const workers = useMemo(
    () =>
      [...agents.values()].filter(
        (agent) => Boolean(sessionId) && agent.sessionId === sessionId && !agent.isLeader,
      ),
    [agents, sessionId],
  );
  const working =
    Boolean(sessionId) && (loading || workers.some((agent) => agent.status === 'running'));
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!sessionId) return;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [sessionId]);
  const bars = useMemo(() => {
    const times = [...executions.values()]
      .map((call) => call.startedAt)
      .filter((value) => Number.isFinite(value) && value > 0);
    const bins = Array<number>(16).fill(0);
    if (!times.length) return bins;
    const start = Math.min(...times),
      span = Math.max(1, Math.max(...times) - start);
    for (const at of times) bins[Math.min(15, Math.floor(((at - start) / span) * 16))]!++;
    return bins;
  }, [executions]);
  const peak = Math.max(1, ...bars);
  const inStory = currentView === 'session-story';
  const open = () => {
    if (!sessionId && !inStory) return;
    const ui = useUIStore.getState();
    if (inStory) ui.selectActivity('chat');
    ui.setCurrentView(inStory ? 'chat' : 'session-story');
    if (collapseOnOpen) ui.setSidebarOpen(false);
  };
  return (
    <div className="shrink-0 border-b border-border/60 p-2.5">
      <button
        type="button"
        onClick={open}
        disabled={!sessionId && !inStory}
        aria-label={t(inStory ? 'activity:storyWidget.back' : 'activity:storyWidget.open')}
        title={t(inStory ? 'activity:storyWidget.back' : 'activity:storyWidget.hint')}
        className={cn(
          'group w-full overflow-hidden rounded-xl border border-info/20 bg-gradient-to-br from-info/5 to-primary/5 p-2.5 text-left transition-colors hover:border-info/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info disabled:cursor-default disabled:opacity-50',
          currentView === 'session-story' && 'border-info/50 bg-info/10',
        )}
      >
        <span className="flex items-center gap-2">
          {inStory ? (
            <ArrowLeft size={15} className="shrink-0 text-info" />
          ) : (
            <ChartNoAxesCombined size={15} className="shrink-0 text-info" />
          )}
          <span className="text-xs font-semibold">
            {inStory ? t('activity:storyWidget.back') : 'Story'}
          </span>
          <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
            {working && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
            {sessionId
              ? t(working ? 'activity:storyWidget.working' : 'activity:storyWidget.snapshot')
              : t('activity:storyWidget.noSession')}
            {!inStory && (
              <ArrowUpRight
                size={12}
                className="shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            )}
          </span>
        </span>
        {sessionId && (
          <span className="mt-2 flex items-end justify-between gap-2">
            <span className="flex flex-wrap gap-x-2 gap-y-1 font-mono text-[10px] text-muted-foreground">
              <span>
                {executions.size} {t('activity:storyWidget.calls')}
              </span>
              <span>
                {workers.length} {t('activity:storyWidget.workers')}
              </span>
              <span title={t('activity:storyWidget.age')}>{age(startedAt, now)}</span>
            </span>
            <svg viewBox="0 0 64 16" className="h-4 w-16 shrink-0 text-info" aria-hidden="true">
              {bars.map((value, index) => (
                <rect
                  key={index}
                  x={index * 4}
                  y={16 - (value / peak) * 14}
                  width={2.5}
                  height={(value / peak) * 14}
                  rx={1}
                  fill="currentColor"
                  opacity={0.3 + (index / 16) * 0.7}
                />
              ))}
            </svg>
          </span>
        )}
      </button>
    </div>
  );
}
