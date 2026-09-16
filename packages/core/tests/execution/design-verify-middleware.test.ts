import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  makeDesignVerifyToolCallMiddleware,
  setActiveKit,
} from '../../src/execution/design-detect.js';

let root: string;
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-design-vmw-'));
});
afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function payloadFor(relPath: string, ctx: unknown) {
  return {
    toolUse: { type: 'tool_use', id: 't1', name: 'write', input: { path: relPath } },
    result: { type: 'tool_result', tool_use_id: 't1', content: 'wrote file', is_error: false },
    ctx,
  } as any;
}

describe('makeDesignVerifyToolCallMiddleware', () => {
  it('appends an off-palette warning after a frontend write when a kit is pinned', async () => {
    const mw = makeDesignVerifyToolCallMiddleware();
    const ctx = { projectRoot: root, meta: {} } as any;
    setActiveKit(ctx, 'minimal-clarity', 'web');
    await fs.writeFile(path.join(root, 'bad.css'), '.x { color: #123456; background: #abcdef; }');
    const out = await mw.handler(payloadFor('bad.css', ctx), async (p) => p);
    expect(out.result.content).toMatch(/Design Studio/);
    expect(out.result.content).toMatch(/off-palette/);
    expect(out.result.content).toContain('#123456');
  });

  it('says once that an unpinned frontend write went out unchecked', async () => {
    // This used to assert silence. Silence was wrong: with no kit pinned there
    // is no palette, so `verifyFiles` reports nothing — and "no findings" reads
    // exactly like "clean" to whoever is reading the tool result, while the
    // craft rules treat zero composition findings as the floor. Same reasoning
    // as `filesWithNoSignal` for native stacks: unchecked must not look clean.
    const mw = makeDesignVerifyToolCallMiddleware();
    const ctx = { projectRoot: root, meta: {} } as any; // no activeKit
    await fs.writeFile(path.join(root, 'bad2.css'), '.x { color: #123456; }');
    const out = await mw.handler(payloadFor('bad2.css', ctx), async (p) => p);
    expect(out.result.content).toMatch(/no kit is pinned/);
    expect(out.result.content).toMatch(/NOT being design-checked/);
  });

  it('gives the unpinned notice once per session, not on every write', async () => {
    // A warning repeated on every frontend write is a warning that gets tuned
    // out — and it would bury the real findings once a kit is pinned.
    const mw = makeDesignVerifyToolCallMiddleware();
    const ctx = { projectRoot: root, meta: {} } as any;
    await fs.writeFile(path.join(root, 'first.css'), '.x { color: #123456; }');
    await fs.writeFile(path.join(root, 'second.css'), '.y { color: #654321; }');
    const first = await mw.handler(payloadFor('first.css', ctx), async (p) => p);
    const second = await mw.handler(payloadFor('second.css', ctx), async (p) => p);
    expect(first.result.content).toMatch(/no kit is pinned/);
    expect(second.result.content).toBe('wrote file');
  });

  it('stays silent for a non-frontend file even with no kit pinned', async () => {
    // The unpinned notice is about UI going out unchecked, so it must not fire
    // for files the design engine would never have checked anyway.
    const mw = makeDesignVerifyToolCallMiddleware();
    const ctx = { projectRoot: root, meta: {} } as any;
    await fs.writeFile(path.join(root, 'server.md'), 'color: #123456');
    const out = await mw.handler(payloadFor('server.md', ctx), async (p) => p);
    expect(out.result.content).toBe('wrote file');
  });

  it('stays silent for a non-frontend file', async () => {
    const mw = makeDesignVerifyToolCallMiddleware();
    const ctx = { projectRoot: root, meta: {} } as any;
    setActiveKit(ctx, 'minimal-clarity', 'web');
    await fs.writeFile(path.join(root, 'notes.txt'), 'color: #123456');
    const out = await mw.handler(payloadFor('notes.txt', ctx), async (p) => p);
    expect(out.result.content).toBe('wrote file');
  });

  it('stays silent when the write errored', async () => {
    const mw = makeDesignVerifyToolCallMiddleware();
    const ctx = { projectRoot: root, meta: {} } as any;
    setActiveKit(ctx, 'minimal-clarity', 'web');
    const p = payloadFor('bad.css', ctx);
    p.result.is_error = true;
    const out = await mw.handler(p, async (x) => x);
    expect(out.result.content).toBe('wrote file');
  });
});
