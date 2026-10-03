import { useCallback, useEffect, useRef, useState } from 'react';
import { getWSClient } from '@/lib/ws-client';
import type { ChronicleEventView, ChronicleQueryResult } from '@/types';

const MAX_EVENTS = 10000;
export function useStoryHistory(sessionId: string | null, live: boolean) {
  const [state, setState] = useState<{
    sessionId: string | null;
    events: ChronicleEventView[];
    total: number;
    loading: boolean;
    error: string | null;
    cursor?: string;
  }>({ sessionId: null, events: [], total: 0, loading: false, error: null });
  const request = useRef<{
    id: string;
    append: boolean;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const client = getWSClient();
  const load = useCallback(
    (cursor?: string) => {
      if (!sessionId || request.current) return;
      if (!client.supportsCapability('chronicle.query')) {
        setState({
          sessionId,
          events: [],
          total: 0,
          loading: false,
          error: 'Chronicle history is unavailable on this backend.',
        });
        return;
      }
      const id = `session-story:${crypto.randomUUID()}`;
      const timer = setTimeout(() => {
        if (request.current?.id !== id) return;
        request.current = null;
        setState((previous) => ({
          ...previous,
          loading: false,
          error: 'No matching history reply. Reconnect or restart the backend.',
        }));
      }, 15000);
      request.current = { id, append: Boolean(cursor), timer };
      setState((previous) =>
        previous.sessionId === sessionId
          ? { ...previous, loading: true, error: null }
          : { sessionId, events: [], total: 0, loading: true, error: null },
      );
      client.send({
        type: 'chronicle.query',
        payload: {
          requestId: id,
          query: { sessionId, order: 'desc', limit: 5000, ...(cursor ? { cursor } : {}) },
        },
      });
      client.send({ type: 'mailbox.messages', payload: { limit: 100 } });
    },
    [client, sessionId],
  );
  useEffect(() => {
    setState({ sessionId, events: [], total: 0, loading: false, error: null });
    const offResult = client.on('chronicle.query_result', (message) => {
      if (
        message.type !== 'chronicle.query_result' ||
        message.payload.requestId !== request.current?.id ||
        !request.current
      )
        return;
      const pending = request.current;
      clearTimeout(pending.timer);
      request.current = null;
      const result: ChronicleQueryResult = message.payload;
      setState((previous) => {
        const records =
          pending.append && previous.sessionId === sessionId
            ? [...previous.events, ...result.events]
            : result.events;
        const events = [
          ...new Map(
            records
              .filter((event) => event.scope.sessionId === sessionId)
              .map((event) => [event.eventId, event]),
          ).values(),
        ].slice(0, MAX_EVENTS);
        return {
          sessionId,
          events,
          total: pending.append
            ? Math.max(previous.total, result.total, events.length)
            : result.total,
          loading: false,
          error: null,
          cursor: events.length < MAX_EVENTS ? result.nextCursor : undefined,
        };
      });
    });
    const offError = client.on('chronicle.error', (message) => {
      if (
        message.type !== 'chronicle.error' ||
        !request.current ||
        message.payload.requestId !== request.current.id
      )
        return;
      clearTimeout(request.current.timer);
      request.current = null;
      setState((previous) => ({ ...previous, loading: false, error: message.payload.message }));
    });
    load();
    return () => {
      offResult();
      offError();
      if (request.current) clearTimeout(request.current.timer);
      request.current = null;
    };
  }, [client, sessionId, load]);
  useEffect(() => {
    if (!live) return;
    const poll = setInterval(() => load(), 10000);
    return () => clearInterval(poll);
  }, [live, load]);
  return {
    ...state,
    events: state.sessionId === sessionId ? state.events : [],
    refresh: () => load(),
    loadEarlier: () => load(state.cursor),
  };
}
