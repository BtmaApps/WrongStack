import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fail the next read of a preset JSON file once, delegating everything else to
// the real fs so the production path (builder, bundle loader, presets) is real.
const failure = vi.hoisted(() => ({ armed: false, hits: 0 }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  const readFile = ((file: unknown, ...rest: unknown[]) => {
    if (failure.armed && /system-prompt-presets[\\/][0-9a-f-]{36}\.json$/.test(String(file))) {
      failure.armed = false;
      failure.hits++;
      return Promise.reject(
        Object.assign(new Error('EMFILE: too many open files'), { code: 'EMFILE' }),
      );
    }
    return (real.readFile as (...a: unknown[]) => unknown)(file, ...rest);
  }) as typeof real.readFile;
  return { ...real, readFile, default: { ...real, readFile } };
});

import { DefaultSystemPromptBuilder } from '../../src/core/system-prompt-builder.js';
import {
  activateSystemPromptPreset,
  createSystemPromptPreset,
  saveSystemPromptPreset,
} from '../../src/core/system-prompt-presets.js';

const dirs: string[] = [];
beforeEach(() => {
  failure.armed = false;
  failure.hits = 0;
});
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

const context = {
  cwd: '/repo',
  projectRoot: '/repo',
  tools: [],
  provider: 'mock',
  model: 'test',
};

async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-bundle-retry-'));
  dirs.push(root);
  const globalDir = path.join(root, 'profile', 'instructions');
  await fs.mkdir(globalDir, { recursive: true });
  const preset = await createSystemPromptPreset(globalDir, 'Active', 'default');
  const edited = await saveSystemPromptPreset(
    globalDir,
    preset.id,
    1,
    'Active',
    '# Retry identity',
  );
  await activateSystemPromptPreset(globalDir, 'default', edited.id);
  return { globalDir };
}

const render = async (builder: DefaultSystemPromptBuilder): Promise<string> =>
  (await builder.build(context)).map((block) => block.text).join('\n');

describe('system prompt builder instruction-bundle cache', () => {
  it('renders the active preset and reuses the loaded bundle', async () => {
    const { globalDir } = await setup();
    const builder = new DefaultSystemPromptBuilder({
      injectMemory: false,
      instructionPaths: { globalDir, systemVariant: 'default' },
    });
    expect(await render(builder)).toContain('Retry identity');
    expect(await render(builder)).toContain('Retry identity');
  });

  it('recovers on the next build after a transient bundle load failure', async () => {
    const { globalDir } = await setup();
    const builder = new DefaultSystemPromptBuilder({
      injectMemory: false,
      instructionPaths: { globalDir, systemVariant: 'default' },
    });
    failure.armed = true;
    await expect(builder.build(context)).rejects.toThrow(/EMFILE/);
    expect(failure.hits).toBe(1);
    expect(await render(builder)).toContain('Retry identity');
    // And the recovered bundle is cached again: no further read is attempted.
    expect(await render(builder)).toContain('Retry identity');
  });

  it('keeps failing while the fault persists, then recovers once it clears', async () => {
    const { globalDir } = await setup();
    const builder = new DefaultSystemPromptBuilder({
      injectMemory: false,
      instructionPaths: { globalDir, systemVariant: 'default' },
    });
    failure.armed = true;
    await expect(builder.build(context)).rejects.toThrow(/EMFILE/);
    failure.armed = true;
    await expect(builder.build(context)).rejects.toThrow(/EMFILE/);
    expect(failure.hits).toBe(2);
    expect(await render(builder)).toContain('Retry identity');
  });
});
