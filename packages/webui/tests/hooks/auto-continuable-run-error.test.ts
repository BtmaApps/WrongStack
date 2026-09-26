import { describe, expect, it } from 'vitest';
import { isAutoContinuableRunError } from '@/hooks/ws-handlers/chat-handlers';

describe('isAutoContinuableRunError', () => {
  it('accepts a provider failure the provider marked recoverable', () => {
    for (const code of [
      'PROVIDER_OVERLOADED',
      'PROVIDER_RATE_LIMITED',
      'PROVIDER_SERVER_ERROR',
      'PROVIDER_NETWORK_ERROR',
    ]) {
      expect(isAutoContinuableRunError({ code, recoverable: true })).toBe(true);
    }
  });

  it('refuses everything a plain continue would repeat or override', () => {
    // Non-retryable provider failures fail the same way again.
    expect(isAutoContinuableRunError({ code: 'PROVIDER_AUTH_FAILED', recoverable: false })).toBe(
      false,
    );
    expect(
      isAutoContinuableRunError({ code: 'PROVIDER_INVALID_REQUEST', recoverable: false }),
    ).toBe(false);
    // Recoverable, but a continue overflows again.
    expect(
      isAutoContinuableRunError({ code: 'PROVIDER_CONTEXT_OVERFLOW', recoverable: true }),
    ).toBe(false);
    expect(isAutoContinuableRunError({ code: 'AGENT_CONTEXT_OVERFLOW', recoverable: true })).toBe(
      false,
    );
    // The iteration budget and user aborts stopped the run on purpose.
    expect(isAutoContinuableRunError({ code: 'AGENT_ITERATION_LIMIT', recoverable: true })).toBe(
      false,
    );
    expect(isAutoContinuableRunError({ code: 'AGENT_ABORTED', recoverable: false })).toBe(false);
    expect(isAutoContinuableRunError({ recoverable: true })).toBe(false);
    expect(isAutoContinuableRunError(undefined)).toBe(false);
  });
});
