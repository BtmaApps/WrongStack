import type { WebSocket } from 'ws';
import { withRequestId } from './ws-utils.js';

/** Correlate direct operation replies without stamping unrelated broadcasts on the socket. */
export function correlatedReply(ws: WebSocket, payload: unknown, types: readonly string[]) {
  const requestId = withRequestId(payload, {}).requestId;
  let replied = false;
  const socket = requestId
    ? new Proxy(ws, {
        get(target, key) {
          if (key === 'send')
            return (...args: unknown[]) => {
              if (typeof args[0] === 'string') {
                const frame = JSON.parse(args[0]) as {
                  type?: string;
                  payload?: Record<string, unknown>;
                };
                if (frame.type && types.includes(frame.type)) {
                  frame.payload = { ...frame.payload, requestId };
                  args[0] = JSON.stringify(frame);
                  replied = true;
                }
              }
              return Reflect.apply(target.send, target, args);
            };
          const value = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      })
    : ws;
  return {
    socket,
    get replied() {
      return replied;
    },
    requestId,
  };
}
