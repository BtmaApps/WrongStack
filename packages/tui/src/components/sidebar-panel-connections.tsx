import type React from 'react';
import { Box, Text } from '../ink.js';
import { displayWidth } from '../terminal-width.js';
import { theme } from '../theme.js';
import { METRIC_MIN_BODY_WIDTH, PILL_MIN_INNER_WIDTH } from '../ui-contracts.js';
import { glyphs } from '../ui-glyphs.js';
import {
  SidebarCountsRow,
  SidebarMeter,
  SidebarPanelFrame,
  SidebarSectionHeader,
  trunc,
} from './sidebar-panel-frame.js';
import { EmptyState } from './sidebar-panels-shared.js';

export interface ConnectionsPanelSidebarProps {
  connections: readonly {
    name: string;
    status: 'ok' | 'warn' | 'down' | 'unknown';
    latencyMs?: number | undefined;
  }[];
  width: number;
}

export function ConnectionsPanelSidebar({
  connections,
  width,
}: ConnectionsPanelSidebarProps): React.ReactElement {
  const inner = Math.max(8, width);
  // Card body content width — the Card adds 2 cols for `│` sides and 2 cols
  // for body padding on rails wide enough to afford the chrome (inner >= 18).
  // The SectionHeader / StatRow / WorklistRow dotted leaders size to this
  // inset width so they fill the available content area without overshooting
  // the right `│` bar.
  const bodyWidth = inner >= 18 ? inner - 4 : inner;
  const okCount = connections.filter((c) => c.status === 'ok').length;
  const warnCount = connections.filter((c) => c.status === 'warn').length;
  const downCount = connections.filter((c) => c.status === 'down').length;
  return (
    <SidebarPanelFrame
      accent={theme.brand}
      icon={glyphs.tools}
      title="CONNECTIONS"
      width={width}
      kicker="signal matrix"
      pillLabel={
        inner >= PILL_MIN_INNER_WIDTH
          ? downCount > 0
            ? `${downCount} DOWN`
            : warnCount > 0
              ? `${warnCount} WARN`
              : `${okCount} OK`
          : undefined
      }
      pillColor={downCount > 0 ? theme.error : warnCount > 0 ? theme.warn : theme.success}
      right={
        inner < PILL_MIN_INNER_WIDTH ? (
          <Text
            color={downCount > 0 ? theme.error : warnCount > 0 ? theme.warn : theme.success}
            bold
          >
            {downCount > 0
              ? `${downCount} DOWN`
              : warnCount > 0
                ? `${warnCount} WARN`
                : `${okCount} OK`}
          </Text>
        ) : undefined
      }
    >
      <SidebarSectionHeader
        glyph={glyphs.tools}
        label="SIGNAL MATRIX"
        color={theme.brand}
        badge={`${okCount}/${connections.length || 1}`}
        innerWidth={bodyWidth}
        pill
      />
      <SidebarCountsRow
        counts={[
          { label: glyphs.success, count: okCount, color: theme.success },
          { label: glyphs.warning, count: warnCount, color: theme.warn },
          { label: glyphs.failure, count: downCount, color: theme.error },
        ]}
        innerWidth={bodyWidth}
        marginTop={1}
      />
      <SidebarMeter
        ratio={okCount / Math.max(1, connections.length || 1)}
        innerWidth={bodyWidth}
        color={theme.success}
      />
      {connections.length === 0 ? (
        <EmptyState message="scanning for links…" innerWidth={bodyWidth} variant="scanning" />
      ) : (
        connections.slice(0, 10).map((c, i) => {
          const icon =
            c.status === 'ok'
              ? glyphs.success
              : c.status === 'warn'
                ? glyphs.warning
                : c.status === 'down'
                  ? glyphs.failure
                  : '?';
          const color =
            c.status === 'ok'
              ? theme.success
              : c.status === 'warn'
                ? theme.warn
                : c.status === 'down'
                  ? theme.error
                  : theme.textMuted;
          const showLatency = inner >= METRIC_MIN_BODY_WIDTH;
          const lat = showLatency && c.latencyMs != null ? `${c.latencyMs}ms` : '';
          const lane = c.status === 'ok' ? '━━' : c.status === 'warn' ? '┅┅' : '··';
          const rowChrome = displayWidth(icon) + displayWidth(lane);
          return (
            <Box key={`${c.name}-${i}`} flexDirection="row" width={bodyWidth}>
              <Text color={color}>
                {icon}
                {lane}
              </Text>
              <Text color={theme.textPrimary} bold={c.status === 'ok'} wrap="truncate">
                {trunc(
                  c.name,
                  Math.max(3, bodyWidth - rowChrome - (lat ? displayWidth(lat) + 1 : 0)),
                )}
              </Text>
              {lat ? (
                <>
                  <Box flexGrow={1} />
                  <Text color={color}>{lat}</Text>
                </>
              ) : null}
            </Box>
          );
        })
      )}
    </SidebarPanelFrame>
  );
}
