import { GovernanceManagementReceiptCache } from '../src/management-receipt-cache.js';

async function receiptCase(replace: boolean, action: 'release' | 'commit' = 'release') {
  let now = 100;
  const cache = new GovernanceManagementReceiptCache({ now: () => now, ttlMs: 10 });
  const credential = { projectId: 'p', clientId: 'client', token: 'fixture-token' };
  const input = { requestId: 'request', type: 'mutation' };
  const old = cache.reserve({ input, credential });
  if (!old) throw new Error('invalid fixture');
  let release!: () => void;
  const barrier = new Promise<void>((r) => {
    release = r;
  });
  const stale = barrier.then(() => {
    try {
      if (action === 'release') cache.release(old);
      else
        cache.commit(old, { ok: true, requestId: 'request', result: { type: 'fixture' } } as never);
      return 'accepted';
    } catch {
      return 'rejected';
    }
  });
  if (replace) {
    now = 111;
    if (!cache.reserve({ input, credential })) throw new Error('replacement not reserved');
  }
  release();
  const staleOutcome = await stale;
  return { kind: cache.lookup(input, credential).kind, staleOutcome };
}

import { expect, it } from 'vitest';

it('verifies stale release/commit and normal release/commit controls', async () => {
  expect((await receiptCase(true, 'release')).kind).toBe('in_progress');
  const staleCommit = await receiptCase(true, 'commit');
  expect(staleCommit.kind).toBe('in_progress');
  expect(staleCommit.staleOutcome).toBe('rejected');
  expect((await receiptCase(false, 'release')).kind).toBe('miss');
  expect((await receiptCase(false, 'commit')).kind).toBe('replay');
});
