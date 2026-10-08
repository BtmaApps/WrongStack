import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildWin32CmdShimInvocation } from '../../src/utils/win32-cmd.js';

describe('buildWin32CmdShimInvocation', () => {
  it('refuses a caret, which `call` would double before the shim sees it', () => {
    expect(() => buildWin32CmdShimInvocation('npm.cmd', ['install', 'react@^18.2.0'])).toThrow(
      /metacharacter.*\^/,
    );
    expect(() => buildWin32CmdShimInvocation('C:\\a^b\\tool.cmd')).toThrow(/metacharacter/);
    expect(() => buildWin32CmdShimInvocation('npm.cmd', ['install', 'react@18.2.0'])).not.toThrow();
  });

  describe.skipIf(process.platform !== 'win32')('through real cmd.exe', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ws-win32-cmd-'));
    const shim = join(dir, 'echo-args.cmd');
    writeFileSync(join(dir, 'echo-args.js'), 'console.log(JSON.stringify(process.argv.slice(2)));');
    writeFileSync(shim, `@"${process.execPath}" "%~dp0echo-args.js" %*\r\n`);
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it('delivers every accepted argument to the shim unchanged', () => {
      const args = ['plain', 'with space', 'p!q!', '(a,b;c=d)', '', 'trail\\'];
      const inv = buildWin32CmdShimInvocation(shim, args);
      const out = spawnSync(inv.command, inv.args, {
        windowsVerbatimArguments: true,
        windowsHide: true,
        encoding: 'utf8',
      });
      expect(JSON.parse(out.stdout.trim())).toEqual(args);
    });
  });
});
