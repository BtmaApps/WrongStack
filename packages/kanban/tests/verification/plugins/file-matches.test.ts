/**
 * Tests for FileMatchesPlugin — deterministic verifier contract.
 *
 * Coverage targets:
 * - id and kind accessors
 * - canHandle('file_matches') returns true
 * - canHandle(other types) returns false
 * - verify returns a structured KanbanVerificationCheckResult
 */
import { describe, expect, it } from 'vitest';
import { FileMatchesPlugin } from '../../../src/verification/plugins/file-matches.js';
import type { KanbanCheck } from '../../../src/types.js';
import type { VerificationContext } from '../../../src/verification/verification-context.js';

describe('FileMatchesPlugin', () => {
  const plugin = new FileMatchesPlugin();

  it('has the correct id', () => {
    expect(plugin.id).toBe('file_matches');
  });

  it('has kind "deterministic"', () => {
    expect(plugin.kind).toBe('deterministic');
  });

  describe('canHandle', () => {
    it('returns true for "file_matches" check type', () => {
      expect(plugin.canHandle('file_matches')).toBe(true);
    });

    it('returns false for other check types', () => {
      expect(plugin.canHandle('file_exists')).toBe(false);
      expect(plugin.canHandle('test')).toBe(false);
      expect(plugin.canHandle('git_diff')).toBe(false);
      expect(plugin.canHandle('')).toBe(false);
      expect(plugin.canHandle('metric')).toBe(false);
    });

    it('returns false for undefined/null', () => {
      expect(plugin.canHandle(undefined as unknown as string)).toBe(false);
      expect(plugin.canHandle(null as unknown as string)).toBe(false);
    });
  });

  describe('verify', () => {
    const mockCheck: KanbanCheck = {
      id: 'fm-check-1',
      type: 'file_matches',
      description: 'Verify file content matches pattern',
    } as unknown as KanbanCheck;

    const mockContext = {
      projectRoot: '/fake/project',
      board: {} as any,
      task: {} as any,
      requireBackingEvidence: false,
    } as unknown as VerificationContext;

    it('returns a structured result with checkId', async () => {
      const result = await plugin.verify(mockCheck, mockContext);
      expect(result).toHaveProperty('checkId', 'fm-check-1');
    });

    it('returns a result with status and evidence fields', async () => {
      const result = await plugin.verify(mockCheck, mockContext);
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('evidence');
      expect(result).toHaveProperty('description');
    });

    it('returns a structured result (not thrown)', async () => {
      const result = await plugin.verify(mockCheck, mockContext);
      expect(result).toBeDefined();
    });
  });

  /**
   * Regression: the global exec-scan used to collect `lineNumbers` never
   * advanced `lastIndex` past a zero-length match. A global regex that can
   * match the empty string (`b*`, `\s*`, `^`, `\b`) therefore returned the
   * same match forever: the array grew until V8 threw
   * `RangeError: Invalid array length`, which the outer catch reported as a
   * bogus `Error reading <file>` with status 'error' instead of a verdict.
   */
  describe('zero-length match handling', () => {
    const contextWith = (content: string) =>
      ({
        projectRoot: '/fake/project',
        board: {} as any,
        task: {} as any,
        requireBackingEvidence: false,
        readFile: async () => content,
      }) as unknown as VerificationContext;

    const checkFor = (pattern: string, flags = '') =>
      ({
        id: 'fm-zero-1',
        type: 'file_matches',
        description: 'zero-length match',
        notes: JSON.stringify({ file: 'x.txt', pattern, flags }),
      }) as unknown as KanbanCheck;

    it('passes when the pattern matches non-empty text and can also match empty', async () => {
      const result = await plugin.verify(checkFor('b*'), contextWith('bbb'));
      expect(result.status).toBe('passed');
      expect(result.evidence.matched).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('keeps the collected line numbers bounded', async () => {
      const content = 'line one\nline two\nline three';
      const result = await plugin.verify(checkFor('\\s*'), contextWith(content));
      const lineNumbers = result.evidence.lineNumbers as number[] | undefined;
      expect(lineNumbers?.length ?? 0).toBeLessThanOrEqual(content.length + 1);
    });

    it('terminates when the pattern carries an explicit global flag', async () => {
      const result = await plugin.verify(checkFor('b*', 'g'), contextWith('bbb'));
      expect(result.status).toBe('passed');
      expect(result.error).toBeUndefined();
    });

    it('still reports a genuine non-match as failed', async () => {
      const result = await plugin.verify(checkFor('zzz'), contextWith('bbb'));
      expect(result.status).toBe('failed');
      expect(result.evidence.matched).toBe(false);
    });

    it('still reports the correct line for a non-empty match on a later line', async () => {
      const result = await plugin.verify(checkFor('bar'), contextWith('foo\nbar'));
      expect(result.status).toBe('passed');
      expect(result.evidence.lineNumbers).toContain(2);
    });
  });
});
