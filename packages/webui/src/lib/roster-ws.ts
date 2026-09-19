/**
 * Shared `sendRosterMessage` helper for the WebUI roster panels.
 *
 * Chimera-review findings addressed (CustomRosterPanel.tsx / AgentRosterView.tsx):
 *
 *  - **RACE**: each call is gated per message type. If two requests of the
 *    same type overlap (e.g. two `agent-roster.list` calls), the in-flight
 *    one is rejected with a "superseded" error before the new request
 *    registers its listener, so a late reply cannot resolve the early
 *    promise. We chose per-type gating over `requestId` correlation because
 *    the server-side `AgentRosterWSHandler` does not echo a request id
 *    (it correlates only by reply type), so correlation would require a
 *    server change. Gating is a client-only fix.
 *
 *  - **CORRECTNESS**: we await `client.connect()` before calling `send()`.
 *    Checking `client.isConnected` was racy: under `reconnecting` /
 *    `closing` `isConnected === false`, but `send()` would silently queue
 *    the message and only drain it on the next `onopen`, so the promise
 *    could sit for a full reconnect cycle before its listener was even
 *    attached. `connect()` returns the in-flight promise on retries.
 *
 *  - **LEAK**: the helper accepts an optional `AbortSignal`. When aborted
 *    (typically by a `useEffect` cleanup), the listener is detached and
 *    the timer is cleared immediately, so the closure captured during
 *    component setup is not retained until the 15s timeout fires.
 *
 *  - **BEHAVIOR-DRIFT**: the old inline code accepted both the wrapped
 *    (`agent-roster.list`) and the unwrapped (`list`) reply type. The
 *    current server only ever emits the wrapped form, but we keep the
 *    dual match for robustness. The `WrongStackWebSocketClient.on`
 *    overload is exact-match only, so we register two listeners keyed off
 *    `type` and the prefix-stripped form.
 *
 *  - **CONTRACT-MISMATCH**: `WSClientMessageCore` includes
 *    `| { type: \`agent-roster.${string}\`; … }`, so the caller-side
 *    `send()` no longer needs the `as unknown as WSClientMessage` cast.
 */

import { safeId } from '@/lib/utils';
import { getWSClient } from '@/lib/ws-client';

/** Per-type gate. Only one in-flight request per full message type. */
const inflight = new Map<
  string,
  {
    cleanup: () => void;
    reject: (reason: unknown) => void;
  }
>();

/** Default timeout for a roster round-trip. */
const DEFAULT_TIMEOUT_MS = 15_000;

/** Strip the leading `agent-roster.` for the BEHAVIOR-DRIFT dual-match. */
function stripPrefix(type: string): string | undefined {
  const PREFIX = 'agent-roster.';
  return type.startsWith(PREFIX) && type.length > PREFIX.length
    ? type.slice(PREFIX.length)
    : undefined;
}

/**
 * Send a roster WS message and wait for a correlated reply.
 *
 * @param type    Full message type, e.g. `agent-roster.list`.
 * @param payload Optional payload record.
 * @param signal  Optional AbortSignal — aborting detaches the listener
 *                and rejects with `DOMException('Aborted')` instead of
 *                waiting for the timeout.
 */
export function sendRosterMessage(
  type: string,
  payload?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const client = getWSClient();
    const requestId = safeId();

    let settled = false;
    let cleanupFns: Array<() => void> = [];

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      for (const c of cleanupFns) c();
      cleanupFns = [];
      inflight.delete(type);
      fn();
    };

    const handle = (msg: unknown) => {
      const envelope = msg as { payload?: unknown } | undefined;
      const body = envelope && typeof envelope === 'object' ? (envelope.payload ?? envelope) : msg;
      if (
        body &&
        typeof body === 'object' &&
        'requestId' in body &&
        typeof (body as { requestId?: unknown }).requestId === 'string' &&
        (body as { requestId: string }).requestId !== requestId
      ) {
        return;
      }
      if (
        body &&
        typeof body === 'object' &&
        'error' in body &&
        typeof (body as { error?: unknown }).error === 'string'
      ) {
        settle(() => reject(new Error((body as { error: string }).error)));
        return;
      }
      settle(() => resolve(body));
    };

    client
      .connect()
      .then(() => {
        if (settled) return;

        // RACE: replace any in-flight request of this type so a late
        // reply cannot resolve the wrong promise.
        const prior = inflight.get(type);
        if (prior) {
          prior.cleanup();
          prior.reject(new Error(`Roster request "${type}" superseded by new request`));
          inflight.delete(type);
        }

        // Register the inflight entry BEFORE attaching listeners so the
        // per-type gate is active during setup — no second concurrent call
        // of the same type can sneak in between listener attachment and
        // entry registration.
        inflight.set(type, {
          reject: (reason) => settle(() => reject(reason)),
          cleanup: () => {
            for (const c of cleanupFns) c();
            cleanupFns = [];
            if (!settled) inflight.delete(type);
          },
        });

        // Primary listener — exact type (current server behaviour).
        const offPrimary = client.on(type, handle);
        cleanupFns.push(offPrimary);

        // Backwards-compatible listener — accept the unwrapped form
        // (`list` rather than `agent-roster.list`).
        const stripped = stripPrefix(type);
        if (stripped) {
          const offStripped = client.on(stripped, handle);
          cleanupFns.push(offStripped);
        }

        // LEAK: AbortSignal detaches listeners immediately on unmount.
        if (signal) {
          if (signal.aborted) {
            settle(() => reject(new DOMException('Aborted', 'AbortError')));
            return;
          }
          const onAbort = () => settle(() => reject(new DOMException('Aborted', 'AbortError')));
          signal.addEventListener('abort', onAbort, { once: true });
          cleanupFns.push(() => signal.removeEventListener('abort', onAbort));
        }

        // Timeout safety net.
        const timer = setTimeout(
          () => settle(() => reject(new Error(`Roster request "${type}" timed out`))),
          DEFAULT_TIMEOUT_MS,
        );
        cleanupFns.push(() => clearTimeout(timer));

        // CONTRACT-MISMATCH: the type union was extended in types.ts to
        // include `agent-roster.${string}`, so the cast is no longer needed.
        client.send({
          type: type as `agent-roster.${string}`,
          payload: { ...payload, requestId },
        });
      })
      .catch((err) => settle(() => reject(err)));
  });
}
