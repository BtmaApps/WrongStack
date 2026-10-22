import { expect, it } from 'vitest';
import { automationCancelHandoff } from './helpers/automation-cancel-handoff.js';

it.each(['queued', 'claim', 'active'] as const)(
  'cancels a local run during the %s phase',
  async (phase) => {
    expect(await automationCancelHandoff(phase)).toEqual({ outcome: 'ok', status: 'cancelled' });
  },
);
