import { basename } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureSessionShell } from '../src/_session-shell.js';
import { pickShell } from '../src/_shell-pick.js';

// Mock only filesystem availability; use the real default probe and resolver.
const availability = vi.hoisted(() => ({ names: new Set<string>(), calls: 0 }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    accessSync(...args: Parameters<typeof actual.accessSync>) {
      availability.calls++;
      if (availability.names.has(basename(String(args[0])).toLowerCase())) return;
      throw Object.assign(new Error('fixture executable absent'), { code: 'ENOENT' });
    },
  };
});
afterEach(() => {
  availability.names.clear();
  availability.calls = 0;
});

// The real Windows resolver deliberately returns unchanged input on POSIX.
describe.skipIf(process.platform !== 'win32')(
  'session shell uses the real default Windows probe',
  () => {
    it.each([
      [['pwsh.exe', 'powershell.exe'], 'pwsh'],
      [['powershell.exe'], 'powershell'],
      [[], 'cmd'],
    ] as const)('selects %s as %s without an injected hasBinary', (names, expected) => {
      availability.names = new Set(names);
      const env: NodeJS.ProcessEnv = {};
      expect(ensureSessionShell({ env })).toBe(expected);
      expect(env.WRONGSTACK_SHELL).toBe(expected);
      expect(pickShell('win32', 'echo hello', { get: (key) => env[key] })).toBe(expected);
      expect(availability.calls).toBeGreaterThan(0);
    });

    it('keeps an explicit override unchanged without filesystem probes', () => {
      availability.names.add('pwsh.exe');
      const env: NodeJS.ProcessEnv = { WRONGSTACK_SHELL: 'cmd.exe' };
      expect(ensureSessionShell({ env })).toBe('cmd');
      expect(env.WRONGSTACK_SHELL).toBe('cmd.exe');
      expect(availability.calls).toBe(0);
    });

    it('keeps the pinned shell stable when filesystem availability changes', () => {
      availability.names.add('powershell.exe');
      const env: NodeJS.ProcessEnv = {};
      expect(ensureSessionShell({ env })).toBe('powershell');
      const calls = availability.calls;
      availability.names.clear();
      expect(ensureSessionShell({ env })).toBe('powershell');
      expect(availability.calls).toBe(calls);
    });

    it('preserves the documented .exe arguments of the injectable probe', () => {
      const probe = vi.fn((bin: string) => bin === 'powershell.exe');
      const env: NodeJS.ProcessEnv = {};
      expect(ensureSessionShell({ env, hasBinary: probe })).toBe('powershell');
      expect(probe.mock.calls.map(([bin]) => bin)).toEqual(['pwsh.exe', 'powershell.exe']);
      expect(availability.calls).toBe(0);
    });
  },
);
