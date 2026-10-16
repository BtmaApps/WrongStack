import { Bot, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AgentTree } from '@/components/agents/AgentTree';
import { EventTimeline } from '@/components/ui';
import { FleetAgentRow } from '@/components/ui/fleet-agent-row';
import { useIsFullChrome } from '@/hooks/useChromeLevel';
import { useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import type { FleetTimelineEvent, SubagentView } from '@/stores';
import { useFleetStore } from '@/stores';
import { AgentCard } from './AgentCard';

// ── Fleet tab content ──────────────────────────────────────────────────

type FleetFilter = 'all' | 'running' | 'completed' | 'failed';

const FLEET_FILTERS: Array<{ value: FleetFilter; labelKey: string }> = [
  { value: 'all', labelKey: 'activity:agents.filterAll' },
  { value: 'running', labelKey: 'activity:agents.filterRunning' },
  { value: 'completed', labelKey: 'activity:agents.filterCompleted' },
  { value: 'failed', labelKey: 'activity:agents.filterFailed' },
];

function matchesFleetFilter(agent: SubagentView, filter: FleetFilter): boolean {
  if (filter === 'running') return agent.status === 'running';
  if (filter === 'completed') return agent.status === 'completed';
  if (filter === 'failed') return agent.status === 'failed' || agent.status === 'timeout';
  return true;
}

export function FleetTabContent({
  fleetList,
  sessionId,
  leaderId,
  selectedAgentId,
  eventTimeline,
  onSelectAgent,
}: {
  fleetList: SubagentView[];
  sessionId: string | null;
  leaderId: string | undefined;
  selectedAgentId: string | null;
  eventTimeline: FleetTimelineEvent[];
  onSelectAgent: (agent: SubagentView) => void;
}) {
  const { t } = useAppTranslation();
  // Calm chrome makes this tab THE agents surface, so it takes over the left
  // Agents panel's status filter and "clear finished". Full chrome leaves the
  // tab as it was (those controls live in the left panel there).
  const fullChrome = useIsFullChrome();
  const clearFinishedAgents = useFleetStore((s) => s.clearFinishedAgents);
  const [filter, setFilter] = useState<FleetFilter>('all');
  const effectiveFilter: FleetFilter = fullChrome ? 'all' : filter;
  const shownList = useMemo(
    () => fleetList.filter((agent) => matchesFleetFilter(agent, effectiveFilter)),
    [fleetList, effectiveFilter],
  );
  const hasFinished = fleetList.some((agent) => agent.status !== 'running');
  // Fleet is bounded (active agents), show all without pagination.
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {!fullChrome && fleetList.length > 0 && (
        <div
          data-testid="inspector-fleet-toolbar"
          className="flex shrink-0 items-center gap-1 border-b border-border/70 px-2 py-1"
        >
          {FLEET_FILTERS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              aria-pressed={filter === opt.value}
              className={cn(
                'rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors',
                filter === opt.value
                  ? 'bg-primary/10 text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
            >
              {t(opt.labelKey)}
            </button>
          ))}
          <span className="flex-1" />
          {hasFinished && (
            <button
              type="button"
              onClick={() => clearFinishedAgents(sessionId)}
              title={t('activity:agents.clearFinishedTitle')}
              aria-label={t('activity:agents.clearFinishedTitle')}
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
              {t('activity:agents.clearFinished')}
            </button>
          )}
        </div>
      )}
      {/* Agent list */}
      {shownList.length === 0 ? (
        fleetList.length > 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <p className="text-xs font-medium">{t('activity:agents.emptyFilteredTitle')}</p>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className="mt-1 text-[11px] text-foreground hover:underline"
            >
              {t('activity:agents.emptyFilteredClear')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Users className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-xs font-medium">{t('activity:inspector.noAgentsActive')}</p>
            <p className="text-[11px] mt-0.5">{t('activity:inspector.agentsAppearHint')}</p>
          </div>
        )
      ) : (
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
          {fullChrome ? (
            shownList.map((agent) => (
              <FleetAgentRow
                key={agent.id}
                agent={agent}
                isSelected={selectedAgentId === agent.id}
                isLeader={agent.id === leaderId}
                onClick={() => onSelectAgent(agent)}
              />
            ))
          ) : (
            <AgentTree
              agents={shownList}
              leaderId={leaderId}
              selectedAgentId={selectedAgentId}
              onSelectAgent={onSelectAgent}
              ariaLabel={t('activity:agentsPanel.agentRoster')}
            />
          )}
        </div>
      )}

      {/* Event timeline footer */}
      {eventTimeline.length > 0 && (
        <div className="border-t px-3 py-1.5 shrink-0">
          <EventTimeline events={eventTimeline} max={4} />
        </div>
      )}
    </div>
  );
}

// ── Agents tab content ─────────────────────────────────────────────────

export function AgentsTabContent({
  fleetList,
  selectedAgent,
  leaderId,
  selectedAgentId,
  onSelectAgent,
}: {
  fleetList: SubagentView[];
  selectedAgent: SubagentView | null;
  leaderId: string | undefined;
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
}) {
  const { t } = useAppTranslation();
  // Fleet is bounded (active agents), show all without pagination.
  if (fleetList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Bot className="h-8 w-8 mb-2 opacity-20" />
        <p className="text-xs font-medium">{t('activity:inspector.noAgentsActive')}</p>
      </div>
    );
  }
  if (!selectedAgent) return null;

  const selectedIdx = Math.max(
    0,
    fleetList.findIndex((a) => a.id === selectedAgentId),
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {/* Detail card */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3">
        <div className="max-w-2xl mx-auto">
          <AgentCard agent={selectedAgent} isLeader={selectedAgent.id === leaderId} />
        </div>
      </div>

      {/* Agent selector strip */}
      <div className="border-t px-2 py-1.5 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {fleetList.map((agent, i) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => onSelectAgent(agent.id)}
              className={cn(
                'shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] transition-colors',
                agent.id === selectedAgent?.id
                  ? 'bg-primary/15 text-foreground ring-1 ring-primary/40'
                  : 'hover:bg-accent text-muted-foreground',
              )}
              title={
                i === selectedIdx
                  ? t('activity:inspector.selected', { name: agent.name })
                  : agent.name
              }
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full shrink-0',
                  agent.status === 'running'
                    ? 'bg-success animate-pulse'
                    : agent.status === 'failed'
                      ? 'bg-destructive'
                      : 'bg-muted-foreground/50',
                )}
              />
              <span className="truncate max-w-[8rem]">{agent.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
