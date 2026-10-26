import { describe, expect, it } from 'vitest';
import { taskDefinitionPatch } from '../src/task-definition-model';

describe('task definition write contracts', () => {
  it('writes edited fields without reapplying the old assignment policy or worker state', () => {
    const baseline = {
      title: 'Before',
      description: 'Context',
      priority: 'high',
      retryPolicy: 'off',
      costCeilingUsd: 5,
      status: 'ready',
    };
    expect(
      taskDefinitionPatch(baseline, {
        title: 'After',
        description: 'Context',
        priority: 'high',
        retryPolicy: 'off',
        costCeilingUsd: 5,
        status: 'ready',
      }),
    ).toEqual({ title: 'After' });
  });
  it('preserves explicit optional-field clears and compares date-only controls without truncating untouched timestamps', () => {
    const baseline = { dueDate: '2026-12-20T15:30:00.000Z', costCeilingUsd: 5, dependsOn: ['a'] };
    expect(
      taskDefinitionPatch(baseline, { dueDate: '2026-12-20', costCeilingUsd: null, dependsOn: [] }),
    ).toEqual({ costCeilingUsd: null, dependsOn: [] });
  });
});
