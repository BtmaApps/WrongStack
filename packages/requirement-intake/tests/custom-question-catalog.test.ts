/**
 * Custom question catalogs flow through the service's record builder, which
 * defaults a missing `required` flag to false instead of propagating
 * `undefined` onto the question.
 */
import { describe, expect, it } from 'vitest';
import { ALICE, makeHarness } from './helpers.js';

describe('custom question catalogs', () => {
  it('defaults a missing required flag to false and keeps explicit flags', async () => {
    const harness = makeHarness();
    const { record } = await harness.service.createIntake(
      {
        projectId: ALICE.projectId,
        originalRequest: 'Add SSO.',
        requestedBy: ALICE.id,
        questions: [
          { field: 'alpha', question: 'Required one?', required: true },
          { field: 'beta', question: 'Flagged-off one?' },
        ],
      },
      ALICE,
    );

    const byField = new Map(record.questions.map((question) => [question.field, question]));
    expect(byField.get('alpha')?.required).toBe(true);
    expect(byField.get('beta')?.required).toBe(false);
  });

  it('defaults a missing required flag on an accepted question suggestion proposal to false (F650)', async () => {
    const { applySuggestionProposal } = await import('../src/service-helpers.js');
    const harness = makeHarness();
    const { record } = await harness.service.createIntake(
      {
        projectId: ALICE.projectId,
        originalRequest: 'Add SSO.',
        requestedBy: ALICE.id,
      },
      ALICE,
    );
    applySuggestionProposal(record, {
      id: 'sug_q1',
      kind: 'question',
      status: 'accepted',
      rationale: 'Optional question',
      value: { field: 'gamma', question: 'Optional gamma?' } as never,
      createdAt: Date.now(),
    });
    const gamma = record.questions.find((q) => q.field === 'gamma');
    expect(gamma?.required).toBe(false);
  });
});
