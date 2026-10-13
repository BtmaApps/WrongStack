/**
 * Providers the host serves itself (the CLI's ACP leader, `acp`) are offered
 * by the WebUI pickers beside the saved ones: they ride `providers.saved`
 * with their models, and `provider.models` answers from the host's list
 * without the catalog. A saved record of the same id is never shadowed.
 */
import type { ProviderConfig } from '@wrongstack/core/types';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { createProviderOperations } from '../src/server/provider-handlers.js';

const ACP = {
  id: 'acp',
  type: 'acp',
  models: [{ id: 'claude-code', name: 'Claude Code', contextWindow: 1_000_000 }],
};

function operations(saved: Record<string, ProviderConfig>) {
  const sent: Array<{ type: string; payload: unknown }> = [];
  const broadcast = vi.fn();
  const ops = createProviderOperations({
    providerStore: { load: async () => saved, save: async () => {} },
    broadcast,
    send: (_ws, message) => sent.push(message as never),
    hostProviders: () => [ACP],
  });
  return { ops, sent, broadcast };
}

const WS = {} as WebSocket;

describe('host providers in the WebUI pickers', () => {
  it('lists acp with its agents after the saved providers', async () => {
    const { ops, sent } = operations({ zai: { type: 'zai', models: ['glm-5'] } as ProviderConfig });
    await ops.handleProvidersSaved(WS);
    const payload = sent[0]?.payload as { providers: Array<Record<string, unknown>> } | undefined;
    const providers = payload?.providers ?? [];
    expect(providers.map((p) => p.id)).toEqual(['zai', 'acp']);
    expect(providers[1]).toMatchObject({
      type: 'acp',
      models: ['claude-code'],
      pickedModelId: 'claude-code',
      apiKeys: [],
    });
  });

  it("answers acp's models from the host, with no models registry at all", async () => {
    const { ops, sent } = operations({});
    await ops.handleProviderModels(WS, 'acp');
    expect(sent[0]).toEqual({
      type: 'provider.models',
      payload: {
        provider: 'acp',
        models: [
          {
            id: 'claude-code',
            name: 'Claude Code',
            contextWindow: 1_000_000,
            outputModalities: ['text'],
          },
        ],
      },
    });
  });

  it('keeps acp in the list a broadcast sends, and never shadows a saved acp record', () => {
    const { ops, broadcast } = operations({});
    ops.broadcastSaved({ acp: { type: 'openai', models: ['x'] } as ProviderConfig });
    const message = broadcast.mock.calls[0]?.[0] as
      | { payload: { providers: Array<{ id: string; type: string }> } }
      | undefined;
    const providers = message?.payload.providers;
    expect(providers).toEqual([expect.objectContaining({ id: 'acp', type: 'openai' })]);
  });
});
