/**
 * Tests for TestPlugin — deterministic verifier contract.
 *
 * Coverage targets:
 * - id and kind accessors
 * - canHandle('test') returns true
 * - canHandle(other types) returns false
 * - verify returns a structured KanbanVerificationCheckResult
 */
import { describe, expect, it, vi } from 'vitest';
import type { KanbanCheck } from '../../../src/types.js';
import { TestPlugin } from '../../../src/verification/plugins/test.js';
import type { VerificationContext } from '../../../src/verification/verification-context.js';

describe('TestPlugin', () => {
  const plugin = new TestPlugin();

  it('has the correct id', () => {
    expect(plugin.id).toBe('test');
  });

  it('has kind "deterministic"', () => {
    expect(plugin.kind).toBe('deterministic');
  });

  describe('canHandle', () => {
    it('returns true for "test" check type', () => {
      expect(plugin.canHandle('test')).toBe(true);
    });

    it('returns false for other check types', () => {
      expect(plugin.canHandle('file_exists')).toBe(false);
      expect(plugin.canHandle('git_diff')).toBe(false);
      expect(plugin.canHandle('metric')).toBe(false);
      expect(plugin.canHandle('')).toBe(false);
      expect(plugin.canHandle('agent')).toBe(false);
    });

    it('returns false for undefined/null', () => {
      expect(plugin.canHandle(undefined as unknown as string)).toBe(false);
      expect(plugin.canHandle(null as unknown as string)).toBe(false);
    });
  });

  describe('verify', () => {
    // The old tests only checked that fields existed, against a context whose
    // runTest reported zero tests — the exact case that wrongly scored
    // `passed` and let a card reach Done with nothing executed.
    const check = (description: string, notes?: string): KanbanCheck =>
      ({ id: 'test-check-1', type: 'test', description, notes }) as unknown as KanbanCheck;

    const contextWith = (result: {
      passed: number;
      failed: number;
      skipped?: number;
      failureOutput?: string;
    }) => {
      const runTest = vi.fn(async (pattern: string) => ({
        testPattern: pattern,
        skipped: 0,
        durationMs: 7,
        ...result,
      }));
      return {
        runTest,
        context: {
          projectRoot: '/fake/project',
          board: {} as any,
          task: {} as any,
          requireBackingEvidence: false,
          runTest,
        } as unknown as VerificationContext,
      };
    };

    it('passes when tests ran and none failed, with the pattern taken from notes', async () => {
      const { runTest, context } = contextWith({ passed: 4, failed: 0 });
      const result = await plugin.verify(check('Auth tests pass', 'src/auth.test.ts'), context);
      expect(runTest).toHaveBeenCalledWith('src/auth.test.ts');
      expect(result).toMatchObject({
        checkId: 'test-check-1',
        status: 'passed',
        evidence: { testPattern: 'src/auth.test.ts', passed: 4, failed: 0, durationMs: 7 },
      });
      expect(result.error).toBeUndefined();
    });

    it('fails when any test failed', async () => {
      const { context } = contextWith({ passed: 3, failed: 2, failureOutput: 'boom' });
      const result = await plugin.verify(check('auth.test.ts'), context);
      expect(result).toMatchObject({ status: 'failed', evidence: { failureOutput: 'boom' } });
      expect(result.error).toContain('2 test(s) failed.');
    });

    it('fails when no tests ran — an empty run never proves a criterion', async () => {
      const { context } = contextWith({ passed: 0, failed: 0 });
      const result = await plugin.verify(check('does-not-match.test.ts'), context);
      expect(result.status).toBe('failed');
      expect(result.error).toMatch(/No tests ran for pattern "does-not-match\.test\.ts"\./);
    });

    it('fails when every matched test was skipped', async () => {
      const { context } = contextWith({ passed: 0, failed: 0, skipped: 5 });
      const result = await plugin.verify(check('auth.test.ts'), context);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('(5 skipped)');
    });

    it('enforces a minimum pass count stated in the description', async () => {
      const { context } = contextWith({ passed: 2, failed: 0 });
      const result = await plugin.verify(check('at least 5 pass in auth.test.ts'), context);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Expected 5 passes, got 2.');
    });

    it('reports an error (not a pass) when no pattern is given', async () => {
      const { runTest, context } = contextWith({ passed: 9, failed: 0 });
      const result = await plugin.verify(check('   '), context);
      expect(result.status).toBe('error');
      expect(runTest).not.toHaveBeenCalled();
    });
  });
});
