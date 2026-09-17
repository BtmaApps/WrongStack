/**
 * Tests for utility modules with no previous coverage.
 * Covers: sleep, tool-subject, session-scoped-path, merge-custom-models
 */

import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mergeCustomModelDefs } from '../../src/utils/merge-custom-models.js';
import { sessionScopedPath } from '../../src/utils/session-scoped-path.js';
import { sleep } from '../../src/utils/sleep.js';
import {
  escapeGlobSubject,
  isPathSubjectKey,
  normalizePathSubject,
  subjectForToolInput,
} from '../../src/utils/tool-subject.js';

// ============================================================================
// sleep
// ============================================================================

describe('sleep', () => {
  it('should resolve after given ms', async () => {
    const start = Date.now();
    await sleep(5);
    expect(Date.now() - start).toBeGreaterThanOrEqual(3);
  });

  it('should resolve with 0ms', async () => {
    await expect(sleep(0)).resolves.toBeUndefined();
  });
});

// ============================================================================
// tool-subject
// ============================================================================

describe('escapeGlobSubject', () => {
  it('should escape glob metacharacters', () => {
    // Round 2026-09-17-r7: class-form literals (see tool-subject.ts).
    expect(escapeGlobSubject('test[*].js')).toBe('test[[][*][]].js');
    expect(escapeGlobSubject('path?/file')).toBe('path[?]/file');
  });

  it('should return unchanged for plain text', () => {
    expect(escapeGlobSubject('plain.txt')).toBe('plain.txt');
  });

  it('should handle empty string', () => {
    expect(escapeGlobSubject('')).toBe('');
  });
});

describe('normalizePathSubject', () => {
  it('should convert backslashes to forward slashes', () => {
    expect(normalizePathSubject('a\\b\\c')).toBe('a/b/c');
  });

  it('should escape glob in normalized path', () => {
    expect(normalizePathSubject('src/[test].ts')).toBe('src/[[]test[]].ts');
  });
});

describe('isPathSubjectKey', () => {
  it('should return true for path keys', () => {
    expect(isPathSubjectKey('path')).toBe(true);
    expect(isPathSubjectKey('file')).toBe(true);
    expect(isPathSubjectKey('files')).toBe(true);
  });

  it('should return false for non-path keys', () => {
    expect(isPathSubjectKey('name')).toBe(false);
    expect(isPathSubjectKey('url')).toBe(false);
    expect(isPathSubjectKey('')).toBe(false);
  });
});

describe('subjectForToolInput', () => {
  it('should return undefined for non-object input', () => {
    expect(subjectForToolInput('read', null)).toBeUndefined();
    expect(subjectForToolInput('read', 'string')).toBeUndefined();
    expect(subjectForToolInput('read', 42)).toBeUndefined();
    expect(subjectForToolInput('read', undefined)).toBeUndefined();
  });

  it('should use provided subjectKey', () => {
    expect(subjectForToolInput('write', { path: '/tmp/file' }, 'path')).toBe('/tmp/file');
  });

  it('should normalize path subjectKey values', () => {
    expect(subjectForToolInput('write', { path: 'a\\b\\c' }, 'path')).toBe('a/b/c');
  });

  it('should escape glob when subjectKey is not a path key', () => {
    // Non-path subjectKey should use escapeGlobSubject, not normalizePathSubject
    expect(subjectForToolInput('write', { name: '[test]' }, 'name')).toBe('[[]test[]]');
    expect(subjectForToolInput('write', { url: 'path?query' }, 'url')).toBe('path[?]query');
  });

  it('should extract command for bash tool', () => {
    expect(subjectForToolInput('bash', { command: 'ls -la' })).toBe('ls -la');
  });

  it('should extract path from object', () => {
    expect(subjectForToolInput('read', { path: '/etc/hosts' })).toBe('/etc/hosts');
  });

  it('should extract url from object', () => {
    expect(subjectForToolInput('fetch', { url: 'https://example.com' })).toBe(
      'https://example.com',
    );
  });

  it('should extract name from object', () => {
    expect(subjectForToolInput('install', { name: 'lodash' })).toBe('lodash');
  });

  it('should return undefined for empty object', () => {
    expect(subjectForToolInput('read', {})).toBeUndefined();
  });
});

// ============================================================================
// session-scoped-path
// ============================================================================

describe('sessionScopedPath', () => {
  it('should build path with suffix', () => {
    const result = sessionScopedPath('/tmp', 'sess_abc', '.jsonl');
    expect(result).toBe(path.resolve('/tmp', 'sess_abc.jsonl'));
  });

  it('should handle date-sharded session IDs', () => {
    const result = sessionScopedPath('/data', '2026-06/sess_ulid', '.log');
    expect(result).toBe(path.resolve('/data', '2026-06/sess_ulid.log'));
  });

  it('should throw for empty sessionId', () => {
    expect(() => sessionScopedPath('/tmp', '', '.txt')).toThrow();
  });

  it('should throw for path traversal with ..', () => {
    expect(() => sessionScopedPath('/tmp', '../etc/passwd', '.txt')).toThrow();
  });

  it('should throw for backslash in sessionId', () => {
    expect(() => sessionScopedPath('/tmp', 'a\\b', '.txt')).toThrow();
  });

  // Was named "should throw when resolved path escapes parent dir" while only
  // asserting a VALID id does not throw — the name promised a check it never
  // made. The escape cases are the `..` / backslash tests above.
  it('keeps a plain session id inside the parent dir (containment check)', () => {
    const resolved = sessionScopedPath('/tmp', 'valid-sess', '');
    expect(path.dirname(resolved)).toBe(path.resolve('/tmp'));
    expect(path.basename(resolved)).toBe('valid-sess');
  });

  it('should handle empty suffix', () => {
    const result = sessionScopedPath('/tmp', 'sess_abc', '');
    expect(result).toBe(path.resolve('/tmp', 'sess_abc'));
  });
});

// ============================================================================
// merge-custom-models
// ============================================================================

describe('mergeCustomModelDefs', () => {
  it('should return undefined when both inputs are undefined', () => {
    expect(mergeCustomModelDefs(undefined, undefined)).toBeUndefined();
  });

  it('should return provider models when no config models', () => {
    const provider = { 'gpt-4': { model: 'gpt-4', provider: 'openai' } as any };
    const result = mergeCustomModelDefs(provider, undefined);
    expect(result?.['gpt-4']).toBeDefined();
    expect(result?.['gpt-4']?.model).toBe('gpt-4');
  });

  it('should return config models when no provider models', () => {
    const config = { 'claude-3': { model: 'claude-3', provider: 'anthropic' } as any };
    const result = mergeCustomModelDefs(undefined, config);
    expect(result?.['claude-3']).toBeDefined();
  });

  it('should let config models override provider models', () => {
    const provider = { 'gpt-4': { model: 'gpt-4', provider: 'openai' } as any };
    const config = { 'gpt-4': { model: 'gpt-4-custom', provider: 'openai' } as any };
    const result = mergeCustomModelDefs(provider, config);
    // Config model wins (last writer wins in merge)
    expect(result?.['gpt-4']?.model).toBe('gpt-4-custom');
  });

  it('should combine distinct models from both sources', () => {
    const provider = { 'gpt-4': { model: 'gpt-4', provider: 'openai' } as any };
    const config = { 'claude-3': { model: 'claude-3', provider: 'anthropic' } as any };
    const result = mergeCustomModelDefs(provider, config);
    expect(result?.['gpt-4']).toBeDefined();
    expect(result?.['claude-3']).toBeDefined();
  });
});
