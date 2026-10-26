import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeProviderFromConfig, TRUSTED_PROVIDER_PRESETS } from '../src/index.js';

const LEGACY_ALIBABA_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

async function captureRequestUrl(baseUrl: string): Promise<string[]> {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      urls.push(String(input instanceof Request ? input.url : input));
      throw new Error('stop after URL capture');
    }),
  );
  const cfg = Object.freeze({
    type: 'alibaba-token-plan',
    family: 'openai-compatible' as const,
    baseUrl,
    apiKey: 'sk-sp-test',
  });
  const provider = makeProviderFromConfig('alibaba-token-plan', cfg);
  await expect(
    (async () => {
      for await (const _ of provider.stream(
        { model: 'qwen3.7-max', messages: [{ role: 'user', content: 'hi' }] },
        { signal: new AbortController().signal },
      )) {
        // Drain; the stubbed fetch fails before any event can arrive.
      }
    })(),
  ).rejects.toThrow();
  return urls;
}

describe('stale preset endpoint repair at provider build', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a saved legacy Alibaba Token Plan config to the Token Plan host', async () => {
    const urls = await captureRequestUrl(LEGACY_ALIBABA_BASE);
    const current = TRUSTED_PROVIDER_PRESETS['alibaba-token-plan']!.baseUrl;
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((url) => url.startsWith(current))).toBe(true);
  });

  it('leaves a user-chosen endpoint alone', async () => {
    const custom = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    const urls = await captureRequestUrl(custom);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((url) => url.startsWith(custom))).toBe(true);
  });
});
