/**
 * `/prompts add` took the slug from the ASCII-only title slug, and the loader
 * lists one prompt per slug: two titles without Latin letters (both `prompt`)
 * left the second saved prompt invisible to /prompt and the WebUI picker.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DefaultPromptLoader } from '@wrongstack/core/execution';
import { DefaultPromptStore } from '@wrongstack/core/storage';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPromptsCommand } from '../src/prompts-command.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'prompts-slug-'));
  dirs.push(dir);
  const store = new DefaultPromptStore(dir);
  const loader = new DefaultPromptLoader({ paths: { globalPrompts: dir } as never });
  const cmd = buildPromptsCommand(
    () => store,
    () => loader,
    () => undefined,
  );
  const add = async (title: string, content: string) => {
    const out = await cmd.run(`add "${title}" "${content}"`, {} as never);
    loader.invalidateCache();
    return (out as { message: string }).message;
  };
  return { add, loader };
}

describe('/prompts add: unique slug within the layer', () => {
  it('colliding titles get -2, -3 … and every prompt is findable by its slug', async () => {
    const { add, loader } = setup();
    expect(await add('要約', 'S')).toContain('(prompt)');
    expect(await add('翻訳', 'T')).toContain('(prompt-2)');
    expect(await add('Übersicht', 'U')).toContain('(bersicht)');
    expect(await add('Prompt', 'P')).toContain('(prompt-3)');
    expect((await loader.find('prompt'))?.content).toBe('S');
    expect((await loader.find('prompt-2'))?.content).toBe('T');
    expect((await loader.find('prompt-3'))?.content).toBe('P');
    expect(await loader.list()).toHaveLength(4);
  });

  it('a free slug is unchanged, and a title whose slug already ends in -2 still gets a fresh one', async () => {
    const { add, loader } = setup();
    expect(await add('Review', 'a')).toContain('(review)');
    expect(await add('Review 2', 'b')).toContain('(review-2)');
    expect(await add('review', 'c')).toContain('(review-3)');
    expect((await loader.list()).map((e) => e.slug).sort()).toEqual([
      'review',
      'review-2',
      'review-3',
    ]);
  });
});
