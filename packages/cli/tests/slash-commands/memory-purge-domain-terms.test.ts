/**
 * Regression: `/memory purge-domain-terms --force` must target only memories
 * carrying the canonical `domain-term` tag.
 *
 * The targeting predicate used to select ANY memory tagged `glossary` or
 * `project-jargon` — it could not distinguish the historical extractor trio
 * ['domain-term','glossary','project-jargon'] from modern topical use of the
 * companion words. Observed live on 2026-09-20: six modern memories
 * (a bug-hunt record and four system-prompt-glossary notes) were soft-deleted
 * as collateral and had to be recovered. Every extractor-written entry
 * carried the canonical tag, so requiring it loses no legitimate target.
 *
 * Runs the REAL command against a REAL store (no getSageSurface mock) so the
 * enumeration and deletion semantics exercised here are the production ones.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { SqliteMemoryPort } from '../../../sage/src/memory-port.js';
import { buildMemoryCommand } from '../../src/slash-commands/memory.js';

let port: SqliteMemoryPort | undefined;
let dir: string | undefined;

afterAll(async () => {
  try {
    await port?.dispose?.();
  } catch {
    /* disposal failures must not mask test results */
  }
  if (dir) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      /* locked temp dirs are OS-cleaned */
    }
  }
});

async function statusById(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const status of ['active', 'stale', 'deleted'] as const) {
    let cursor: string | undefined;
    for (;;) {
      const page = await port!.listSagePage({
        statuses: [status],
        limit: 200,
        ...(cursor !== undefined ? { cursor } : {}),
      });
      for (const mem of page.memories ?? []) map.set(mem.id, mem.status);
      if (!page.nextCursor || (page.memories ?? []).length === 0) break;
      cursor = page.nextCursor;
    }
  }
  return map;
}

describe('memory purge-domain-terms — canonical-tag targeting', () => {
  it('deletes the trio-tagged legacy entry and spares companion-only and untagged memories', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-purge-targeting-'));
    port = new SqliteMemoryPort({ projectRoot: dir });

    const trio = await port.rememberSage({
      text: 'Legacy extracted glossary term minted by the old extractor.',
      tags: ['domain-term', 'glossary', 'project-jargon'],
      kind: 'fact',
      importance: 0.7,
      confidence: 0.7,
      anchors: [{ type: 'file', path: 'src/legacy-trio.ts' }],
    });
    const glossaryOnly = await port.rememberSage({
      text: 'Modern renderer observation about the prompt jargon block wiring.',
      tags: ['sage', 'glossary', 'api-surface'],
      kind: 'fact',
      importance: 0.8,
      confidence: 0.9,
      anchors: [{ type: 'file', path: 'src/modern-glossary.ts' }],
    });
    const projectJargonOnly = await port.rememberSage({
      text: 'Modern topical note carrying only the companion tag.',
      tags: ['project-jargon'],
      kind: 'fact',
      importance: 0.8,
      confidence: 0.9,
      anchors: [{ type: 'file', path: 'src/modern-jargon.ts' }],
    });
    const untagged = await port.rememberSage({
      text: 'Plain project fact with no glossary tags at all.',
      kind: 'fact',
      importance: 0.8,
      confidence: 0.9,
      anchors: [{ type: 'file', path: 'src/plain-fact.ts' }],
    });

    const logger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      child(this: unknown) {
        return this;
      },
    };
    const cmd = buildMemoryCommand({
      memoryStore: port,
      logger,
      broadcast: () => {},
      send: () => {},
    } as never);

    const result = (await cmd.run('purge-domain-terms --force')) as
      | { message?: string }
      | undefined;
    expect(result?.message).toContain('Purged 1 of 1');

    const statuses = await statusById();
    expect(statuses.get(trio.id)).toBe('deleted');
    expect(statuses.get(glossaryOnly.id)).toBe('active');
    expect(statuses.get(projectJargonOnly.id)).toBe('active');
    expect(statuses.get(untagged.id)).toBe('active');

    // Idempotent: a second run finds nothing and deletes nothing.
    const again = (await cmd.run('purge-domain-terms --force')) as { message?: string } | undefined;
    expect(again?.message).toContain('Nothing to purge');
  }, 60_000);
});
