/**
 * BackgroundShellStrip — this tab's background shells, above the composer.
 *
 * `bash` with `background: true` (and `pwsh` with `run_in_background`) leaves
 * a process running after the tool returns, and its output goes to a log file
 * (tools background-log.ts). The strip shows one chip per such process, with
 * how long it has run; a chip opens the last lines of its output, refreshed
 * while open, and a Stop button. Subagents are not repeated here: AgentTabs
 * above the transcript already lists them with live status.
 *
 * No steady polling: the list is asked for when the tab connects and after
 * every shell tool call, and re-asked every few seconds only while a
 * background shell is running.
 */

import { ChevronDown, ChevronUp, Square, Terminal } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAppTranslation } from '@/i18n';
import { agentBelongsToSession } from '@/lib/agent-session';
import { cn } from '@/lib/utils';
import { useActiveSessionId, useConfigStore } from '@/stores';
import { confirmModal } from '../ConfirmModal';

const LIST_POLL_MS = 3000;
const OUTPUT_POLL_MS = 1500;
const OUTPUT_LINES = 12;
/** `tool_use` can run a shell too. */
const SHELL_TOOLS = new Set(['bash', 'pwsh', 'tool_use']);

interface BackgroundShell {
  pid: number;
  command: string;
  startedAt: number;
  hasOutput: boolean;
}

interface ListedProcess {
  pid: number;
  command: string;
  startedAt: number;
  status: 'running' | 'exited' | 'killed';
  background?: boolean | undefined;
  hasOutput?: boolean | undefined;
}

/** Running background shells out of a `process.list` reply, oldest first. */
function backgroundShellsOf(processes: readonly ListedProcess[]): BackgroundShell[] {
  return processes
    .filter((p) => p.background === true && p.status === 'running')
    .map((p) => ({
      pid: p.pid,
      command: p.command.replace(/\s+/g, ' ').trim(),
      startedAt: p.startedAt,
      hasOutput: p.hasOutput === true,
    }))
    .sort((a, b) => a.startedAt - b.startedAt);
}

/** `12s`, `3m`, `1h4m`. */
function formatShellAge(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h}h` : `${h}h${m % 60}m`;
}

interface OutputState {
  pid: number;
  lines: string[];
  gone: boolean;
}

export function BackgroundShellStrip(): React.ReactElement | null {
  const { t } = useAppTranslation();
  const ws = useWebSocket();
  const sessionId = useActiveSessionId();
  const wsConnected = useConfigStore((s) => s.wsConnected);
  const [shells, setShells] = useState<BackgroundShell[]>([]);
  const [openPid, setOpenPid] = useState<number | undefined>();
  const [output, setOutput] = useState<OutputState | undefined>();

  const requestList = useCallback(() => {
    const payload = ws.client.withSession?.({}) ?? (sessionId ? { sessionId } : {});
    ws.client.send?.({ type: 'process.list', payload });
  }, [ws.client, sessionId]);

  // The list: on connect, after each shell tool call, and from other senders
  // (the process monitor dialog) — every reply for this tab is used.
  useEffect(() => {
    if (!wsConnected || !ws.client?.isConnected) return;
    setShells([]);
    const offList = ws.client.on?.('process.list', (msg: unknown) => {
      const payload = (msg as { payload?: { processes?: ListedProcess[]; sessionId?: string } })
        ?.payload;
      if (!payload?.processes) return;
      if (!agentBelongsToSession(payload.sessionId, sessionId)) return;
      setShells(backgroundShellsOf(payload.processes));
    });
    const offTool = ws.client.on?.('tool.executed', (msg: unknown) => {
      const payload = (msg as { payload?: { name?: string; sessionId?: string } })?.payload;
      if (!payload?.name || !SHELL_TOOLS.has(payload.name)) return;
      if (!agentBelongsToSession(payload.sessionId, sessionId)) return;
      requestList();
    });
    requestList();
    return () => {
      offList?.();
      offTool?.();
    };
  }, [wsConnected, ws.client, sessionId, requestList]);

  // Re-ask while something runs, so an exited shell's chip goes away.
  useEffect(() => {
    if (shells.length === 0) return;
    const timer = setInterval(requestList, LIST_POLL_MS);
    return () => clearInterval(timer);
  }, [shells.length, requestList]);

  // Close the output of a shell that is no longer listed.
  useEffect(() => {
    if (openPid !== undefined && !shells.some((s) => s.pid === openPid)) setOpenPid(undefined);
  }, [shells, openPid]);

  // The open shell's output, refreshed while open.
  useEffect(() => {
    if (openPid === undefined || !ws.client?.isConnected) {
      setOutput(undefined);
      return;
    }
    const off = ws.client.on?.('process.output', (msg: unknown) => {
      const payload = (
        msg as { payload?: { pid?: number; lines?: string[]; gone?: boolean; sessionId?: string } }
      )?.payload;
      if (payload?.pid !== openPid || !Array.isArray(payload.lines)) return;
      if (!agentBelongsToSession(payload.sessionId, sessionId)) return;
      setOutput({ pid: openPid, lines: payload.lines, gone: payload.gone === true });
    });
    const request = () => {
      const base = { pid: openPid, lines: OUTPUT_LINES };
      const payload = ws.client.withSession?.(base) ?? (sessionId ? { ...base, sessionId } : base);
      ws.client.send?.({ type: 'process.output', payload });
    };
    request();
    const timer = setInterval(request, OUTPUT_POLL_MS);
    return () => {
      off?.();
      clearInterval(timer);
    };
  }, [openPid, ws.client, sessionId]);

  const stop = useCallback(
    async (shell: BackgroundShell) => {
      const ok = await confirmModal({
        title: t('activity:process.killTitle', { pid: shell.pid }),
        message: t('activity:process.confirmKillBackground', { pid: shell.pid }),
        confirmLabel: t('activity:process.stripStop'),
        danger: true,
      });
      if (!ok) return;
      const payload = ws.client.withSession?.({ pid: shell.pid }) ?? { pid: shell.pid };
      ws.client.send?.({ type: 'process.kill', payload });
      requestList();
    },
    [t, ws.client, requestList],
  );

  if (shells.length === 0) return null;
  const now = Date.now();
  const open = shells.find((s) => s.pid === openPid);

  return (
    <div className="ws-background-strip mb-1.5 flex flex-col gap-1" data-testid="background-strip">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="font-medium uppercase tracking-wide text-muted-foreground/70">
          {t('activity:process.stripLabel')}
        </span>
        {shells.map((shell) => {
          const active = shell.pid === openPid;
          return (
            <button
              key={shell.pid}
              type="button"
              aria-expanded={active}
              title={shell.command}
              onClick={() => setOpenPid(active ? undefined : shell.pid)}
              className={cn(
                'flex max-w-[18rem] items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono transition-colors',
                active
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-success/30 bg-success/5 text-success hover:bg-success/10',
              )}
            >
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-success" />
              <Terminal className="h-3 w-3 shrink-0" />
              <span className="truncate">{shell.command}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatShellAge(now - shell.startedAt)}
              </span>
              {active ? (
                <ChevronUp className="h-3 w-3 shrink-0" />
              ) : (
                <ChevronDown className="h-3 w-3 shrink-0" />
              )}
            </button>
          );
        })}
      </div>
      {open ? (
        <div className="rounded-md border border-border/60 bg-muted/30 text-xs">
          <div className="flex items-center justify-between gap-2 border-b border-border/40 px-2 py-1">
            <span className="text-muted-foreground">
              {t('activity:process.stripOutputTitle', { pid: open.pid })}
            </span>
            <button
              type="button"
              onClick={() => void stop(open)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-destructive hover:bg-destructive/10"
            >
              <Square className="h-3 w-3" />
              {t('activity:process.stripStop')}
            </button>
          </div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all px-2 py-1.5 font-mono text-[11px] leading-snug">
            {!open.hasOutput
              ? t('activity:process.stripNotCaptured')
              : output?.pid !== open.pid
                ? ''
                : output.gone
                  ? t('activity:process.stripGone')
                  : output.lines.length === 0
                    ? t('activity:process.stripNoOutput')
                    : output.lines.join('\n')}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
