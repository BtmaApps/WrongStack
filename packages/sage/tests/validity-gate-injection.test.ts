import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ToolCallPipelinePayload } from '@wrongstack/core/agent';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSageToolCallMiddleware } from '../src/middleware/tool-call-memory.js';
import { SqliteSageStore } from '../src/sqlite-store.js';

/**
 * A memory can carry `validity.checks` (`source_contains`: this file still
 * contains this literal). Injection evaluated them but only rendered the
 * result as a `sourceChecks` note, so a memory whose claim the code no longer
 * supports still reached the model as guidance. It must not be injected.
 */

const FILE = 'packages/core/src/config.ts';

describe('tool-call injection honours validity checks', () => {
  let tmpDir: string;
  let store: SqliteSageStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-validity-gate-'));
    await fs.mkdir(path.join(tmpDir, path.dirname(FILE)), { recursive: true });
    store = new SqliteSageStore({ projectRoot: tmpDir });
  });

  afterEach(async () => {
    store.close();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function injectedFor(session: string): Promise<string> {
    const mw = createSageToolCallMiddleware({
      memory: {
        retrieveForPath: (opts) => store.retrieveForPath([opts.path], opts),
        searchSage: (query, opts) => store.searchSage(query, opts),
        findRelatedSage: (ids, opts) => store.findRelatedSage(ids, opts),
        recordInjection: (ids, trigger, sessionId) =>
          store.recordInjection(ids, trigger, sessionId),
        recordUse: (ids, source, sessionId) => store.recordUse(ids, source, sessionId),
      },
    });
    const payload = {
      toolUse: { type: 'tool_use', id: `tu_${session}`, name: 'read', input: { path: FILE } },
      result: { type: 'tool_result', tool_use_id: `tu_${session}`, name: 'read', content: 'x' },
      ctx: {
        projectRoot: tmpDir,
        cwd: tmpDir,
        session: { id: session },
        signal: new AbortController().signal,
      },
    } as unknown as ToolCallPipelinePayload;
    await mw.handler(payload, async (p) => p);
    const evidence = (payload.ctx as { memoryEvidence?: Array<{ text: string }> }).memoryEvidence;
    return evidence?.map((entry) => entry.text).join('\n') ?? '';
  }

  async function rememberRetryClaim() {
    await store.rememberSage({
      text: `Provider retries in ${FILE} default to 5 attempts (MAX_RETRIES).`,
      kind: 'fact',
      importance: 0.9,
      anchors: [{ type: 'file', path: FILE }],
      validity: {
        statement: 'While MAX_RETRIES is 5.',
        checks: [{ type: 'source_contains', path: FILE, text: 'MAX_RETRIES = 5' }],
      },
    });
  }

  it('injects the memory while its source check holds', async () => {
    await fs.writeFile(path.join(tmpDir, FILE), 'export const MAX_RETRIES = 5;\n');
    await rememberRetryClaim();
    expect(await injectedFor('holds')).toContain('default to 5 attempts');
  });

  it('does not inject the memory once the source no longer contains the cited text', async () => {
    await fs.writeFile(path.join(tmpDir, FILE), 'export const MAX_RETRIES = 5;\n');
    await rememberRetryClaim();
    await fs.writeFile(path.join(tmpDir, FILE), 'export const MAX_RETRIES = 3;\n');
    expect(await injectedFor('drifted')).not.toContain('default to 5 attempts');
  });
});
