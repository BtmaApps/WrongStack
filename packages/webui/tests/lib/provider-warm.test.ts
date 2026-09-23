import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Typing in the composer asks the server to open the provider connection
 * (`composer.warm`) — only when the server supports it, only for prompts, and
 * not once per keystroke.
 */

const client = vi.hoisted(() => ({
  isConnected: true,
  capabilities: new Set<string>(['session.provider-warm']),
  sent: [] as Array<{ type: string; payload?: Record<string, unknown> }>,
}));

vi.mock('@/lib/ws-client', () => ({
  getWSClient: () => ({
    get isConnected() {
      return client.isConnected;
    },
    supportsCapability: (c: string) => client.capabilities.has(c),
    send: (m: { type: string; payload?: Record<string, unknown> }) => {
      client.sent.push(m);
      return true;
    },
  }),
}));

import { warmProviderWhileTyping } from '../../src/lib/provider-warm';

let session = 0;
beforeEach(() => {
  client.sent.length = 0;
  client.isConnected = true;
  client.capabilities = new Set(['session.provider-warm']);
  session += 1;
});

describe('warmProviderWhileTyping', () => {
  it('sends one warm frame per session every two seconds of typing', () => {
    const id = `sess_${session}`;
    warmProviderWhileTyping(id, 'h', 10_000);
    warmProviderWhileTyping(id, 'he', 10_500);
    warmProviderWhileTyping(id, 'hel', 11_999);
    warmProviderWhileTyping(`${id}_other`, 'x', 11_999);
    warmProviderWhileTyping(id, 'hell', 12_000);
    expect(client.sent).toEqual([
      { type: 'composer.warm', payload: { sessionId: id } },
      { type: 'composer.warm', payload: { sessionId: `${id}_other` } },
      { type: 'composer.warm', payload: { sessionId: id } },
    ]);
  });

  it('ignores commands, shell lines and blank text', () => {
    const id = `sess_${session}`;
    for (const text of ['/model', '  !ls', '   ', '']) warmProviderWhileTyping(id, text, 1);
    expect(client.sent).toEqual([]);
  });

  it('sends nothing to a server without the capability, or while disconnected', () => {
    client.capabilities = new Set();
    warmProviderWhileTyping(`sess_${session}`, 'hi', 1);
    client.capabilities = new Set(['session.provider-warm']);
    client.isConnected = false;
    warmProviderWhileTyping(`sess_${session}_b`, 'hi', 1);
    expect(client.sent).toEqual([]);
  });
});
