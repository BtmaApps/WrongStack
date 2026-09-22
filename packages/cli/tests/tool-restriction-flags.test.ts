import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/arg-parser.js';
import {
  resolveLaunchAllowedTools,
  resolveToolRestriction,
  unknownRestrictedToolNames,
} from '../src/boot/tool-restriction-flags.js';

describe('resolveToolRestriction', () => {
  it('is undefined when neither flag is set', () => {
    expect(resolveToolRestriction({})).toBeUndefined();
  });

  it('splits on commas and spaces', () => {
    expect(resolveToolRestriction({ 'only-tools': 'read, grep glob' })).toEqual({
      only: ['read', 'grep', 'glob'],
      deny: [],
    });
    expect(resolveToolRestriction({ 'disallowed-tools': 'bash,exec' })).toEqual({
      deny: ['bash', 'exec'],
    });
  });

  it('refuses scoped rules instead of silently dropping a deny', () => {
    expect(() => resolveToolRestriction({ 'disallowed-tools': 'Bash(git *)' })).toThrow(
      /scoped rules like "Bash\(git" are not supported/,
    );
  });

  it('refuses a bare flag', () => {
    expect(() => resolveToolRestriction({ 'only-tools': true })).toThrow(/needs a comma-separated/);
  });

  it('accepts the camelCase --disallowedTools spelling', () => {
    const { flags } = parseArgs(['--disallowedTools', 'bash', 'task']);
    expect(flags['disallowed-tools']).toBe('bash');
    expect(flags['disallowedTools']).toBeUndefined();
  });
});

describe('unknownRestrictedToolNames', () => {
  it('flags likely typos but not globs or MCP names', () => {
    const known = new Set(['read']);
    expect(
      unknownRestrictedToolNames(
        { only: ['read', 'raed', 'mcp__x__*'], deny: ['mcp__gh__issue'] },
        (n) => known.has(n),
      ),
    ).toEqual(['raed']);
  });
});

describe('resolveLaunchAllowedTools', () => {
  it('parses the list and accepts the camelCase spelling', () => {
    const { flags } = parseArgs(['--allowedTools', 'read,mcp__gh__*']);
    expect(resolveLaunchAllowedTools(flags)).toEqual(['read', 'mcp__gh__*']);
  });

  it('refuses scoped allows that would widen to the whole tool', () => {
    expect(() => resolveLaunchAllowedTools({ 'allowed-tools': 'Bash(git status)' })).toThrow(
      /scoped rules/,
    );
  });
});
