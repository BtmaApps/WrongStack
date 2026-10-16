import type React from 'react';
import type { ResumeSessionEntry } from '../app-state.js';
import { Box, Text } from '../ink.js';
import { displayWidth } from '../terminal-width.js';
import { theme } from '../theme.js';
import { METRIC_MIN_BODY_WIDTH, PILL_MIN_INNER_WIDTH } from '../ui-contracts.js';
import { glyphs } from '../ui-glyphs.js';
import type { LiveSessionEntry } from './sessions-panel.js';
import { isCurrentSession } from './sidebar-content.js';
import {
  SidebarCountsRow,
  SidebarPanelFrame,
  SidebarSectionHeader,
  trunc,
} from './sidebar-panel-frame.js';
import {
  EmptyState,
  fmtRelative,
  liveSessionColor,
  liveSessionGlyph,
  SidebarWorklistRow,
} from './sidebar-panels-shared.js';

export interface SessionsPanelSidebarProps {
  liveSessions?: readonly LiveSessionEntry[] | undefined;
  resumeSessions?: readonly ResumeSessionEntry[] | undefined;
  currentSessionId?: string | undefined;
  now?: number | undefined;
  width: number;
}

export function SessionsPanelSidebar({
  liveSessions,
  resumeSessions,
  currentSessionId,
  now,
  width,
}: SessionsPanelSidebarProps): React.ReactElement {
  const inner = Math.max(8, width);
  // Card body content width — the Card adds 2 cols for `│` sides and 2 cols
  // for body padding on rails wide enough to afford the chrome (inner >= 18).
  // The SectionHeader / StatRow / WorklistRow dotted leaders size to this
  // inset width so they fill the available content area without overshooting
  // the right `│` bar.
  const bodyWidth = inner >= 18 ? inner - 4 : inner;
  const nowRef = now ?? Date.now();
  const live = liveSessions?.slice(0, 3) ?? [];
  const resume = resumeSessions?.slice(0, 3) ?? [];
  const total = (liveSessions?.length ?? 0) + (resumeSessions?.length ?? 0);
  return (
    <SidebarPanelFrame
      accent={theme.success}
      icon={glyphs.sessions}
      title="SESSIONS"
      width={width}
      kicker="live + resume"
      pillLabel={inner >= PILL_MIN_INNER_WIDTH ? `${total}` : undefined}
      pillColor={total > 0 ? theme.success : theme.textMuted}
      right={
        inner < PILL_MIN_INNER_WIDTH ? (
          <Text color={total > 0 ? theme.success : theme.textMuted}>{total}</Text>
        ) : undefined
      }
      footer="F10 details"
    >
      <SidebarCountsRow
        counts={[
          { label: glyphs.bullet, count: liveSessions?.length ?? 0, color: theme.success },
          { label: glyphs.save, count: resumeSessions?.length ?? 0, color: theme.textMuted },
        ]}
        innerWidth={bodyWidth}
        marginTop={total > 0 ? 1 : 0}
      />
      {live.length > 0 ? (
        <>
          <SidebarSectionHeader
            glyph={glyphs.peers}
            label="LIVE"
            color={theme.success}
            badge={`${live.length}`}
            innerWidth={bodyWidth}
            pill
          />
          {live.map((s) => {
            const isCurrent = isCurrentSession(s.sessionId, currentSessionId);
            const icon = isCurrent ? glyphs.bullet : liveSessionGlyph(s.status);
            const color = liveSessionColor(s.status);
            const showAgentCount = inner >= METRIC_MIN_BODY_WIDTH;
            return (
              <Box key={s.sessionId} flexDirection="row" width={bodyWidth}>
                <Text color={color}>{icon}</Text>
                <Text
                  color={isCurrent ? theme.accent : theme.textPrimary}
                  bold={isCurrent}
                  wrap="truncate"
                >
                  {' '}
                  {trunc(s.projectName, Math.max(4, bodyWidth - (showAgentCount ? 6 : 2)))}
                </Text>
                {showAgentCount ? (
                  <>
                    <Box flexGrow={1} />
                    <Text color={theme.textMuted}>{s.agentCount}a</Text>
                  </>
                ) : null}
              </Box>
            );
          })}
        </>
      ) : null}
      {resume.length > 0 ? (
        <>
          <SidebarSectionHeader
            glyph={glyphs.save}
            label="RESUME"
            color={theme.textMuted}
            badge={`${resume.length}`}
            innerWidth={bodyWidth}
            pill
          />
          {resume.map((rs) => {
            const showRelativeTime = inner >= METRIC_MIN_BODY_WIDTH;
            const rel = showRelativeTime
              ? fmtRelative(rs.lastActivityAt ?? rs.endedAt, nowRef)
              : '';
            const title = trunc(
              rs.title || rs.lastUserMessage || rs.id,
              Math.max(4, bodyWidth - 2 - (showRelativeTime ? displayWidth(rel) + 1 : 0)),
            );
            const outcomeGlyph =
              rs.outcome === 'completed'
                ? glyphs.success
                : rs.outcome === 'error'
                  ? glyphs.failure
                  : rs.outcome === 'timeout'
                    ? '⏱'
                    : '⊘';
            const outcomeColor =
              rs.outcome === 'completed'
                ? theme.success
                : rs.outcome === 'error'
                  ? theme.error
                  : rs.outcome === 'timeout'
                    ? theme.warn
                    : theme.textMuted;
            const isCurrent = isCurrentSession(rs.id, currentSessionId, rs.isCurrent);
            return (
              <Box key={rs.id} flexDirection="row" width={bodyWidth}>
                <Text color={outcomeColor}>{outcomeGlyph}</Text>
                <Text
                  color={isCurrent ? theme.accent : theme.textSecondary}
                  bold={isCurrent}
                  wrap="truncate"
                >
                  {' '}
                  {title}
                </Text>
                {showRelativeTime ? (
                  <>
                    <Box flexGrow={1} />
                    <Text color={theme.textMuted}>{rel}</Text>
                  </>
                ) : null}
              </Box>
            );
          })}
        </>
      ) : null}
      {total === 0 ? <EmptyState message="no sessions" innerWidth={bodyWidth} /> : null}
    </SidebarPanelFrame>
  );
}

export interface KanbanPanelSidebarProps {
  columns: readonly { name: string; count: number; wip?: number }[];
  totalActive: number;
  activeCardTitles: readonly string[];
  width: number;
}

export function KanbanPanelSidebar({
  columns,
  totalActive,
  activeCardTitles,
  width,
}: KanbanPanelSidebarProps): React.ReactElement {
  const inner = Math.max(8, width);
  // Card body content width — the Card adds 2 cols for `│` sides and 2 cols
  // for body padding on rails wide enough to afford the chrome (inner >= 18).
  // The SectionHeader / StatRow / WorklistRow dotted leaders size to this
  // inset width so they fill the available content area without overshooting
  // the right `│` bar.
  const bodyWidth = inner >= 18 ? inner - 4 : inner;
  return (
    <SidebarPanelFrame
      accent={theme.accent}
      icon={glyphs.task}
      title="KANBAN"
      width={width}
      kicker="board"
      pillLabel={inner >= PILL_MIN_INNER_WIDTH ? `${totalActive} active` : undefined}
      pillColor={totalActive > 0 ? theme.warn : theme.textMuted}
      right={
        inner < PILL_MIN_INNER_WIDTH ? (
          <Text>
            <Text color={theme.success}>
              {glyphs.success}
              {columns.find((c) => c.name === 'done')?.count ?? 0}
            </Text>
            <Text color={theme.textMuted}> {totalActive}</Text>
          </Text>
        ) : undefined
      }
      footer="F12 details"
    >
      <SidebarSectionHeader
        glyph={glyphs.fleet}
        label="COLUMNS"
        color={theme.accent}
        badge={columns.some((c) => c.wip !== undefined && c.count > c.wip) ? 'WIP!' : undefined}
        badgeColor={theme.error}
        innerWidth={bodyWidth}
        pill
      />
      {columns.slice(0, 6).map((c, i) => {
        // WIP-limit aware: `count/wip` with the limit breached in the alert
        // color — the same at-a-glance overload signal the bottom F12 board
        // marks per column.
        const overWip = c.wip !== undefined && c.count > c.wip;
        return (
          <Box key={i} flexDirection="row" width={bodyWidth}>
            <Text color={overWip ? theme.error : theme.textSecondary} wrap="truncate">
              {trunc(c.name, Math.max(4, bodyWidth - 8))}
            </Text>
            <Box flexGrow={1} />
            <Text color={overWip ? theme.error : theme.textMuted}>
              {c.count}
              {c.wip !== undefined ? `/${c.wip}` : ''}
            </Text>
          </Box>
        );
      })}
      <SidebarSectionHeader
        glyph={glyphs.running}
        label="ACTIVE"
        color={theme.warn}
        innerWidth={bodyWidth}
        pill
      />
      {activeCardTitles.length === 0 ? (
        <EmptyState message="no active cards" innerWidth={bodyWidth} />
      ) : (
        activeCardTitles.slice(0, 6).map((title, i) => {
          const icon = i === 0 ? glyphs.pending : glyphs.warning;
          const iconColor = i === 0 ? theme.textMuted : theme.warn;
          const label = i === 0 ? title : `${i + 1}. ${title}`;
          return (
            <SidebarWorklistRow
              key={i}
              icon={icon}
              iconColor={iconColor}
              label={label}
              labelColor={theme.textPrimary}
              innerWidth={bodyWidth}
            />
          );
        })
      )}
    </SidebarPanelFrame>
  );
}
