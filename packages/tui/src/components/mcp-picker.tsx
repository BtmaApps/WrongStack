import type React from 'react';
import { useTerminalSize } from '../hooks/use-terminal-size.js';
import { useWindowedPicker } from '../hooks/use-windowed-picker.js';
import { Box, Text } from '../ink.js';
import type { McpPickerEditor } from '../ui-contracts.js';

export interface McpPickerItem {
  name: string;
  enabled: boolean;
  status: string;
  transport: string;
  description?: string | undefined;
  toolCount: number;
  lazy?: boolean | undefined;
  command?: string | undefined;
  url?: string | undefined;
  args?: string[] | undefined;
}

interface McpPickerProps {
  maxRows?: number | undefined;
  columns?: number | undefined;
  items: McpPickerItem[];
  selected: number;
  busy?: boolean | undefined;
  hint?: string | undefined;
  editor?: McpPickerEditor | undefined;
}

/** Colourise an MCP connection status string. */
function statusBadge(status: string, enabled: boolean): React.ReactElement {
  if (!enabled) return <Text dimColor>○ disabled</Text>;
  switch (status) {
    case 'connected':
      return <Text color="green">● connected</Text>;
    case 'connecting':
      return <Text color="cyan">◐ connecting</Text>;
    case 'reconnecting':
      return <Text color="cyan">◑ reconnecting</Text>;
    case 'disconnected':
      return <Text dimColor>○ disconnected</Text>;
    case 'failed':
      return <Text color="red">✗ failed</Text>;
    default:
      return <Text dimColor>{status}</Text>;
  }
}

export function McpPicker({
  items,
  selected,
  busy = false,
  hint,
  maxRows,
  columns,
  editor,
}: McpPickerProps): React.ReactElement {
  const size = useTerminalSize();
  const budget = maxRows ?? Math.max(8, size.rows - 6);
  const compact = budget < 12;

  // Height-aware scrolling window centred on the selection.
  const total = items.length;
  const { start: windowStart, end: windowEnd } = useWindowedPicker({
    total,
    selected,
    maxRows: budget,
    chromeRows: 4 + (compact ? 0 : 1) + (hint ? (compact ? 1 : 2) : 0),
    markerRows: 2,
  });
  const above = windowStart;
  const below = total - windowEnd;

  if (editor) {
    const fields = [
      ['Name', editor.name],
      ['Transport (stdio / streamable-http / sse)', editor.transport],
      [
        editor.transport === 'stdio' || !editor.transport ? 'Command (empty for preset)' : 'URL',
        editor.target,
      ],
      ['Arguments (JSON array)', editor.args],
    ];
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">
          {editor.mode === 'remove'
            ? 'Remove MCP server'
            : editor.mode === 'add'
              ? 'Add MCP server'
              : 'Edit MCP server'}
        </Text>
        {editor.mode === 'remove' ? (
          <Text>Remove "{editor.name}" from config? y confirm · n/Esc cancel</Text>
        ) : (
          <>
            <Text dimColor wrap="truncate-end">
              Tab fields · Enter save · Ctrl+U clear · Esc cancel
            </Text>
            {fields.map(([label, value], index) =>
              !compact || editor.field === index ? (
                <Text
                  key={label}
                  color={editor.field === index ? 'cyan' : undefined}
                  wrap="truncate-end"
                >
                  {editor.field === index ? '›' : ' '} {label}: {value}
                  {editor.field === index ? '▌' : ''}
                </Text>
              ) : null,
            )}
            {!compact ? (
              <Text dimColor wrap="truncate-end">
                New servers start disabled; Enter on the server row enables them.
              </Text>
            ) : null}
          </>
        )}
        {hint ? (
          <Text color="yellow" wrap="truncate-end">
            {hint}
          </Text>
        ) : null}
        {busy ? <Text dimColor>Saving…</Text> : null}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">
        MCP Servers
      </Text>
      <Text dimColor wrap="truncate-end">
        {(columns ?? size.columns) < 70
          ? 'a add · e edit · d del · Enter on/off · r restart · Esc'
          : '↑/↓ select · a add · e edit · d remove · Enter toggle · r restart · Esc close'}
      </Text>
      <Box marginTop={compact ? 0 : 1} flexDirection="column">
        {items.length === 0 ? (
          <Text dimColor>{busy ? 'Loading servers…' : 'No MCP servers configured.'}</Text>
        ) : (
          <>
            {above > 0 ? <Text dimColor>{`  ↑ ${above} more`}</Text> : null}
            {items.slice(windowStart, windowEnd).map((item, i) => {
              const index = windowStart + i;
              const focused = index === selected;
              const marker = focused ? '›' : ' ';
              return (
                <Text key={item.name} color={focused ? 'cyan' : undefined} wrap="truncate-end">
                  {marker} {statusBadge(item.status, item.enabled)}{' '}
                  <Text bold>{item.name.padEnd(18)}</Text>
                  <Text dimColor>
                    {item.transport.padEnd(14)}
                    {item.toolCount > 0 ? `${item.toolCount} tools` : ''}
                    {item.lazy ? ' lazy' : ''}
                  </Text>
                </Text>
              );
            })}
            {below > 0 ? <Text dimColor>{`  ↓ ${below} more`}</Text> : null}
          </>
        )}
      </Box>
      {hint ? (
        <Box marginTop={compact ? 0 : 1}>
          <Text dimColor wrap="truncate-end">
            {hint}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}
