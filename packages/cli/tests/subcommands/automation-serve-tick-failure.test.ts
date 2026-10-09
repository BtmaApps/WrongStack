import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { SubcommandDeps } from '../../src/subcommands/contracts.js';
import { automationCmd } from '../../src/subcommands/handlers/automation.js';

const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true });
});

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

describe('automation serve', () => {
  it('keeps the worker running when a tick fails', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wrongstack-serve-'));
    directories.push(dir);
    const state = path.join(dir, 'state');
    await mkdir(state);
    const jobs = path.join(state, 'jobs.json');
    await writeFile(jobs, '{broken');
    let output = '';
    let notify: (() => void) | undefined;
    const written = (pattern: RegExp) =>
      new Promise<void>((resolve) => {
        notify = () => {
          if (pattern.test(output)) resolve();
        };
        notify();
      });
    const deps = {
      renderer: {
        write: (text: string) => {
          output += text;
          notify?.();
        },
      },
      projectRoot: dir,
      cwd: dir,
      paths: { profileName: 'default', profileConfig: () => path.join(dir, 'profile.json') },
      vault: { decrypt: () => '' },
      flags: { 'data-dir': state, port: String(await freePort()) },
    } as unknown as SubcommandDeps;
    let exitCode: number | undefined;
    const command = automationCmd(['serve'], deps).then((code) => {
      exitCode = code;
      notify?.();
      return code;
    });

    await written(/automation: .*(JSON|Unexpected|Expected)/i);
    await writeFile(jobs, '{"version":2,"jobs":[],"runs":[]}\n');
    await Promise.race([written(/Invalid automation state/), command]);
    expect(exitCode).toBeUndefined();

    process.emit('SIGINT');
    expect(await command).toBe(0);
  });
});
