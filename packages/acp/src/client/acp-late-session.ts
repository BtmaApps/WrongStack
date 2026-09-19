import type { ACPClientTransport } from '../agent/stdio-transport.js';
import type { ACPMessage } from '../types/acp-messages.js';
import type { SessionId } from '../types/acp-v1.js';

/** Bound for the best-effort late session/cancel send. `session/cancel` is a
 * notification — the server sends no response — so this only bounds a hung
 * transport, not a protocol wait. */
const LATE_CANCEL_SEND_TIMEOUT_MS = 10_000;

export function cancelLateAcpSession(
  transport: ACPClientTransport,
  createPromise: Promise<SessionId>,
): void {
  createPromise
    .then(async (lateId) => {
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            // Plain Error, not kind:'aborted' — the wire hung, nobody aborted.
            reject(new Error('late session/cancel send timed out'));
          }, LATE_CANCEL_SEND_TIMEOUT_MS);
          Promise.resolve(
            transport.send({
              jsonrpc: '2.0',
              method: 'session/cancel',
              params: { sessionId: lateId },
            } as never as ACPMessage),
          ).then(
            () => {
              clearTimeout(timer);
              resolve();
            },
            (sendErr: unknown) => {
              clearTimeout(timer);
              reject(sendErr instanceof Error ? sendErr : new Error(String(sendErr)));
            },
          );
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.warn(
          JSON.stringify({
            level: 'warn',
            event: 'acp_session.late_cancel_failed',
            sessionId: lateId,
            message,
          }),
        );
      }
    })
    .catch((reason: unknown) => {
      // The abandoned creation itself failed after we stopped waiting
      // (e.g. the server refused the late session/new): nothing is left
      // to cancel, but the refusal is observable, not swallowed.
      const message = reason instanceof Error ? reason.message : String(reason);
      // eslint-disable-next-line no-console
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'acp_session.late_cancel_failed',
          reason: message,
        }),
      );
    });
}
