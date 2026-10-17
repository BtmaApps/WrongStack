'use client';

import type { ProtocolEnvelope } from '@wrongstack/webui-protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import { clientId } from './ids';
import { record } from './session';
import type { SessionController } from './use-session';

export function acceptsPanelReply(
  frame: ProtocolEnvelope,
  expected: string,
  requestId: string,
  accept?: (payload: Record<string, unknown>) => boolean,
) {
  const payload = record(frame.payload);
  return (
    frame.type === expected &&
    (typeof payload.requestId !== 'string' || payload.requestId === requestId) &&
    (!accept || accept(payload))
  );
}

/** Subscribe before sending; clean up requests when a modal or session closes. */
export function usePanelRequests(controller: SessionController) {
  const { send, subscribe, state, connection } = controller;
  const pending = useRef(new Map<string, () => void>());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(
    () => () => {
      for (const cancel of pending.current.values()) cancel();
      pending.current.clear();
    },
    [state.id, connection],
  );
  const request = useCallback(
    (
      type: string,
      payload: Record<string, unknown> = {},
      expected = type,
      accept?: (payload: Record<string, unknown>) => boolean,
    ): Promise<Record<string, unknown> | null> => {
      if (pending.current.has(expected)) return Promise.resolve(null);
      const requestId = clientId();
      setError('');
      setBusy(true);
      return new Promise((resolve) => {
        const finish = (value: Record<string, unknown> | null) => {
          clearTimeout(timer);
          off();
          pending.current.delete(expected);
          setBusy(pending.current.size > 0);
          resolve(value);
        };
        const timer = setTimeout(() => {
          setError('The server did not respond. Refresh to retry.');
          finish(null);
        }, 12_000);
        const off = subscribe((frame) => {
          if (acceptsPanelReply(frame, expected, requestId, accept)) {
            const p = record(frame.payload);
            if (p.error || p.success === false || p.ok === false)
              setError(
                typeof p.error === 'string'
                  ? p.error
                  : typeof p.message === 'string'
                    ? p.message
                    : 'The operation was not applied.',
              );
            finish(p);
          }
        });
        pending.current.set(expected, () => finish(null));
        if (!send(type, { sessionId: state.id, ...payload, requestId })) {
          setError('Reconnect to use this control.');
          finish(null);
        }
      });
    },
    [send, subscribe, state.id],
  );
  return { request, busy, error, setError };
}
