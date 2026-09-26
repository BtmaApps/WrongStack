import { type Dispatch, useEffect } from 'react';
import type { Action } from '../app-action-type.js';
import type { AppProps } from '../app-props.js';

/**
 * Tells the person when an MCP server is down for good, and when it is back.
 *
 * The model learns about a failed server through its tool list; the person
 * learned nothing — the registry only logged it. Only a `terminal` disconnect
 * is shown: connect attempts or reconnect cycles are exhausted and nothing
 * retries by itself. A stop, an idle sleep or a drop that an automatic
 * reconnect follows stays quiet. Each failure is shown once; the recovery line
 * appears only for a server this bridge reported down.
 */
export function useMcpStatusBridge({
  events,
  dispatch,
}: {
  events: AppProps['events'];
  dispatch: Dispatch<Action>;
}): void {
  useEffect(() => {
    const reportedDown = new Set<string>();
    const offDown = events.on('mcp.server.disconnected', (e) => {
      if (!e.terminal || reportedDown.has(e.name)) return;
      reportedDown.add(e.name);
      const reason = e.reason.split('\n')[0]?.trim() || 'unknown';
      dispatch({
        type: 'addEntry',
        entry: {
          kind: 'warn',
          text: `MCP server "${e.name}" is not connected (${reason}); its tools are unavailable. Retry with /mcp restart ${e.name}.`,
        },
      });
    });
    const onUp = (e: { name: string }) => {
      if (!reportedDown.delete(e.name)) return;
      dispatch({
        type: 'addEntry',
        entry: { kind: 'info', text: `MCP server "${e.name}" is connected again.` },
      });
    };
    const offConnected = events.on('mcp.server.connected', onUp);
    const offReconnected = events.on('mcp.server.reconnected', onUp);
    return () => {
      offDown();
      offConnected();
      offReconnected();
    };
  }, [events, dispatch]);
}
