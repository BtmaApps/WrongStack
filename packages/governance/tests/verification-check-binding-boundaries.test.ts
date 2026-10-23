import { describe, expect, it } from 'vitest';
import {
  calculateVerificationCheckRegistryFingerprint,
  createVerificationCheckBinding,
  type VerificationCheckDescriptor,
} from '../src/index.js';

const baseDescriptor: VerificationCheckDescriptor = {
  id: 'check-test',
  evidenceKind: 'test',
  handlerVersion: '1.0.0',
  executionClass: 'trusted_deterministic',
};

/**
 * Boundary coverage for check-binding that the sibling suite does not hold:
 * the CHECK_ID grammar allows exactly one leading character plus up to 127
 * more, and the issued binding is contractually immutable.
 */
describe('verification check binding boundaries', () => {
  it('accepts the longest legal check id and rejects the very next character', () => {
    const registryFingerprint = calculateVerificationCheckRegistryFingerprint([baseDescriptor]);
    const longestLegalId = `a${'b'.repeat(127)}`;

    expect(
      createVerificationCheckBinding(registryFingerprint, {
        ...baseDescriptor,
        id: longestLegalId,
      }),
    ).toMatchObject({ checkId: longestLegalId });

    expect(() =>
      createVerificationCheckBinding(registryFingerprint, {
        ...baseDescriptor,
        id: `${longestLegalId}b`,
      }),
    ).toThrow('Verification check descriptor cannot produce a valid binding.');
  });

  it('freezes the binding it issues', () => {
    const registryFingerprint = calculateVerificationCheckRegistryFingerprint([baseDescriptor]);

    expect(
      Object.isFrozen(createVerificationCheckBinding(registryFingerprint, baseDescriptor)),
    ).toBe(true);
  });
});
