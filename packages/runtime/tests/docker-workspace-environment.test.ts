import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';

const spawned = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  spawn: spawned,
}));

import { systemDocker } from '../src/docker-workspace.js';

afterEach(() => {
  vi.unstubAllEnvs();
  spawned.mockReset();
});
it('filters ambient provider/vault secrets while preserving selected Docker environment', async () => {
  vi.stubEnv('WRONGSTACK_CHILD_ENV_PASSTHROUGH', '0');
  vi.stubEnv('WRONGSTACK_BASH_ENV_PASSTHROUGH', '0');
  vi.stubEnv('OPENAI_API_KEY', 'fixture-ambient-key');
  vi.stubEnv('WRONGSTACK_VAULT_PASSPHRASE', 'fixture-ambient-vault');
  vi.stubEnv('DOCKER_HOST', 'fixture://daemon');
  let environment: NodeJS.ProcessEnv | undefined;
  spawned.mockImplementation((_command, _args, options) => {
    environment = options.env;
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(),
    });
    queueMicrotask(() => child.emit('close', 0));
    return child;
  });
  const result = await systemDocker(['version'], {
    timeoutMs: 1000,
    env: { EXPLICIT_FIXTURE_KEY: 'selected' },
  });
  expect(result.code).toBe(0);
  expect(environment?.OPENAI_API_KEY).toBeUndefined();
  expect(environment?.WRONGSTACK_VAULT_PASSPHRASE).toBeUndefined();
  expect(environment?.DOCKER_HOST).toBe('fixture://daemon');
  expect(environment?.EXPLICIT_FIXTURE_KEY).toBe('selected');
});
