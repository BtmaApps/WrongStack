import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import featureFlagLifecycle from '../src/feature-flag-lifecycle/index.js';

type Tool = { execute(input: unknown, context: unknown): Promise<unknown> };

describe('feature_flag_inventory expiry boundary', () => {
  const now = Date.parse('2026-09-24T12:00:00.000Z');
  let root: string;
  let registered: Map<string, Tool>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    root = await mkdtemp(join(tmpdir(), 'feature-flag-lifecycle-'));
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src', 'flag.ts'), 'export const NEW_FLAG = true;\n');
    registered = new Map();
    featureFlagLifecycle.setup({
      config: { extensions: {} },
      tools: {
        register: (tool: { name: string; execute: Tool['execute'] }) => {
          registered.set(tool.name, tool);
        },
      },
    } as never);
  });

  afterEach(async () => {
    featureFlagLifecycle.teardown?.({
      config: { extensions: {} },
      tools: { register: () => undefined },
    } as never);
    vi.useRealTimers();
    await rm(root, { recursive: true, force: true });
  });

  async function inventory(expiresAt: string) {
    const tool = registered.get('feature_flag_inventory');
    if (!tool) throw new Error('feature_flag_inventory was not registered');
    return (await tool.execute(
      { flags: [{ name: 'NEW_FLAG', expiresAt }], files: ['src/flag.ts'] },
      { projectRoot: root, cwd: root },
    )) as { flags: Array<{ expired: boolean }> };
  }

  it('keeps a flag active until its expiry timestamp', async () => {
    vi.setSystemTime(now - 1);
    const result = await inventory(new Date(now).toISOString());
    expect(result.flags[0]?.expired).toBe(false);
  });

  it('reports a flag expired at its exact expiry timestamp', async () => {
    const result = await inventory(new Date(now).toISOString());
    expect(result.flags[0]?.expired).toBe(true);
  });
});
