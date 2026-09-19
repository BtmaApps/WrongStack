/**
 * The Kanban criterion judge: one Noul over (criterion, diff).
 *
 * Kanban treats `undefined` as "no opinion, use the other verifier", so every
 * failure — host error, timeout, an answer of the wrong shape — has to come
 * back as `undefined`, never as a probability and never as a throw.
 */

import { describe, expect, it, vi } from 'vitest';
import type { SystemOneRequest, SystemOneResult, TypeSafeJudge } from '../src/typesafe/index.js';
import { createTypeSafeCriterionJudge } from '../src/typesafe/index.js';

function judgeWith(
  systemOne: (req: SystemOneRequest, signal?: AbortSignal) => Promise<SystemOneResult>,
): TypeSafeJudge {
  return {
    client: { systemOne: vi.fn(systemOne) } as unknown as TypeSafeJudge['client'],
    model: 'jev-test',
    feature: 'kanbanVerify',
  };
}

const input = {
  criterion: '`status` accepts --json',
  diff: "+ .option('--json')",
  changedFiles: ['src/status.ts'],
};

describe('createTypeSafeCriterionJudge', () => {
  it('asks one Noul over the criterion, diff and files and returns its probability', async () => {
    const judge = judgeWith(async () => ({
      answers: { met: { type: 'noul', noul: 0.97 } },
      usage: { inputTokens: 1, outputTokens: 1 },
      model: 'jev-1.13.0',
    }));
    const result = await createTypeSafeCriterionJudge(judge)(input);
    expect(result).toEqual({ probability: 0.97, model: 'jev-1.13.0' });

    const [req, signal] = vi.mocked(judge.client.systemOne).mock.calls[0]!;
    expect(req.state).toEqual({
      criterion: input.criterion,
      changedFiles: input.changedFiles,
      diff: input.diff,
    });
    expect(req.questions['met']?.type).toBe('noul');
    expect(req.model).toBe('jev-test');
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("falls back to the judge's model when the host does not echo one", async () => {
    const judge = judgeWith(async () => ({
      answers: { met: { type: 'noul', noul: 0.02 } },
      usage: { inputTokens: 1, outputTokens: 1 },
    }));
    expect(await createTypeSafeCriterionJudge(judge)(input)).toEqual({
      probability: 0.02,
      model: 'jev-test',
    });
  });

  it('has no opinion when the answer is missing or of another type', async () => {
    const judge = judgeWith(async () => ({
      answers: { met: { type: 'choice', choice: 'x', probabilities: { x: 1 }, confidence: 1 } },
      usage: { inputTokens: 1, outputTokens: 1 },
    }));
    expect(await createTypeSafeCriterionJudge(judge)(input)).toBeUndefined();
    const empty = judgeWith(async () => ({
      answers: {},
      usage: { inputTokens: 1, outputTokens: 1 },
    }));
    expect(await createTypeSafeCriterionJudge(empty)(input)).toBeUndefined();
  });

  it('has no opinion when the host fails, instead of throwing into Kanban', async () => {
    const judge = judgeWith(async () => {
      throw new Error('503');
    });
    await expect(createTypeSafeCriterionJudge(judge)(input)).resolves.toBeUndefined();
  });

  it('gives up at the timeout', async () => {
    const judge = judgeWith(
      (_req, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason));
        }),
    );
    await expect(
      createTypeSafeCriterionJudge(judge, { timeoutMs: 10 })(input),
    ).resolves.toBeUndefined();
  });
});
