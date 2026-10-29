/**
 * path-guard knew PowerShell only for deletion (Remove-Item/ri) and redirection:
 * Set-Content, Out-File, Copy-Item… named no target, so protected paths were
 * writable from the pwsh tool, and a colon-bound `-Path:.env` hid the target.
 */
import { describe, expect, it, vi } from 'vitest';

const plugin = (await import('../src/path-guard/index.js')).default;

function hook(extensions: Record<string, unknown> = {}) {
  const api = {
    tools: { register: vi.fn() },
    config: { extensions },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    metrics: { counter: vi.fn(), histogram: vi.fn(), gauge: vi.fn() },
    registerHook: vi.fn(() => vi.fn()),
  };
  plugin.setup(api as never);
  const h = (api.registerHook.mock.calls[0] as unknown[])[2] as (
    i: unknown,
  ) => Promise<{ decision?: string } | undefined>;
  return async (command: string) =>
    (
      await h({
        toolName: 'pwsh',
        toolInput: { command },
        cwd: process.cwd(),
        toolMutating: true,
        toolCapabilities: ['shell.arbitrary'],
      })
    )?.decision;
}

describe('path-guard: PowerShell writers', () => {
  it('blocks writers in every spelling: aliases, case, quoting, pipelines, groups', async () => {
    const run = hook();
    for (const command of [
      'Set-Content .env x',
      'set-content ".env" x',
      'sc.exe query; Set-Content -Path:".env" -Value x',
      'ac .env x',
      'clc .env',
      'ni .env -Force',
      'cpi a .env',
      'copy a .env',
      'mi a .env',
      'move a .env',
      'rni a .env',
      'ren a .env',
      'Copy-Item -Destination:.git/config -Path a',
      '{ Set-Content .env x }',
      'Get-ChildItem | ForEach-Object { $_ } ; Out-File -FilePath yarn.lock',
      'Remove-Item -LiteralPath:.env',
    ]) {
      expect(await run(command), command).toBe('block');
    }
  });

  it('leaves unprotected writes, reads and quoted mentions alone', async () => {
    const run = hook();
    for (const command of [
      'Set-Content notes.txt x',
      'Copy-Item a b',
      'Get-Content .env',
      'Write-Output "Set-Content .env"',
      'Out-File -FilePath report.txt',
    ]) {
      expect(await run(command), command).not.toBe('block');
    }
  });

  it('allow globs and warn mode still apply', async () => {
    expect(await hook({ 'path-guard': { allow: ['.env'] } })('Set-Content .env x')).not.toBe(
      'block',
    );
    expect(await hook({ 'path-guard': { mode: 'warn' } })('Set-Content .env x')).toBe('allow');
  });
});
