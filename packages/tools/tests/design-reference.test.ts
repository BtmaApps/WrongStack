import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { type DesignDnaRaw, summarizeDesignDna } from '@wrongstack/core/design';
import { lockNetworkOff } from '@wrongstack/core/security';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { designTool } from '../src/design.js';

// Browser-free contract tests. The measuring path itself (a real Chromium
// against a local page) is proven outside the unit suite; here extract and
// compare must validate input before any browser work and compare saved
// references without one. This file locks the network last — the lock is
// one-way and process-wide, and vitest isolates it to this file.

let root: string;
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-design-ref-'));
});
afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const makeCtx = () => ({ cwd: root, tools: [], projectRoot: root, meta: {} }) as any;
const opts = { signal: new AbortController().signal };

function raw(primary: string, radius: string): DesignDnaRaw {
  return {
    v: 1,
    url: 'https://example.com/',
    title: 'Example',
    vw: 1440,
    vh: 900,
    docH: 1800,
    screens: 2,
    rootBg: '#ffffff',
    colorScheme: 'normal',
    themeColor: null,
    generator: null,
    samples: { points: 100, media: 0, gradient: 0, area: [['#ffffff', 95]] },
    text: [['16|400|24|0|Inter||p', 500]],
    textColor: [['#111111', 500]],
    families: [['Inter', 500]],
    fontsLoaded: ['Inter'],
    padding: [['16', 10]],
    gap: [['8', 5]],
    vmargin: [],
    radius: [[radius, 5]],
    shadow: [],
    borderW: [],
    borderColor: [],
    duration: [['200', 3]],
    easing: [['ease', 3]],
    gradients: [],
    effects: {},
    grids: [],
    buttons: [
      {
        h: 40,
        w: 100,
        padX: 16,
        r: 6,
        bg: primary,
        fg: '#ffffff',
        border: null,
        fw: '500',
        fs: 14,
        tt: 'none',
        y: 100,
      },
    ],
    inputs: [],
    nav: null,
    sections: [],
    images: 0,
    imgRatios: [],
    icons: [],
    vars: {},
    elements: 10,
  };
}

async function saveReference(slug: string, dnaRaw: DesignDnaRaw): Promise<void> {
  const dir = path.join(root, '.design', 'references', slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'dna.json'), JSON.stringify(summarizeDesignDna([dnaRaw])));
}

describe('design extract / compare', () => {
  it('compares two saved references without a browser and writes the fidelity record', async () => {
    await saveReference('ref-a', raw('#e11d48', '12'));
    await saveReference('ref-b', raw('#2563eb', '4'));
    const ctx = makeCtx();
    const same = await designTool.execute(
      { action: 'compare', reference: 'ref-a', against: 'ref-a' },
      ctx,
      opts,
    );
    expect(same.score).toBe(1);
    const res = await designTool.execute(
      { action: 'compare', reference: 'ref-a', against: 'ref-b' },
      ctx,
      opts,
    );
    expect(res.action).toBe('compare');
    expect(res.score).toBeLessThan(1);
    expect(res.output).toMatch(/\| color \| off \| role primary/);
    expect(res.output).toMatch(/\| shape \| off \| dominant radius \| 12 \| 4 \|/);
    expect(res.path).toBe('.design/references/ref-a/fidelity.md');
    expect(await fs.readFile(path.join(root, res.path as string), 'utf8')).toContain('# Fidelity');
  });

  it('rejects a reference name that could leave .design/references', async () => {
    await expect(
      designTool.execute(
        { action: 'compare', reference: '../../etc', against: 'ref-a' },
        makeCtx(),
        opts,
      ),
    ).rejects.toThrow(/not a reference name/);
  });

  it('names the missing reference and how to create it', async () => {
    await expect(
      designTool.execute(
        { action: 'compare', reference: 'nope', against: 'ref-a' },
        makeCtx(),
        opts,
      ),
    ).rejects.toThrow(/no extracted reference "nope".*action:"extract"/s);
  });

  it('requires a reference for compare', async () => {
    await expect(designTool.execute({ action: 'compare' }, makeCtx(), opts)).rejects.toThrow(
      /needs reference/,
    );
  });

  it('validates the URL and viewports before opening a browser', async () => {
    const ctx = makeCtx();
    await expect(designTool.execute({ action: 'extract' }, ctx, opts)).rejects.toThrow(
      /http\(s\) URL/,
    );
    await expect(
      designTool.execute({ action: 'extract', url: 'file:///etc/passwd' }, ctx, opts),
    ).rejects.toThrow(/http\(s\) URL/);
    await expect(
      designTool.execute(
        { action: 'extract', url: 'https://example.com', viewports: [100] },
        ctx,
        opts,
      ),
    ).rejects.toThrow(/viewports/);
    await expect(
      designTool.execute(
        { action: 'extract', url: 'https://example.com', name: 'Bad Name' },
        ctx,
        opts,
      ),
    ).rejects.toThrow(/not a reference name/);
  });

  it('validates inspect input before opening a browser', async () => {
    const ctx = makeCtx();
    await expect(designTool.execute({ action: 'inspect' }, ctx, opts)).rejects.toThrow(
      /http\(s\) URL/,
    );
    await expect(
      designTool.execute(
        { action: 'inspect', url: 'https://example.com', surface: 'poster' as never },
        ctx,
        opts,
      ),
    ).rejects.toThrow(/"surface" is "page"/);
  });

  // Keep last: the lock cannot be undone in this process.
  it('refuses to measure while restricted mode has locked the network off', async () => {
    lockNetworkOff();
    await expect(
      designTool.execute({ action: 'extract', url: 'https://example.com' }, makeCtx(), opts),
    ).rejects.toThrow(/locked off in restricted mode/);
    await expect(
      designTool.execute({ action: 'inspect', url: 'https://example.com' }, makeCtx(), opts),
    ).rejects.toThrow(/locked off in restricted mode/);
    // Saved references still compare offline.
    const res = await designTool.execute(
      { action: 'compare', reference: 'ref-a', against: 'ref-b' },
      makeCtx(),
      opts,
    );
    expect(res.score).toBeLessThan(1);
  });
});
