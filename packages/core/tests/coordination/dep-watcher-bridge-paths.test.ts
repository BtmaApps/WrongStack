import { describe, expect, it } from 'vitest';
import { relativize } from '../../src/coordination/dep-watcher-bridge.js';

describe('relativize', () => {
  const root = '/repo';

  it('converts an absolute path under the root to a relative one', () => {
    expect(relativize(root, '/repo/packages/web/package.json')).toBe('packages/web/package.json');
  });

  it('converts a root-level manifest', () => {
    expect(relativize(root, '/repo/package.json')).toBe('package.json');
  });

  it('normalizes windows separators on both sides', () => {
    expect(relativize('C:\\repo', 'C:\\repo\\packages\\web\\package.json')).toBe(
      'packages/web/package.json',
    );
  });

  it('tolerates a trailing separator on the root', () => {
    expect(relativize('/repo/', '/repo/package.json')).toBe('package.json');
  });

  it('returns the root itself as an empty relative path', () => {
    expect(relativize(root, root)).toBe('');
  });

  it('does not fabricate a relative path for a file outside the root', () => {
    // Returning the original lets `acceptManifestCandidate` reject it. Stripping
    // a non-matching prefix would invent a path that names the wrong file.
    expect(relativize(root, '/etc/shadow')).toBe('/etc/shadow');
    expect(relativize(root, '/repository-other/package.json')).toBe(
      '/repository-other/package.json',
    );
  });

  it('does not match a sibling directory that merely shares the root prefix', () => {
    expect(relativize('/repo', '/repo-other/package.json')).toBe('/repo-other/package.json');
  });
});
