/**
 * InMemoryIntakeLogger must snapshot caller-supplied field objects (later
 * caller mutations must not rewrite past entries) and store `undefined`
 * fields when none are provided.
 */
import { describe, expect, it } from 'vitest';
import { InMemoryIntakeLogger } from '../src/logger.js';

describe('InMemoryIntakeLogger field snapshots', () => {
  it('stores a defensive copy of provided fields', () => {
    const logger = new InMemoryIntakeLogger();
    const fields = { intakeId: 'reqi_1' };

    logger.info('intake', 'intake.updated', fields);
    fields.intakeId = 'mutated-after-call';

    expect(logger.entries[0]).toMatchObject({
      level: 'info',
      scope: 'intake',
      message: 'intake.updated',
      fields: { intakeId: 'reqi_1' },
    });
  });

  it('stores undefined fields when none are provided', () => {
    const logger = new InMemoryIntakeLogger();

    logger.warn('intake', 'intake.warned');
    logger.error('intake', 'intake.failed');

    expect(logger.entries.map((entry) => entry.level)).toEqual(['warn', 'error']);
    expect(logger.entries.map((entry) => entry.fields)).toEqual([undefined, undefined]);
  });
});
