import type React from 'react';
import { Box, Text } from '../ink.js';
import { displayWidth } from '../terminal-width.js';
import { theme } from '../theme.js';
import { METRIC_MIN_BODY_WIDTH, PILL_MIN_INNER_WIDTH, type WorktreeRow } from '../ui-contracts.js';
import { glyphs } from '../ui-glyphs.js';
import { SidebarCountsRow, SidebarPanelFrame, trunc } from './sidebar-panel-frame.js';
import { EmptyState, fmtShortDuration } from './sidebar-panels-shared.js';

export interface WorktreePanelSidebarProps {
  worktrees: Record<string, WorktreeRow>;
  /** Live tick (ms) — drives per-worktree age labels. Defaults to Date.now(). */
  nowTick?: number | undefined;
  width: number;
}

function worktreeStatusVisual(status: string): { glyph: string; color: string } {
  switch (status) {
    case 'active':
      return { glyph: '•', color: theme.warn };
    case 'committing':
      return { glyph: '◐', color: theme.accent };
    case 'merging':
      return { glyph: '⇡', color: theme.brand };
    case 'merged':
      return { glyph: glyphs.success, color: theme.success };
    case 'needs-review':
      return { glyph: glyphs.warning, color: theme.brand };
    case 'failed':
      return { glyph: glyphs.failure, color: theme.error };
    default:
      return { glyph: '○', color: theme.textMuted };
  }
}

export function WorktreePanelSidebar({
  worktrees,
  nowTick,
  width,
}: WorktreePanelSidebarProps): React.ReactElement {
  const inner = Math.max(8, width);
  // Card body content width — the Card adds 2 cols for `│` sides and 2 cols
  // for body padding on rails wide enough to afford the chrome (inner >= 18).
  // The SectionHeader / StatRow / WorklistRow dotted leaders size to this
  // inset width so they fill the available content area without overshooting
  // the right `│` bar.
  const bodyWidth = inner >= 18 ? inner - 4 : inner;
  const nowRef = nowTick ?? Date.now();
  const list = Object.values(worktrees);
  const active = list.filter(
    (w) => w.status === 'active' || w.status === 'committing' || w.status === 'merging',
  ).length;
  const merged = list.filter((w) => w.status === 'merged').length;
  const failed = list.filter((w) => w.status === 'failed' || w.status === 'needs-review').length;
  return (
    <SidebarPanelFrame
      accent={theme.monitor.worktree}
      icon={glyphs.gitBranch}
      title="WORKTREES"
      width={width}
      kicker="isolation"
      pillLabel={
        inner >= PILL_MIN_INNER_WIDTH
          ? `${active} act ${glyphs.success}${merged}${failed > 0 ? ` !${failed}` : ''}`
          : undefined
      }
      pillColor={failed > 0 ? theme.error : active > 0 ? theme.warn : theme.textMuted}
      right={
        inner < PILL_MIN_INNER_WIDTH ? (
          <Text>
            <Text color={theme.warn}>A{active}</Text>
            <Text color={theme.textMuted}> </Text>
            <Text color={theme.success}>D{merged}</Text>
            {failed > 0 ? (
              <>
                <Text color={theme.textMuted}> </Text>
                <Text color={theme.error}>!{failed}</Text>
              </>
            ) : null}
          </Text>
        ) : undefined
      }
      footer="F4 details"
    >
      <SidebarCountsRow
        counts={[
          { label: glyphs.running, count: active, color: theme.warn },
          { label: glyphs.success, count: merged, color: theme.success },
          { label: glyphs.failure, count: failed, color: theme.error },
        ]}
        innerWidth={bodyWidth}
        marginTop={list.length > 0 ? 1 : 0}
      />
      {list.length === 0 ? (
        <EmptyState message="no worktrees" innerWidth={bodyWidth} />
      ) : (
        list.slice(0, 8).map((w) => {
          const v = worktreeStatusVisual(w.status);
          const diff = `+${w.insertions}/-${w.deletions}`;
          const showDiff = inner >= METRIC_MIN_BODY_WIDTH;
          const rowChrome = displayWidth(v.glyph) + 1;
          const diffWidth = showDiff ? displayWidth(diff) + 1 : 0;
          const branch = trunc(
            w.branch.replace(/^wstack\/ap\//, ''),
            Math.max(4, bodyWidth - rowChrome - diffWidth),
          );
          // Second line carries the worktree's isolation metadata — owner
          // label, touched-file count, and age — the same trio the F4
          // bottom monitor lists per worktree.
          const showMeta = inner >= METRIC_MIN_BODY_WIDTH;
          const metaParts = [
            w.ownerLabel || '',
            showMeta ? `${w.files}f` : '',
            showMeta && w.allocatedAt > 0
              ? fmtShortDuration(Math.max(0, nowRef - w.allocatedAt))
              : '',
          ].filter(Boolean);
          return (
            <Box key={w.branch} flexDirection="column" width={bodyWidth}>
              <Box flexDirection="row" width={bodyWidth}>
                <Text color={v.color}>{v.glyph}</Text>
                <Text color={theme.textPrimary}> </Text>
                <Text wrap="truncate">{branch}</Text>
                {showDiff ? (
                  <>
                    <Box flexGrow={1} />
                    <Text color={theme.textMuted}>{diff}</Text>
                  </>
                ) : null}
              </Box>
              {metaParts.length > 0 ? (
                <Text color={theme.textMuted} wrap="truncate">
                  {'  '}
                  {glyphs.treeLast} {trunc(metaParts.join(' · '), Math.max(3, bodyWidth - 4))}
                </Text>
              ) : null}
            </Box>
          );
        })
      )}
    </SidebarPanelFrame>
  );
}
