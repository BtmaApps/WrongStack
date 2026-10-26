import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { VerificationContext } from '../src/verification/verification-context.js';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
});

async function projectWithShim(name: string, shim: string): Promise<VerificationContext> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-cmd-shim-'));
  roots.push(base);
  const root = path.join(base, name);
  await fs.mkdir(path.join(root, 'node_modules', '.bin'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), '{}');
  await fs.writeFile(
    path.join(root, 'node_modules', 'argv.js'),
    'console.log(JSON.stringify(process.argv.slice(2)))',
  );
  await fs.writeFile(path.join(root, 'node_modules', '.bin', 'lintx.cmd'), shim);
  return new VerificationContext({
    projectRoot: root,
    board: {} as never,
    task: {} as never,
    commandAllowlist: { allowedCommands: ['+lintx'] },
  });
}

// A `.cmd` shim was spawned with `shell: true`, which joins command and args
// unquoted: the shim path split at the first space of the project path and
// the allowlisted tool never ran.
describe.runIf(process.platform === 'win32')('verifier .cmd shim spawning', () => {
  it('runs an allowlisted shim in a project path with spaces and keeps argv intact', async () => {
    const ctx = await projectWithShim('Dir With Spaces', '@node "%~dp0\\..\\argv.js" %*\r\n');
    const result = await ctx.runCommand('lintx "my file.ts" plain');
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual(['my file.ts', 'plain']);
  });

  it('refuses a shim path carrying a cmd.exe metacharacter instead of splitting it', async () => {
    const ctx = await projectWithShim('R&D', '@echo SHOULD-NOT-RUN\r\n');
    const result = await ctx.runCommand('lintx x');
    expect(result.exitCode).toBe(-1);
    expect(result.stdout).not.toContain('SHOULD-NOT-RUN');
    expect(result.stderr).toMatch(/metacharacter/);
  });
});
