import type { ConnectionHealthServiceId, ConnectionHealthStatus } from '../connections-health.js';
import { useActiveTheme } from '../hooks/use-active-theme.js';
import type { SidebarConnection } from '../hooks/use-sidebar-panel-data.js';
import { Box, Text } from '../ink.js';
import { theme } from '../theme.js';
import { glyphs } from '../ui-glyphs.js';

const SERVICES: readonly [ConnectionHealthServiceId, keyof typeof glyphs][] = [
  ['session-catalog', 'sessions'],
  ['chronicle', 'clock'],
  ['codebase-index', 'index'],
  ['sage', 'brain'],
  ['kanban', 'task'],
  ['mailbox', 'mail'],
  ['governance', 'audit'],
];

export function ipcStatusColor(status: ConnectionHealthStatus | undefined): string {
  switch (status) {
    case 'healthy':
      return theme.success;
    case 'degraded':
      return theme.warn;
    case 'error':
      return theme.error;
    default:
      return theme.textMuted;
  }
}

/** Stable service order, icon-only, using the same health readings as Connections. */
export function SidebarIpcIcons({
  connections,
  width,
}: {
  connections: readonly SidebarConnection[];
  width: number;
}): React.ReactElement {
  useActiveTheme();
  return (
    <Box width={width} height={1} justifyContent="center" overflowX="hidden">
      {SERVICES.map(([id, icon], index) => (
        <Text
          key={id}
          color={ipcStatusColor(connections.find((service) => service.id === id)?.healthStatus)}
        >
          {index > 0 ? ' ' : ''}
          {glyphs[icon].trim()}
        </Text>
      ))}
    </Box>
  );
}
