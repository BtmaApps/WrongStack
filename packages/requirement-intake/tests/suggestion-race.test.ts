/**
 * Regression: acceptSuggestion checked `status === 'pending'` on a record read
 * before the record lock, then applied the proposal on the locked copy without
 * re-checking. A reject landing in between was overwritten: the suggestion
 * flipped rejected -> accepted and its value (here an LLM title) was written to
 * the record against the user's explicit decision. rejectSuggestion already
 * re-checked on the locked copy; accept now does the same. The race is made
 * deterministic by the authorizer, which runs between the read and the write.
 */
import { describe, expect, it } from 'vitest';
import type { IntakeAuthorizer } from '../src/authorization.js';
import { IntakeValidationError } from '../src/errors.js';
import type { RequirementIntakeService } from '../src/service.js';
import { ALICE, makeHarness, stubGenerator } from './helpers.js';

/** A service whose `accept_suggestion` check first lets `interleave` finish on another service. */
async function racingAccept(
  interleave: (other: RequirementIntakeService, id: string, proposalId: string) => Promise<unknown>,
) {
  const other = makeHarness({ generator: stubGenerator({ suggested_title: 'LLM title' }) });
  let fired = false;
  let target = { id: '', proposalId: '' };
  const authorizer: IntakeAuthorizer = {
    async isAllowed(op) {
      if (op === 'accept_suggestion' && !fired) {
        fired = true;
        await interleave(other.service, target.id, target.proposalId);
      }
      return true;
    },
  };
  const racing = makeHarness({ authorizer });
  // Both services share the first harness's directory.
  (racing.service as unknown as { store: unknown }).store = other.store;
  const { record } = await other.service.createIntake(
    { projectId: 'proj_alpha', originalRequest: 'Add CSV export', requestedBy: ALICE.id },
    ALICE,
  );
  const [proposal] = await other.service.generateSuggestions(record.id, ALICE);
  target = { id: record.id, proposalId: proposal!.id };
  return { other, racing: racing.service, ...target, originalTitle: record.title };
}

describe('requirement intake suggestion races', () => {
  it('refuses to apply a suggestion that was rejected after it was read', async () => {
    const race = await racingAccept((s, id, proposalId) =>
      s.rejectSuggestion(id, proposalId, ALICE),
    );
    await expect(
      race.racing.acceptSuggestion(race.id, race.proposalId, ALICE),
    ).rejects.toBeInstanceOf(IntakeValidationError);
    const final = await race.other.store.load(race.id);
    expect(final?.llmSuggestions.find((s) => s.id === race.proposalId)?.status).toBe('rejected');
    expect(final?.title).toBe(race.originalTitle);
    expect(final?.history.some((entry) => entry.action === 'suggestion_accepted')).toBe(false);
  });

  it('refuses a second accept that raced the first, applying the proposal once', async () => {
    const race = await racingAccept((s, id, proposalId) =>
      s.acceptSuggestion(id, proposalId, ALICE),
    );
    await expect(
      race.racing.acceptSuggestion(race.id, race.proposalId, ALICE),
    ).rejects.toBeInstanceOf(IntakeValidationError);
    const final = await race.other.store.load(race.id);
    expect(final?.title).toBe('LLM title');
    expect(final?.history.filter((entry) => entry.action === 'suggestion_accepted')).toHaveLength(
      1,
    );
  });

  it('still accepts across an unrelated concurrent edit', async () => {
    const race = await racingAccept((s, id) =>
      s.updateIntake(id, { scopeNotes: 'meanwhile' }, ALICE),
    );
    const accepted = await race.racing.acceptSuggestion(race.id, race.proposalId, ALICE);
    expect(accepted.title).toBe('LLM title');
    expect(accepted.scopeNotes).toBe('meanwhile');
    expect(accepted.llmSuggestions.find((s) => s.id === race.proposalId)?.status).toBe('accepted');
  });
});
