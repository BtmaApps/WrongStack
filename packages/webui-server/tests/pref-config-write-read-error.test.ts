// Regression (F530): the WebUI server's config writer (every prefs.update, YOLO
// toggle, telegram/hq setting) reads the profile config and, on ANY read
// failure, continues from '{}' — then mutates and writes. A transient read
// error (EBUSY from an AV scanner / indexer on Windows, EPERM, EIO) therefore
// replaces the whole config — every provider and API key — with the one
// changed preference. (A corrupt/BOM file is refused instead; only the read
// path falls back.)
// Control: the same update with a readable config keeps the provider.
// The EBUSY is injected at the fs seam on the writer's own read of config.json
// (the backup's earlier read succeeds), once.
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

const fault = vi.hoisted(() => ({ armed: false, skip: 0 }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...real,
    readFile: (async (file: unknown, ...rest: unknown[]) => {
      if (fault.armed && path.basename(String(file)) === 'config.json') {
        // The backup reads config.json first; the error hits the writer's read.
        if (fault.skip-- > 0) return (real.readFile as (...a: unknown[]) => unknown)(file, ...rest);
        fault.armed = false;
        throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
      }
      return (real.readFile as (...a: unknown[]) => unknown)(file, ...rest);
    }) as typeof real.readFile,
  };
});

const { noOpVault } = await import('@wrongstack/core/security');
const { writeGlobalConfigFile, updateGlobalConfig } = await import(
  '../src/server/pref-config-write.js'
);

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});
async function setup(withFile = true) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pref-config-read-error-'));
  dirs.push(root);
  const file = path.join(root, 'profiles', 'default', 'config.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  if (withFile)
    await fs.writeFile(
      file,
      JSON.stringify({ providers: { anthropic: { apiKey: 'sk-ant-KEEP' } } }),
    );
  return file;
}
const read = async (file: string) => JSON.parse(await fs.readFile(file, 'utf8'));

it('missing config is created with the preference', async () => {
  const file = await setup(false);
  await writeGlobalConfigFile(
    file,
    noOpVault,
    (c) => {
      c['yolo'] = true;
    },
    'prefs',
  );
  expect((await read(file)).yolo).toBe(true);
});
it('EBUSY refuses; the next update succeeds and keeps the key', async () => {
  const file = await setup();
  fault.armed = true;
  fault.skip = 1;
  await expect(
    writeGlobalConfigFile(
      file,
      noOpVault,
      (c) => {
        c['yolo'] = true;
      },
      'prefs',
    ),
  ).rejects.toThrow(/not overwriting/);
  expect((await read(file)).providers.anthropic.apiKey).toBe('sk-ant-KEEP');
  await writeGlobalConfigFile(
    file,
    noOpVault,
    (c) => {
      c['yolo'] = false;
    },
    'prefs',
  );
  const after = await read(file);
  expect(after.providers.anthropic.apiKey).toBe('sk-ant-KEEP');
  expect(after.yolo).toBe(false);
});
it('a refused update does not poison the serialized write chain', async () => {
  const file = await setup();
  const holder = { lock: Promise.resolve() };
  const deps = {
    profileConfigPath: file,
    vault: noOpVault,
    logger: { warn: () => undefined },
  } as never;
  fault.armed = true;
  fault.skip = 1;
  await expect(
    updateGlobalConfig(
      deps,
      holder,
      (c) => {
        c['a'] = 1;
      },
      'prefs',
    ),
  ).rejects.toThrow();
  await updateGlobalConfig(
    deps,
    holder,
    (c) => {
      c['b'] = 2;
    },
    'prefs',
  );
  const after = await read(file);
  expect(after.b).toBe(2);
  expect(after.providers.anthropic.apiKey).toBe('sk-ant-KEEP');
});
