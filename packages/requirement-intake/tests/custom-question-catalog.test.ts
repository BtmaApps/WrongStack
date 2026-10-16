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
});
