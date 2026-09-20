/**
 * Regression: the glossary adapter must surface live `domain-term`-tagged
 * entries even when untagged memories text-match the 'domain-term' query.
 *
 * `searchSage('domain-term', …)` is an FTS keyword match over text+tags+audience
 * (NOT a tag filter), and its SQL LIMIT used to be clamped to 16 inside the
 * adapter BEFORE any tag filtering — so untagged memories whose text mentions
 * both query tokens occupied every cap slot and the renderer's downstream tag
 * filter then emptied the dictionary. Proven pre-fix: 30 untagged
 * "domain term" notes hid all 3 live glossary entries. The adapter now scans
 * up to the caller's bound (renderer asks for 200) and filters to tagged rows
 * itself, matching its documented contract.
 *
 * Runs against a real SqliteMemoryPort (real FTS index) so the ranking and
 * cap interplay exercised here are the production ones.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { renderDomainGlossary } from '../../../core/src/core/system-prompt-glossary.js';
import { SqliteMemoryPort } from '../../../sage/src/memory-port.js';
import { createDomainGlossaryAdapter } from '../../src/wiring/domain-glossary.js';

const LEGACY_TAGS = ['domain-term', 'glossary', 'project-jargon'];
const GLOSSARY_TERMS = ['MailboxBridge', 'SddBoardProjector', 'KanbanFence'];
const NOISE_WORDS = [
  'anchor',
  'bumblebee',
  'cobalt',
  'dynamo',
  'ember',
  'fjord',
  'glacier',
  'harbor',
  'indigo',
  'jasmine',
  'krypton',
  'lantern',
  'meadow',
  'nimbus',
  'obsidian',
  'pelican',
  'quartz',
  'raven',
  'saffron',
  'tundra',
  'umber',
  'violet',
  'walnut',
  'xenon',
  'yonder',
  'zephyr',
  'basalt',
  'cinder',
  'driftwood',
  'evergreen',
];

const openCorpora: Array<{ port: SqliteMemoryPort; dir: string }> = [];

async function seedCorpus(noiseCount: number): Promise<{ port: SqliteMemoryPort; dir: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-glossary-crowd-'));
  const port = new SqliteMemoryPort({ projectRoot: dir });
  await Promise.all(
    GLOSSARY_TERMS.map((term, i) =>
      port.rememberSage({
        text: term,
        tags: [...LEGACY_TAGS],
        importance: 0.7,
        confidence: 0.7,
        kind: 'fact',
        anchors: [{ type: 'file', path: `src/glossary-${i}.ts` }],
      }),
    ),
  );
  for (let i = 0; i < noiseCount; i++) {
    await port.rememberSage({
      text: `domain domain domain term term ${NOISE_WORDS[i]}`,
      importance: 0.9,
      kind: 'fact',
      anchors: [{ type: 'file', path: `src/noise-${i}.ts` }],
    });
  }
  openCorpora.push({ port, dir });
  return { port, dir };
}

afterAll(async () => {
  for (const { port, dir } of openCorpora) {
    try {
      await port.dispose?.();
    } catch {
      /* disposal failures must not mask test results */
    }
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      /* locked temp dirs are OS-cleaned */
    }
  }
});

describe('createDomainGlossaryAdapter — tag contract vs FTS keyword noise', () => {
  it('returns the tagged entries and the renderer renders them when no noise exists', async () => {
    const { port, dir } = await seedCorpus(0);
    const adapter = createDomainGlossaryAdapter(port as never);
    const entries = await adapter.list('project-memory', 200);
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => (e.tags as readonly string[]).includes('domain-term'))).toBe(true);
    const block = await renderDomainGlossary({ projectRoot: dir } as never, adapter as never);
    for (const term of GLOSSARY_TERMS) expect(block).toContain(`**${term}**`);
  });

  it('surfaces every tagged glossary entry even when untagged text matches crowd the query', async () => {
    const { port, dir } = await seedCorpus(30);
    const adapter = createDomainGlossaryAdapter(port as never);
    const entries = await adapter.list('project-memory', 200);
    const texts = entries.map((e) => e.text);
    const untagged = entries.filter(
      (e) => !(e.tags as readonly string[]).includes('domain-term'),
    ).length;
    expect(untagged, 'adapter must return only domain-term-tagged entries').toBe(0);
    expect(GLOSSARY_TERMS.filter((t) => !texts.includes(t))).toEqual([]);
    const block = await renderDomainGlossary({ projectRoot: dir } as never, adapter as never);
    for (const term of GLOSSARY_TERMS) expect(block).toContain(`**${term}**`);
  });
});
