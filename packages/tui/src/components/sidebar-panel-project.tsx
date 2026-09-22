import type React from 'react';
import { Box, Text } from '../ink.js';
import { theme } from '../theme.js';
import { PILL_MIN_INNER_WIDTH } from '../ui-contracts.js';
import { glyphs } from '../ui-glyphs.js';
import type { ProjectPickerItem } from './project-picker.js';
import { SidebarPanelFrame, SidebarSectionHeader, trunc } from './sidebar-panel-frame.js';
import { EmptyState } from './sidebar-panels-shared.js';

export interface ProjectPickerSidebarProps {
  items: readonly ProjectPickerItem[];
  selected: number;
  filter: string;
  hint?: string | undefined;
  currentProject?: string | undefined;
  width: number;
}

export function ProjectPickerSidebar({
  items,
  selected,
  filter,
  hint,
  currentProject,
  width,
}: ProjectPickerSidebarProps): React.ReactElement {
  const inner = Math.max(8, width);
  // Card body content width — the Card adds 2 cols for `│` sides and 2 cols
  // for body padding on rails wide enough to afford the chrome (inner >= 18).
  // The SectionHeader / StatRow / WorklistRow dotted leaders size to this
  // inset width so they fill the available content area without overshooting
  // the right `│` bar.
  const bodyWidth = inner >= 18 ? inner - 4 : inner;
  const projectCount = items.filter((item) => item.kind === 'project').length;
  const selectableCount = items.filter((item) => item.key !== '__divider__').length;
  const start = Math.max(0, Math.min(selected - 2, Math.max(0, items.length - 5)));
  const visible = items.slice(start, start + 5);
  return (
    <SidebarPanelFrame
      accent={theme.brand}
      icon={glyphs.folder}
      title="PROJECT"
      width={width}
      kicker={filter ? trunc(filter, 20) : 'switcher'}
      pillLabel={inner >= PILL_MIN_INNER_WIDTH ? `${projectCount} projects` : undefined}
      pillColor={projectCount > 0 ? theme.brand : theme.textMuted}
      right={
        inner < PILL_MIN_INNER_WIDTH ? (
          <Text color={theme.textMuted}>{projectCount} projects</Text>
        ) : undefined
      }
      footer="↑↓ select · Enter open"
    >
      <SidebarSectionHeader
        glyph={glyphs.folder}
        label="CURRENT"
        color={theme.brand}
        badge={`${selectableCount} choices`}
        innerWidth={bodyWidth}
        pill
      />
      {currentProject ? (
        <Text color={theme.textPrimary} bold wrap="truncate">
          {trunc(currentProject, bodyWidth - 2)}
        </Text>
      ) : (
        <Text color={theme.textMuted}>—</Text>
      )}
      <SidebarSectionHeader
        glyph={glyphs.folder}
        label="CHOICES"
        color={theme.textMuted}
        badge={start > 0 || start + visible.length < items.length ? '↑↓' : undefined}
        innerWidth={bodyWidth}
        pill
      />
      {visible.length === 0 ? (
        <EmptyState message="no matching projects" innerWidth={bodyWidth} />
      ) : (
        visible.map((item, offset) => {
          const index = start + offset;
          const isSelected = index === selected;
          if (item.key === '__divider__') {
            return (
              <Text key={`${item.key}-${index}`} color={theme.textMuted}>
                {'─'.repeat(bodyWidth)}
              </Text>
            );
          }
          const icon = item.kind === 'project' ? glyphs.folder : glyphs.task;
          const accent = item.kind === 'project' ? theme.brand : theme.warn;
          return (
            <Box key={item.key} flexDirection="column" width={bodyWidth}>
              <Box flexDirection="row" width={bodyWidth}>
                <Text color={isSelected ? accent : theme.textMuted}>
                  {isSelected ? glyphs.railMid : ' '}
                </Text>
                <Text color={accent}> {icon} </Text>
                <Text
                  color={isSelected ? theme.textPrimary : theme.textSecondary}
                  bold={isSelected}
                  wrap="truncate"
                >
                  {trunc(item.label, Math.max(4, bodyWidth - 6))}
                </Text>
              </Box>
              {item.subtitle ? (
                <Text color={theme.textMuted} wrap="truncate">
                  {' '}
                  {glyphs.treeLast} {trunc(item.subtitle, Math.max(4, bodyWidth - 4))}
                </Text>
              ) : null}
            </Box>
          );
        })
      )}
      {hint ? (
        <Text color={theme.warn} wrap="truncate">
          {glyphs.warning} {trunc(hint, bodyWidth - 2)}
        </Text>
      ) : null}
    </SidebarPanelFrame>
  );
}
