import type React from 'react';
import type {
  SidebarWrongProxy,
  SidebarWrongProxyStatus,
} from '../hooks/use-sidebar-panel-data.js';
import { Box, Text } from '../ink.js';
import { displayWidth } from '../terminal-width.js';
import { theme } from '../theme.js';
import { METRIC_MIN_BODY_WIDTH, PILL_MIN_INNER_WIDTH } from '../ui-contracts.js';
import { glyphs } from '../ui-glyphs.js';
import { SidebarPanelFrame, SidebarStatRow, trunc } from './sidebar-panel-frame.js';

/**
 * Status pill + glyph mapping for the WrongProxy sidebar twin. Kept
 * local to this file (instead of as a module-level constant) because
 * it is only meaningful in this sidebar card and duplicates the
 * envelope of `ConnectionsPanelSidebar` only loosely.
 */
function wrongProxyVisual(status: SidebarWrongProxyStatus): {
  glyph: string;
  color: string;
  pill: string;
} {
  switch (status) {
    case 'ok':
      return { glyph: glyphs.success, color: theme.success, pill: 'LIVE' };
    case 'warn':
      return { glyph: glyphs.warning, color: theme.warn, pill: 'WARN' };
    case 'down':
      return { glyph: glyphs.failure, color: theme.error, pill: 'DOWN' };
    default:
      return { glyph: '?', color: theme.textMuted, pill: '?' };
  }
}

export interface WrongProxyPanelSidebarProps {
  /**
   * Live probe state. When `null` (URL missing or probe disabled) the
   * panel renders an idle placeholder inside the same frame so the
   * layout never jumps when the toggle flips on mid-session.
   */
  proxy: SidebarWrongProxy | null;
  width: number;
}

/**
 * Sidebar twin for the live WrongProxy / WrongTrace daemon. Renders the
 * proxy URL with its round-trip latency, the probe error detail when
 * warn/down, and — when the daemon's `/api/health` body exposes them —
 * the WrongTrace IPC socket path and daemon version.
 *
 * The panel is mounted only when `wrongProxyEnabled` is true at the
 * `app-view-sidebar.tsx` gate — see the `wrongProxyEnabled` usage there.
 * This component still defensively renders an empty-state when
 * `proxy === null` so a mount/unmount race during a toggle flip does
 * not flash an inconsistent card.
 */
export function WrongProxyPanelSidebar({
  proxy,
  width,
}: WrongProxyPanelSidebarProps): React.ReactElement {
  const inner = Math.max(8, width);
  // Mirror the body-width math used by every other sidebar twin on
  // this page: `Card` adds 2 cols for `│` sides and 2 cols for body
  // padding on rails wide enough to afford the chrome (>= 18), and
  // SectionHeader / StatRow dotted leaders size to that inset width.
  const bodyWidth = inner >= 18 ? inner - 4 : inner;
  const visual = proxy ? wrongProxyVisual(proxy.status) : wrongProxyVisual('unknown');
  const showLatency = inner >= METRIC_MIN_BODY_WIDTH;
  const latencyLabel = proxy?.latencyMs !== undefined ? `${proxy.latencyMs}ms` : '';
  const urlLabel = proxy?.url ?? '—';
  // Pre-truncate the IPC socket path so the StatRow dot-leader math
  // stays exact on narrow rails — `SidebarStatRow` assumes the caller
  // passes a value that fits (it only clamps the leader, not the value).
  // "· ipc " label + 3 (min leader + gap) reserve on the left.
  const ipcLabel = `${glyphs.dividerDot} ipc`;
  const ipcValue = proxy?.socketPath
    ? trunc(proxy.socketPath, Math.max(4, bodyWidth - displayWidth(ipcLabel) - 3))
    : null;
  const daemonLabel = `${glyphs.dividerDot} daemon`;
  const daemonValue = proxy?.version
    ? trunc(proxy.version, Math.max(4, bodyWidth - displayWidth(daemonLabel) - 3))
    : null;
  return (
    <SidebarPanelFrame
      accent={visual.color}
      icon={glyphs.link}
      title="WRONGPROXY"
      width={width}
      kicker="proxy daemon"
      pillLabel={inner >= PILL_MIN_INNER_WIDTH ? `${visual.glyph} ${visual.pill}` : undefined}
      pillColor={visual.color}
      right={
        inner < PILL_MIN_INNER_WIDTH ? (
          <Text color={visual.color} bold>
            {visual.glyph} {visual.pill}
          </Text>
        ) : undefined
      }
    >
      <Box flexDirection="row" width={bodyWidth}>
        <Text color={visual.color}>{visual.glyph}</Text>
        <Text color={theme.textPrimary} bold wrap="truncate">
          {' '}
          {trunc(
            urlLabel,
            Math.max(
              3,
              bodyWidth - (showLatency && latencyLabel ? displayWidth(latencyLabel) + 1 : 2),
            ),
          )}
        </Text>
        {showLatency && latencyLabel ? (
          <>
            <Box flexGrow={1} />
            <Text color={theme.textMuted}>{latencyLabel}</Text>
          </>
        ) : null}
      </Box>
      {proxy?.detail ? (
        <Text color={proxy.status === 'down' ? theme.error : theme.warn} wrap="truncate">
          {glyphs.warning} {trunc(proxy.detail, bodyWidth - 2)}
        </Text>
      ) : null}
      {/* WrongTrace IPC info — rendered only when the daemon reported a
          socket path / version, so an HTTP-only daemon keeps the card at
          its minimal height. */}
      {ipcValue ? (
        <SidebarStatRow
          label={ipcLabel}
          value={ipcValue}
          color={theme.textMuted}
          innerWidth={bodyWidth}
          valueMuted
        />
      ) : null}
      {daemonValue ? (
        <SidebarStatRow
          label={daemonLabel}
          value={daemonValue}
          color={theme.textPrimary}
          innerWidth={bodyWidth}
        />
      ) : null}
    </SidebarPanelFrame>
  );
}
