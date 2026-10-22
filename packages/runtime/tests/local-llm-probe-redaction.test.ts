import { DefaultSecretScrubber } from '@wrongstack/core/security';
import { describe, expect, it } from 'vitest';
import { probeLocalLlm } from '../src/local-llm-probe.js';

describe('local LLM probe error redaction boundary', () => {
  it.each([0, 160, 180, 190, 200])(
    'scrubs the full body before the display cap at offset %i',
    async (offset) => {
      const scrubber = new DefaultSecretScrubber();
      const body = `${'x'.repeat(offset)} ${JSON.stringify({ api_key: 'AUDIT_SECRET_VALUE_1234567890' })}`;
      const result = await probeLocalLlm({
        baseUrl: 'http://localhost/v1',
        apiKey: undefined,
        noAuth: true,
        scrubber,
        fetchImpl: (async () => new Response(body, { status: 401 })) as typeof fetch,
      });
      expect(result.status).toBe('http_error');
      expect(result.detail).toBe(scrubber.scrub(body).slice(0, 200));
      expect(result.detail?.length).toBeLessThanOrEqual(200);
    },
  );
});
