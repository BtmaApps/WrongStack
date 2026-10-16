/**
 * Regression tests for answer-update list withdrawal.
 *
 * `applyAnswerUpdateToRecord` must withdraw only the items the edited answer
 * itself introduced. Items supplied by the create input, or still supplied by
 * another answer, must survive the edit. Contributions are recorded on each
 * answer (`contributedItems`); answers recorded before that field existed
 * fall back to the historical behavior (withdraw the full previous text).
 */
import { describe, expect, it } from 'vitest';
import { MAX_ARRAY_ITEMS } from '../src/constants.js';
import {
  applyAnswerToRecord,
  applyAnswerUpdateToRecord,
} from '../src/service-helpers.js';
import type { RequirementIntakeRecord } from '../src/types.js';
import { ALICE, makeHarness } from './helpers.js';

describe('answer updates must not withdraw create-supplied list items', () => {
  it('keeps a create-supplied constraint when the duplicating answer is edited', async () => {
    const harness = makeHarness();
    const { record } = await harness.service.createIntake(
      {
        projectId: ALICE.projectId,
        originalRequest: 'Add SSO. Hard constraint: rust-only implementation.',
        requestedBy: ALICE.id,
        constraints: ['rust'],
      },
      ALICE,
    );

    const answered = await harness.service.addAnswer(
      record.id,
      { field: 'constraints', answer: 'rust' },
      ALICE,
    );
    expect(answered.constraints).toEqual(['rust']);

    const updated = await harness.service.updateAnswer(
      record.id,
      answered.answers[0]!.id,
      { answer: 'python' },
      ALICE,
    );
    expect(updated.constraints).toEqual(['rust', 'python']);
  });

  it('still withdraws an answer-introduced item that nothing else supplies', async () => {
    const harness = makeHarness();
    const { record } = await harness.service.createIntake(
      { projectId: ALICE.projectId, originalRequest: 'Add SSO.', requestedBy: ALICE.id },
      ALICE,
    );
    const answered = await harness.service.addAnswer(
      record.id,
      { field: 'constraints', answer: 'rust' },
      ALICE,
    );

    const updated = await harness.service.updateAnswer(
      record.id,
      answered.answers[0]!.id,
      { answer: 'python' },
      ALICE,
    );
    expect(updated.constraints).toEqual(['python']);
  });

  it('keeps an item another answer still gives', async () => {
    const harness = makeHarness();
    const { record } = await harness.service.createIntake(
      { projectId: ALICE.projectId, originalRequest: 'Add SSO.', requestedBy: ALICE.id },
      ALICE,
    );
    const first = await harness.service.addAnswer(
      record.id,
      { field: 'constraints', answer: 'rust' },
      ALICE,
    );
    await harness.service.addAnswer(record.id, { field: 'constraints', answer: 'rust' }, ALICE);

    const updated = await harness.service.updateAnswer(
      record.id,
      first.answers[0]!.id,
      { answer: 'python' },
      ALICE,
    );
    expect(updated.constraints).toEqual(['rust', 'python']);
  });

  it('keeps reaffirmed items withdrawable across successive edits', async () => {
    const harness = makeHarness();
    const { record } = await harness.service.createIntake(
      { projectId: ALICE.projectId, originalRequest: 'Add SSO.', requestedBy: ALICE.id },
      ALICE,
    );
    const answered = await harness.service.addAnswer(
      record.id,
      { field: 'constraints', answer: 'rust' },
      ALICE,
    );
    const answerId = answered.answers[0]!.id;

    const widened = await harness.service.updateAnswer(
      record.id,
      answerId,
      { answer: 'rust, docker' },
      ALICE,
    );
    expect(widened.constraints).toEqual(['rust', 'docker']);

    const replaced = await harness.service.updateAnswer(
      record.id,
      answerId,
      { answer: 'python' },
      ALICE,
    );
    expect(replaced.constraints).toEqual(['python']);
  });

  it('answers recorded without contributions keep the historical withdrawal', () => {
    const record = {
      constraints: ['rust', 'docker'],
      fieldSources: {},
      questions: [],
      answers: [
        {
          id: 'ans_legacy',
          field: 'constraints',
          question: 'Any constraints?',
          answer: 'rust',
          source: 'user',
          answeredAt: 1,
        },
      ],
    } as unknown as RequirementIntakeRecord;

    applyAnswerUpdateToRecord(record, 'ans_legacy', 'python');
    expect(record.constraints).toEqual(['docker', 'python']);
  });

  it('items beyond the list cap never become withdrawable contributions', () => {
    const record = {
      constraints: Array.from({ length: MAX_ARRAY_ITEMS }, (_, i) => `item${i}`),
      fieldSources: {},
      questions: [],
      answers: [],
    } as unknown as RequirementIntakeRecord;

    applyAnswerToRecord(
      record,
      { field: 'constraints', answer: `item${MAX_ARRAY_ITEMS}` },
      ALICE.id,
      1,
    );
    expect(record.constraints).toHaveLength(MAX_ARRAY_ITEMS);
    expect(record.answers[0]!.contributedItems).toEqual([`item${MAX_ARRAY_ITEMS}`]);

    applyAnswerUpdateToRecord(record, record.answers[0]!.id, 'final');
    expect(record.constraints).toHaveLength(MAX_ARRAY_ITEMS);
    expect(record.constraints).not.toContain(`item${MAX_ARRAY_ITEMS}`);
    expect(record.constraints).not.toContain('final');
  });

  it('feeds provided_context and project_component answers from the shared list', async () => {
    const harness = makeHarness();
    const { record } = await harness.service.createIntake(
      { projectId: ALICE.projectId, originalRequest: 'Add SSO.', requestedBy: ALICE.id },
      ALICE,
    );
    const contextAnswered = await harness.service.addAnswer(
      record.id,
      { field: 'provided_context', answer: 'auth module exists' },
      ALICE,
    );
    await harness.service.addAnswer(
      record.id,
      { field: 'project_component', answer: 'web dashboard' },
      ALICE,
    );

    const updated = await harness.service.updateAnswer(
      record.id,
      contextAnswered.answers[0]!.id,
      { answer: 'auth module exists, billing service' },
      ALICE,
    );
    expect(updated.providedContext).toEqual([
      'auth module exists',
      'web dashboard',
      'billing service',
    ]);
  });
});
