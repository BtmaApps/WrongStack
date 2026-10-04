import type { SandboxBackend } from '../types.js';

/**
 * T2 backend: never denies. It exists so the choke point, config resolution,
 * and equivalence tests ship before the container / windows-native backends
 * (T4/T5) add real containment.
 */
export const policyOnlySandboxBackend: SandboxBackend = {
  id: 'policy-only',
  async enforceExec() {
    return { outcome: 'allow' };
  },
};
