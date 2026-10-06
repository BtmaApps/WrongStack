import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stripAnsi } from '@wrongstack/core/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SlashCommandContext } from '../src/slash-commands/index.js';
import {
  buildNextStepsModeCommand,
  NEXT_STEPS_LIMIT_PRESETS,
  parseNextStepsLimit,
} from '../src/slash-commands/nextsteps-mode.js';

let dir: string;
let globalConfig: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'wstack-nextsteps-mode-'));
  globalConfig = path.join(dir, 'global', 'config.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
});

function makeCommand(config: Record<string, unknown> = {}) {
  const store = { get: vi.fn(() => config), update: vi.fn() };
  const ctx = {
    configStore: store,
    paths: {
      globalConfig,
      profileConfig: () => globalConfig,
      inProjectConfig: path.join(dir, 'project', 'config.json'),
    },
    vault: {
      encrypt: (value: string) => value,
      decrypt: (value: string) => value,
      isEncrypted: () => false,
      keyVersion: 1,
    },
  } as never as SlashCommandContext;
  return { command: buildNextStepsModeCommand(ctx), store };
}

const run = async (command: ReturnType<typeof makeCommand>['command'], args: string) =>
  stripAnsi(((await command.run(args)) as { message: string }).message);

const persistedAutonomy = () =>
  (JSON.parse(readFileSync(globalConfig, 'utf8')) as { autonomy?: Record<string, unknown> })
    .autonomy;

describe('parseNextStepsLimit', () => {
  it('accepts the presets, any whole number, and the unlimited spellings', () => {
    expect(NEXT_STEPS_LIMIT_PRESETS).toEqual([5, 10, 20, 50, 100, 0]);
    for (const n of [5, 10, 20, 50, 100, 7]) expect(parseNextStepsLimit(String(n))).toBe(n);
    for (const word of ['unlimited', 'sonsuz', '∞', '0']) expect(parseNextStepsLimit(word)).toBe(0);
    expect(parseNextStepsLimit('-3')).toBeUndefined();
    expect(parseNextStepsLimit('many')).toBeUndefined();
  });
});

describe('/nextsteps', () => {
  it('reports the default mode and limit', async () => {
    const { command } = makeCommand();
    const out = await run(command, '');
    // Required and unlimited are the defaults: auto mode runs until the model says done.
    expect(out).toContain('REQUIRED');
    expect(out).toContain('unlimited');
  });

  it('persists required mode with a limit in one call', async () => {
    const { command, store } = makeCommand();
    const out = await run(command, 'required 20');
    expect(out).toContain('REQUIRED');
    expect(out).toContain('20 turns');
    expect(persistedAutonomy()).toMatchObject({
      nextSteps: 'required',
      autoProceedMaxIterations: 20,
    });
    expect(store.update).toHaveBeenCalled();
  });

  it('writes the profile even under project scope and merges the live autonomy', async () => {
    const { command, store } = makeCommand({
      configScope: 'project',
      autonomy: { autoProceedDelayMs: 1234 },
    });
    await run(command, 'required');
    // The in-project policy strips autonomy.nextSteps, so a project write would not survive.
    expect(persistedAutonomy()).toEqual({ nextSteps: 'required' });
    expect(existsSync(path.join(dir, 'project', 'config.json'))).toBe(false);
    expect(store.update).toHaveBeenCalledWith({
      autonomy: { autoProceedDelayMs: 1234, nextSteps: 'required' },
    });
  });

  it('sets only the limit, leaving the mode alone', async () => {
    const { command } = makeCommand();
    await run(command, 'limit unlimited');
    expect(persistedAutonomy()).toEqual({ autoProceedMaxIterations: 0 });
  });

  it('rejects unknown arguments and bad limits without writing', async () => {
    const { command, store } = makeCommand();
    expect(await run(command, 'always')).toContain('Unknown argument');
    expect(await run(command, 'required lots')).toContain('Invalid limit');
    expect(await run(command, 'limit')).toContain('Usage');
    expect(store.update).not.toHaveBeenCalled();
  });
});
