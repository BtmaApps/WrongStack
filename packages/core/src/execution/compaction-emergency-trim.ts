import type { Context } from '../core/context.js';

import type { ContextWindowBudgetSnapshot } from '../utils/context-budget.js';

import { estimateRequestTokens, estimateRequestTokensUpperBound } from '../utils/token-estimate.js';

import { enforceHardBudget, estimateMessages } from './compaction-core.js';

export function emergencyTrim(
  ctx: Context,
  budget: ContextWindowBudgetSnapshot,
  hardThreshold: number,
  preserveK: number,
  invalidateTokenCaches: (ctx: Context) => void,
): {
  saved: number;
  trimmedBlocks: number;
  droppedMessages: number;
  withinBudget: boolean;
} | null {
  const rawMessageTokens = estimateMessages(ctx.messages);
  const rawFull = estimateRequestTokens(ctx.messages, ctx.systemPrompt, ctx.tools ?? []).total;
  const rawOverhead = Math.max(0, rawFull - rawMessageTokens);
  // Target 95% of the hard line, expressed in the estimator's raw scale.
  const targetGuardFull = Math.floor(hardThreshold * budget.availableInputTokens * 0.95);
  // `enforceHardBudget` counts raw tokens, but the request is measured by the
  // upper-bound guard. Deflate the raw message budget by the current density
  // inflation so the trimmed request fits the guard, not just the raw
  // estimate — over-trimming slightly is the safe direction here.
  const guardFull = estimateRequestTokensUpperBound(
    ctx.messages,
    ctx.systemPrompt,
    ctx.tools ?? [],
    `${ctx.provider?.id ?? 'unknown'}/${ctx.model}`,
  ).total;
  const inflation = rawFull > 0 ? Math.max(1, guardFull / rawFull) : 1;
  const messageBudget = Math.max(1, Math.floor(targetGuardFull / inflation) - rawOverhead);
  const result = enforceHardBudget(ctx.messages, messageBudget, {
    preserveK: preserveK,
  });
  if (!result.changed) return null;
  ctx.state.replaceMessages(result.messages);
  invalidateTokenCaches(ctx);
  return {
    saved: result.saved,
    trimmedBlocks: result.trimmedBlocks,
    droppedMessages: result.droppedMessages,
    withinBudget: result.withinBudget,
  };
}
