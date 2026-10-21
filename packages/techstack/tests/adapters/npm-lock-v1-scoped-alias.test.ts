import { describe, expect, it } from 'vitest';
import { parseNpmLockVersions } from '../../src/adapters/npm-lockfile-parse.js';

/**
 * Regression: an npm v1 lockfile spells an alias in the version
 * (`"types-node": { "version": "npm:@types/node@20.1.0" }`). The scope belongs to
 * the real package name; dropping it mapped the alias to `node`, a different
 * package that exists, which the inventory then reported and audited.
 */
const aliasOf = (name: string, version: string) =>
  parseNpmLockVersions(
    JSON.stringify({ lockfileVersion: 1, dependencies: { [name]: { version } } }),
  ).aliases.get(name);

describe('npm v1 lockfile aliases', () => {
  it('keeps the scope of a scoped alias target', () => {
    expect(aliasOf('types-node', 'npm:@types/node@20.1.0')).toBe('@types/node');
  });

  it('still maps an unscoped alias', () => {
    expect(aliasOf('typescript5', 'npm:typescript@5.9.3')).toBe('typescript');
  });
});
