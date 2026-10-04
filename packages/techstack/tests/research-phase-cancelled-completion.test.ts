import { vi } from 'vitest';
import { runResearchPhase } from '../src/service/research-phase.js';

async function researchCase(cancel: boolean, outcome: 'finding' | 'empty' | 'error' = 'finding') {
  const snapshot = {
    id: 'snapshot',
    dependencies: [
      {
        id: 'dep',
        workspaceId: 'ws',
        name: 'pkg',
        ecosystem: 'npm',
        sourceType: 'registry',
        scope: 'runtime',
        requested: '1',
        locked: '1',
        direct: true,
        status: 'update_available_breaking',
        evidence: [],
      },
    ],
    findings: [],
  } as never;
  let entered!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((r) => {
    entered = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const abort = new AbortController();
  const progress = vi.fn();
  const pending = runResearchPhase(snapshot, {
    signal: abort.signal,
    onProgress: progress,
    researcher: {
      research: async () => {
        entered();
        await gate;
        if (outcome === 'error') throw new Error('research failure');
        return outcome === 'empty' ? [] : [{ id: 'late' } as never];
      },
    },
  });
  await ready;
  if (cancel) abort.abort();
  release();
  const result = await pending;
  return {
    result,
    snapshot,
    synthesizing: progress.mock.calls.some(([phase]) => phase === 'synthesizing'),
  };
}

import { expect, it } from 'vitest';

it('verifies cancellation after finding/empty/error completions and unchanged live result', async () => {
  for (const outcome of ['finding', 'empty', 'error'] as const) {
    const actual = await researchCase(true, outcome);
    expect(actual.result).toBe(actual.snapshot);
    expect(actual.synthesizing).toBe(false);
  }
  const control = await researchCase(false);
  expect(control.result.findings).toHaveLength(1);
  expect(control.synthesizing).toBe(true);
});
