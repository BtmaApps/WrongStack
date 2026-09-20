import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearProjectPathCache, normalizeProjectPath, resolveSagePaths } from '../src/paths.js';

// POSIX simulation of the backslash-traversal containment regression (same
// class as core yolo-risk / cloud-sync). The hole only exists where `\` is a
// legal filename character, so pin node:path to POSIX semantics regardless of
// host. node:fs is mocked to an identity realpath because paths.ts's only fs
// dependency is realpathSync and the virtual '/project' tree has no real
// files behind it — same string-math style as paths.test.ts.
vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:path')>();
  return { ...actual.posix, default: actual.posix };
});
vi.mock('node:fs', () => {
  const identity = (p: string) => p;
  return { realpathSync: identity, default: { realpathSync: identity } };
});

beforeEach(() => {
  clearProjectPathCache();
});

describe('normalizeProjectPath (POSIX host): Windows-style backslash traversal', () => {
  it('rejects a ..\\..\\ traversal instead of storing it as ../../', () => {
    // On POSIX the traversal reads as ONE in-root filename to the platform
    // path ops; storing it would put a real `../../` traversal into the
    // store, which escapes on Windows clients of a synced .wrongstack tree.
    expect(() => normalizeProjectPath('/project', '..\\..\\shared-secrets')).toThrow(
      /inside the project root/i,
    );
  });

  it('control: ordinary ../ escape is still rejected', () => {
    expect(() => normalizeProjectPath('/project', '../outside.txt')).toThrow(
      /inside the project root/i,
    );
  });

  it('control: legal in-root ..-prefixed name is still accepted', () => {
    expect(normalizeProjectPath('/project', '..hidden/theme.css')).toBe('..hidden/theme.css');
  });

  it('control: ordinary in-root path is unchanged', () => {
    expect(normalizeProjectPath('/project', 'src/foo.ts')).toBe('src/foo.ts');
  });
});

describe('resolveSagePaths (POSIX host): Windows-style backslash traversal', () => {
  it('rejects a ..\\..\\ sage directory', () => {
    expect(() => resolveSagePaths('/project', '..\\..\\elsewhere')).toThrow(
      /inside the project root/i,
    );
  });
});
