import { useCallback, useEffect, useRef, useState } from 'react';
import { executeConnectionAction, isRestartableService } from '../connection-actions.js';
import {
  type ConnectionHealthService,
  type ConnectionHealthServiceId,
  type ConnectionsHealthReport,
  collectConnectionsHealth,
} from '../connections-health.js';
import { useWindowedPicker } from '../hooks/use-windowed-picker.js';
import { Box, Text } from '../ink.js';
import { usePanelInput as useInput, usePanelShortcutsEnabled } from './monitor-shell.js';

/** Refresh interval for auto-updating service status. */
const REFRESH_MS = 8_000;

const STATUS_GLYPH: Record<ConnectionHealthService['status'], string> = {
  healthy: '●',
  degraded: '◐',
  offline: '○',
  unavailable: '⊘',
  error: '✗',
};

const STATUS_COLOR: Record<ConnectionHealthService['status'], string> = {
  healthy: 'green',
  degraded: 'yellow',
  offline: 'gray',
  unavailable: 'gray',
  error: 'red',
};

const OVERALL_COLOR: Record<ConnectionsHealthReport['overall'], string> = {
  healthy: 'green',
  degraded: 'yellow',
  error: 'red',
};

function formatUptime(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  const s = Math.floor(ms / 1_000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

function formatLatency(ms: number | undefined): string | null {
  if (ms === undefined) return null;
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  return `${(ms / 1_000).toFixed(1)}s`;
}

function ServiceRow({
  service,
  isSelected,
}: {
  service: ConnectionHealthService;
  isSelected: boolean;
}): React.ReactElement {
  const glyph = STATUS_GLYPH[service.status];
  const color = STATUS_COLOR[service.status];
  const latency = formatLatency(service.latencyMs);
  const restartable = isRestartableService(service.id);

  const metaParts: string[] = [];
  if (service.ownerPid !== undefined) metaParts.push(`PID ${service.ownerPid}`);
  if (service.clients !== undefined)
    metaParts.push(`${service.clients} client${service.clients === 1 ? '' : 's'}`);
  if (service.activeRequests !== undefined && service.activeRequests > 0) {
    metaParts.push(`${service.activeRequests} active`);
  }
  if (service.uptimeMs !== undefined) metaParts.push(`up ${formatUptime(service.uptimeMs)}`);
  if (latency) metaParts.push(`${latency}`);
  if (service.queuedWork !== undefined && service.queuedWork > 0) {
    metaParts.push(`${service.queuedWork} queued`);
  }

  return (
    <Box flexDirection="column" marginTop={0}>
      <Box gap={1}>
        <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
          {isSelected ? '› ' : '  '}
        </Text>
        <Text color={color}>{glyph}</Text>
        <Text bold inverse={isSelected}>
          {service.label}
        </Text>
        {service.required ? <Text dimColor>required</Text> : null}
        <Text dimColor>· {service.mode}</Text>
        {isSelected ? (
          restartable ? (
            <Text color="cyan"> [Enter: restart]</Text>
          ) : (
            <Text dimColor> [read-only]</Text>
          )
        ) : null}
      </Box>
      <Box marginLeft={4}>
        <Text dimColor>{service.detail}</Text>
      </Box>
      {metaParts.length > 0 ? (
        <Box marginLeft={4}>
          <Text dimColor>{metaParts.join(' · ')}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

interface ConnectionsPanelProps {
  projectRoot: string;
  onClose: () => void;
  maxRows?: number | undefined;
}

export function ConnectionsPanel({
  projectRoot,
  onClose,
  maxRows,
}: ConnectionsPanelProps): React.ReactElement {
  const [report, setReport] = useState<ConnectionsHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pendingAction, setPendingAction] = useState<{
    serviceId: ConnectionHealthServiceId;
    label: string;
  } | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [actionResult, setActionResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const cancelledRef = useRef(false);

  const fetch = useCallback(async () => {
    try {
      const r = await collectConnectionsHealth(projectRoot);
      if (cancelledRef.current) return;
      setReport(r);
      setError(null);
    } catch (e) {
      if (cancelledRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [projectRoot]);

  useEffect(() => {
    cancelledRef.current = false;
    void fetch();
    const timer = setInterval(() => void fetch(), REFRESH_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(timer);
    };
  }, [fetch]);

  const services = report?.services ?? [];
  const safeIndex = Math.min(selectedIndex, Math.max(0, services.length - 1));

  useEffect(() => {
    if (services.length > 0) {
      setSelectedIndex((idx) => Math.min(idx, services.length - 1));
    }
  }, [services.length]);

  const selected = services[safeIndex];

  const dynamicChrome =
    pendingAction != null ? 3 : actionResult != null || actionInProgress ? 1 : 0;
  const { start, end, hasAbove, hasBelow } = useWindowedPicker({
    total: services.length,
    selected: safeIndex,
    rowSpan: 3,
    chromeRows: 4 + dynamicChrome,
    markerRows: 2,
    maxRows,
    minVisible: 2,
  });
  const visibleServices = services.slice(start, end);

  const triggerRestart = useCallback(
    async (service: ConnectionHealthService) => {
      if (!isRestartableService(service.id)) {
        setActionResult({
          success: false,
          message: `${service.label} is read-only; restart is not supported.`,
        });
        return;
      }
      setActionInProgress(true);
      setActionResult(null);
      try {
        const res = await executeConnectionAction(service.id, 'restart', projectRoot);
        setActionResult({ success: res.success, message: res.message });
        await fetch();
      } catch (err) {
        setActionResult({
          success: false,
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setActionInProgress(false);
        setPendingAction(null);
      }
    },
    [projectRoot, fetch],
  );

  const shortcutsEnabled = usePanelShortcutsEnabled();
  useInput((input, key) => {
    if (key.ctrl || key.meta) return;
    if (!shortcutsEnabled) return;
    if (actionInProgress) return;

    if (pendingAction) {
      if (key.return || input.toLowerCase() === 'y') {
        const svc = services.find((s) => s.id === pendingAction.serviceId);
        if (svc) void triggerRestart(svc);
      } else if (input.toLowerCase() === 'n' || key.escape) {
        setPendingAction(null);
      }
      return;
    }

    if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      setActionResult(null);
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => Math.min(services.length - 1, prev + 1));
      setActionResult(null);
    } else if (key.pageUp) {
      setSelectedIndex((prev) => Math.max(0, prev - 3));
      setActionResult(null);
    } else if (key.pageDown) {
      setSelectedIndex((prev) => Math.min(services.length - 1, prev + 3));
      setActionResult(null);
    } else if (key.home) {
      setSelectedIndex(0);
      setActionResult(null);
    } else if (key.end) {
      setSelectedIndex(Math.max(0, services.length - 1));
      setActionResult(null);
    } else if ((key.return || input === 'x' || input === 's') && selected) {
      if (isRestartableService(selected.id)) {
        setPendingAction({ serviceId: selected.id, label: selected.label });
      } else {
        setActionResult({
          success: false,
          message: `${selected.label} is read-only; restart is not supported.`,
        });
      }
    } else if (input === 'r') {
      setActionResult(null);
      void fetch();
    } else if (input === 'q') {
      onClose();
    }
  });

  const overallLabel = report
    ? report.overall === 'healthy'
      ? 'All required services healthy'
      : report.overall === 'degraded'
        ? 'Some services degraded'
        : 'Service errors detected'
    : 'Checking…';

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={report ? OVERALL_COLOR[report.overall] : 'gray'}
      paddingX={1}
      marginY={0}
      flexShrink={0}
    >
      <Box justifyContent="space-between">
        <Box gap={1} flexShrink={0}>
          <Text bold wrap="truncate-end">
            Service Connections
          </Text>
          {report ? <Text color={OVERALL_COLOR[report.overall]}>● {overallLabel}</Text> : null}
        </Box>
        <Text dimColor>
          {pendingAction
            ? 'Confirm restart'
            : '↑/↓ select · Enter restart · r refresh · Esc/q close'}
        </Text>
      </Box>

      {loading && !report ? (
        <Box paddingY={1}>
          <Text dimColor>Checking service health…</Text>
        </Box>
      ) : null}

      {error ? (
        <Box paddingY={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      ) : null}

      {pendingAction ? (
        <Box
          borderStyle="single"
          borderColor="yellow"
          paddingX={1}
          marginY={0}
          justifyContent="space-between"
        >
          <Text color="yellow" bold>
            Restart {pendingAction.label}?
          </Text>
          <Box gap={1}>
            <Text color="green" bold>
              [y/Enter] Restart
            </Text>
            <Text dimColor>·</Text>
            <Text color="gray">[n/Esc] Cancel</Text>
          </Box>
        </Box>
      ) : null}

      {actionInProgress ? (
        <Box paddingX={1} marginY={0}>
          <Text color="cyan" bold>
            ⟳ Restarting service daemon…
          </Text>
        </Box>
      ) : null}

      {actionResult ? (
        <Box paddingX={1} marginY={0}>
          <Text color={actionResult.success ? 'green' : 'red'}>
            {actionResult.success ? '✓ ' : '✗ '}
            {actionResult.message}
          </Text>
        </Box>
      ) : null}

      {report ? (
        <Box flexDirection="column" marginTop={0}>
          {hasAbove ? <Text dimColor>{`  ↑ … ${start} more above`}</Text> : null}
          {visibleServices.map((s, idx) => {
            const actualIndex = start + idx;
            return <ServiceRow key={s.id} service={s} isSelected={actualIndex === safeIndex} />;
          })}
          {hasBelow ? <Text dimColor>{`  ↓ … ${services.length - end} more below`}</Text> : null}
        </Box>
      ) : null}

      {report ? (
        <Box justifyContent="space-between" marginTop={0}>
          <Text dimColor>
            {services.length > 0 && (hasAbove || hasBelow)
              ? `${safeIndex + 1}/${services.length} · `
              : ''}
            Last checked {new Date(report.checkedAt).toLocaleTimeString()}
          </Text>
          {selected ? (
            <Text dimColor>
              {selected.id} · {selected.mode}
            </Text>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
