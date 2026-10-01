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
      expect(isAutoContinuableRunError({ code, recoverable: true }, 'failed')).toBe(true);
    }
  });

  it('refuses everything a plain continue would repeat or override', () => {
    const failed = (error: { code?: string; recoverable?: boolean } | undefined) =>
      isAutoContinuableRunError(error, 'failed');
    // Non-retryable provider failures fail the same way again.
    expect(failed({ code: 'PROVIDER_AUTH_FAILED', recoverable: false })).toBe(false);
    expect(failed({ code: 'PROVIDER_INVALID_REQUEST', recoverable: false })).toBe(false);
    // Recoverable, but a continue overflows again.
    expect(failed({ code: 'PROVIDER_CONTEXT_OVERFLOW', recoverable: true })).toBe(false);
    expect(failed({ code: 'AGENT_CONTEXT_OVERFLOW', recoverable: true })).toBe(false);
    // The iteration budget and user aborts stopped the run on purpose.
    expect(failed({ code: 'AGENT_ITERATION_LIMIT', recoverable: true })).toBe(false);
    expect(failed({ code: 'AGENT_ABORTED', recoverable: false })).toBe(false);
    expect(failed({ recoverable: true })).toBe(false);
    expect(failed(undefined)).toBe(false);
  });

  it('never arms for a run the user stopped, whatever error the cut request left', () => {
    // Stop mid-stream: core returns `aborted` carrying the provider's own
    // error for the severed request — recoverable, PROVIDER_* coded.
    for (const code of ['PROVIDER_NETWORK_ERROR', 'PROVIDER_RATE_LIMITED', 'PROVIDER_OVERLOADED']) {
      expect(isAutoContinuableRunError({ code, recoverable: true }, 'aborted')).toBe(false);
    }
    expect(
      isAutoContinuableRunError({ code: 'PROVIDER_SERVER_ERROR', recoverable: true }, 'done'),
    ).toBe(false);
    expect(
      isAutoContinuableRunError(
        { code: 'PROVIDER_SERVER_ERROR', recoverable: true },
        'max_iterations',
      ),
    ).toBe(false);
  });
});
