import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type DockerCommandRunner, runDockerWorkspace } from '../src/docker-workspace.js';

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'docker-workspace-test-'));
  dirs.push(dir);
  await writeFile(path.join(dir, 'original.txt'), 'unchanged');
  let owner = '';
  const calls: string[][] = [];
  const runner: DockerCommandRunner = vi.fn(async (args) => {
    calls.push(args);
    if (args[0] === 'create') owner = args[args.indexOf('--label') + 1]!.split('=')[1]!;
    let stdout = '';
    if (args[0] === 'create') stdout = `${'a'.repeat(64)}\n`;
    if (args[0] === 'inspect') stdout = `${'a'.repeat(64)} ${owner}\n`;
    if (args.at(-1)?.includes('git rev-parse')) stdout = `${'a'.repeat(40)}\n`;
    if (args.at(-1)?.includes('git diff')) stdout = 'diff --git a/original.txt b/original.txt\n';
    return { code: 0, stdout, stderr: '' };
  });
  return { dir, runner, calls };
}
describe('Docker workspace ownership', () => {
  it('uses immutable Docker IDs for execution and removal', async () => {
    const { dir, runner, calls } = await fixture();
    await runDockerWorkspace({ projectRoot: dir, image: 'trusted:1', command: 'wstack', runner });
    expect(calls.find((a) => a[0] === 'start')?.[1]).toBe('a'.repeat(64));
    expect(calls.find((a) => a[0] === 'rm')?.at(-1)).toBe('a'.repeat(64));
  });
  it('stops and retains partial work after an interrupted agent command', async () => {
    const { dir, runner, calls } = await fixture();
    const wrapped: DockerCommandRunner = async (args, opts) => {
      if (args[0] === 'exec' && args.includes('wstack')) throw new Error('command timed out');
      return runner(args, opts);
    };
    const result = await runDockerWorkspace({
      projectRoot: dir,
      image: 'trusted:1',
      command: 'wstack',
      runner: wrapped,
    });
    expect(result).toMatchObject({
      patch: null,
      cleanup: 'retained',
      failure: 'command timed out',
    });
    expect(calls.some((a) => a[0] === 'stop')).toBe(true);
    expect(calls.some((a) => a[0] === 'rm')).toBe(false);
  });
  it('does not remove a prior generation after a stable run name collision', async () => {
    const { dir, runner, calls } = await fixture();
    const wrapped: DockerCommandRunner = async (args, opts) => {
      if (args[0] === 'create') return { code: 1, stdout: '', stderr: 'name already exists' };
      if (args[0] === 'inspect')
        return { code: 0, stdout: `${'b'.repeat(64)} foreign-generation`, stderr: '' };
      return runner(args, opts);
    };
    await expect(
      runDockerWorkspace({
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        projectRoot: dir,
        image: 'trusted:1',
        command: 'wstack',
        runner: wrapped,
      }),
    ).rejects.toThrow('name already exists');
    expect(calls.some((a) => a[0] === 'rm' || a[0] === 'stop')).toBe(false);
  });
  it('runs argv in a copied workspace, forwards only named env and returns a snapshot patch', async () => {
    const { dir, runner, calls } = await fixture();
    const result = await runDockerWorkspace({
      projectRoot: dir,
      image: 'trusted:1',
      command: 'wstack',
      args: ['--prompt', 'literal $(danger); text'],
      envNames: ['OPENAI_API_KEY'],
      network: 'none',
      runner,
    });
    const create = calls.find((a) => a[0] === 'create')!;
    expect(create).not.toContain('--mount');
    expect(create).not.toContain('--privileged');
    expect(create).toContain('OPENAI_API_KEY');
    expect(create).toContain('none');
    expect(calls.some((a) => a.includes('literal $(danger); text'))).toBe(true);
    expect(result).toMatchObject({
      exitCode: 0,
      cleanup: 'removed',
      snapshotRevision: 'a'.repeat(40),
    });
    expect(result.patch).toContain('diff --git');
    expect(await readFile(path.join(dir, 'original.txt'), 'utf8')).toBe('unchanged');
  });
  it('does not remove a container whose ownership probe fails', async () => {
    const { dir, runner, calls } = await fixture();
    const wrapped: DockerCommandRunner = async (args, opts) =>
      args[0] === 'inspect' ? { code: 1, stdout: '', stderr: 'unreachable' } : runner(args, opts);
    const result = await runDockerWorkspace({
      projectRoot: dir,
      image: 'trusted:1',
      command: 'wstack',
      runner: wrapped,
    });
    expect(result.cleanup).toBe('unverified');
    expect(calls.some((a) => a[0] === 'rm')).toBe(false);
  });
  it('does not remove a replacement container with another owner label', async () => {
    const { dir, runner, calls } = await fixture();
    const wrapped: DockerCommandRunner = async (args, opts) =>
      args[0] === 'inspect' ? { code: 0, stdout: 'another-owner', stderr: '' } : runner(args, opts);
    await runDockerWorkspace({
      projectRoot: dir,
      image: 'trusted:1',
      command: 'wstack',
      runner: wrapped,
    });
    expect(calls.some((a) => a[0] === 'rm')).toBe(false);
  });
  it('cleans only the proven owner after a provisioning error', async () => {
    const { dir, runner, calls } = await fixture();
    const wrapped: DockerCommandRunner = async (args, opts) =>
      args[0] === 'cp' ? { code: 1, stdout: '', stderr: 'copy failed' } : runner(args, opts);
    await expect(
      runDockerWorkspace({
        projectRoot: dir,
        image: 'trusted:1',
        command: 'wstack',
        runner: wrapped,
      }),
    ).rejects.toThrow('copy failed');
    expect(calls.filter((a) => a[0] === 'rm')).toHaveLength(1);
  });
  it.each(['HOME', 'NODE_OPTIONS', 'DOCKER_HOST', 'WRONGSTACK_HOME', 'x=y'])(
    'refuses ambient authority through %s',
    async (env) => {
      const { dir, runner, calls } = await fixture();
      await expect(
        runDockerWorkspace({
          projectRoot: dir,
          image: 'trusted:1',
          command: 'wstack',
          envNames: [env],
          runner,
        }),
      ).rejects.toThrow('cannot be forwarded');
      expect(calls).toHaveLength(0);
    },
  );
});
