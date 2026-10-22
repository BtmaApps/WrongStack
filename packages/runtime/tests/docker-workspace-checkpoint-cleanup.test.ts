import * as syncFs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';

const roots: string[] = [];
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rm: async (
      target: Parameters<typeof actual.rm>[0],
      options?: Parameters<typeof actual.rm>[1],
    ) => {
      if (String(target).endsWith('-prior'))
        throw Object.assign(new Error('synthetic EBUSY'), { code: 'EBUSY' });
      return actual.rm(target, options);
    },
  };
});

const { runDockerWorkspace } = await import('../src/docker-workspace.js');
type Runner = NonNullable<Parameters<typeof runDockerWorkspace>[0]['runner']>;

afterAll(() => {
  for (const root of roots) syncFs.rmSync(root, { recursive: true, force: true });
});

it('reports unverified cleanup when the prior checkpoint backup cannot be removed', async () => {
  const fs = await import('node:fs/promises');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'docker-checkpoint-cleanup-'));
  roots.push(root);
  await fs.writeFile(path.join(root, 'source.txt'), 'source');
  const conversationDirectory = path.join(root, 'conversation');
  await fs.mkdir(conversationDirectory, { recursive: true });
  await fs.writeFile(path.join(conversationDirectory, 'checkpoint.json'), '{"turn":1}');
  let owner = '';
  const runner: Runner = async (args) => {
    if (args[0] === 'create') owner = args[args.indexOf('--label') + 1]!.split('=')[1]!;
    if (args[0] === 'cp' && String(args[1]).includes(':/home/node/.wrongstack/.'))
      await fs.writeFile(path.join(args[2]!, 'checkpoint.json'), '{"turn":2}');
    let stdout = '';
    if (args[0] === 'create') stdout = `${'a'.repeat(64)}\n`;
    if (args[0] === 'inspect') stdout = `${'a'.repeat(64)} ${owner}\n`;
    if (args.at(-1)?.includes('git rev-parse')) stdout = `${'a'.repeat(40)}\n`;
    if (args.at(-1)?.includes('git diff')) stdout = 'diff --git a/source.txt b/source.txt\n';
    return { code: 0, stdout, stderr: '' };
  };

  const result = await runDockerWorkspace({
    projectRoot: root,
    image: 'trusted:1',
    command: 'wstack',
    conversationDirectory,
    runner,
  });

  expect(result.cleanup).toBe('unverified');
  expect(await fs.readFile(path.join(conversationDirectory, 'checkpoint.json'), 'utf8')).toBe(
    '{"turn":2}',
  );
  expect(
    syncFs
      .readdirSync(root)
      .filter((name) => name.startsWith('.wrongstack-conversation-') && name.endsWith('-prior')),
  ).toHaveLength(1);
});
