import type { MCPTaskView } from '@wrongstack/webui-protocol';
import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAppTranslation } from '@/i18n';
import { safeId } from '@/lib/utils';
import { useConfigStore } from '@/stores/config-store';
import { SESSION_DEFAULT_LANE_ID, useSessionLanes } from '@/stores/session-lanes';
import { useSessionStore } from '@/stores/session-store';
import { Button } from '../ui/button';
import { taskUpdates } from './mcp-task-updates';

export function MCPTasksPanel() {
  const lane = useSessionLanes((s) => s.activeSessionId);
  const fallback = useSessionStore((s) => s.session?.id);
  const sessionId = lane !== SESSION_DEFAULT_LANE_ID ? lane : fallback;
  return <SessionTasks key={sessionId ?? ''} sessionId={sessionId} />;
}

function SessionTasks({ sessionId }: { sessionId: string | undefined }) {
  const { client } = useWebSocket();
  const connected = useConfigStore((s) => s.wsConnected);
  const { t } = useAppTranslation();
  const [tasks, setTasks] = useState<MCPTaskView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [cancelled, setCancelled] = useState<Set<string>>(new Set());
  const refresh = useRef<() => void>(() => {});
  const action = useRef<(task: MCPTaskView, kind: 'retry' | 'cancel') => void>(() => {});

  useEffect(() => {
    setPending(null);
    setLoading(false);
    if (!client || !sessionId || !connected) return;
    let actionId = '',
      actionTask = '',
      actionKind = '';
    let actionTimer: ReturnType<typeof setTimeout> | undefined;
    const updates = taskUpdates(client, sessionId, {
      tasks: (next) => {
        setTasks(next);
        setLoaded(true);
      },
      loading: setLoading,
      error: setError,
      timeout: t('settings:mcp.tasks.timeout', {
        defaultValue: 'No response. Refresh to try again.',
      }),
    });
    const offResult = client.on('mcp.tasks.result', ({ payload: p }) => {
      if (p.sessionId !== sessionId) return;
      if (updates.consumeResult(p)) return;
      if (!actionId || p.requestId !== actionId) return;
      clearTimeout(actionTimer);
      actionId = '';
      setPending(null);
      if (p.success) {
        setNotice(p.message);
        setError('');
        setActionError('');
        if (actionKind === 'cancel') setCancelled((prev) => new Set([...prev, actionTask]));
        updates.refresh();
      } else setActionError(p.message);
    });
    refresh.current = updates.refresh;
    action.current = (task, kind) => {
      if (actionId) return;
      actionId = safeId();
      actionTask = task.id;
      actionKind = kind;
      setPending(task.id);
      setNotice('');
      setError('');
      setActionError('');
      if (
        client.send(
          {
            type: kind === 'cancel' ? 'mcp.tasks.cancel' : 'mcp.tasks.retry',
            payload: { sessionId, id: task.id, requestId: actionId },
          },
          { queueIfDisconnected: false },
        ) === false
      ) {
        actionId = '';
        setPending(null);
        setActionError(
          t('settings:mcp.tasks.disconnected', { defaultValue: 'Reconnect to manage tasks.' }),
        );
        return;
      }
      actionTimer = setTimeout(() => {
        actionId = '';
        setPending(null);
        setActionError(
          t('settings:mcp.tasks.actionTimeout', {
            defaultValue: 'No confirmation received. Refresh the status before trying again.',
          }),
        );
      }, 15_000);
    };
    return () => {
      updates.dispose();
      clearTimeout(actionTimer);
      offResult();
      refresh.current = () => {};
      action.current = () => {};
    };
  }, [client, sessionId, connected, t]);

  const statusLabel = (task: MCPTaskView) => {
    const labels = {
      working: 'Working',
      input_required: 'Waiting for input',
      completed: 'Completed',
      cancelled: 'Cancelled',
      failed: 'Failed',
    };
    return t(`settings:mcp.tasks.status.${task.status}`, { defaultValue: labels[task.status] });
  };
  return (
    <section
      aria-label={t('settings:mcp.tasks.title', { defaultValue: 'MCP tasks' })}
      className="space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t('settings:mcp.tasks.description', {
            defaultValue:
              'Tasks saved for this session. Recovery resumes observation without running the tool again.',
          })}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={!sessionId || !connected || loading}
          onClick={() => refresh.current()}
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          {t('common:action.refresh')}
        </Button>
      </div>
      {!sessionId ? (
        <p>
          {t('settings:mcp.tasks.noSession', { defaultValue: 'Open a session to view its tasks.' })}
        </p>
      ) : !connected ? (
        <p role="status">
          {t('settings:mcp.tasks.disconnected', { defaultValue: 'Reconnect to manage tasks.' })}
        </p>
      ) : null}
      {(actionError || error) && (
        <p role="alert" className="text-sm text-destructive">
          {actionError || error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      {sessionId && connected && !loaded && loading && (
        <p role="status">{t('common:action.loading')}</p>
      )}
      {sessionId && connected && loaded && tasks.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t('settings:mcp.tasks.empty', { defaultValue: 'No saved tasks in this session.' })}
        </p>
      )}
      {tasks.map((task) => {
        const terminal = ['completed', 'cancelled', 'failed'].includes(task.status);
        return (
          <article key={task.id} className="rounded-md border p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 break-all font-medium">
                {task.server} / {task.tool}
              </div>
              <span className="rounded bg-muted px-2 py-1 text-xs">{statusLabel(task)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {task.delivered
                ? t('settings:mcp.tasks.delivered', { defaultValue: 'Result collected' })
                : task.observing
                  ? t('settings:mcp.tasks.observing', { defaultValue: 'Observing task' })
                  : t('settings:mcp.tasks.waiting', {
                      defaultValue: 'Waiting to resume observation',
                    })}
            </p>
            <time className="block text-xs text-muted-foreground" dateTime={task.lastUpdatedAt}>
              {new Date(task.lastUpdatedAt).toLocaleString()}
            </time>
            {!task.delivered && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!connected || !!pending || task.observing}
                  onClick={() => action.current(task, 'retry')}
                >
                  {t('settings:mcp.tasks.retry', { defaultValue: 'Retry recovery' })}
                </Button>
                {!terminal && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!connected || !!pending || cancelled.has(task.id)}
                    onClick={() => action.current(task, 'cancel')}
                  >
                    {cancelled.has(task.id)
                      ? t('settings:mcp.tasks.cancelRequested', {
                          defaultValue: 'Cancel requested',
                        })
                      : t('settings:mcp.tasks.cancel', { defaultValue: 'Cancel task' })}
                  </Button>
                )}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
