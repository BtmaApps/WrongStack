import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChronicleProjectAccess } from '../src/project-access.js';

/**
 * The inline access opens its SQLite store lazily and memoizes the open. A
 * failed open must reset that memo: otherwise the first error is replayed to
 * every later call, and to `close()`, forever.
 */

const event = {
  eventType: 'tool.started',
  scope: { installationId: 'i', machineId: 'm' },
  correlation: { traceId: 't', spanId: 's' },
};

let root: string;

beforeEach(async () => {
  vi.stubEnv('WRONGSTACK_CHRONICLE_INLINE', '1');
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'chronicle-open-retry-'));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(root, { recursive: true, force: true });
});

function accessFor(projectDir: string) {
  return createChronicleProjectAccess({
    projectRoot: path.join(root, 'project'),
    projectPaths: { globalRoot: root, projectId: 'proj', projectDir, workspaceId: 'ws' },
  });
}

const append = (access: ReturnType<typeof accessFor>) =>
  access.call('append', { inputs: [event] } as never);

/** A FILE where the chronicle directory belongs, so `mkdir` fails. */
async function blockedProjectDir(name: string): Promise<string> {
  const projectDir = path.join(root, name);
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(path.join(projectDir, 'chronicle'), 'blocker');
  return projectDir;
}

describe('InlineChronicleProjectAccess store open', () => {
  it('appends on a healthy directory', async () => {
    const access = accessFor(path.join(root, 'healthy'));
    await expect(append(access)).resolves.toBeDefined();
    await access.close();
  });

  it('retries the open after a transient mkdir failure instead of replaying it', async () => {
    const projectDir = await blockedProjectDir('blocked');
    const access = accessFor(projectDir);
    await expect(append(access)).rejects.toThrow(/EEXIST|mkdir/);
    await fs.rm(path.join(projectDir, 'chronicle'), { force: true });
    await expect(append(access)).resolves.toBeDefined();
    await access.close();
  });

  it('keeps rejecting while the fault persists, then recovers once it clears', async () => {
    const projectDir = await blockedProjectDir('persistent');
    const access = accessFor(projectDir);
    await expect(append(access)).rejects.toThrow(/EEXIST|mkdir/);
    await expect(append(access)).rejects.toThrow(/EEXIST|mkdir/);
    await fs.rm(path.join(projectDir, 'chronicle'), { force: true });
    await expect(append(access)).resolves.toBeDefined();
    await access.close();
  });

  it('close() resolves after a failed open instead of re-throwing it', async () => {
    const projectDir = await blockedProjectDir('closing');
    const access = accessFor(projectDir);
    await expect(append(access)).rejects.toThrow(/EEXIST|mkdir/);
    await expect(access.close()).resolves.toBeUndefined();
  });
});
