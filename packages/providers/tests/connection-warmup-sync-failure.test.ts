import { expect, it } from 'vitest';
import { warmConnection } from '../src/connection-warmup.js';

it.each(['sync', 'async'] as const)('allows a new warmup after %s fetch failure', async (mode) => {
  let calls = 0;
  const fetchImpl = (() => {
    calls++;
    if (calls === 1) {
      if (mode === 'sync') throw new Error('fetch setup failed');
      return Promise.reject(new Error('fetch failed'));
    }
    return Promise.resolve(new Response(null));
  }) as typeof fetch;
  const url = `https://warmup-${mode}-failure.example/v1`;
  await warmConnection(url, fetchImpl, 1000);
  await warmConnection(url, fetchImpl, 1050);
  expect(calls).toBe(2);
});
