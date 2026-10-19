import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DefaultPromptLoader, renderPrompt } from '../../src/execution/prompt-loader.js';
import { migratePromptEntry } from '../../src/storage/prompt-store.js';
import { resolveWstackPaths } from '../../src/utils/wstack-paths.js';

const bundledDir = fileURLToPath(new URL('../../data/prompts/', import.meta.url));

describe('FluidFlow prompt library', () => {
  it('ships every category, quick action, user template and runtime template', async () => {
    const loader = new DefaultPromptLoader({
      paths: {} as never,
      bundledDir,
    });
    const imported = (await loader.list()).filter((p) => p.tags.includes('fluidflow'));
    expect(imported).toHaveLength(615);
    expect(imported.filter((p) => p.category === 'design')).toHaveLength(137);
    expect(imported.filter((p) => p.category === 'quick-actions')).toHaveLength(12);
    expect(imported.filter((p) => p.variants)).toHaveLength(600);
    expect(new Set(imported.map((p) => p.slug)).size).toBe(615);
    expect(imported.every((p) => p.license === 'MIT' && p.author === 'Ersin KOÇ')).toBe(true);
  });

  it('selects original variants and preserves them when favorited and reloaded', async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fluidflow-prompts-'));
    try {
      const paths = resolveWstackPaths({
        projectRoot,
        globalRoot: path.join(projectRoot, 'profile'),
      });
      const loader = new DefaultPromptLoader({ paths, bundledDir });
      const entry = await loader.find('fluidflow-design-d2-glassmorphism-style');
      expect(entry).toBeDefined();
      expect(entry!.variants?.simple).toContain('glass');
      expect(renderPrompt(entry!).text).toBe(entry!.variants!.detailed);
      expect(renderPrompt(entry!, {}, 'simple').text).toBe(entry!.variants!.simple);
      expect(renderPrompt(entry!, {}, 'advanced').text).toBe(entry!.variants!.advanced);
      await loader.setFavorite(entry!.slug, true);
      const reloaded = await new DefaultPromptLoader({ paths, bundledDir }).find(entry!.slug);
      expect(reloaded?.favorite).toBe(true);
      expect(reloaded?.variants).toEqual(entry!.variants);
    } finally {
      await fs.rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('ignores malformed variants and leaves legacy prompt content usable', () => {
    const entry = migratePromptEntry({
      id: 'legacy',
      title: 'Legacy',
      content: 'Original {{target}}',
      variants: { simple: 42 },
    });
    expect(entry?.variants).toBeUndefined();
    expect(renderPrompt(entry!, { target: '$&' }, 'advanced')).toEqual({
      text: 'Original $&',
      missing: [],
      invalid: [],
    });
  });

  it('uses an edited favorite as the detailed default while preserving its other levels', () => {
    const entry = migratePromptEntry({
      id: 'edited',
      title: 'Edited style',
      content: 'My edited style',
      variants: {
        simple: 'Simple original',
        detailed: 'Detailed original',
        advanced: 'Advanced original',
      },
    });
    expect(entry?.variants).toEqual({
      simple: 'Simple original',
      detailed: 'My edited style',
      advanced: 'Advanced original',
    });
    expect(renderPrompt(entry!, {}, 'detailed').text).toBe('My edited style');
  });

  it('retains every upstream text byte for byte, including all 1,800 variants', async () => {
    const upstream = JSON.parse(
      await fs.readFile(path.join(bundledDir, 'fluidflow/upstream.json'), 'utf8'),
    );
    const loader = new DefaultPromptLoader({ paths: {} as never, bundledDir });
    const entries = new Map((await loader.list()).map((entry) => [entry.slug, entry]));
    const hash = (text: string) => createHash('sha256').update(text).digest('hex');
    let variants = 0;
    for (const ref of upstream.prompts) {
      const entry = entries.get(ref.slug)!;
      expect(hash(entry.content), ref.slug).toBe(ref.checksum);
      for (const [level, checksum] of Object.entries(ref.variants ?? {})) {
        expect(
          hash(entry.variants![level as 'simple' | 'detailed' | 'advanced']),
          `${ref.slug}:${level}`,
        ).toBe(checksum);
        variants++;
      }
    }
    expect(variants).toBe(1800);
  });
});
