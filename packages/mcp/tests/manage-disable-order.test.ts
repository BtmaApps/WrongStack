import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disableMcp, type McpManageDeps } from '../src/manage.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

let dir: string | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  if (dir) await fs.rm(dir, { recursive: true, force: true });
  dir = undefined;
});

function makeRegistry() {
  const state = { stopped: false, markedDisabled: false };
  const registry = {
    list: () => [],
    stop: vi.fn(async () => {
      state.stopped = true;
    }),
    markDisabled: vi.fn(() => {
      state.markedDisabled = true;
    }),
    start: vi.fn(async () => undefined),
    restart: vi.fn(async () => undefined),
  } as never;
  return { registry, state };
}

async function seed(configPath: string, name: string, enabled: boolean): Promise<void> {
  const config = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
    mcpServers?: Record<string, { enabled: boolean }>;
  };
  config.mcpServers ??= {};
  config.mcpServers[name] = { enabled };
  await fs.writeFile(configPath, JSON.stringify(config), 'utf8');
}

async function enabledOnDisk(configPath: string, name: string): Promise<boolean> {
  const config = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
    mcpServers: Record<string, { enabled: boolean }>;
  };
  return config.mcpServers[name]?.enabled === true;
}

describe('MCP disable persistence ordering', () => {
  it('does not mutate the live registry when the config rename fails', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-disable-order-'));
    const configPath = path.join(dir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify({ version: 1 }), 'utf8');

    const control = makeRegistry();
    await seed(configPath, 'control', true);
    const controlDeps: McpManageDeps = { configPath, registry: control.registry };
    await expect(disableMcp('control', controlDeps)).resolves.toEqual(
      expect.objectContaining({ ok: true }),
    );
    expect(control.state.stopped).toBe(true);
    expect(control.state.markedDisabled).toBe(true);
    expect(await enabledOnDisk(configPath, 'control')).toBe(false);

    const victim = makeRegistry();
    await seed(configPath, 'victim', true);
    const victimDeps: McpManageDeps = { configPath, registry: victim.registry };
    vi.mocked(fs.rename).mockRejectedValueOnce(new Error('disk rename failed'));
    await expect(disableMcp('victim', victimDeps)).rejects.toThrow('disk rename failed');

    // Disk is authoritative; failed persistence must not stop or disable the live server.
    expect(victim.state.stopped).toBe(false);
    expect(victim.state.markedDisabled).toBe(false);
    expect(await enabledOnDisk(configPath, 'victim')).toBe(true);
  });
});
