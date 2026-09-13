import type { LanguageModelV4, LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { createCloudflareGatewayModel } from '../src/cloudflare-ai-gateway.js';

type ModelFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * Minimal OpenAI-shaped provider model whose doGenerate resolves its fetch by
 * reading `config.fetch` at CALL time — the lazy lookup the real
 * `@ai-sdk/openai-compatible` / `@ai-sdk/anthropic` models use, which is what
 * makes the config-mutation interception work at all.
 */
function fakeProviderModel(realFetch: ModelFetch): {
  model: LanguageModelV4;
  config: { fetch?: ModelFetch | undefined };
} {
  const config: { fetch?: ModelFetch | undefined } = { fetch: realFetch };
  const model = {
    specificationVersion: 'v4',
    provider: 'openai',
    modelId: 'test-model',
    config,
    doGenerate: async () => {
      // Capture or replay phase — whichever stub is installed handles this.
      const response = await config.fetch?.('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model: 'test-model' }),
      });
      // Replay phase hands back the gateway response; the fake parses nothing.
      return {
        content: [{ type: 'text', text: String(response?.status ?? 0) }],
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      };
    },
  };
  return { model: model as unknown as LanguageModelV4, config };
}

function gatewayOptions(): {
  accountId: string;
  gatewayId: string;
  apiKey: string;
  provider: 'openai';
  fetchImpl: typeof fetch;
} {
  return {
    accountId: 'account-1',
    gatewayId: 'gateway-1',
    apiKey: 'gateway-key',
    provider: 'openai',
    fetchImpl: (async () => new Response('{}', { status: 200 })) as typeof fetch,
  };
}

const callOptions = {
  prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
} as unknown as LanguageModelV4CallOptions;

/**
 * The capture stub must always win the interception: if a dispatch ever ran
 * against the un-stubbed config, the real fetch would fire.
 */
function neverRoutedRealFetch(): ModelFetch {
  return (() => {
    throw new Error('real fetch must never run while the gateway wrapper is installed');
  }) as unknown as ModelFetch;
}

describe('createCloudflareGatewayModel dispatch serialization', () => {
  it('restores config.fetch after two interleaved dispatches instead of poisoning the model', async () => {
    const realFetch = neverRoutedRealFetch();
    const { model, config } = fakeProviderModel(realFetch);
    const gateway = createCloudflareGatewayModel(model, gatewayOptions());

    const [first, second] = await Promise.all([
      gateway.doGenerate(callOptions),
      gateway.doGenerate(callOptions),
    ]);

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    // A poisoned restore would leave a CaptureRequest stub in place.
    expect(config.fetch).toBe(realFetch);

    // A third dispatch on the same model still works — the exact operation
    // the poisoning race breaks.
    await expect(gateway.doGenerate(callOptions)).resolves.toBeDefined();
  });

  it('restores the original config.fetch after a successful single dispatch', async () => {
    const realFetch = neverRoutedRealFetch();
    const { model, config } = fakeProviderModel(realFetch);
    const gateway = createCloudflareGatewayModel(model, gatewayOptions());

    await expect(gateway.doGenerate(callOptions)).resolves.toBeDefined();
    expect(config.fetch).toBe(realFetch);
  });
});
