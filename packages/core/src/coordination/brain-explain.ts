/**
 * Brain decision explainer and dry-run simulation.
 *
 * Autonomy workloads and operators need to inspect why a decision was made
 * at a specific tier (or why it will be routed to a specific tier) without
 * triggering side effects, firing events, or mutating cache and ledger states.
 *
 * @module brain-explain
 */

import type {
  BrainDecision,
  BrainDecisionRequest,
  BrainEscalationMode,
  BrainRisk,
  BrainTerminalPolicy,
} from './brain.js';
import { BRAIN_RISK_LEVELS, terminalPolicyDecision } from './brain.js';
import type { BrainDecisionCache } from './brain-cache.js';
import {
  type BrainHeuristicsConfig,
  isBlockedResolved,
  isContinuePing,
  isDeadlockWithFailedWork,
  isRetryExhausted,
  resolveBrainHeuristics,
} from './brain-heuristics.js';
import { type BrainAutoRisk, resolveRiskCeiling } from './brain-risk.js';
import type { CompiledBrainRule } from './brain-rules.js';
import { applyRule, ruleMatches } from './brain-rules.js';

export interface BrainExplainLedgerHost {
  isEnabled(): boolean;
  failureStreakFor?:
    | ((request: Pick<BrainDecisionRequest, 'source' | 'question' | 'id'>) => number)
    | undefined;
}

export interface BrainExplainContext {
  ledger?: BrainExplainLedgerHost | undefined;
  ledgerAutoDenyAfterFailures?: number | undefined;
  cache?: Pick<BrainDecisionCache, 'isEnabled' | 'peek'> | undefined;
  rules?: readonly CompiledBrainRule[] | undefined;
  heuristics?: BrainHeuristicsConfig | undefined;
  maxAutoRisk?: BrainAutoRisk | BrainRisk | undefined;
  council?:
    | {
        enabled?: boolean | undefined;
        minRisk?: 'medium' | 'high' | 'critical' | undefined;
      }
    | undefined;
  mode?: BrainEscalationMode | undefined;
  terminalPolicy?: BrainTerminalPolicy | undefined;
}

export type BrainDecisionTierName =
  | 'ledger_guard'
  | 'cache'
  | 'rule'
  | 'heuristic'
  | 'risk_gate'
  | 'terminal';

export interface BrainDecisionStepExplanation {
  tier: BrainDecisionTierName;
  status: 'settled' | 'passed' | 'skipped' | 'disabled';
  reason: string;
  decision?: BrainDecision | undefined;
}

export interface BrainDecisionExplanation {
  request: BrainDecisionRequest;
  steps: BrainDecisionStepExplanation[];
  verdict: {
    settledDeterministically: boolean;
    resolvingTier?: BrainDecisionTierName | undefined;
    decision?: BrainDecision | undefined;
    nextTierIfNotSettled?: 'council' | 'autonomous_llm' | 'ask_human' | undefined;
    reason: string;
  };
}

/**
 * Perform a pure, side-effect-free dry run of the deterministic decision pipeline.
 */
export function explainBrainDecision(
  request: BrainDecisionRequest,
  ctx: BrainExplainContext = {},
): BrainDecisionExplanation {
  const steps: BrainDecisionStepExplanation[] = [];

  // 1. Ledger Guard Stage
  if (ctx.ledger && ctx.ledger.isEnabled() && ctx.ledger.failureStreakFor) {
    const streak = ctx.ledger.failureStreakFor(request);
    const threshold = ctx.ledgerAutoDenyAfterFailures ?? 3;
    if (streak >= threshold) {
      const decision: BrainDecision = {
        type: 'deny',
        reason:
          `Ledger guard auto-denied: ${streak} consecutive failures recorded for similar decisions ` +
          `(source: ${request.source}, question: "${request.question}").`,
      };
      steps.push({
        tier: 'ledger_guard',
        status: 'settled',
        reason: `Ledger guard auto-deny triggered: ${streak} consecutive failures recorded (threshold: ${threshold}).`,
        decision,
      });
      return {
        request,
        steps,
        verdict: {
          settledDeterministically: true,
          resolvingTier: 'ledger_guard',
          decision,
          reason: `Vetoed by ledger guard failure streak (${streak} >= ${threshold}).`,
        },
      };
    }
    steps.push({
      tier: 'ledger_guard',
      status: 'passed',
      reason: `Failure streak (${streak}) is below auto-deny threshold (${threshold}).`,
    });
  } else {
    steps.push({
      tier: 'ledger_guard',
      status: 'disabled',
      reason: 'Ledger guard is disabled or unconfigured.',
    });
  }

  // 2. Decision Cache Stage
  if (ctx.cache && ctx.cache.isEnabled()) {
    const cachedDecision = ctx.cache.peek(request);
    if (cachedDecision) {
      steps.push({
        tier: 'cache',
        status: 'settled',
        reason: 'Cached verdict available for normalized request.',
        decision: cachedDecision,
      });
      return {
        request,
        steps,
        verdict: {
          settledDeterministically: true,
          resolvingTier: 'cache',
          decision: cachedDecision,
          reason: 'Replayed cached verdict.',
        },
      };
    }
    steps.push({
      tier: 'cache',
      status: 'passed',
      reason: 'Cache miss (no unexpired entry found for request).',
    });
  } else {
    steps.push({
      tier: 'cache',
      status: 'disabled',
      reason: 'Decision cache is disabled or unconfigured.',
    });
  }

  // 3. Rule Tier Stage
  if (ctx.rules && ctx.rules.length > 0) {
    let matchedRule: CompiledBrainRule | undefined;
    for (const rule of ctx.rules) {
      if (ruleMatches(rule, request)) {
        matchedRule = rule;
        break;
      }
    }
    if (matchedRule) {
      const decision = applyRule(matchedRule, request);
      if (decision) {
        steps.push({
          tier: 'rule',
          status: 'settled',
          reason: `Rule "${matchedRule.id}" matched and produced a decision.`,
          decision,
        });
        return {
          request,
          steps,
          verdict: {
            settledDeterministically: true,
            resolvingTier: 'rule',
            decision,
            reason: `Configured rule "${matchedRule.id}" resolved the request.`,
          },
        };
      }
      steps.push({
        tier: 'rule',
        status: 'passed',
        reason: `Rule "${matchedRule.id}" matched but deferred or produced no immediate action.`,
      });
    } else {
      steps.push({
        tier: 'rule',
        status: 'passed',
        reason: 'No configured rules matched this request.',
      });
    }
  } else {
    steps.push({
      tier: 'rule',
      status: 'disabled',
      reason: 'No rules configured.',
    });
  }

  // 4. Deterministic Heuristics Stage
  const heuristics = resolveBrainHeuristics(ctx.heuristics);
  const recommended = request.options?.find((o) => o.recommended);

  if (heuristics.lowRiskAutoAnswer && request.risk === 'low' && recommended) {
    const decision: BrainDecision = {
      type: 'answer',
      optionId: recommended.id,
      text: recommended.label,
      rationale: 'Low-risk request with an explicit recommended option.',
    };
    steps.push({
      tier: 'heuristic',
      status: 'settled',
      reason: 'Low-risk heuristic matched: auto-answering with caller-recommended option.',
      decision,
    });
    return {
      request,
      steps,
      verdict: {
        settledDeterministically: true,
        resolvingTier: 'heuristic',
        decision,
        reason: 'Settled deterministically by lowRiskAutoAnswer heuristic.',
      },
    };
  }

  // Options are control-plane choices; heuristics do not override explicit options
  if (!request.options?.length) {
    const q = request.question.toLowerCase();
    const c = (request.context ?? '').toLowerCase();

    if (
      heuristics.blockedResolved &&
      request.fallback === 'continue' &&
      request.context &&
      isBlockedResolved(q, c, heuristics.blockedResolvedMarkers)
    ) {
      const decision: BrainDecision = {
        type: 'answer',
        text: 'Blocker resolved. Continue with the previously blocked work.',
        rationale: 'Heuristic: blocking dependency explicitly resolved — resuming.',
      };
      steps.push({
        tier: 'heuristic',
        status: 'settled',
        reason: 'Blocked-resolved heuristic matched: blocking dependency resolved.',
        decision,
      });
      return {
        request,
        steps,
        verdict: {
          settledDeterministically: true,
          resolvingTier: 'heuristic',
          decision,
          reason: 'Settled deterministically by blockedResolved heuristic.',
        },
      };
    }

    if (heuristics.deadlockSkip && request.context && isDeadlockWithFailedWork(q, c)) {
      const decision: BrainDecision = {
        type: 'answer',
        text: 'Skip deadlocked tasks and continue with remaining work. Failed tasks will be reported in the final summary.',
        rationale:
          'Heuristic: deadlocked tasks blocked by failed dependencies — skipping unblocks remaining work.',
      };
      steps.push({
        tier: 'heuristic',
        status: 'settled',
        reason: 'Deadlock-skip heuristic matched: deadlocked work skipped.',
        decision,
      });
      return {
        request,
        steps,
        verdict: {
          settledDeterministically: true,
          resolvingTier: 'heuristic',
          decision,
          reason: 'Settled deterministically by deadlockSkip heuristic.',
        },
      };
    }

    if (heuristics.retryExhausted && request.context && isRetryExhausted(q, c)) {
      const decision: BrainDecision = {
        type: 'answer',
        text: 'Mark as failed and move on. Note the failure for the final report.',
        rationale: 'Heuristic: retries exhausted — continuing would waste resources.',
      };
      steps.push({
        tier: 'heuristic',
        status: 'settled',
        reason: 'Retry-exhausted heuristic matched: stopping exhausted retries.',
        decision,
      });
      return {
        request,
        steps,
        verdict: {
          settledDeterministically: true,
          resolvingTier: 'heuristic',
          decision,
          reason: 'Settled deterministically by retryExhausted heuristic.',
        },
      };
    }

    if (heuristics.continuePing && request.fallback === 'continue' && isContinuePing(q)) {
      const decision: BrainDecision = {
        type: 'answer',
        text: 'Continue execution. Do not stop.',
        rationale: 'Heuristic: autonomy mode — continue until all work is complete.',
      };
      steps.push({
        tier: 'heuristic',
        status: 'settled',
        reason: 'Continue-ping heuristic matched: auto-continuing heartbeat ping.',
        decision,
      });
      return {
        request,
        steps,
        verdict: {
          settledDeterministically: true,
          resolvingTier: 'heuristic',
          decision,
          reason: 'Settled deterministically by continuePing heuristic.',
        },
      };
    }
  }

  steps.push({
    tier: 'heuristic',
    status: 'passed',
    reason: 'No deterministic heuristics matched.',
  });

  // 5. Risk Gate & Qualification Stage
  const maxRiskLevel = resolveRiskCeiling(ctx.maxAutoRisk as BrainAutoRisk | undefined);
  const reqRiskLevel = BRAIN_RISK_LEVELS[request.risk] ?? 1;
  const councilEnabled = ctx.council?.enabled ?? false;
  const councilMinRisk = ctx.council?.minRisk ?? 'high';
  const councilMinLevel = BRAIN_RISK_LEVELS[councilMinRisk] ?? 2;

  const councilEligible = councilEnabled && reqRiskLevel >= councilMinLevel;
  const autoEligible = reqRiskLevel <= maxRiskLevel;

  let nextTier: 'council' | 'autonomous_llm' | 'ask_human';
  let nextReason: string;

  if (councilEligible) {
    nextTier = 'council';
    nextReason = `Request risk "${request.risk}" meets council floor "${councilMinRisk}": eligible for Multi-LLM Council.`;
  } else if (autoEligible) {
    nextTier = 'autonomous_llm';
    nextReason = `Request risk "${request.risk}" is within maxAutoRisk "${String(ctx.maxAutoRisk ?? 'medium')}": eligible for Autonomous LLM pool.`;
  } else {
    nextTier = 'ask_human';
    nextReason = `Request risk "${request.risk}" exceeds maxAutoRisk "${String(ctx.maxAutoRisk ?? 'medium')}" and council is not eligible: requires escalation.`;
  }

  steps.push({
    tier: 'risk_gate',
    status: 'passed',
    reason: nextReason,
  });

  // 6. Terminal Escalation Stage (Headless Mode Simulation)
  if (
    nextTier === 'ask_human' &&
    (ctx.mode === 'headless' || request.allowHumanEscalation === false)
  ) {
    const termPolicy = ctx.terminalPolicy ?? 'conservative';
    const termDecision = terminalPolicyDecision(request, termPolicy);
    steps.push({
      tier: 'terminal',
      status: 'settled',
      reason: `Headless mode or human escalation disallowed: resolved deterministically by terminal policy "${termPolicy}".`,
      decision: termDecision,
    });
    return {
      request,
      steps,
      verdict: {
        settledDeterministically: true,
        resolvingTier: 'terminal',
        decision: termDecision,
        reason: `Terminal policy "${termPolicy}" resolved the escalation without human prompt.`,
      },
    };
  }

  // Fallthrough to non-deterministic tier
  return {
    request,
    steps,
    verdict: {
      settledDeterministically: false,
      nextTierIfNotSettled: nextTier,
      reason: nextReason,
    },
  };
}
