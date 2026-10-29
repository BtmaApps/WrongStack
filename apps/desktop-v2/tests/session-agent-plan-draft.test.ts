import { describe, expect, it } from 'vitest';
import { agentModelPlan } from '../src/session-agent-plan';
import { agentPlanDraftCodec } from '../src/session-agent-plan-draft';

describe('session model plan draft envelope', () => {
  it('round-trips the plan with the saved plan it was edited from', () => {
    const plan = agentModelPlan({ enabled: true, slots: [{ provider: 'p', model: 'm' }] });
    const base = { enabled: false, slots: [] };
    expect(agentPlanDraftCodec.parse(agentPlanDraftCodec.serialize({ base, plan }))).toEqual({
      base,
      plan,
    });
    // A session without a stored plan has no base; it is kept as null, not dropped.
    expect(
      agentPlanDraftCodec.parse(agentPlanDraftCodec.serialize({ base: undefined, plan }))?.base,
    ).toBeNull();
    expect(agentPlanDraftCodec.parse(null)).toBeNull();
  });
  it('refuses foreign envelopes and plans the engine projection would refuse', () => {
    const plan = agentModelPlan({});
    for (const value of [
      { version: 2, base: null, plan },
      { version: 1, base: null, plan: [] },
      { version: 1, base: null },
      [],
    ])
      expect(() => agentPlanDraftCodec.parse(value)).toThrow(/unsupported format/);
    expect(() =>
      agentPlanDraftCodec.parse({ version: 1, base: null, plan: { slots: Array(17).fill({}) } }),
    ).toThrow(/invalid model lanes/);
  });
});
