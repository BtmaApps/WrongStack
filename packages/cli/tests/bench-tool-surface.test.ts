import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { computeToolManifestHash, runBenchmark, runWstack } from '@wrongstack/bench';
import { ToolRegistry } from '@wrongstack/core/registry';
import { registerBuiltinToolTier } from '@wrongstack/tools/tool-tier';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../src/arg-parser.js';
import { resolveToolRestriction } from '../src/boot/tool-restriction-flags.js';
import type { SubcommandDeps } from '../src/subcommands/contracts.js';
import { benchCmd } from '../src/subcommands/handlers/bench.js';

// Stop at the model-execution boundary; keep manifest selection and hashing real.
vi.mock('@wrongstack/bench', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wrongstack/bench')>()),
  runBenchmark: vi.fn(async () => {
    throw new Error('benchmark subprocess boundary');
  }),
}));

const dirs: string[] = [];
const names = ['bash', 'edit', 'glob', 'grep', 'read', 'write'];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bench-tool-surface-'));
  dirs.push(dir);
  const registry = new ToolRegistry();
  registerBuiltinToolTier({ registry, tier: 'off' });
  return { dir, registry };
}

describe('benchmark schema budget', () => {
  it.each(['lean', 'host'] as const)(
    'bounds real provider schemas for %s runs',
    async (profile) => {
      const { dir, registry } = await fixture();
      const baseline = JSON.stringify(registry.listForProvider()).length;
      const entry = path.join(dir, 'echo-args.cjs');
      await fs.writeFile(
        entry,
        'console.log(JSON.stringify({status:"completed",finalText:JSON.stringify(process.argv.slice(2))}));',
      );
      const result = await runWstack({
        nodeBin: process.execPath,
        wstackEntry: entry,
        workdir: dir,
        homeDir: dir,
        cell: { label: 'fixture', provider: 'fixture', model: 'fixture' },
        prompt: 'edit the file',
        timeoutMs: 10_000,
        profile,
      });
      expect(result.status).toBe('completed');
      const args: string[] = JSON.parse(result.finalText!);
      const { flags } = parseArgs(args);
      const restriction = resolveToolRestriction(flags);
      if (restriction) registry.setSessionRestriction(restriction);
      if (profile === 'host') {
        expect(registry.listForProvider().length).toBeGreaterThan(6);
        expect(registry.get('tool_use')).toBeDefined();
      } else {
        expect(
          registry
            .listForProvider()
            .map((tool) => tool.name)
            .sort(),
        ).toEqual(names);
        expect(JSON.stringify(registry.listForProvider()).length).toBeLessThan(baseline);
        expect(registry.get('tool_search')).toBeUndefined();
        expect(registry.get('tool_use')).toBeUndefined();
        // Wiring that exposes a tool after the initial tier cannot grow the surface.
        registry.exposeToProvider('project_kit');
        expect(
          registry
            .listForProvider()
            .map((tool) => tool.name)
            .sort(),
        ).toEqual(names);
      }
    },
  );

  it.each([false, true])(
    'fingerprints the selected manifest with host-profile=%s',
    async (host) => {
      const { dir, registry } = await fixture();
      const renderer = { write: vi.fn(), writeInfo: vi.fn(), writeError: vi.fn() };
      const deps = {
        cwd: dir,
        toolRegistry: registry,
        flags: { suite: 'smoke', cell: 'fixture/fixture', 'host-profile': host },
        renderer,
      } as unknown as SubcommandDeps;
      expect(await benchCmd(['run'], deps)).toBe(1);
      expect(renderer.writeError).toHaveBeenCalledWith('benchmark subprocess boundary');
      const opts = vi.mocked(runBenchmark).mock.lastCall![0];
      const selected = registry.list().filter((tool) => host || names.includes(tool.name));
      expect(opts.toolNames.sort()).toEqual(selected.map((tool) => tool.name).sort());
      expect(opts.toolManifestHash).toBe(computeToolManifestHash(selected));
      if (!host) expect(opts.toolNames).toEqual(names);
    },
  );
});
