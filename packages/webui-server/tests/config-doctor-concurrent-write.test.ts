/**
 * Regression (F533): `/doctor fix` computed its repair from a read taken
 * outside the config lock and then replaced the whole file with that stale
 * snapshot inside the locked write, erasing anything written in between.
 * Gated without sleeps: updateConfig runs only after the doctor's read, and the
 * wrapper lands the concurrent writer's locked write first.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { noOpVault } from '@wrongstack/core/security';
import { afterEach, describe, expect, it } from 'vitest';
import { handleConfigDoctor } from '../src/server/config-doctor.js';
import { writeGlobalConfigFile } from '../src/server/pref-config-write.js';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

async function run(apply: boolean, concurrentWrite: boolean) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'config-doctor-race-'));
  dirs.push(root);
  const file = path.join(root, 'profiles', 'default', 'config.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  const initial = JSON.stringify({ providers: { anthropic: { apiKey: 'sk-ant-OLD' } } });
  await fs.writeFile(file, initial);
  let runtime: Record<string, unknown> | undefined;
  await handleConfigDoctor({ send: () => undefined, readyState: 1 } as never, apply, {
    profileConfigPath: file,
    vault: noOpVault,
    applyRuntimeConfig: (config: unknown) => {
      runtime = config as Record<string, unknown>;
    },
    updateConfig: async (mutate: (c: Record<string, unknown>) => void, label: string) => {
      if (concurrentWrite) {
        await writeGlobalConfigFile(
          file,
          noOpVault,
          (c) => {
            (c.providers as Record<string, unknown>).openai = { apiKey: 'sk-NEW' };
          },
          'tui',
        );
      }
      await writeGlobalConfigFile(file, noOpVault, mutate, label);
    },
  } as never);
  return { text: await fs.readFile(file, 'utf8'), runtime };
}

describe('handleConfigDoctor apply', () => {
  it('keeps a write that landed between its read and its locked write', async () => {
    const { text, runtime } = await run(true, true);
    const after = JSON.parse(text);
    expect(after.providers.openai.apiKey).toBe('sk-NEW');
    expect(Object.keys(after).length).toBeGreaterThan(1);
    expect(runtime).toMatchObject({ providers: { openai: { apiKey: 'sk-NEW' } } });
  });

  it('a preview does not write', async () => {
    const { text } = await run(false, false);
    expect(JSON.parse(text)).toEqual({ providers: { anthropic: { apiKey: 'sk-ant-OLD' } } });
  });
});
