import { type ChildProcess, spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sageProjectServerMetadataPath } from '../src/project-server-endpoint.js';
import type { ProjectSageMemoryPort } from '../src/remote-memory-port.js';
import type { SageSurface } from '../src/service-contract.js';

/**
 * The maintenance schedule and the doctor cross the real daemon boundary: a
 * JSON round-trip through the production client against the built daemon.
 * An in-process fake cannot catch an op the dispatcher silently drops.
 */
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
let root: string;
let child: ChildProcess | undefined;
let ports: ProjectSageMemoryPort[] = [];

async function startDaemon(): Promise<void> {
  child = spawn(process.execPath, [join(dist, 'project-server.js'), '--project-root', root], {
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, WRONGSTACK_SAGE_MAINTENANCE_SETTLE_MS: '0' },
  });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const metadata = JSON.parse(await readFile(sageProjectServerMetadataPath(root), 'utf8'));
      if (metadata.pid === child.pid) return;
    } catch {
      /* startup not finished */
    }
    if (child.exitCode !== null) throw new Error(`SAGE test daemon exited ${child.exitCode}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('SAGE test daemon startup timed out');
}

async function stopDaemon(): Promise<void> {
  await Promise.all(ports.map((port) => port.dispose()));
  ports = [];
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise<void>((resolve) => child!.once('exit', () => resolve()));
    child.kill();
    await exited;
  }
  child = undefined;
}

async function surface(): Promise<SageSurface> {
  const url = pathToFileURL(join(dist, 'index.js')).href;
  const api = (await import(/* @vite-ignore */ url)) as typeof import('../src/index.js');
  const port = new api.ProjectSageMemoryPort({ projectRoot: root, spawnIfMissing: false });
  ports.push(port);
  await port.initialize();
  return api.getSageSurface(port)!;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sage-doctor-ipc-'));
  await startDaemon();
}, 20_000);
afterEach(async () => {
  await stopDaemon();
  await rm(root, { recursive: true, force: true });
});

describe('SAGE maintenance and doctor over the production IPC boundary', () => {
  it('runs scheduled hygiene inside the daemon and reports it through doctor', async () => {
    const remote = await surface();
    const expired = await remote.rememberSage({
      text: 'Session digest whose expiry passed long ago and must be collected.',
      kind: 'session_digest',
      scope: 'session',
      ownerSessionId: 'sess_ipc',
      persistence: 'short_lived',
      expiresAt: '2020-01-01T00:00:00.000Z',
    });

    const before = await remote.doctor!();
    expect(before.checks.find((check) => check.id === 'expired-active')?.count).toBe(1);
    expect(before.checks.find((check) => check.id === 'maintenance')?.severity).toBe('warn');

    const status = await remote.maintenance!('schedule', { sessionRetentionDays: 7 });
    expect(status).toMatchObject({ owner: 'daemon', scheduled: true });

    const statePath = join(root, '.wrongstack', 'memories', 'hygiene', 'maintenance.json');
    const deadline = Date.now() + 15_000;
    for (;;) {
      try {
        await access(statePath);
        break;
      } catch {
        if (Date.now() > deadline) throw new Error('daemon never ran scheduled maintenance');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    expect((await remote.getSage(expired.id))?.status).toBe('deleted');
    const after = await remote.doctor!();
    expect(after.maintenance?.lastRunAt).toEqual(expect.any(String));
    expect(after.checks.find((check) => check.id === 'maintenance')?.severity).toBe('ok');
    expect(after.checks.find((check) => check.id === 'expired-active')?.severity).toBe('ok');
  }, 30_000);

  it('applies a named repair over IPC and rejects malformed args', async () => {
    const remote = await surface();
    await remote.rememberSage({
      text: 'Runtime mode audience memory created before the role-only auto-audience fix.',
      kind: 'fact',
      audience: { modes: ['default'] },
    });
    const fixed = await remote.doctor!({ fix: ['audience-runtime-mode'] });
    expect(fixed.fixesApplied).toEqual([
      expect.objectContaining({ fix: 'audience-runtime-mode', changed: 1 }),
    ]);
    await expect(remote.maintenance!(undefined as never)).rejects.toThrow(/action/);
  }, 30_000);
});
