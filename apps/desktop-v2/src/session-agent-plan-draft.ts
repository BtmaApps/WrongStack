import type { FormDraftCodec } from './durable-form-draft';
import { type AgentModelPlan, agentModelPlan } from './session-agent-plan';

/** An unsaved session model plan and the saved plan it was edited from. */
export interface AgentPlanDraft {
  base: unknown;
  plan: AgentModelPlan;
}

/** Versioned envelope; the plan is re-checked with the same projection as the engine's. */
export const agentPlanDraftCodec: FormDraftCodec<AgentPlanDraft> = {
  serialize: (draft) => ({ version: 1, base: draft.base ?? null, plan: draft.plan }),
  parse: (value) => {
    if (value === null) return null;
    const saved = value as Record<string, unknown>;
    if (
      !saved ||
      typeof saved !== 'object' ||
      Array.isArray(saved) ||
      saved['version'] !== 1 ||
      !saved['plan'] ||
      typeof saved['plan'] !== 'object' ||
      Array.isArray(saved['plan'])
    )
      throw Error('The saved model plan draft has an unsupported format.');
    return { base: saved['base'] ?? null, plan: agentModelPlan(saved['plan']) };
  },
};
