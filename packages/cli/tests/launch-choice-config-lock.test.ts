/**
 * persistLaunchChoices / persistMenuChoice / persistSystemPromptVariant and the boot
 * migratePlaintextSecrets and `/doctor fix` must hold the config lock that every
 * other profile-config writer holds. Unlocked, a locked update landing between
 * their read and write (another window, the WebUI adding a provider key) was
 * silently overwritten.
 *
 * Gated, no sleeps: the launch writer's read of the config is held until the
 * competing locked writer has either finished (unlocked writer: the bug) or is
 * observed blocked on the lock file (`wx` open → EEXIST: the fix).
 */

import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const gate = vi.hoisted(() => ({
  path: undefined as string | undefined,
  competitor: undefined as (() => Promise<unknown>) | undefined,
  run: undefined as Promise<unknown> | undefined,
  onContended: undefined as (() => void) | undefined,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const open = (async (
    p: Parameters<typeof actual.open>[0],
    flags?: string | number,
    mode?: number,
  ) => {
    try {
      return await actual.open(p, flags, mode);
    } catch (error) {
      if (
        flags === 'wx' &&
        String(p).endsWith('.config.json.lock') &&
        (error as NodeJS.ErrnoException).code === 'EEXIST'
      ) {
        gate.onContended?.();
      }
      throw error;
    }
  }) as typeof actual.open;
  const readFile = (async (...args: Parameters<typeof actual.readFile>) => {
    const content = await actual.readFile(...args);
    if (gate.path !== undefined && String(args[0]) === gate.path && gate.competitor) {
      const competitor = gate.competitor;
      gate.path = undefined;
      gate.run = competitor();
      await Promise.race([
        gate.run.then(
          () => undefined,
          () => undefined,
        ),
        new Promise<void>((resolve) => {
          gate.onContended = resolve;
        }),
      ]);
      gate.onContended = undefined;
    }
    return content;
  }) as typeof actual.readFile;
  return { ...actual, open, readFile, default: { ...actual, open, readFile } };
});

import * as fs from 'node:fs/promises';
import { updateJsonObjectFile } from '@wrongstack/core/utils';
// Source import: `@wrongstack/core/agent` resolves to core's built dist in vitest.
import { persistSystemPromptVariant } from '../../core/src/core/system-prompt-variants.js';
import {
  DefaultSecretVault,
  migratePlaintextSecrets,
} from '../../core/src/security/secret-vault.js';
import { persistMenuChoice } from '../src/boot/launch-menu.js';
import { persistLaunchChoices } from '../src/pre-launch/launch-prompts.js';
import { buildDoctorCommand } from '../src/slash-commands/doctor.js';

let dir: string;
let configPath: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-launch-config-lock-'));
  configPath = path.join(dir, 'config.json');
  await fs.writeFile(
    configPath,
    JSON.stringify({ providers: { anthropic: { type: 'anthropic' } } }),
  );
});

afterEach(async () => {
  gate.path = undefined;
  gate.competitor = undefined;
  gate.run = undefined;
  await fs.rm(dir, { recursive: true, force: true });
});

const addProvider = () =>
  updateJsonObjectFile(configPath, (config) => {
    (config.providers as Record<string, unknown>).openai = { type: 'openai' };
  });

describe.each([
  [
    'persistLaunchChoices',
    'launch',
    () => persistLaunchChoices(configPath, { mode: 'tui', yolo: true, autonomy: 'auto' }),
  ],
  ['persistMenuChoice', 'launch', () => persistMenuChoice(configPath, 'webui' as never)],
  [
    'persistSystemPromptVariant',
    'systemPrompt',
    () => persistSystemPromptVariant(configPath, 'scout' as never),
  ],
  [
    'migratePlaintextSecrets',
    'providers',
    async () => {
      // Boot migration only writes when a plaintext secret is present.
      await fs.writeFile(
        configPath,
        JSON.stringify({ providers: { anthropic: { type: 'anthropic', apiKey: 'sk-plain' } } }),
      );
      const vault = new DefaultSecretVault({ keyFile: path.join(dir, '.key') });
      gate.path = configPath;
      expect((await migratePlaintextSecrets(configPath, vault)).migrated).toBe(1);
    },
  ],
  [
    '/doctor fix',
    'hints',
    async () => {
      await fs.writeFile(
        configPath,
        JSON.stringify({ hints: 'true', providers: { anthropic: { type: 'anthropic' } } }),
      );
      const ctx = {
        configStore: { get: () => ({}), update: () => undefined },
        paths: {
          globalConfig: configPath,
          profileConfig: () => configPath,
          inProjectConfig: path.join(dir, 'project', 'config.json'),
        },
      } as never;
      await buildDoctorCommand(ctx).run?.('fix');
    },
  ],
] as const)('%s config lock', (_name, writtenKey, write) => {
  it('keeps a locked provider update that lands inside its read-modify-write', async () => {
    gate.path = configPath;
    gate.competitor = addProvider;
    await write();
    await gate.run;

    const config = JSON.parse(await fs.readFile(configPath, 'utf8')) as Record<string, unknown> & {
      providers: Record<string, unknown>;
    };
    expect(Object.keys(config.providers).sort()).toEqual(['anthropic', 'openai']);
    expect(config[writtenKey]).toBeDefined();
  });
});
