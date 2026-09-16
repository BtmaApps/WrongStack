import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { designTool } from '../src/design.js';

let root: string;
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-design-tool-'));
});
afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const makeCtx = () => ({ cwd: root, tools: [], projectRoot: root, meta: {} }) as any;
const opts = { signal: new AbortController().signal };

describe('designTool', () => {
  it('is confirmation-gated because some actions persist project design state', () => {
    expect(designTool.permission).toBe('confirm');
    expect(designTool.mutating).toBe(true);
    expect(designTool.capabilities).toEqual(['fs.write']);
  });

  it('lists the bundled kit menu by default', async () => {
    const ctx = makeCtx();
    const res = await designTool.execute({}, ctx, opts);
    expect(res.action).toBe('list');
    expect(res.output).toContain('minimal-clarity');
    expect(res.output).not.toContain('_foundations');
  });

  it('loads a kit body for a stack and pins it active on ctx.meta', async () => {
    const ctx = makeCtx();
    const res = await designTool.execute(
      { action: 'use', kit: 'neo-brutalist', stack: 'web' },
      ctx,
      opts,
    );
    expect(res.action).toBe('use');
    expect(res.kit).toBe('neo-brutalist');
    expect(res.stack).toBe('web');
    expect(res.output).toMatch(/Active design kit/i);
    expect(res.output).toContain('## Stack: web');
    expect(res.output).not.toContain('## Stack: flutter');
    // tokens snapshot included
    expect(res.output).toMatch(/oklch/);
    // active kit recorded for the request middleware / UI pickers
    expect((ctx.meta.designStudio as any)?.activeKit).toBe('neo-brutalist');
  });

  it('throws (with the menu in the message) when an unknown kit is requested', async () => {
    const ctx = makeCtx();
    await expect(designTool.execute({ action: 'use', kit: 'nope' }, ctx, opts)).rejects.toThrow(
      /not found[\s\S]*minimal-clarity/i,
    );
  });

  it('throws when "set" is called without overrides', async () => {
    await expect(designTool.execute({ action: 'set' }, makeCtx(), opts)).rejects.toThrow(
      /no overrides given/i,
    );
  });

  it('throws when verify/materialize have no active kit to work from', async () => {
    const bare = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-design-bare-'));
    try {
      const ctx = { cwd: bare, tools: [], projectRoot: bare, meta: {} } as any;
      await expect(designTool.execute({ action: 'verify' }, ctx, opts)).rejects.toThrow(
        /no active kit/i,
      );
      await expect(designTool.execute({ action: 'materialize' }, ctx, opts)).rejects.toThrow(
        /no active kit/i,
      );
    } finally {
      await fs.rm(bare, { recursive: true, force: true });
    }
  });

  it('returns the mandatory foundations baseline', async () => {
    const ctx = makeCtx();
    const res = await designTool.execute({ action: 'foundations', stack: 'web' }, ctx, opts);
    expect(res.action).toBe('foundations');
    expect(res.output).toMatch(/WCAG/);
  });

  it('blocks a ../ traversal escape in materialize out path (CWE-22)', async () => {
    const ctx = makeCtx();
    // Pin an active kit so materialize has tokens to write.
    await designTool.execute({ action: 'use', kit: 'minimal-clarity', stack: 'web' }, ctx, opts);

    // A caller-supplied out path that climbs out of the project root must be
    // refused before any file is written.
    const escapePath = path.join('..', '..', '..', '..', 'ws-design-escape.css');
    await expect(
      designTool.execute({ action: 'materialize', out: escapePath }, ctx, opts),
    ).rejects.toThrow(/escape the project root/i);

    // And nothing was written outside the root.
    const outside = path.resolve(root, escapePath);
    let wrote = true;
    try {
      await fs.access(outside);
    } catch {
      wrote = false;
    }
    expect(wrote).toBe(false);
  });

  // #249: dest and projectRoot are siblings under os.tmpdir() — the case
  // that used to pass through when realpath of the dest parent collapsed
  // onto a shared tmp mount. The containment check now realpaths both
  // sides and rejects any relative that starts with '..' or is absolute.
  it('blocks an absolute out path outside the project root', async () => {
    const ctx = makeCtx();
    await designTool.execute({ action: 'use', kit: 'minimal-clarity', stack: 'web' }, ctx, opts);

    const abs = path.join(os.tmpdir(), `ws-design-abs-${Date.now()}.css`);
    await expect(
      designTool.execute({ action: 'materialize', out: abs }, ctx, opts),
    ).rejects.toThrow(/escape the project root/i);
    let wrote = true;
    try {
      await fs.access(abs);
    } catch {
      wrote = false;
    }
    expect(wrote).toBe(false);
  });

  it('tune resolves high-level knobs and flows into materialize', async () => {
    const ctx = makeCtx();
    await designTool.execute({ action: 'use', kit: 'linear-dark', stack: 'web' }, ctx, opts);
    const tuned = await designTool.execute(
      { action: 'tune', tune: { radius: 'lg', density: 'compact' } },
      ctx,
      opts,
    );
    expect(tuned.output).toMatch(/Tuned/);
    expect(tuned.output).toContain('radius-md=0.75rem');
    // Materialize picks up the tuned overrides in the generated CSS.
    const mat = await designTool.execute(
      { action: 'materialize', out: 'tuned.css', force: true },
      ctx,
      opts,
    );
    const css = await fs.readFile(path.join(root, 'tuned.css'), 'utf8');
    expect(css).toContain('--radius-md: 0.75rem;');
    expect(css).toContain('--spacing-4: 0.8rem;'); // compact density
    expect(mat.output).toMatch(/Wrote/);

    // Refusing to clobber without force is a failed call, not an ok result.
    await expect(
      designTool.execute({ action: 'materialize', out: 'tuned.css' }, ctx, opts),
    ).rejects.toThrow(/already exists/);
  });

  // ── The verify summary must be axis-aware: the remediation footer and the
  // unchecked caveat describe the PALETTE axis, and must not make claims the
  // radius/spacing/type axes refute. ──

  it('does not claim a file went unchecked when its radius/type axes flagged it', async () => {
    const ctx = makeCtx();
    await designTool.execute({ action: 'use', kit: 'minimal-clarity', stack: 'web' }, ctx, opts);
    // No className, no color literal, no color function: the palette axis has
    // nothing here — but the radius and type axes still scan the file.
    await fs.writeFile(
      path.join(root, 'styles.css'),
      '.card {\n  border-radius: 8px;\n  font-family: Arial, sans-serif;\n}\n',
    );

    const res = await designTool.execute({ action: 'verify', files: ['styles.css'] }, ctx, opts);

    // Sanity: the file WAS checked and flagged by the non-color axes…
    expect(res.output).toContain('hardcoded radius');
    expect(res.output).toMatch(/hardcoded font family/);
    // …so the summary must not claim it went unchecked.
    expect(res.output).not.toMatch(/were NOT checked/);
  });

  it('does not tell a 100%-on-palette report to replace off-palette colors', async () => {
    const ctx = makeCtx();
    await designTool.execute({ action: 'use', kit: 'minimal-clarity', stack: 'web' }, ctx, opts);
    // Token-clean slop: 100% on-palette, composition-axis hit only.
    await fs.writeFile(
      path.join(root, 'hero.tsx'),
      '<h1 className="bg-clip-text text-transparent">Hi</h1>\n',
    );

    const res = await designTool.execute({ action: 'verify', files: ['hero.tsx'] }, ctx, opts);

    expect(res.output).toMatch(/composition finding/);
    // The color remediation contradicts the composition advice on a report
    // with zero color violations.
    expect(res.output).not.toContain('Replace off-palette colors');
  });
});
