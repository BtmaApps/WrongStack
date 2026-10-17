import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { KanbanBoard, KanbanTask } from '../../src/types.js';
import { buildAllowlist, validateCommand } from '../../src/verification/command-security.js';
import { VerificationContext } from '../../src/verification/verification-context.js';

const command =
  'bun --cwd apps/desktop --bun run vitest run --config vitest.config.ts --maxWorkers=1';
const policy = { ...buildAllowlist(undefined), allowAll: false };
const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const scratch = path.join(repoRoot, '.temp_files');
  await fs.mkdir(scratch, { recursive: true });
  const root = await fs.mkdtemp(path.join(scratch, 'kanban-desktop-verifier-'));
  roots.push(root);
  await fs.mkdir(path.join(root, 'apps/desktop'), { recursive: true });
  await fs.writeFile(path.join(root, 'apps/desktop/vitest.config.ts'), 'export default {};');
  await fs.writeFile(path.join(root, 'package.json'), '{"private":true}');
  const context = new VerificationContext({
    projectRoot: root,
    board: { id: 'board', title: 'fixture', columns: [], tasks: [] } as unknown as KanbanBoard,
    task: { id: 'task', title: 'fixture', status: 'pending' } as unknown as KanbanTask,
  });
  return { root, context };
}

async function localRunner(root: string, source: string) {
  const dir = path.join(root, 'node_modules/vitest');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'vitest', bin: './vitest.mjs' }),
  );
  await fs.writeFile(path.join(dir, 'vitest.mjs'), source);
}

describe('authorized Desktop Vitest verifier exception', () => {
  it('admits only the approved argv while keeping Bun generally blocked', () => {
    expect(policy.block.has('bun')).toBe(true);
    expect(validateCommand(command, policy)).toBeNull();
  });

  it.each([
    'bun --version',
    'bun install',
    'bun -e "console.log(1)"',
    'bun run test',
    command.replace('apps/desktop', 'apps/other'),
    command.replace('apps/desktop', '../desktop'),
    command.replace('vitest.config.ts', 'other.config.ts'),
    command.replace('--maxWorkers=1', '--maxWorkers=8'),
    command.replace('--bun ', ''),
    command.replace('vitest run', 'vitest watch'),
    command.replace('bun --cwd', 'C:/elsewhere/bun.exe --cwd'),
    `${command} --reporter=json`,
    `${command} && true`,
    `${command}\ntrue`,
    command.replace('apps/desktop', '$PROJECT'),
    command.replace('apps/desktop', '%PROJECT%'),
  ])('rejects unapproved form %s', (input) => {
    expect(validateCommand(input, policy)).not.toBeNull();
  });

  it('executes the local JS runner under Bun with the exact cwd/argv', async () => {
    const { root, context } = await fixture();
    await localRunner(
      root,
      'console.log(JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2),bun:!!process.versions.bun}));',
    );
    const result = await context.runCommand(command, { timeoutMs: 10_000 });
    expect(result.rejected).not.toBe(true);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      cwd: path.join(root, 'apps/desktop'),
      args: ['run', '--config', 'vitest.config.ts', '--maxWorkers=1'],
      bun: true,
    });
  });

  it('fails closed when no in-project runner is available', async () => {
    const { context } = await fixture();
    const result = await context.runCommand(command);
    expect(result.rejected).toBe(true);
    expect(result.stderr).toContain('local Vitest JS');
  });

  it('rejects a Desktop directory junction escaping the project', async () => {
    const { root, context } = await fixture();
    const outside = await fixture();
    await fs.rm(path.join(root, 'apps/desktop'), { recursive: true });
    await fs.symlink(
      path.join(outside.root, 'apps/desktop'),
      path.join(root, 'apps/desktop'),
      'junction',
    );
    const result = await context.runCommand(command);
    expect(result.rejected).toBe(true);
    expect(result.stderr).toContain('inside the project root');
  });

  it('rejects a local runner junction escaping the project', async () => {
    const { root, context } = await fixture();
    const outside = await fixture();
    await localRunner(outside.root, 'throw new Error("must not execute");');
    await fs.mkdir(path.join(root, 'node_modules'), { recursive: true });
    await fs.symlink(
      path.join(outside.root, 'node_modules/vitest'),
      path.join(root, 'node_modules/vitest'),
      'junction',
    );
    const result = await context.runCommand(command);
    expect(result.rejected).toBe(true);
    expect(result.stderr).toContain('local Vitest JS');
  });

  it('does not fall back to PATH Bun from a non-Bun host', async () => {
    const { context } = await fixture();
    const descriptor = Object.getOwnPropertyDescriptor(process.versions, 'bun');
    Object.defineProperty(process.versions, 'bun', { configurable: true, value: undefined });
    try {
      const result = await context.runCommand(command);
      expect(result.rejected).toBe(true);
      expect(result.stderr).toContain('verifier running under Bun');
    } finally {
      if (descriptor) Object.defineProperty(process.versions, 'bun', descriptor);
    }
  });

  it('retains actual test failure exit status', async () => {
    const { root, context } = await fixture();
    await localRunner(root, 'console.error("fixture assertion failed"); process.exitCode=1;');
    const result = await context.runCommand(command, { timeoutMs: 10_000 });
    expect(result.rejected).not.toBe(true);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('fixture assertion failed');
  });
});
