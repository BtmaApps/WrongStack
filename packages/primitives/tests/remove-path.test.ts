/**
 * Tests for `removePathSync`, the `fs.rmSync` that verifies the path is gone.
 *
 * Node 24's native rmSync returns without removing anything on Windows when a
 * path segment is non-ASCII. That runtime bug cannot be reproduced on every
 * CI platform, so the fallback cases stand rmSync in as a no-op — exactly
 * what the bug looks like to the caller — and check the path still goes.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { removePathSync } from '../src/remove-path.js';

const state = vi.hoisted(() => ({
  rmSyncIsNoop: false,
  onReaddir: undefined as ((target: string) => void) | undefined,
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    rmSync: (...args: Parameters<typeof actual.rmSync>) => {
      if (!state.rmSyncIsNoop) actual.rmSync(...args);
    },
    readdirSync: ((...args: Parameters<typeof actual.readdirSync>) => {
      const entries = actual.readdirSync(...args);
      state.onReaddir?.(String(args[0]));
      return entries;
    }) as typeof actual.readdirSync,
  };
});

afterEach(() => {
  state.rmSyncIsNoop = false;
  state.onReaddir = undefined;
});

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'remove-path-'));
}

function tree(root: string): string {
  const dir = path.join(root, 'klasör');
  fs.mkdirSync(path.join(dir, 'alt', 'derin'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'kök.txt'), 'x');
  fs.writeFileSync(path.join(dir, 'alt', 'derin', 'ü.txt'), 'x');
  return dir;
}

describe('removePathSync', () => {
  it('removes a file', () => {
    const file = path.join(tempDir(), 'a.txt');
    fs.writeFileSync(file, 'x');
    removePathSync(file);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('removes a directory tree with recursive', () => {
    const dir = tree(tempDir());
    removePathSync(dir, { recursive: true, force: true });
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('keeps rmSync semantics for a missing path', () => {
    const missing = path.join(tempDir(), 'nope');
    expect(() => removePathSync(missing, { force: true })).not.toThrow();
    expect(() => removePathSync(missing)).toThrow(/ENOENT/);
  });

  it('refuses a directory without recursive, like rmSync', () => {
    const dir = tree(tempDir());
    expect(() => removePathSync(dir)).toThrow();
    expect(fs.existsSync(dir)).toBe(true);
  });

  describe('when rmSync returns without removing anything', () => {
    it('removes a file anyway', () => {
      state.rmSyncIsNoop = true;
      const file = path.join(tempDir(), 'şablon.txt');
      fs.writeFileSync(file, 'x');
      removePathSync(file);
      expect(fs.existsSync(file)).toBe(false);
    });

    it('removes a directory tree anyway', () => {
      state.rmSyncIsNoop = true;
      const dir = tree(tempDir());
      removePathSync(dir, { recursive: true, force: true });
      expect(fs.existsSync(dir)).toBe(false);
    });

    it('does not empty a directory it was not asked to recurse into', () => {
      state.rmSyncIsNoop = true;
      const dir = tree(tempDir());
      removePathSync(dir, { force: true });
      expect(fs.existsSync(path.join(dir, 'kök.txt'))).toBe(true);
    });

    it('aborts fallback traversal when a directory is replaced during readdir', () => {
      state.rmSyncIsNoop = true;
      const root = tempDir();
      const dir = path.join(root, 'target-dir');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'child.txt'), 'x');
      state.onReaddir = (target) => {
        if (target === dir) {
          fs.unlinkSync(path.join(dir, 'child.txt'));
          fs.rmdirSync(dir);
          fs.writeFileSync(dir, 'replaced-with-file');
        }
      };
      expect(() => removePathSync(dir, { recursive: true, force: true })).toThrow(
        /Path changed during recursive removal/,
      );
    });
  });
});
