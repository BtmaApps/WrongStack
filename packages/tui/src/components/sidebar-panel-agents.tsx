import type React from 'react';
import type { FleetEntry } from '../app-state.js';
import { Box, Text } from '../ink.js';
import { displayWidth } from '../terminal-width.js';
import { theme } from '../theme.js';
import { METRIC_MIN_BODY_WIDTH, PILL_MIN_INNER_WIDTH } from '../ui-contracts.js';
import { glyphs } from '../ui-glyphs.js';
import {
  SidebarMeter,
  SidebarPanelFrame,
  SidebarSectionHeader,
  trunc,
} from './sidebar-panel-frame.js';
import { EmptyState, fleetStatusVisual, fmtShortDuration } from './sidebar-panels-shared.js';
import { fmtRatioPct } from './status-bar-format.js';

export interface AgentsPanelSidebarProps {
  entries: Record<string, FleetEntry>;
  totalCost: number;
  nowTick: number;
  width: number;
}

export function AgentsPanelSidebar({
  entries,
  totalCost,
  nowTick,
  width,
}: AgentsPanelSidebarProps): React.ReactElement {
  const inner = Math.max(8, width);
  // Card body content width — the Card adds 2 cols for `│` sides and 2 cols
  // for body padding on rails wide enough to afford the chrome (inner >= 18).
  // The SectionHeader / StatRow / WorklistRow dotted leaders size to this
  // inset width so they fill the available content area without overshooting
  // the right `│` bar.
  const bodyWidth = inner >= 18 ? inner - 4 : inner;
  const all = Object.values(entries);
  const running = all.filter((e) => e.status === 'running');
  const done = all.filter((e) => e.status === 'success');
  const failed = all.filter((e) => e.status === 'failed' || e.status === 'timeout');
  const hotAgent = [...running].sort((a, b) => (b.ctxPct ?? 0) - (a.ctxPct ?? 0))[0];
  const live = running.slice(0, 10);
  return (
    <SidebarPanelFrame
      accent={theme.monitor.agents}
      icon={glyphs.peers}
      title="AGENTS"
      width={width}
      kicker="live ops"
      pillLabel={
        inner >= PILL_MIN_INNER_WIDTH
          ? `${running.length}${done.length > 0 ? ` ${glyphs.success}${done.length}` : ''}${
              failed.length > 0 ? ` !${failed.length}` : ''
            }`
          : undefined
      }
      pillColor={
        failed.length > 0 ? theme.error : running.length > 0 ? theme.success : theme.textMuted
      }
      right={
        inner < PILL_MIN_INNER_WIDTH ? (
          <Text>
            <Text color={theme.warn}>{running.length}</Text>
            <Text color={theme.textMuted}> </Text>
            <Text color={theme.success}>{done.length}</Text>
            {failed.length > 0 ? (
              <>
                <Text color={theme.textMuted}> </Text>
                <Text color={theme.error}>{failed.length}</Text>
              </>
            ) : null}
          </Text>
        ) : undefined
      }
      footer={`F3 details ${glyphs.dividerDiamond} $${totalCost.toFixed(4)}`}
    >
      {hotAgent ? (
        <>
          <SidebarSectionHeader
            glyph={glyphs.warning}
            label="HOTTEST"
            color={theme.warn}
            innerWidth={bodyWidth}
          />
          <Text color={theme.textPrimary} wrap="truncate" bold>
            {trunc(hotAgent.name || hotAgent.id, bodyWidth - 2)}
          </Text>
          <Text color={theme.textMuted} wrap="truncate">
            {trunc(
              `ctx ${fmtRatioPct(hotAgent.ctxPct ?? 0)} ${glyphs.dividerDiamond} ${hotAgent.currentTool?.name ?? 'idle'}`,
              bodyWidth,
            )}
          </Text>
          {hotAgent.ctxPct !== undefined && hotAgent.ctxPct > 0 ? (
            <SidebarMeter
              ratio={hotAgent.ctxPct}
              innerWidth={bodyWidth}
              color={hotAgent.ctxPct >= 0.8 ? theme.error : theme.warn}
              marginTop={0}
            />
          ) : null}
        </>
      ) : (
        <EmptyState message="no live agents" innerWidth={bodyWidth} />
      )}
      <SidebarSectionHeader
        glyph={glyphs.fleet}
        label="RUNNING"
        color={theme.monitor.agents}
        badge={`${running.length}`}
        badgeColor={theme.success}
        innerWidth={bodyWidth}
        pill
      />
      {live.map((e) => {
        const v = fleetStatusVisual(e.status);
        const elapsed = nowTick - e.startedAt;
        const showElapsed = inner >= METRIC_MIN_BODY_WIDTH;
        const elapsedLabel = showElapsed ? fmtShortDuration(elapsed) : '';
        const name = trunc(
          e.name || e.id,
          Math.max(4, bodyWidth - 2 - (showElapsed ? displayWidth(elapsedLabel) + 1 : 0)),
        );
        // Second line pairs the live tool with the context-window load,
        // colored by pressure — mirrors the F3 bottom monitor's per-agent
        // telemetry rows on the narrow rail.
        const tool = e.currentTool?.name ?? 'idle';
        const ctxPct = e.ctxPct ?? 0;
        const ctxLabel = showElapsed ? fmtRatioPct(ctxPct) : '';
        const ctxColor = ctxPct >= 0.8 ? theme.error : ctxPct >= 0.6 ? theme.warn : theme.textMuted;
        return (
          <Box key={e.id} flexDirection="column" width={bodyWidth}>
            <Box flexDirection="row" width={bodyWidth}>
              <Text color={v.color}>{v.glyph}</Text>
              <Text color={theme.textPrimary}> </Text>
              <Text wrap="truncate">{name}</Text>
              {showElapsed ? (
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
      })}
    </SidebarPanelFrame>
  );
}
