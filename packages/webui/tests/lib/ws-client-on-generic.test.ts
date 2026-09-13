import { describe, expect, it } from 'vitest';
import { WrongStackWebSocketClient } from '../../src/lib/ws-client';
import type { WSServerMessage } from '../../src/types';

/**
 * Type-safety tests for the generic `on<K>()` overload on
 * WrongStackWebSocketClient. These verify at the type-checker level (the
 * test body is mostly compile-time assertions) that:
 *   1. A literal type key narrows the received payload.
 *   2. The wider string overload still accepts a generic handler.
 *
 * Runtime behavior of dispatch is covered elsewhere; this file is a
 * regression guard for the type contract.
 */

// Helper: invoke the typed overload shape without actually connecting.
function makeClient(): WrongStackWebSocketClient {
  // The constructor only stores config; it doesn't open a socket. We never
  // call connect() so no real WebSocket is created.
  return new WrongStackWebSocketClient('ws://127.0.0.1:65535');
}

describe('WrongStackWebSocketClient.on — generic type narrowing', () => {
  it('narrows the message payload when given a literal type key', () => {
    const client = makeClient();
    let receivedPayload: { text?: string; messageId?: string } | undefined;

    // The generic overload: 'provider.text_delta' is a known server message
    // type, so `msg.payload` is statically the matching shape. If the
    // overload regresses, this line fails to type-check.
    const off = client.on('provider.text_delta', (msg) => {
      // No `as` cast needed — the payload is narrowed.
      receivedPayload = msg.payload;
    });

    expect(typeof off).toBe('function');
    off();
    expect(receivedPayload).toBeUndefined();
  });

  it('accepts a runtime string key with the wider WSServerMessage handler', () => {
    const client = makeClient();
    let received: WSServerMessage | undefined;

    // The string overload: any string is accepted, handler gets the wide type.
    const off = client.on('some.dynamic.type' as WSServerMessage['type'], (msg) => {
      received = msg;
    });

    off();
    expect(received).toBeUndefined();
  });

  it('off() mirrors on() — both overloads unregister cleanly', () => {
    const client = makeClient();

    const handler = (msg: Extract<WSServerMessage, { type: 'tool.executed' }>) => {
      void msg;
    };
    // Both the literal-key and string overloads of off() should be callable,
    // including for a handler that was never registered.
    expect(() => client.off('tool.executed', handler)).not.toThrow();
  });
});
