import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { verifyAutomationPatch } from '../src/automation/verification.js';
import { runDockerWorkspace } from '../src/docker-workspace.js';

// Live Docker proof, deliberately separate from the deterministic unit suite.
// Supply an operator-selected image containing sh and git. No model/account is used.
const image = process.argv[process.argv.indexOf('--image') + 1];
if (!process.argv.includes('--image') || !image)
  throw new Error(
    'Usage: bun packages/runtime/scripts/automation-verification-smoke.ts --image <trusted-image-with-git>',
  );
const base = await realpath(os.tmpdir());
const projectRoot = await mkdtemp(path.join(base, 'wrongstack-verification-live-'));
assert(
  path.dirname(path.resolve(projectRoot)) === base &&
    path.basename(projectRoot).startsWith('wrongstack-verification-live-'),
  'Refusing fixture outside the owned temporary directory',
);
try {
  await writeFile(path.join(projectRoot, 'value.txt'), 'original\n');
  const candidate = await runDockerWorkspace({
    projectRoot,
    image,
    command: '/bin/sh',
    args: ['-c', 'printf "fixed\\n" > value.txt'],
    network: 'none',
    captureTreeIdentity: true,
  });
  assert.equal(candidate.exitCode, 0, candidate.failure);
  assert.equal(candidate.cleanup, 'removed');
  const check = async (command: string) =>
    verifyAutomationPatch(
      {
        projectRoot,
        image,
        verification: { commands: [['/bin/sh', '-c', command]], timeoutMs: 30_000 },
      },
      candidate,
      new AbortController().signal,
    );
  assert.equal((await check('test "$(cat value.txt)" = fixed')).validation.status, 'passed');
  assert.equal((await check('exit 7')).validation.status, 'failed');
  assert.equal((await check('printf "mutated\\n" > value.txt')).validation.status, 'stale');
  await writeFile(path.join(projectRoot, 'value.txt'), 'concurrent host change\n');
  assert.equal((await check('true')).validation.status, 'stale');
  assert.equal(
    await readFile(path.join(projectRoot, 'value.txt'), 'utf8'),
    'concurrent host change\n',
  );
  process.stdout.write(
    'PASS: live Docker verification, failure, mutation, source drift and host preservation\n',
  );
} finally {
  await rm(projectRoot, { recursive: true, force: true });
}
