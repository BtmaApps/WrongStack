import { describe, expect, it, vi } from 'vitest';
import { fileTriageProposals } from '../../src/shared/file-proposals.js';

describe('fileTriageProposals', () => {
  const recent = new Date(Date.now() - 86_400_000).toISOString();

  it('skips a proposal whose unchanged memory a human already reviewed', async () => {
    const createCandidate = vi.fn(async (_input: { targetMemoryId?: string }) => ({ id: 'new' }));
    const surface = {
      listCandidates: async () => [
        {
          status: 'rejected',
          kind: 'memory_review',
          targetMemoryId: 'kept',
          text: 'Kept memory preview',
          updatedAt: recent,
        },
        {
          status: 'rejected',
          kind: 'memory_review',
          targetMemoryId: 'edited',
          text: 'Old wording',
          updatedAt: recent,
        },
      ],
      getSage: async (id: string) =>
        id === 'kept'
          ? { id, text: 'Kept memory preview and the rest of it' }
          : { id, text: 'New wording after an edit' },
      createCandidate,
    };

    const result = await fileTriageProposals(surface as never, [
      {
        memoryId: 'kept',
        memoryText: 'Kept memory preview',
        suggestedAction: 'archive',
        reason: 'r',
      },
      { memoryId: 'edited', memoryText: 'New wording', suggestedAction: 'archive', reason: 'r' },
      { memoryId: 'fresh', memoryText: 'Never reviewed', suggestedAction: 'archive', reason: 'r' },
    ]);

    expect(result.skippedAsReviewed).toBe(1);
    expect(result.filed).toBe(2);
    expect(createCandidate.mock.calls.map(([input]) => input.targetMemoryId)).toEqual([
      'edited',
      'fresh',
    ]);
  });
});
