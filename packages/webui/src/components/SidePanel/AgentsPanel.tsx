/**
 * AgentsPanel — live fleet roster for the side panel.
 *
 * Running agents sort first in a session-scoped leader → workers tree.
 * Selecting a row opens that agent's transcript in the chat workspace while
 * the roster remains available as the secondary navigation menu.
 */

import { Bot, LayoutGrid, ListFilter, Trash2 } from 'lucide-react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AgentDetailSection } from '@/components/agents/AgentDetailSection';
import { AgentTree } from '@/components/agents/AgentTree';
import { FleetSummaryBar } from '@/components/agents/FleetSummaryBar';
import { useAppTranslation } from '@/i18n';
import { agentBelongsToSession } from '@/lib/agent-session';
import { cn } from '@/lib/utils';
import { openMainView } from '@/lib/view-navigation';
import {
  selectSortedAgentList,
  useActiveSessionId,
  useFleetStore,
  useSessionLeaderId,
  useUIStore,
} from '@/stores';
import { onLaneDisposed } from '@/stores/chat-lanes';

type AgentFilter = 'all' | 'running' | 'completed' | 'failed';
type AgentsPanelChrome = {
  filter: AgentFilter;
  expandedAgentId: string | null;
};

const AGENTS_PANEL_NO_SESSION = '__no_session__';
const agentsPanelChromeBySession = new Map<string, AgentsPanelChrome>();
const disposedAgentPanelSessions = new Set<string>();

onLaneDisposed((sessionId) => {
  agentsPanelChromeBySession.delete(sessionId);
  disposedAgentPanelSessions.add(sessionId);
});

const FILTER_OPTIONS: Array<{
  value: AgentFilter;
  translationKey: `activity:agents.filter${string}`;
}> = [
  { value: 'all', translationKey: 'activity:agents.filterAll' },
  { value: 'running', translationKey: 'activity:agents.filterRunning' },
  { value: 'completed', translationKey: 'activity:agents.filterCompleted' },
  { value: 'failed', translationKey: 'activity:agents.filterFailed' },
];

export function AgentsPanel() {
  // This derived selector allocates on every invocation. Zustand 5 reads it
  // through useSyncExternalStore, so the selected snapshot must keep its
  // reference while the underlying values are unchanged.
  const fleetList = useFleetStore(useShallow(selectSortedAgentList));
  const clearFinishedAgents = useFleetStore((s) => s.clearFinishedAgents);
  const currentSessionId = useActiveSessionId();
  // Leader and its name come from THIS tab — the process-wide pointer and
  // `selectLeaderName` name whichever session promoted a leader last.
  const leaderId = useSessionLeaderId(currentSessionId ?? undefined);
  const leaderName = useFleetStore((s) => (leaderId ? s.agents.get(leaderId)?.name : undefined));
  const focusedSubagentId = useUIStore((s) => s.subagentChatFocusId);
  const { t } = useAppTranslation();

  const [filter, setFilter] = useState<AgentFilter>('all');
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const chromeKey = currentSessionId ?? AGENTS_PANEL_NO_SESSION;
  const chromeKeyRef = useRef(chromeKey);

  useLayoutEffect(() => {
    if (chromeKeyRef.current === chromeKey) return;
    if (!disposedAgentPanelSessions.has(chromeKeyRef.current)) {
      agentsPanelChromeBySession.set(chromeKeyRef.current, {
        filter,
        expandedAgentId,
      });
    }
    const next = agentsPanelChromeBySession.get(chromeKey) ?? {
      filter: 'all',
      expandedAgentId: null,
    };
    disposedAgentPanelSessions.delete(chromeKey);
    chromeKeyRef.current = chromeKey;
    setFilter(next.filter);
    setExpandedAgentId(next.expandedAgentId);
  }, [chromeKey, expandedAgentId, filter]);

  const sessionFleetList = useMemo(
    () => fleetList.filter((a) => agentBelongsToSession(a.sessionId, currentSessionId)),
    [fleetList, currentSessionId],
  );

  const filteredList = useMemo(() => {
    if (filter === 'all') return sessionFleetList;
    return sessionFleetList.filter((a) => {
      if (filter === 'running') return a.status === 'running';
      if (filter === 'completed') return a.status === 'completed';
      if (filter === 'failed') return a.status === 'failed' || a.status === 'timeout';
      return true;
    });
  }, [sessionFleetList, filter]);

  // Agents are bounded (active fleet), show all without pagination.

  const hasFinished = sessionFleetList.some((a) => a.status !== 'running');

  const openAgentChat = useCallback(
    (agentId: string) => {
      setExpandedAgentId(agentId);
      useUIStore
        .getState()
        .setSubagentChatFocus(agentId === leaderId ? null : agentId, currentSessionId ?? undefined);
      useUIStore.getState().setCurrentView('chat');
    },
    [currentSessionId, leaderId],
  );

  // ── Empty states ──────────────────────────────────────────────────
  // Both states read the SESSION roster — the global one counts other tabs'
  // agents, which inflated this panel's stats and mis-fired its empty states.
  const selectedAgentId = focusedSubagentId ?? leaderId;
  const selectedAgent = expandedAgentId
    ? filteredList.find((agent) => agent.id === expandedAgentId)
    : undefined;
  const toolbar = (
    <div className="flex shrink-0 items-center gap-1 border-b border-border/70 px-2 py-1">
      {FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setFilter(opt.value)}
          aria-pressed={filter === opt.value}
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
            filter === opt.value
              ? 'bg-primary/10 text-foreground'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
          )}
        >
          {t(opt.translationKey)}
        </button>
      ))}
      <span className="flex-1" />
      {hasFinished && (
        <button
          type="button"
          onClick={() => clearFinishedAgents(currentSessionId)}
          aria-label={t('activity:agents.clearFinishedTitle')}
          title={t('activity:agents.clearFinishedTitle')}
          className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-2.5 w-2.5" />
          {t('activity:agents.clearFinished')}
        </button>
      )}
    </div>
  );

  if (sessionFleetList.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[hsl(var(--surface-2)/0.35)] p-3">
        <div className="ws-surface flex max-w-[15rem] flex-col items-center gap-3 rounded-xl p-5 text-center text-muted-foreground">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bot className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{t('activity:agents.empty')}</p>
            <p className="mt-1 text-xs">{t('activity:agents.emptyHint')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (filteredList.length === 0 && filter !== 'all') {
    return (
      <>
        <FleetSummaryBar sessionId={currentSessionId ?? undefined} leaderName={leaderName} />
        {toolbar}
        <div className="flex min-h-0 flex-1 items-center justify-center bg-[hsl(var(--surface-2)/0.35)] p-3">
          <div className="ws-surface flex max-w-[15rem] flex-col items-center gap-3 rounded-xl p-5 text-center text-muted-foreground">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
              <ListFilter className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {t('activity:agents.emptyFilteredTitle')}
              </p>
              <p className="mt-1 text-xs">{t('activity:agents.emptyFilteredHint')}</p>
            </div>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className="h-7 rounded-md border border-border px-3 text-[11px] font-medium text-foreground hover:bg-accent transition-colors"
            >
              {t('activity:agents.emptyFilteredClear')}
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <FleetSummaryBar sessionId={currentSessionId ?? undefined} leaderName={leaderName} />
      {toolbar}

      {/* Session-scoped leader → workers tree. */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-[hsl(var(--surface-2)/0.35)] p-2">
        <AgentTree
          key={currentSessionId ?? AGENTS_PANEL_NO_SESSION}
          agents={filteredList}
          leaderId={leaderId}
          selectedAgentId={selectedAgentId}
          onSelectAgent={(agent) => openAgentChat(agent.id)}
          ariaLabel={t('activity:agentsPanel.agentRoster')}
        />
        {selectedAgent ? (
          <div className="mt-2 border border-border/70 bg-card/60 pt-2">
            <AgentDetailSection
              agent={selectedAgent}
              isExpanded
              onOpenInspector={() => openAgentChat(selectedAgent.id)}
            />
          </div>
        ) : null}
      </div>
      <div className="shrink-0 border-t border-border/70 bg-card/75 px-3 py-2">
        <button
          type="button"
          onClick={() => openMainView('roster')}
          className="w-full flex items-center justify-center gap-1.5 h-7 rounded-md border border-border text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <LayoutGrid className="h-3 w-3" />
          {t('activity:agents.openFull')}
        </button>
      </div>
    </>
  );
}
