import { describe, expect, it } from 'vitest';
import {
  parseAutomationEnvironmentReceipt,
  parseAutomationVerification,
} from '../src/automation-evidence';

describe('recorded automation evidence', () => {
  it('preserves canonical verification identity and refuses malformed passed check records', () => {
    const value = {
      status: 'passed',
      evidence: ['verification.json'],
      checks: [
        {
          argv: ['bun', 'run', 'test'],
          exitCode: 0,
          durationMs: 250,
          outputSha256: 'a'.repeat(64),
          binding: {
            schemaVersion: 1,
            checkId: 'automation.check-1',
            evidenceKind: 'test',
            handlerVersion: 'v1',
            handlerFingerprint: 'b'.repeat(64),
            registryFingerprint: 'c'.repeat(64),
            executionClass: 'trusted_deterministic',
          },
        },
      ],
    };
    expect(parseAutomationVerification(JSON.stringify(value))).toEqual(value);
    expect(() =>
      parseAutomationVerification(
        JSON.stringify({ ...value, checks: [{ ...value.checks[0], argv: 'bun test' }] }),
      ),
    ).toThrow('Unrecognized');
    expect(() =>
      parseAutomationVerification(JSON.stringify({ ...value, evidence: [null] })),
    ).toThrow('Unrecognized');
  });
  it('keeps explicit environment lifecycle and rejects setup output with an invalid structure', () => {
    const value = {
      version: 1,
      name: 'native-proof',
      fingerprint: 'f'.repeat(64),
      phase: 'candidate',
      status: 'removed',
      network: null,
      services: [],
      caches: [],
      ports: [],
      setup: [
        {
          argv: ['bun', 'install'],
          exitCode: 0,
          durationMs: 300,
          outputSha256: 'a'.repeat(64),
          output: 'Installed dependencies',
        },
      ],
    };
    expect(parseAutomationEnvironmentReceipt(JSON.stringify(value))).toEqual(value);
    expect(() =>
      parseAutomationEnvironmentReceipt(
        JSON.stringify({ ...value, setup: [{ ...value.setup[0], output: {} }] }),
      ),
    ).toThrow('Unrecognized');
    expect(() =>
      parseAutomationEnvironmentReceipt(JSON.stringify({ ...value, status: 'success' })),
    ).toThrow('Unrecognized');
  });
});
