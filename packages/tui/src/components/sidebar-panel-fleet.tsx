import type React from 'react';
import type { FleetEntry } from '../app-state.js';
import { Box, Text } from '../ink.js';
import { displayWidth } from '../terminal-width.js';
import { theme } from '../theme.js';
import { METRIC_MIN_BODY_WIDTH, PILL_MIN_INNER_WIDTH } from '../ui-contracts.js';
import { glyphs } from '../ui-glyphs.js';
import { SidebarCountsRow, SidebarPanelFrame, trunc } from './sidebar-panel-frame.js';
import { EmptyState, fleetStatusVisual, fmtShortDuration } from './sidebar-panels-shared.js';
import { fmtRatioPct } from './status-bar-format.js';

export interface FleetPanelSidebarProps {
  entries: Record<string, FleetEntry>;
  /**
   * Pre-computed running count from the caller. Retained for interface
   * compatibility; the panel derives every displayed count (pill + chips)
   * from `entries` so leader and subagents can never diverge.
   */
  runningCount: number;
  /** Live tick (ms) — drives per-agent elapsed labels. Defaults to Date.now(). */
  nowTick?: number | undefined;
  width: number;
}

export function FleetPanelSidebar({
  entries,
  nowTick,
  width,
}: FleetPanelSidebarProps): React.ReactElement {
  const inner = Math.max(8, width);
  // Card body content width — the Card adds 2 cols for `│` sides and 2 cols
  // for body padding on rails wide enough to afford the chrome (inner >= 18).
  // The SectionHeader / StatRow / WorklistRow dotted leaders size to this
  // inset width so they fill the available content area without overshooting
  // the right `│` bar.
  const bodyWidth = inner >= 18 ? inner - 4 : inner;
  const nowRef = nowTick ?? Date.now();
  const all = Object.values(entries);
  const leader = all.find((e) => e.id === 'leader');
  const subagents = all.filter((e) => e !== leader);
  const runningSubs = subagents.filter((e) => e.status === 'running');
  // Distribution counts include the leader — it renders as a row, so it must
  // be counted, or the chips and the pill would disagree (Chimera review).
  const leaderRunning = leader?.status === 'running' ? 1 : 0;
  const liveCount = runningSubs.length + leaderRunning;
  const idleCount =
    subagents.filter((e) => e.status === 'idle').length + (leader?.status === 'idle' ? 1 : 0);
  const doneCount =
    subagents.filter((e) => e.status === 'success').length + (leader?.status === 'success' ? 1 : 0);
  const failedCount =
    subagents.filter(
      (e) => e.status === 'failed' || e.status === 'timeout' || e.status === 'stopped',
    ).length +
    (leader?.status === 'failed' || leader?.status === 'timeout' || leader?.status === 'stopped'
      ? 1
      : 0);
  const rows = [...(leader ? [leader] : []), ...runningSubs].slice(0, 8);
  return (
    <SidebarPanelFrame
      accent={theme.monitor.fleet}
      icon={glyphs.fleet}
      title="AGENT SWARM"
      width={width}
      kicker="fleet"
      pillLabel={
        inner >= PILL_MIN_INNER_WIDTH ? (liveCount > 0 ? `${liveCount} LIVE` : 'IDLE') : undefined
      }
      pillColor={liveCount > 0 ? theme.success : theme.textMuted}
      right={
        inner < PILL_MIN_INNER_WIDTH ? (
          <Text color={liveCount > 0 ? theme.success : theme.textMuted} bold>
            {liveCount > 0 ? `${liveCount} LIVE` : 'IDLE'}
          </Text>
        ) : undefined
      }
    >
      {/* State distribution — the same chips row the bottom F2 monitor opens
          with, so the twin reads as the same panel at a glance. */}
      <SidebarCountsRow
        counts={[
          { label: glyphs.running, count: liveCount, color: theme.success },
          { label: glyphs.idle, count: idleCount, color: theme.textMuted },
          { label: glyphs.success, count: doneCount, color: theme.success },
          { label: glyphs.failure, count: failedCount, color: theme.error },
        ]}
        innerWidth={bodyWidth}
        marginTop={rows.length > 0 ? 1 : 0}
      />
      {rows.length === 0 ? (
        <EmptyState message="no active agents" innerWidth={bodyWidth} />
      ) : (
        rows.map((e) => {
          const v = fleetStatusVisual(e.status);
          const isLeader = e === leader;
          const showElapsed = inner >= METRIC_MIN_BODY_WIDTH && e.startedAt > 0;
          const elapsedLabel = showElapsed
            ? fmtShortDuration(Math.max(0, nowRef - e.startedAt))
            : '';
          // Reserve the label + a 1-col gutter so a long duration can never
          // consume the separator between name and elapsed (Chimera review).
          const name = trunc(
            e.name || e.id,
            Math.max(4, bodyWidth - 2 - (elapsedLabel ? displayWidth(elapsedLabel) + 2 : 0)),
          );
          // Second line pairs the live tool with the context-window load,
          // colored by pressure — the same telemetry the bottom monitor
          // shows per agent, packed into the narrow rail.
          const tool = e.currentTool?.name ?? 'idle';
          const ctxPct = e.ctxPct ?? 0;
          const showCtx = inner >= METRIC_MIN_BODY_WIDTH;
          const ctxLabel = showCtx ? fmtRatioPct(ctxPct) : '';
          const ctxColor =
            ctxPct >= 0.8 ? theme.error : ctxPct >= 0.6 ? theme.warn : theme.textMuted;
          return (
            <Box key={e.id} flexDirection="column" width={bodyWidth}>
              <Box flexDirection="row" width={bodyWidth}>
                <Text color={v.color}>{v.glyph}</Text>
                <Text
                  color={e.status === 'running' ? theme.textPrimary : theme.textSecondary}
                  bold={isLeader}
                  wrap="truncate"
                >
                  {' '}
                  {name}
                </Text>
                {elapsedLabel ? (
                  <>
                    <Box flexGrow={1} />
                    <Text color={theme.textMuted}>{elapsedLabel}</Text>
                  </>
                ) : null}
              </Box>
              <Box flexDirection="row" width={bodyWidth}>
                <Text color={theme.textMuted} wrap="truncate">
                  {'  '}
                  {trunc(tool, Math.max(3, bodyWidth - 4 - displayWidth(ctxLabel)))}
                </Text>
                {ctxLabel ? (
                  <>
                    <Box flexGrow={1} />
                    <Text color={ctxColor}>{ctxLabel}</Text>
                  </>
                ) : null}
              </Box>
            </Box>
          );
        })
      )}
    </SidebarPanelFrame>
  );
}
