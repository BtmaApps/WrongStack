import { describe, expect, it, vi } from 'vitest';
import { resolveSpawnCommand } from '../../src/utils/safe-spawn.js';

/**
 * A server configured by hand kept its bare command, and Node does not apply
 * PATHEXT, so `typescript-language-server` ENOENTed on Windows although its
 * `.cmd` shim was on PATH (audit 2026-09-15). Only auto-discovered presets were
 * resolved.
 */
describe('resolveSpawnCommand', () => {
  it('resolves a bare command on Windows to the concrete shim', async () => {
    const resolve = vi.fn(async () => 'C:\\tools\\typescript-language-server.cmd');
    await expect(
      resolveSpawnCommand('typescript-language-server', 'C:\\proj', 'win32', resolve),
    ).resolves.toBe('C:\\tools\\typescript-language-server.cmd');
    expect(resolve).toHaveBeenCalledWith('typescript-language-server', 'C:\\proj');
  });

  it('leaves paths and explicit extensions alone on Windows', async () => {
    const resolve = vi.fn(async () => 'C:\\elsewhere.cmd');
    for (const command of ['C:\\bin\\gopls.exe', 'bin/clangd', 'rust-analyzer.exe', 'x.CMD']) {
      await expect(resolveSpawnCommand(command, 'C:\\proj', 'win32', resolve)).resolves.toBe(
        command,
      );
    }
    expect(resolve).not.toHaveBeenCalled();
  });

  it('does not resolve on POSIX, where spawn searches PATH itself', async () => {
    const resolve = vi.fn(async () => '/usr/bin/gopls');
    await expect(resolveSpawnCommand('gopls', '/proj', 'linux', resolve)).resolves.toBe('gopls');
    expect(resolve).not.toHaveBeenCalled();
  });

  it('keeps the configured command when resolution finds nothing or fails', async () => {
    await expect(resolveSpawnCommand('gopls', 'C:\\proj', 'win32', async () => null)).resolves.toBe(
      'gopls',
    );
    await expect(
      resolveSpawnCommand('gopls', 'C:\\proj', 'win32', async () => {
        throw new Error('where.exe missing');
      }),
    ).resolves.toBe('gopls');
  });
});
