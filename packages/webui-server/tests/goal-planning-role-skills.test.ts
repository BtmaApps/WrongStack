import { describe, expect, it, vi } from 'vitest';
import { planGoalPhases } from '../src/server/goal-ws-handler-hosts.js';

/**
 * #416: the WebUI goal planner ran as the `planner` role, whose skills teach a
 * Markdown plan layout. A model that followed them returned no JSON, and the
 * goal failed with zero phases. Uses the real GoalPlanner (no core mock).
 */
describe('planGoalPhases (#416)', () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    level: 'info',
  };

  it('spawns the planner without role skills and recovers a Markdown answer', async () => {
    const plan = JSON.stringify([
      { name: 'Survey', tasks: [{ title: 'Read the docs', type: 'docs', priority: 'low' }] },
    ]);
    const plannerRun = vi
      .fn()
      .mockResolvedValueOnce({ status: 'done', finalText: '## Plan Summary\n| 1 | Read |' })
      .mockResolvedValueOnce({ status: 'done', finalText: '```json\n' + plan + '\n```' });
    const dispose = vi.fn();
    const taskAgentFactory = vi.fn(async () => ({
      agent: { run: plannerRun },
      events: {},
      dispose,
    }));

    const phases = await planGoalPhases(
      { goalId: 'goal-416', taskAgentFactory, projectRoot: '/proj', logger } as never,
      'document the repo',
    );

    expect(taskAgentFactory).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'planner', skillNames: [] }),
    );
    expect(plannerRun).toHaveBeenCalledTimes(2);
    expect(phases.map((p) => p.name)).toEqual(['Survey']);
    expect(dispose).toHaveBeenCalledOnce();
  });
});
