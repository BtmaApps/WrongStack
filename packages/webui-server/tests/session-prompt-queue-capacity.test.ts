import { expect, it, vi } from 'vitest';

const seam = vi.hoisted(() => ({ hold: undefined as undefined | (() => Promise<void>) }));
vi.mock('../src/server/incoming-documents.js', () => ({
  pdfPromptBlocks: async () => {
    await seam.hold?.();
    return [];
  },
}));

import { createSessionPromptQueue } from '../src/server/session-prompt-queue.js';

it('keeps capacity across gated contention, empty and separate sessions', async () => {
  for (const [filled, contenders] of [
    [99, 2],
    [98, 5],
    [0, 3],
  ]) {
    const q = createSessionPromptQueue({
      isBusy: () => true,
      startTurn: async () => false,
      broadcast: () => {},
    });
    for (let i = 0; i < filled!; i++) await q.add('s', { text: String(i) });
    let entered!: () => void;
    let count = 0;
    const releases: Array<() => void> = [];
    const ready = new Promise<void>((r) => {
      entered = r;
    });
    seam.hold = () =>
      new Promise<void>((r) => {
        releases.push(r);
        if (++count === contenders) entered();
      });
    const pending = Array.from({ length: contenders! }, (_, i) => q.add('s', { text: `new${i}` }));
    await ready;
    for (const release of releases.reverse()) release();
    const results = await Promise.all(pending);
    seam.hold = undefined;
    const accepted = Math.min(contenders!, 100 - filled!);
    expect(results.filter((r) => r.ok)).toHaveLength(accepted);
    expect(await q.list('s')).toHaveLength(filled! + accepted);
    expect((await q.add('other', { text: 'independent' })).ok).toBe(true);
    expect(await q.list('other')).toHaveLength(1);
  }
  console.log('FIX VERIFIED');
});
