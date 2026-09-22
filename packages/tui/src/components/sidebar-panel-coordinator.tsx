import type React from 'react';
import { Text } from '../ink.js';
import { theme } from '../theme.js';
import { PILL_MIN_INNER_WIDTH } from '../ui-contracts.js';
import { glyphs } from '../ui-glyphs.js';
import { SidebarMeter, SidebarPanelFrame, SidebarSectionHeader } from './sidebar-panel-frame.js';
import { EmptyState, fmtShortDuration, SidebarWorklistRow } from './sidebar-panels-shared.js';

export interface CoordinatorPanelSidebarProps {
  running: boolean;
  activePhases: number;
  completedPhases: number;
  phaseNames: readonly string[];
  elapsedMs: number;
  width: number;
}

export function CoordinatorPanelSidebar({
  running,
  activePhases,
  completedPhases,
  phaseNames,
  elapsedMs,
  width,
}: CoordinatorPanelSidebarProps): React.ReactElement {
  const inner = Math.max(8, width);
  // Card body content width — the Card adds 2 cols for `│` sides and 2 cols
  // for body padding on rails wide enough to afford the chrome (inner >= 18).
  // The SectionHeader / StatRow / WorklistRow dotted leaders size to this
  // inset width so they fill the available content area without overshooting
  // the right `│` bar.
  const bodyWidth = inner >= 18 ? inner - 4 : inner;
  return (
    <SidebarPanelFrame
      accent={theme.brand}
      icon={glyphs.auto}
      title="COORDINATOR"
      width={width}
      kicker="phases"
      pillLabel={
        inner >= PILL_MIN_INNER_WIDTH ? (running ? `${activePhases} active` : 'idle') : undefined
      }
      pillColor={running ? theme.warn : theme.textMuted}
      right={
        inner < PILL_MIN_INNER_WIDTH ? (
          <Text color={running ? theme.warn : theme.textMuted} bold>
            {running ? `${activePhases} active` : 'idle'}
          </Text>
        ) : undefined
      }
      footer={`F11 details ${glyphs.dividerDiamond} ${fmtShortDuration(elapsedMs)}`}
    >
      <SidebarSectionHeader
        glyph={glyphs.plan}
        label="PHASES"
        color={theme.brand}
        badge={`${completedPhases}/${phaseNames.length || completedPhases}`}
        innerWidth={bodyWidth}
        pill
      />
      {phaseNames.length > 0 ? (
        <SidebarMeter
          ratio={completedPhases / Math.max(1, phaseNames.length)}
          innerWidth={bodyWidth}
          color={completedPhases >= phaseNames.length ? theme.success : theme.brand}
        />
      ) : null}
      {phaseNames.length === 0 ? (
        <EmptyState message="no active phases" innerWidth={bodyWidth} />
      ) : (
        phaseNames.slice(0, 10).map((name, i) => {
          const isDone = i < completedPhases;
          const isActive = i === completedPhases && running;
          const icon = isDone ? glyphs.success : isActive ? glyphs.running : glyphs.pending;
          const color = isDone ? theme.success : isActive ? theme.warn : theme.textMuted;
          return (
            <SidebarWorklistRow
              key={name}
              icon={icon}
              iconColor={color}
              label={name}
              labelColor={isDone ? theme.textMuted : theme.textPrimary}
              innerWidth={bodyWidth}
              dim={isDone}
              strikethrough={isDone}
            />
          );
        })
      )}
    </SidebarPanelFrame>
  );
}
