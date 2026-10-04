import { vi } from 'vitest';

const fake = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('@wrongstack/tools', () => ({ searchTool: { execute: fake.execute } }));

import { createToolSearch } from '../../src/research/search.js';

async function searchCase(cancel: boolean, outcome: 'result' | 'empty' | 'error' = 'result') {
  let entered!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((r) => {
    entered = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const abort = new AbortController();
  fake.execute.mockImplementation(async () => {
    entered();
    await gate;
    if (outcome === 'error') throw new Error('search failed');
    return {
      results:
        outcome === 'empty'
          ? []
          : [{ title: 'late', url: 'https://example.test', snippet: 'late' }],
    };
  });
  const pending = createToolSearch()('query', { signal: abort.signal });
  await ready;
  if (cancel) abort.abort();
  release();
  return pending;
}

import { expect, it } from 'vitest';

it('verifies cancelled nonempty, empty, rejected completions and live mapping', async () => {
  for (const outcome of ['result', 'empty', 'error'] as const)
    expect(await searchCase(true, outcome)).toEqual([]);
  expect(await searchCase(false)).toEqual([
    { title: 'late', url: 'https://example.test', snippet: 'late' },
  ]);
});
