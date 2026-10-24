// Regression (F531): the cloud-config-sync plugin writes the profile config through
// its own read-modify-write (`writeLocalConfig`), which reads with
// readJsonObjectFile(...).catch(() => ({})) — readJsonObjectFile already maps
// EVERY failure (EBUSY/EPERM/EIO, unparseable JSON) to `{}`. So any write it
// makes during a transient read error replaces the whole config: `/cloudsync
// off` (or on / set url / a pulled snapshot) leaves only `cloudSync`, and every
// provider and API key is gone.
// Control: the same `/cloudsync off` with a readable config keeps the key.
// The EBUSY is injected at the fs seam on the first read of config.json, once.
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

const fault = vi.hoisted(() => ({ armed: false }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...real,
    readFile: (async (file: unknown, ...rest: unknown[]) => {
      if (fault.armed && path.basename(String(file)) === 'config.json') {
        fault.armed = false;
        throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
      }
      return (real.readFile as (...a: unknown[]) => unknown)(file, ...rest);
    }) as typeof real.readFile,
  };
});

const { noOpVault } = await import('../../core/src/security/index.js');
const { createCloudConfigSyncPlugin } = await import('../src/cloud-config-sync-plugin.js');

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

async function run(initial: string | null, verb: string, readFails = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cloudsync-read-error-'));
  dirs.push(root);
  const configDir = path.join(root, 'profiles', 'default');
  await fs.mkdir(configDir, { recursive: true });
  const file = path.join(configDir, 'config.json');
  if (initial !== null) await fs.writeFile(file, initial);
  let command: { run(args: string, ctx: unknown): Promise<unknown> } | undefined;
  const plugin = createCloudConfigSyncPlugin({
    paths: { configDir, globalRoot: root } as never,
    configStore: { get: () => ({}), update: () => undefined } as never,
    vault: noOpVault,
  });
  await plugin.setup({
    config: {},
    log: { info: () => undefined, warn: () => undefined },
    slashCommands: { register: (c: typeof command) => (command = c), unregister: () => undefined },
  } as never);
  fault.armed = readFails;
  let threw = false;
  try {
    await command!.run(verb, {});
  } catch {
    threw = true;
  }
  fault.armed = false;
  return { threw, text: await fs.readFile(file, 'utf8').catch(() => null) };
}
const CFG = JSON.stringify({ providers: { anthropic: { apiKey: 'sk-ant-KEEP' } } });
const parse = (t: string | null) => JSON.parse((t ?? '{}').replace(/^﻿/, ''));

it('BOM config: off keeps the key and records cloudSync', async () => {
  const r = await run(`﻿${CFG}`, 'off');
  expect(r.threw).toBe(false);
  expect(parse(r.text).providers.anthropic.apiKey).toBe('sk-ant-KEEP');
  expect(parse(r.text).cloudSync.enabled).toBe(false);
});
it('missing config: off creates it', async () => {
  const r = await run(null, 'off');
  expect(r.threw).toBe(false);
  expect(parse(r.text).cloudSync.enabled).toBe(false);
});
it('corrupt config: refused and untouched', async () => {
  const r = await run('{ "providers": ', 'off');
  expect(r.threw).toBe(true);
  expect(r.text).toBe('{ "providers": ');
});
it('EBUSY: refused, key intact; the next command succeeds', async () => {
  const r = await run(CFG, 'off', true);
  expect(r.threw).toBe(true);
  expect(parse(r.text).providers.anthropic.apiKey).toBe('sk-ant-KEEP');
});
