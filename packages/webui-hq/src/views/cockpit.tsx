/**
 * Cockpit — the whole fleet on one screen.
 *
 * Every card here duplicates a dedicated view on purpose: the point is triage
 * without navigation. Each one therefore ends in a jump to the surface that
 * can act on it, so the Cockpit is a starting point rather than a dead end.
 */
import {
  BellRing,
  Bot,
  CircleDollarSign,
  EyeOff,
  Gauge,
  Network,
  RadioTower,
  Server,
  ShieldCheck,
  ShieldQuestion,
} from 'lucide-react';
import type * as React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { EmptyState, Mono, StatTile } from '../components/hq/primitives.js';
import { ShareBar } from '../components/hq/view-chrome.js';
import { Badge, type BadgeTone } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { setHqFleetPrefs, useHqLocalPrefs } from '../data/local-prefs.js';
import { attentionBreakdown } from '../data/selectors.js';
import { useHqStore } from '../data/store/index.js';
import { usePendingApprovals } from '../domain/use-pending-approvals.js';
import { usePendingUserInputs } from '../domain/use-pending-user-inputs.js';
import { formatClock, formatPercent, formatUsd } from '../lib/format.js';
import { alertTone, CockpitCard, CommandLatencyCard, TokenStats } from './cockpit-cards.js';
import { SystemHealthTiles } from './cockpit-health.js';
import {
  CockpitAttentionStrip,
  CockpitCommandStrip,
  CockpitHero,
  type CockpitReviewItem,
  type OperationalTone,
} from './cockpit-sections.js';
import { useCockpitAlerts, useCockpitFleetStats, useCockpitHealth } from './use-cockpit-data.js';

export { CommandLatencyCard } from './cockpit-cards.js';

export function CockpitView(): React.ReactElement {
  const { snapshot, alerts, selectedClientId, connected, commandStatuses } = useHqStore(
    useShallow((state) => ({
      snapshot: state.snapshot,
      alerts: state.alerts,
      selectedClientId: state.selectedClientId,
      connected: state.connected,
      commandStatuses: state.commandStatuses,
    })),
  );

  // Shared with the Fleet Map toolbar: one flag, so both HQ surfaces hide
  // the same idle workers.
  const hideIdle = useHqLocalPrefs().fleet.hideIdle;

  const totals = snapshot?.totals;
  const machines = snapshot?.machines ?? [];
  const projects = snapshot?.projects ?? [];
  const clients = snapshot?.clients ?? [];
  const sessions = snapshot?.liveSessions ?? [];
  const fleets = snapshot?.fleets ?? [];

  const governanceProjects = projects.filter((project) => project.governance !== undefined);
  const governanceWarnings = governanceProjects.filter(
    (project) =>
      project.governance?.signal.level === 'warning' ||
      project.governance?.signal.level === 'unavailable',
  );

  const controllableClients = clients.filter((client) =>
    client.capabilities.includes('control.receive'),
  );
  const quickActionClient =
    selectedClientId === null
      ? (controllableClients[0] ?? null)
      : (controllableClients.find((client) => client.clientId === selectedClientId) ?? null);
  const { approvals } = usePendingApprovals();
  const inputs = usePendingUserInputs();

  const { health, healthError, gatewayHealth } = useCockpitHealth();
  const { activeAlerts, alertsError, alertDigest } = useCockpitAlerts(alerts);
  const { agents, clientVersions, topProjects, spawnBudget } = useCockpitFleetStats(
    sessions,
    clients,
    projects,
    fleets,
  );

  const signals = attentionBreakdown(snapshot, alerts, commandStatuses);
  const promptCount = approvals.length + inputs.length;
  const attention =
    Math.max(activeAlerts.length, signals.alerts) +
    signals.governance +
    signals.agents +
    signals.clients +
    signals.commands +
    promptCount;
  const reviewItems: CockpitReviewItem[] = [
    { label: 'Decisions waiting', count: promptCount, view: 'approvals', icon: ShieldQuestion },
    { label: 'Blocked or errored agents', count: signals.agents, view: 'alerts', icon: Bot },
    {
      label: 'Alerts & governance',
      count: Math.max(activeAlerts.length, signals.alerts) + signals.governance,
      view: 'alerts',
      icon: BellRing,
    },
    { label: 'Failed commands', count: signals.commands, view: 'control', icon: RadioTower },
    { label: 'Disconnected clients', count: signals.clients, view: 'fleet', icon: Network },
  ];
  const operationalTone: OperationalTone =
    !connected || snapshot === null || health?.status === 'degraded'
      ? 'degraded'
      : attention > 0
        ? 'attention'
        : 'nominal';
  const operationalLabel =
    snapshot === null
      ? 'Waiting for telemetry'
      : operationalTone === 'degraded'
        ? 'Link degraded'
        : operationalTone === 'attention'
          ? 'Attention needed'
          : 'Systems nominal';

  return (
    <div className="flex flex-col gap-4 p-4">
      <CockpitHero
        operationalTone={operationalTone}
        operationalLabel={operationalLabel}
        connected={connected}
        snapshot={snapshot}
        commandReadyClients={controllableClients.length}
        activeAlertCount={activeAlerts.length}
        governanceWarningCount={governanceWarnings.length}
        alertsError={alertsError}
        busyAgents={agents.busy}
        machineCount={machines.length}
        projectCount={projects.length}
        attention={attention}
      />

      {attention > 0 && <CockpitAttentionStrip reviewItems={reviewItems} />}

      <CockpitCommandStrip
        quickActionClient={quickActionClient}
        controllableClients={controllableClients}
        snapshot={snapshot}
      />

      {/* `grid-flow-row-dense` matters here: the cards have mixed spans and are
          conditionally rendered, so without it a wide card that cannot fit
          beside a narrow one leaves a visible hole in the bento. */}
      <div className="grid grid-flow-row-dense gap-3 xl:grid-cols-2 2xl:grid-cols-3">
        {(health !== null || healthError !== null) && (
          <CockpitCard
            icon={Server}
            title="System health"
            cta="open settings"
            view="settings"
            tone={health?.status === 'degraded' ? 'attention' : 'positive'}
            className="xl:col-span-2"
          >
            {healthError !== null ? (
              <EmptyState title={healthError} />
            ) : health !== null ? (
              <SystemHealthTiles health={health} gatewayHealth={gatewayHealth} />
            ) : null}
          </CockpitCard>
        )}

        <CockpitCard
          icon={Network}
          title="Fleet"
          cta="open fleet"
          view="fleet"
          className="xl:col-span-2"
        >
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <StatTile label="machines" value={machines.length} />
            <StatTile label="clients" value={clients.length} />
            {clientVersions.length > 0 && (
              <StatTile
                label={clientVersions.length === 1 ? 'version' : 'versions'}
                value={clientVersions.join(', ')}
              />
            )}
            <StatTile
              label="sessions"
              value={agents.activeSessions}
              tone={agents.activeSessions > 0 ? 'active' : 'idle'}
            />
            <StatTile
              label="agents"
              value={hideIdle ? agents.total - agents.idle : agents.total}
              hint={hideIdle ? `${agents.idle} idle hidden` : undefined}
            />
            <StatTile
              label="busy"
              value={agents.busy}
              tone={agents.busy > 0 ? 'running' : 'idle'}
            />
            <StatTile
              label="waiting"
              value={agents.waiting}
              tone={agents.waiting > 0 ? 'warn' : 'idle'}
            />
            <StatTile
              label="errored"
              value={agents.errored}
              tone={agents.errored > 0 ? 'error' : 'idle'}
            />
            <StatTile label="cost" value={formatUsd(totals?.totalCostUsd ?? 0)} tone="active" />
            {spawnBudget !== null && (
              <>
                <StatTile
                  label="spawns"
                  value={`${spawnBudget.used}/${Number.isFinite(spawnBudget.max) ? spawnBudget.max : '∞'}`}
                  tone={spawnBudget.mismatch > 0 ? 'warn' : 'idle'}
                />
                <StatTile
                  label="spawns left"
                  value={Number.isFinite(spawnBudget.remaining) ? spawnBudget.remaining : '∞'}
                  tone={spawnBudget.remaining === 0 ? 'error' : 'idle'}
                />
              </>
            )}
            <Button
              className="ml-auto self-start"
              variant={hideIdle ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={hideIdle}
              title="Same toggle as the Fleet Map: idle agents stop counting toward 'agents'"
              onClick={() => setHqFleetPrefs({ hideIdle: !hideIdle })}
            >
              <EyeOff />
              Hide idle
            </Button>
          </div>
        </CockpitCard>

        <CockpitCard
          icon={Gauge}
          title="Governance advisory"
          cta="open fleet"
          view="fleet"
          tone={governanceWarnings.length > 0 ? 'attention' : 'positive'}
        >
          {governanceProjects.length === 0 ? (
            <EmptyState title="No project governance snapshots yet" />
          ) : (
            <div className="space-y-1">
              {governanceProjects.map((project) => {
                const governance = project.governance;
                if (governance === undefined) return null;
                const tone: BadgeTone =
                  governance.signal.level === 'healthy'
                    ? 'active'
                    : governance.signal.level === 'notice'
                      ? 'warn'
                      : 'error';
                return (
                  <div key={project.projectId} className="flex items-center gap-2 text-xs">
                    <Badge tone={tone}>{governance.signal.level}</Badge>
                    <span className="truncate">{project.projectName}</span>
                    <Mono className="truncate">{governance.signal.code}</Mono>
                    <Mono className="ml-auto shrink-0">
                      {governance.signal.executionDisposition}
                    </Mono>
                  </div>
                );
              })}
            </div>
          )}
        </CockpitCard>

        <CockpitCard icon={ShieldCheck} title="Auth tokens" cta="open settings" view="settings">
          <TokenStats tokenStats={totals?.tokenStats} />
        </CockpitCard>

        <CockpitCard
          icon={BellRing}
          title="Alerts"
          cta="open alerts"
          view="alerts"
          tone={alertDigest.length > 0 ? 'attention' : 'positive'}
          className="xl:col-span-2"
        >
          {alertDigest.length === 0 ? (
            <EmptyState title="No alerts in the last few minutes" />
          ) : (
            <div className="space-y-1">
              {alertDigest.map((entry) => (
                <div
                  key={`${entry.ruleId}-${entry.timestamp}-${entry.message}`}
                  className="flex items-center gap-2 text-xs"
                >
                  <Badge tone={alertTone(entry.severity)}>{entry.severity}</Badge>
                  <Mono className="shrink-0">{entry.ruleId}</Mono>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {entry.message}
                  </span>
                  <Mono className="tabular shrink-0">{formatClock(entry.timestamp)}</Mono>
                </div>
              ))}
            </div>
          )}
        </CockpitCard>

        <CockpitCard icon={Gauge} title="Command latency" cta="open console" view="console">
          <CommandLatencyCard latency={snapshot?.commandLatency} />
        </CockpitCard>

        <CockpitCard
          icon={CircleDollarSign}
          title="Cost"
          cta="open cost"
          view="cost"
          className="xl:col-span-2"
        >
          {topProjects.length === 0 ? (
            <EmptyState
              title="No cost data yet"
              hint="Connect a client to start reporting spend."
            />
          ) : (
            <div className="space-y-2.5">
              {topProjects.map((project) => {
                const share =
                  (totals?.totalCostUsd ?? 0) > 0 ? project.totalCostUsd / totals!.totalCostUsd : 0;
                return (
                  <div key={project.projectId} className="space-y-1">
                    <div className="flex items-baseline gap-2 text-xs">
                      <span className="truncate font-medium">{project.projectName}</span>
                      <Mono className="truncate">{project.projectId}</Mono>
                      <span className="tabular ml-auto shrink-0 font-semibold">
                        {formatUsd(project.totalCostUsd)}
                      </span>
                      <Mono className="tabular w-12 shrink-0 text-right">
                        {formatPercent(share, 1)}
                      </Mono>
                    </div>
                    <ShareBar fraction={share} />
                    <div className="flex gap-3 text-[10px] text-muted-foreground">
                      <span>{project.activeSessions} sessions</span>
                      <span>{project.activeSubagents} subagents</span>
                      <span>{project.activeClients} clients</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CockpitCard>
      </div>
    </div>
  );
}
