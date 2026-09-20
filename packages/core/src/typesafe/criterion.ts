/**
 * "Does this evidence show the criterion is met?" as one System One Noul.
 *
 * The shape is the citation check: a claim (a task's acceptance criterion)
 * and the evidence that should support it (the task's diff). Kanban installs
 * the returned function as its criterion judge; it is structural, so core
 * does not import kanban and kanban does not import the TypeSafe client.
 */

import type { TypeSafeJudge } from './judgments.js';

export interface CriterionJudgeInput {
  criterion: string;
  diff: string;
  changedFiles: string[];
}

export interface CriterionJudgeResult {
  probability: number;
  model?: string | undefined;
}

export function createTypeSafeCriterionJudge(
  judge: TypeSafeJudge,
  opts: { timeoutMs?: number | undefined } = {},
): (input: CriterionJudgeInput) => Promise<CriterionJudgeResult | undefined> {
  const timeoutMs = opts.timeoutMs ?? 8_000;
  return async (input) => {
    try {
      const result = await judge.client.systemOne(
        {
          activityFeature: judge.feature,
          state: {
            criterion: input.criterion,
            changedFiles: input.changedFiles,
            diff: input.diff,
          },
          questions: {
            met: {
              type: 'noul',
              instructions:
                'Does `diff` show that `criterion` has been implemented? Judge only what the ' +
                'diff itself shows, not what a commit message or comment claims.',
              criteria: {
                true: 'The changes visibly do what the criterion asks for.',
                false: 'The changes do not do it, do only part of it, or are about something else.',
              },
            },
          },
          model: judge.model,
        },
        AbortSignal.timeout(timeoutMs),
      );
      const answer = result.answers['met'];
      if (answer?.type !== 'noul') return undefined;
      return { probability: answer.noul, model: result.model ?? judge.model };
    } catch {
      return undefined;
    }
  };
}
