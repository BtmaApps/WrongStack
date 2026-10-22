import type { MCPTaskView } from '@wrongstack/webui-protocol';
import { safeId } from '@/lib/utils';
import type { WrongStackWebSocketClient } from '@/lib/ws-client';

/** Fresh snapshots on reconnect; stream IDs and revisions reject late replies. */
export function taskUpdates(
  client: Pick<WrongStackWebSocketClient, 'on' | 'send'>,
  sessionId: string,
  view: {
    tasks: (tasks: MCPTaskView[]) => void;
    loading: (value: boolean) => void;
    error: (message: string) => void;
    timeout: string;
  },
) {
  let listId = '',
    streamId = '',
    revision = 0,
    streaming = false,
    failed = false,
    disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const send = (
    type: 'mcp.tasks.list' | 'mcp.tasks.subscribe' | 'mcp.tasks.unsubscribe',
    requestId: string,
  ) => client.send({ type, payload: { sessionId, requestId } }, { queueIfDisconnected: false });
  const stopStream = () => {
    if (streamId) send('mcp.tasks.unsubscribe', streamId);
    streamId = '';
    revision = 0;
    clearTimeout(timer);
  };
  const timeout = () => {
    listId = '';
    failed = true;
    stopStream();
    view.loading(false);
    view.error(view.timeout);
  };
  const subscribe = () => {
    listId = '';
    stopStream();
    streamId = safeId();
    view.loading(true);
    timer = setTimeout(timeout, 10_000);
    if (send('mcp.tasks.subscribe', streamId) === false) timeout();
  };
  const fetch = () => {
    if (disposed || listId || document.visibilityState === 'hidden') return;
    listId = safeId();
    view.loading(true);
    timer = setTimeout(timeout, 10_000);
    if (send('mcp.tasks.list', listId) === false) {
      clearTimeout(timer);
      listId = '';
      view.loading(false);
    }
  };
  const refresh = () => {
    if (disposed || document.visibilityState === 'hidden') return;
    failed = false;
    if (streaming) subscribe();
    else fetch();
  };
  const offList = client.on('mcp.tasks.list', ({ payload: p }) => {
    if (!listId || p.sessionId !== sessionId || p.requestId !== listId) return;
    listId = '';
    clearTimeout(timer);
    view.tasks(p.tasks);
    view.loading(false);
    view.error('');
    streaming = p.streaming === true;
    if (streaming && !failed) subscribe();
  });
  const offChanged = client.on('mcp.tasks.changed', ({ payload: p }) => {
    if (
      !streamId ||
      p.sessionId !== sessionId ||
      p.requestId !== streamId ||
      !Number.isSafeInteger(p.revision) ||
      p.revision <= revision
    )
      return;
    clearTimeout(timer);
    revision = p.revision;
    view.tasks(p.tasks);
    view.loading(false);
    view.error('');
  });
  const consumeResult = (p: { sessionId: string; requestId: string; message: string }) => {
    if (
      p.sessionId !== sessionId ||
      ((!listId || p.requestId !== listId) && (!streamId || p.requestId !== streamId))
    )
      return false;
    listId = '';
    failed = true;
    stopStream();
    view.loading(false);
    view.error(p.message);
    return true;
  };
  const visible = () => {
    if (document.visibilityState === 'hidden') {
      listId = '';
      stopStream();
      view.loading(false);
    } else refresh();
  };
  document.addEventListener('visibilitychange', visible);
  const poll = setInterval(() => {
    if (!streamId) fetch();
  }, 5000);
  fetch();
  return {
    refresh,
    consumeResult,
    dispose: () => {
      disposed = true;
      listId = '';
      stopStream();
      clearInterval(poll);
      document.removeEventListener('visibilitychange', visible);
      offList();
      offChanged();
    },
  };
}
