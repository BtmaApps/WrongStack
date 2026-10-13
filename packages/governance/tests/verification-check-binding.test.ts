import { describe, expect, it } from 'vitest';
import {
  calculateVerificationCheckRegistryFingerprint,
  createVerificationCheckBinding,
  isVerificationCheckBindingIntegrityValid,
  type VerificationCheckDescriptor,
  verificationCheckBindingMatches,
} from '../src/index.js';

const testDescriptor: VerificationCheckDescriptor = {
  id: 'check-test',
  evidenceKind: 'test',
  handlerVersion: '1.0.0',
  executionClass: 'trusted_deterministic',
};

const lintDescriptor: VerificationCheckDescriptor = {
  id: 'check-lint',
  evidenceKind: 'lint',
  handlerVersion: '2.0.0',
  executionClass: 'trusted_deterministic',
};

describe('verification check binding', () => {
  it('produces an order-independent registry fingerprint', () => {
    expect(calculateVerificationCheckRegistryFingerprint([testDescriptor, lintDescriptor])).toBe(
      calculateVerificationCheckRegistryFingerprint([lintDescriptor, testDescriptor]),
    );
  });

  it('changes registry and handler identities when the handler version changes', () => {
    const changed = { ...testDescriptor, handlerVersion: '1.0.1' };
    const originalRegistry = calculateVerificationCheckRegistryFingerprint([testDescriptor]);
    const changedRegistry = calculateVerificationCheckRegistryFingerprint([changed]);
    const originalBinding = createVerificationCheckBinding(originalRegistry, testDescriptor);
    const changedBinding = createVerificationCheckBinding(changedRegistry, changed);

    expect(changedRegistry).not.toBe(originalRegistry);
    expect(changedBinding.handlerFingerprint).not.toBe(originalBinding.handlerFingerprint);
  });

  it('detects binding tampering and current-registry drift', () => {
    const registryFingerprint = calculateVerificationCheckRegistryFingerprint([
      lintDescriptor,
      testDescriptor,
    ]);
    const binding = createVerificationCheckBinding(registryFingerprint, testDescriptor);

    expect(isVerificationCheckBindingIntegrityValid(binding)).toBe(true);
    expect(verificationCheckBindingMatches(binding, registryFingerprint, testDescriptor)).toBe(
      true,
    );
    expect(
      isVerificationCheckBindingIntegrityValid({ ...binding, handlerVersion: 'tampered' }),
    ).toBe(false);
    expect(
      verificationCheckBindingMatches(
        binding,
        calculateVerificationCheckRegistryFingerprint([testDescriptor]),
        testDescriptor,
      ),
    ).toBe(false);
    expect(verificationCheckBindingMatches(binding, registryFingerprint, lintDescriptor)).toBe(
      false,
    );
  });

  it('rejects bindings with invalid schemaVersion, checkId, evidenceKind, or malformed inputs', () => {
    const registryFingerprint = calculateVerificationCheckRegistryFingerprint([testDescriptor]);
    const valid = createVerificationCheckBinding(registryFingerprint, testDescriptor);

    expect(isVerificationCheckBindingIntegrityValid({ ...valid, schemaVersion: 2 as 1 })).toBe(
      false,
    );
    expect(() => createVerificationCheckBinding('invalid-registry-fp', testDescriptor)).toThrow(
      'Verification check registry fingerprint is invalid.',
    );
    expect(() =>
      createVerificationCheckBinding(registryFingerprint, {
        ...testDescriptor,
        id: '-invalid-check-id',
      }),
    ).toThrow('Verification check descriptor cannot produce a valid binding.');
    expect(() =>
      createVerificationCheckBinding(registryFingerprint, {
        ...testDescriptor,
        evidenceKind: 'unknown-kind' as VerificationCheckDescriptor['evidenceKind'],
      }),
    ).toThrow('Verification check descriptor cannot produce a valid binding.');
    expect(isVerificationCheckBindingIntegrityValid(null as unknown as typeof valid)).toBe(false);
  });
});
