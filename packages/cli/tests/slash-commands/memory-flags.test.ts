import { describe, expect, it } from 'vitest';
import { parseForFileFlags, parseMemoryFlags } from '../../src/slash-commands/memory-flags.js';

describe('parseMemoryFlags', () => {
  it('joins free text and leaves optional fields unset when no flags are given', () => {
    const parsed = parseMemoryFlags(['use', 'pnpm', 'not', 'npm']);
    expect(parsed).toEqual({ text: 'use pnpm not npm', errors: [] });
    expect(parsed).not.toHaveProperty('anchors');
  });

  it('returns empty text for no tokens', () => {
    expect(parseMemoryFlags([])).toEqual({ text: '', errors: [] });
  });

  it('parses kind, scope and status case-insensitively on the flag name only', () => {
    const parsed = parseMemoryFlags([
      '--KIND',
      'decision',
      '--Scope',
      'user',
      '--status',
      'stale',
      'x',
    ]);
    expect(parsed).toMatchObject({ kind: 'decision', scope: 'user', status: 'stale', text: 'x' });
    expect(parsed.errors).toEqual([]);
    // Values are exact enum members; casing is not normalized.
    expect(parseMemoryFlags(['--kind', 'Decision']).errors[0]).toMatch(/--kind must be one of/);
  });

  it('reports invalid or missing enum values', () => {
    const parsed = parseMemoryFlags(['--kind', 'bogus', '--scope', '--status']);
    expect(parsed.kind).toBeUndefined();
    expect(parsed.scope).toBeUndefined();
    expect(parsed.status).toBeUndefined();
    expect(parsed.errors).toHaveLength(3);
    expect(parsed.errors[0]).toContain('--kind must be one of');
    expect(parsed.errors[1]).toContain('--scope must be one of');
    expect(parsed.errors[2]).toContain('--status must be one of');
  });

  it('does not consume a following flag as a value', () => {
    const parsed = parseMemoryFlags(['--tag', '--kind', 'fact', 'hello']);
    expect(parsed.errors).toEqual(['--tag needs a value (comma-separated for multiple).']);
    expect(parsed.kind).toBe('fact');
    expect(parsed.text).toBe('hello');
  });

  it('accumulates comma-separated lists across repeated flags and trims blanks', () => {
    const parsed = parseMemoryFlags([
      '--tag',
      'a, b,,',
      '--tags',
      'c',
      '--supersedes',
      'm1,m2',
      '--supersedes',
      'm3',
      '--contradicts',
      ' m4 ',
    ]);
    expect(parsed.tags).toEqual(['a', 'b', 'c']);
    expect(parsed.supersedes).toEqual(['m1', 'm2', 'm3']);
    expect(parsed.contradicts).toEqual(['m4']);
    expect(parsed.errors).toEqual([]);
  });

  it('builds anchors in flag order for file, symbol, command and agent', () => {
    const parsed = parseMemoryFlags([
      '--file',
      'src/a.ts',
      '--symbol',
      'src/b.ts#Foo',
      '--command',
      'pnpm test',
      '--agent',
      'reviewer',
      '--anchor',
      'c.ts',
    ]);
    expect(parsed.anchors).toEqual([
      { type: 'file', path: 'src/a.ts' },
      { type: 'symbol', path: 'src/b.ts', symbol: 'Foo' },
      { type: 'command', command: 'pnpm test' },
      { type: 'agent', role: 'reviewer' },
      { type: 'file', path: 'c.ts' },
    ]);
  });

  it('splits a symbol anchor on the last # so paths containing # survive', () => {
    const parsed = parseMemoryFlags(['--symbol', 'docs/c#/x.ts#Bar']);
    expect(parsed.anchors).toEqual([{ type: 'symbol', path: 'docs/c#/x.ts', symbol: 'Bar' }]);
  });

  it.each([
    ['#Foo', '--symbol must be path#SymbolName.'],
    ['src/a.ts#', '--symbol must be path#SymbolName.'],
    ['src/a.ts', '--symbol must be path#SymbolName.'],
  ])('rejects malformed symbol anchor %s', (value, message) => {
    const parsed = parseMemoryFlags(['--symbol', value]);
    expect(parsed.errors).toEqual([message]);
    expect(parsed.anchors).toBeUndefined();
  });

  it('reports missing anchor values', () => {
    const parsed = parseMemoryFlags(['--anchor', '--symbol', '--command', '--agent']);
    expect(parsed.errors).toEqual([
      '--anchor needs a file path.',
      '--symbol needs a value like path#SymbolName.',
      '--command needs a value.',
      expect.stringContaining('--agent needs a role id'),
    ]);
  });

  it.each([
    ['0', 0],
    ['1', 1],
    ['0.25', 0.25],
    ['.5', 0.5],
    ['1.', 1],
  ])('accepts score %s', (value, expected) => {
    const parsed = parseMemoryFlags([
      '--importance',
      value,
      '--confidence',
      value,
      '--freshness',
      value,
    ]);
    expect(parsed.errors).toEqual([]);
    expect(parsed).toMatchObject({
      importance: expected,
      confidence: expected,
      freshness: expected,
    });
  });

  it.each(['1.01', '-0.1', 'NaN', 'Infinity', '0.5abc', '1e-1', '0x1', ''])(
    'rejects score %j',
    (value) => {
      const parsed = parseMemoryFlags(['--importance', value]);
      expect(parsed.importance).toBeUndefined();
      expect(parsed.errors).toEqual([
        `--importance must be a number between 0 and 1 (got "${value}").`,
      ]);
    },
  );

  it('reports a score flag with no value', () => {
    expect(parseMemoryFlags(['--confidence']).errors).toEqual([
      '--confidence needs a value between 0 and 1.',
    ]);
  });

  it('appends --text values to free text in order', () => {
    const parsed = parseMemoryFlags(['before', '--text', 'middle', 'after']);
    expect(parsed.text).toBe('before middle after');
    expect(parseMemoryFlags(['--text']).errors).toEqual(['--text needs a value.']);
  });

  it('reports unknown flags', () => {
    const parsed = parseMemoryFlags(['--verbose']);
    expect(parsed.errors).toEqual(['Unknown flag "--verbose".']);
  });
});

describe('parseForFileFlags', () => {
  it('defaults to limit 50, no line, hidden deleted', () => {
    expect(parseForFileFlags([])).toEqual({
      singleLine: undefined,
      limit: 50,
      showDeleted: false,
      errors: [],
    });
  });

  it('ignores positional tokens and parses every supported flag', () => {
    expect(
      parseForFileFlags(['src/a.ts', '--line', '12', '--LIMIT', '200', '--show-deleted-memories']),
    ).toEqual({ singleLine: 12, limit: 200, showDeleted: true, errors: [] });
    expect(parseForFileFlags(['--show-deleted']).showDeleted).toBe(true);
  });

  it.each(['0', '-3', '5x', '1.5', 'abc'])('rejects --line %j', (value) => {
    const parsed = parseForFileFlags(['--line', value]);
    expect(parsed.singleLine).toBeUndefined();
    expect(parsed.errors).toEqual([`--line must be a positive integer (got "${value}").`]);
  });

  it.each(['0', '201', '10.9', '20abc'])('rejects --limit %j and keeps the default', (value) => {
    const parsed = parseForFileFlags(['--limit', value]);
    expect(parsed.limit).toBe(50);
    expect(parsed.errors).toEqual([`--limit must be between 1 and 200 (got "${value}").`]);
  });

  it('accepts the limit bounds', () => {
    expect(parseForFileFlags(['--limit', '1']).limit).toBe(1);
    expect(parseForFileFlags(['--limit', '200']).limit).toBe(200);
  });

  it('reports missing values without swallowing the next flag', () => {
    const parsed = parseForFileFlags(['--line', '--limit', '--show-deleted']);
    expect(parsed.errors).toEqual([
      '--line needs a 1-indexed line number.',
      '--limit needs a value between 1 and 200.',
    ]);
    expect(parsed.showDeleted).toBe(true);
  });

  it('reports unknown flags', () => {
    expect(parseForFileFlags(['--kind', 'fact']).errors).toEqual(['Unknown flag "--kind".']);
  });
});
