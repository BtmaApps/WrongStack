import type React from 'react';
import { useWindowedPicker } from '../hooks/use-windowed-picker.js';
import { Box, Text } from '../ink.js';
import { theme } from '../theme.js';
import type { ResourceMenuItem, ResourceMenuSnapshot } from '../ui-contracts.js';
import { MonitorShell, MonitorViewportProvider } from './monitor-shell.js';

import { filterResourceMenuItems } from './resource-menu-model.js';

export { filterResourceMenuItems };

interface ResourceMenuProps {
  snapshot: ResourceMenuSnapshot;
  selected: number;
  hint?: string | undefined;
  confirming?: string | undefined;
  filter?: string | undefined;
  filtering?: boolean | undefined;
  columns?: number | undefined;
  maxRows?: number | undefined;
}

/** Reusable two-pane browser for operational state exposed by slash commands. */
export function ResourceMenu({
  snapshot,
  selected,
  hint,
  confirming,
  filter = '',
  filtering = false,
  columns = 0,
  maxRows,
}: ResourceMenuProps): React.ReactElement {
  const items = filterResourceMenuItems(snapshot, filter);
  const longest = items.reduce((value, item) => Math.max(value, Array.from(item.label).length), 0);
  const listWidth = Math.max(30, Math.min(54, longest + 9));
  const split = columns >= listWidth + 43 && items.length > 0;
  const { start, end, hasAbove, hasBelow } = useWindowedPicker({
    total: items.length,
    selected,
    chromeRows: 5,
    markerRows: 3,
    maxRows,
  });
  const safeSelected = Math.max(0, Math.min(selected, items.length - 1));
  const focused = items[safeSelected];
  const visible = items.slice(start, end);
  const nameWidth = Math.max(1, listWidth - 9);

  const list = (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.accent}
      paddingX={1}
      {...(split ? { width: listWidth, flexShrink: 0 } : {})}
    >
      <Text color={theme.accent} bold wrap="truncate-end">
        ━━ {snapshot.title} {filter ? `· ${items.length}/${snapshot.items.length}` : ''} ━━
      </Text>
      <Text color={theme.textMuted} wrap="truncate-end">
        {filtering ? `Esc clear · Enter done · filter: ${filter}` : 'Esc · ↑↓ · / · Enter action'}
      </Text>
      {hasAbove ? <Text color={theme.textMuted}> … {start} more above</Text> : null}
      {visible.map((item, offset) => {
        const index = start + offset;
        const active = index === safeSelected;
        const color = statusColor(item.status);
        return (
          <Text
            key={item.id}
            wrap="truncate-end"
            inverse={active}
            {...(active ? { color: theme.accent } : {})}
          >
            {active ? '› ' : '  '}
            <Text color={active ? undefined : color}>{statusGlyph(item.status)} </Text>
            <Text bold>{truncate(item.label, nameWidth).padEnd(nameWidth)}</Text>
            {!split && item.summary ? <Text dimColor> {truncate(item.summary, 48)}</Text> : null}
          </Text>
        );
      })}
      {hasBelow ? <Text color={theme.textMuted}> … {items.length - end} more below</Text> : null}
      {items.length === 0 ? (
        <Text color={theme.textMuted}>
          {filter ? `No matches for “${filter}”.` : (snapshot.emptyText ?? 'Nothing to show.')}
        </Text>
      ) : null}
      {focused?.actions?.length ? (
        <Text color={theme.textSecondary} wrap="truncate-end">
          {focused.actions.map((action) => `${action.key} ${action.label}`).join(' · ')}
        </Text>
      ) : null}
      {confirming ? (
        <Text color={theme.warn} wrap="truncate-end">
          y confirm · n cancel: {confirming}
        </Text>
      ) : null}
      {!confirming && hint ? (
        <Text color={theme.warn} wrap="truncate-end">
          {hint}
        </Text>
      ) : null}
    </Box>
  );

  if (!split || !focused) return list;
  return (
    <Box flexDirection="row">
      {list}
      <Box flexGrow={1} flexDirection="column">
        <MonitorViewportProvider value={{ columns: columns - listWidth, rows: maxRows ?? 16 }}>
          <ResourceDetail
            key={focused.id}
            item={focused}
            subtitle={snapshot.subtitle}
            maxRows={maxRows}
          />
        </MonitorViewportProvider>
      </Box>
    </Box>
  );
}

function ResourceDetail({
  item,
  subtitle,
  maxRows,
}: {
  item: ResourceMenuItem;
  subtitle?: string | undefined;
  maxRows?: number | undefined;
}): React.ReactElement {
  return (
    <MonitorShell
      accent={theme.accent}
      icon=""
      title={item.label}
      maxHeight={maxRows ?? 16}
      wheelScroll={false}
      footer={
        <Text color={theme.textMuted} wrap="truncate-end">
          Alt+PgUp/PgDn scroll
        </Text>
      }
    >
      {subtitle ? <Text color={theme.textMuted}>{subtitle}</Text> : null}
      {item.summary ? <Text wrap="wrap">{item.summary}</Text> : null}
      {item.details.map((detail) => (
        <Text key={`${detail.label}:${detail.value}`} wrap="truncate-end">
          <Text color={theme.textMuted}>{detail.label}: </Text>
          {detail.value}
        </Text>
      ))}
      {item.body ? (
        <>
          <Text> </Text>
          <Text wrap="wrap">{item.body}</Text>
        </>
      ) : null}
      {item.actions && item.actions.length > 0 ? (
        <>
          <Text> </Text>
          <Text color={theme.textMuted} wrap="wrap">
            {item.actions.map((action) => `${action.key} ${action.label}`).join(' · ')}
          </Text>
        </>
      ) : null}
    </MonitorShell>
  );
}

function statusGlyph(status: ResourceMenuItem['status']): string {
  if (status === 'good') return '●';
  if (status === 'warn') return '▲';
  if (status === 'bad') return '×';
  return '○';
}

function statusColor(status: ResourceMenuItem['status']): string {
  if (status === 'good') return theme.success;
  if (status === 'warn') return theme.warn;
  if (status === 'bad') return theme.error;
  return theme.textMuted;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}
