/**
 * json-extractor's repair path (commit 11f254342) shipped without tests: a
 * candidate that only parses after `sanitizeJsonString` (trailing commas,
 * comments, raw newlines — common in model output) was never exercised, and
 * the package's 100% coverage gate has failed since. The defensive branches
 * (a repaired or parsed value of the wrong container type, a sanitizer result
 * that still does not parse) cannot be produced by a real bracketed candidate,
 * so they are driven through a controllable sanitizer / JSON.parse here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const sanitizer = vi.hoisted(() => ({ override: undefined as string | null | undefined }));
vi.mock('@wrongstack/core/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wrongstack/core/utils')>();
  return {
    ...actual,
    sanitizeJsonString: (s: string) =>
      sanitizer.override === undefined ? actual.sanitizeJsonString(s) : sanitizer.override,
  };
});

import { extractJsonBlock } from '../src/json-extractor.js';

afterEach(() => {
  sanitizer.override = undefined;
  vi.restoreAllMocks();
});

describe('extractJsonBlock repair path', () => {
  it('accepts model output that only parses after sanitizing', () => {
    expect(extractJsonBlock('result: {"a": 1, "b": [2,],} done', 'object')).toBe(
      '{"a": 1, "b": [2,],}',
    );
    expect(extractJsonBlock('findings: [{"file":"a.ts",},] end', 'array')).toBe(
      '[{"file":"a.ts",},]',
    );
    expect(extractJsonBlock('scores: [1, 2,]', 'array')).toBe('[1, 2,]');
  });

  it('rejects a repaired value of the wrong container type', () => {
    sanitizer.override = '5';
    expect(extractJsonBlock('x {"a": 1,} y', 'object')).toBe('{"a": 1,}'); // first balanced
    expect(extractJsonBlock('x [1,] y', 'array')).toBe('[1,]');
  });

  it('rejects a sanitizer result that still does not parse', () => {
    sanitizer.override = '{still broken';
    expect(extractJsonBlock('x {"a": 1,} y', 'object')).toBe('{"a": 1,}');
  });

  it('rejects a parsed object candidate that is not an object', () => {
    const realParse = JSON.parse;
    vi.spyOn(JSON, 'parse')
      .mockImplementationOnce(() => 5)
      .mockImplementation(realParse);
    expect(extractJsonBlock('{"a": 1}', 'object')).toBe('{"a": 1}'); // first balanced
  });

  it('rejects a parsed array candidate that is not an array', () => {
    const realParse = JSON.parse;
    vi.spyOn(JSON, 'parse')
      .mockImplementationOnce(() => ({ not: 'an array' }))
      .mockImplementation(realParse);
    expect(extractJsonBlock('[1]', 'array')).toBe('[1]'); // first balanced
  });
});
