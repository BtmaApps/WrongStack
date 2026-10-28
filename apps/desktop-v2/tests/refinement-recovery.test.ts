import { expect, it } from 'vitest';
import { EngineReplyError } from '../src/engine-operations';
import { refinementRecovery } from '../src/refinement-recovery';

it('offers reported timeout recovery and keeps nested model IDs intact', () => {
  expect(
    refinementRecovery(
      new EngineReplyError('No result', {
        errorKind: 'timeout',
        retryTimeoutMs: 240000,
        fallbackRef: 'local/org/model',
      }),
    ),
  ).toMatchObject({
    message: 'No result',
    guidance: expect.stringContaining('longer window'),
    retryTimeoutMs: 240000,
    fallback: { provider: 'local', model: 'org/model' },
  });
});
it('does not turn malformed recovery hints into executable routes or overflowing timers', () => {
  for (const fallbackRef of ['', '/model', 'provider/', 'model']) {
    const result = refinementRecovery(
      new EngineReplyError('Refused', {
        errorKind: 'timeout',
        retryTimeoutMs: Number.MAX_VALUE,
        fallbackRef,
      }),
    );
    expect(result.fallback).toBeUndefined();
    expect(result.retryTimeoutMs).toBe(180000);
  }
  expect(refinementRecovery(new Error('Disconnected')).message).toBe('Disconnected');
  expect(
    refinementRecovery(new EngineReplyError('Failed', { errorKind: 'empty' })).guidance,
  ).toContain('usable rewrite');
  expect(
    refinementRecovery(new EngineReplyError('Failed', { errorKind: 'provider_error' })).guidance,
  ).toContain('connection');
});
