/**
 * The agent's open browser sessions for this tab (server: browser-live.ts).
 *
 * Asked for when the tab connects and after every browser tool call, and
 * re-asked every few seconds only while a session is open, so the list
 * notices one closing at the end of a run.
 */
import { useCallback, useEffect, useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { agentBelongsToSession } from '@/lib/agent-session';
import { useActiveSessionId, useConfigStore } from '@/stores';

const LIST_POLL_MS = 5000;

export interface LiveBrowserSession {
  id: string;
  url: string;
  title: string;
}

export function useLiveBrowserSessions(): LiveBrowserSession[] {
  const ws = useWebSocket();
  const sessionId = useActiveSessionId();
  const wsConnected = useConfigStore((s) => s.wsConnected);
  const [sessions, setSessions] = useState<LiveBrowserSession[]>([]);

  const request = useCallback(() => {
    const payload = ws.client.withSession?.({}) ?? (sessionId ? { sessionId } : {});
    ws.client.send?.({ type: 'browser.live.list', payload });
  }, [ws.client, sessionId]);

  useEffect(() => {
    if (!wsConnected || !ws.client?.isConnected) return;
    setSessions([]);
    const offList = ws.client.on?.('browser.live.list', (msg: unknown) => {
      const payload = (msg as { payload?: { sessions?: LiveBrowserSession[]; sessionId?: string } })
        ?.payload;
      if (!Array.isArray(payload?.sessions)) return;
      if (!agentBelongsToSession(payload.sessionId, sessionId)) return;
      setSessions(payload.sessions.map(({ id, url, title }) => ({ id, url, title })));
    });
    const offTool = ws.client.on?.('tool.executed', (msg: unknown) => {
      const payload = (msg as { payload?: { name?: string; sessionId?: string } })?.payload;
      // `tool_use` reaches the browser tools too: they are off the direct tool list.
      const name = payload?.name;
      if (!name || !(name.startsWith('browser_') || name === 'tool_use')) return;
      if (!agentBelongsToSession(payload?.sessionId, sessionId)) return;
      request();
    });
    request();
    return () => {
      offList?.();
      offTool?.();
    };
  }, [wsConnected, ws.client, sessionId, request]);

  useEffect(() => {
    if (sessions.length === 0) return;
    const timer = setInterval(request, LIST_POLL_MS);
    return () => clearInterval(timer);
  }, [sessions.length, request]);

  return sessions;
}
