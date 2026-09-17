import { describe, expect, it } from 'vitest';
import { inputPathLooksSensitive } from '../../src/security/permission-helpers.js';

/**
 * Regression for the NTFS alternate-data-stream bypass found by the 2026-08-20
 * security-check audit.
 *
 * On Windows `fs` resolves `.env::$DATA` to the same file as `.env`, but every
 * sensitive-path pattern is `$`-anchored so the suffix made them all miss.
 * `read` is `permission: 'auto'`, so `{"path": ".env::$DATA"}` was a silent
 * credential read with no prompt.
 *
 * The detection is pure string work, so these assertions hold on every
 * platform even though the underlying filesystem behaviour is Windows-only.
 */

describe('an ADS suffix cannot hide a sensitive path', () => {
  it.each([
    '.env::$DATA',
    '.env:hidden',
    '.env:hidden:$DATA',
    'C:/Users/me/project/.env::$DATA',
    'C:\\Users\\me\\project\\.env::$DATA',
    '/home/me/.aws/credentials::$DATA',
    '.npmrc::$DATA',
    'id_rsa::$DATA',
  ])('still flags %s', (p) => {
    expect(inputPathLooksSensitive({ path: p })).toBe(true);
  });

  it.each(['.env', '.npmrc', '/home/me/.aws/credentials', 'C:/Users/me/.kube/config'])(
    'still flags the plain form %s',
    (p) => {
      expect(inputPathLooksSensitive({ path: p })).toBe(true);
    },
  );
});

/**
 * Regression for WS-2026-09-17-01 (2026-09-17 audit).
 *
 * The key list was singular-only, so a tool whose path field is PLURAL never
 * reached the sensitive-path patterns at all. `collab_debug` reads every entry
 * of `targetPaths` and embeds the contents in three subagent prompts, and one
 * character — the trailing `s` — kept it off this list entirely.
 */
describe('plural path keys are inspected, not just singular ones', () => {
  it.each([
    ['targetPaths', ['src/index.ts', '/home/me/.aws/credentials']],
    ['paths', ['.env']],
    ['files', ['package.json', 'id_rsa']],
    ['filePaths', ['C:\\Users\\me\\project\\.env']],
    ['file_paths', ['.npmrc']],
    ['targets', ['/home/me/.aws/credentials::$DATA']],
  ])('flags a sensitive entry inside %s', (key, value) => {
    expect(inputPathLooksSensitive({ [key]: value })).toBe(true);
  });

  it('does not flag a plural key whose entries are all ordinary', () => {
    expect(inputPathLooksSensitive({ targetPaths: ['src/a.ts', 'src/b.ts'] })).toBe(false);
  });

  it('still flags a plural key holding a bare string', () => {
    expect(inputPathLooksSensitive({ paths: '.env' })).toBe(true);
  });

  it('ignores non-string entries rather than throwing', () => {
    expect(inputPathLooksSensitive({ files: [42, null, { nested: '.env' }] })).toBe(false);
  });
});

describe('the ADS strip does not create false positives', () => {
  it.each([
    'src/index.ts',
    'C:/Users/me/notes.md',
    'C:\\Users\\me\\notes.md',
    'package.json',
    // A bare drive spec must survive normalization — the colon there is not a
    // stream separator.
    'C:',
    'C:/',
  ])('does not flag %s', (p) => {
    expect(inputPathLooksSensitive({ path: p })).toBe(false);
  });
});
