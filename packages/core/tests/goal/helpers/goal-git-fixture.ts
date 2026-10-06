import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
export async function goalGitFixture() {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-multi-goal-'));
  const projectRoot = path.join(parent, 'project');
  const storeDir = path.join(parent, 'store');
  await fs.mkdir(projectRoot);
  const git = async (...args: string[]) =>
    (await run('git', args, { cwd: projectRoot, windowsHide: true })).stdout.trim();
  await git('init', '-b', 'main');
  await git('config', 'user.name', 'Goal Test');
  await git('config', 'user.email', 'goal@test.invalid');
  await fs.writeFile(path.join(projectRoot, '.gitignore'), '.wrongstack/\n');
  await fs.writeFile(path.join(projectRoot, 'base.txt'), 'unchanged\n');
  await git('add', '.');
  await git('commit', '-m', 'fixture baseline');
  const baseline = await git('rev-parse', 'HEAD');
  return {
    projectRoot,
    storeDir,
    baseline,
    git,
    dispose: () => fs.rm(parent, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
  };
}

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
