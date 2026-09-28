/**
 * Regression: cancelIntake / archiveIntake validated the transition on a record
 * read before the record lock and wrote with no CAS version, so a submit landing
 * in between was overwritten — a SUBMITTED intake became cancelled (submitted ->
 * cancelled is not an allowed transition) with `submittedAt` still set and a
 * history entry claiming it was cancelled "from draft". The transition is now
 * re-checked on the locked copy. The race is made deterministic by the
 * authorizer, which runs between the read and the write.
 */
import { describe, expect, it } from 'vitest';
import type { IntakeAuthorizer } from '../src/authorization.js';
import { IntakeStateTransitionError } from '../src/errors.js';
import type { RequirementIntakeService } from '../src/service.js';
import { ALICE, makeHarness } from './helpers.js';

/** A service whose `operation` check first lets `interleave` finish on another service. */
function racingPair(
  operation: 'cancel' | 'archive',
  interleave: (other: RequirementIntakeService, id: string) => Promise<unknown>,
) {
  const other = makeHarness();
  let target = '';
  let fired = false;
  const authorizer: IntakeAuthorizer = {
    async isAllowed(op) {
      if (op === operation && !fired) {
        fired = true;
        await interleave(other.service, target);
      }
      return true;
    },
  };
  const racing = makeHarness({ authorizer });
  // Both services share the first harness's directory.
  (racing.service as unknown as { store: unknown }).store = other.store;
  return {
    other,
    racing: racing.service,
    async create() {
      const created = await other.service.createIntake(
        { projectId: 'proj_alpha', originalRequest: 'Add CSV export', requestedBy: ALICE.id },
        ALICE,
      );
      target = created.record.id;
      return target;
    },
  };
}

describe('requirement intake lifecycle races', () => {
  it('refuses to cancel an intake submitted after it was read', async () => {
    const pair = racingPair('cancel', (s, id) => s.submitIntake(id, ALICE));
    const id = await pair.create();
    await expect(pair.racing.cancelIntake(id, ALICE)).rejects.toBeInstanceOf(
      IntakeStateTransitionError,
    );
    const final = await pair.other.store.load(id);
    expect(final?.status).toBe('submitted');
    expect(final?.cancelledAt).toBeUndefined();
  });

  it('refuses a second archive that raced the first', async () => {
    const pair = racingPair('archive', (s, id) => s.archiveIntake(id, ALICE));
    const id = await pair.create();
    await pair.other.service.cancelIntake(id, ALICE);
    await expect(pair.racing.archiveIntake(id, ALICE)).rejects.toBeInstanceOf(
      IntakeStateTransitionError,
    );
    const final = await pair.other.store.load(id);
    expect(final?.history.filter((entry) => entry.action === 'archived')).toHaveLength(1);
  });

  it('still cancels across an unrelated concurrent edit and records the real status', async () => {
    const pair = racingPair('cancel', async (_s, id) => {
      await pair.other.store.update(id, { action: 'test' }, (next) => {
        next.status = 'collecting_information';
        next.title = 'Edited meanwhile';
      });
    });
    const id = await pair.create();
    const cancelled = await pair.racing.cancelIntake(id, ALICE);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.title).toBe('Edited meanwhile');
    expect(cancelled.history.at(-1)).toMatchObject({
      from: 'collecting_information',
      to: 'cancelled',
    });
  });
});
