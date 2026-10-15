import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ToolRegistry } from '@wrongstack/core/registry';
import { builtinToolsPack } from '@wrongstack/tools';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createToolGateway, readsCodebaseIndex } from '../src/tool-gateway.js';

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.registerAllOrThrow([...(builtinToolsPack.tools ?? [])], builtinToolsPack.name);
  return r;
}

let root: string;

beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tools-fresh-')));
  await fs.writeFile(path.join(root, 'a.txt'), 'a\n');
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function gateway(oneShot: boolean, catchUpIndex: () => Promise<void>) {
  return createToolGateway({
    registry: registry(),
    config: { tools: {} },
    cwd: root,
    projectRoot: root,
    yolo: false,
    allow: ['fs.write'],
    whitelist: null,
    oneShot,
    catchUpIndex,
    onWarning: () => {},
  });
}

describe('one-shot index freshness', () => {
  it('names only real, index-backed tools (a rename must fail here, not skip the refresh)', () => {
    const indexReaders = registry()
      .list()
      .map((t) => t.name)
      .filter(readsCodebaseIndex)
      .sort();
    expect(indexReaders).toEqual(
      [
        'codebase-context',
        'codebase-impact-analysis',
        'codebase-incoming-calls',
        'codebase-outgoing-calls',
        'codebase-repo-map',
        'codebase-search',
        'codebase-stats',
      ].sort(),
    );
    // These parse the file itself, so they are current without a catch-up.
    expect(readsCodebaseIndex('codebase-read-symbol')).toBe(false);
    expect(readsCodebaseIndex('codebase-skeleton')).toBe(false);
  });

  it('catches up once before the first index query, and again only after a mutating call', async () => {
    const catchUp = vi.fn(async () => {});
    const gw = await gateway(true, catchUp);
    await gw.call('read', { path: 'a.txt' });
    expect(catchUp).not.toHaveBeenCalled();
    await gw.call('codebase-stats', {});
    await gw.call('codebase-repo-map', {});
    expect(catchUp).toHaveBeenCalledTimes(1);
    await gw.call('write', { path: 'b.txt', content: 'b' });
    await gw.call('codebase-stats', {});
    expect(catchUp).toHaveBeenCalledTimes(2);
    await gw.close();
  });

  it('a failed catch-up warns and still answers from the index as it is', async () => {
    const warnings: string[] = [];
    const gw = await createToolGateway({
      registry: registry(),
      config: { tools: {} },
      cwd: root,
      projectRoot: root,
      yolo: false,
      whitelist: null,
      oneShot: true,
      catchUpIndex: async () => {
        throw new Error('daemon away');
      },
      onWarning: (m) => warnings.push(m),
    });
    const outcome = await gw.call('codebase-stats', {});
    expect(outcome.kind).toBe('result');
    expect(warnings).toEqual(['codebase index catch-up failed: daemon away']);
    await gw.close();
  });

  it('a long-lived (mcp serve) gateway does not run the one-shot catch-up', async () => {
    const catchUp = vi.fn(async () => {});
    const gw = await gateway(false, catchUp);
    await gw.call('codebase-stats', {});
    expect(catchUp).not.toHaveBeenCalled();
    await gw.close();
  });
});
