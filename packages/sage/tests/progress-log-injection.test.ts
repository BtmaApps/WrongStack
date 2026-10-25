import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ToolCallPipelinePayload } from '@wrongstack/core/agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assessRememberQuality } from '../src/memory-input-validation.js';
import { createSageToolCallMiddleware } from '../src/middleware/tool-call-memory.js';
import { isIdleProgressLog, isProgressLogText } from '../src/shared/progress-log.js';
import { SqliteSageStore } from '../src/sqlite-store.js';

/**
 * Campaign progress logs ("Bug-hunt round r17-20261023 (17/25 session):
 * NO-PROVEN-BUG …", "… LANDED 2026-08-21 (suites 120/120) …") passed every
 * write gate and dominated injection: on the live store the six most-injected
 * active memories were LANDED logs with 8k–14k injections and zero uses. They
 * stay stored and searchable, but stop auto-injecting once idle for 30 days.
 */

const LOGS = [
  'Bug-hunt round r17-20261023 (17/25 session): NO-PROVEN-BUG, zero edits — simpleui sibling set COMPLETE.',
  'Datasync durability LANDED 2026-08-21 (writer+store suites 120/120 incl. two routing specs; core build clean).',
  'Bug-hunt round 4/25 (2026-10-23, HEAD 2d36e2d134, zero edits): outcome NO-PROVEN-BUG.',
  'Proof-driven round 31 (2026-10-13, no-proven-bug) @ d8d00a8e1: remaining surfaces for future rounds: acp, runtime.',
];

const DURABLE = [
  'The pre-commit hook treats every .ts file under packages/core/src as public API; run sync-core-public-api-snapshot after adding exports.',
  'The codex catalog fix landed in commit fff8907f5; the resolver now drops retired models before ranking.',
  'Vitest in this repo is v5.0.5; the root config aliases @wrongstack/sage to src.',
  'SAGE FTS search must use CROSS JOIN: bun:sqlite otherwise plans the bm25 join inside-out (4s vs 26ms).',
];

describe('progress-log detection', () => {
  it('recognizes the round/LANDED log shape', () => {
    for (const text of LOGS) expect(isProgressLogText(text), text).toBe(true);
  });

  it('leaves durable facts that merely mention a commit or version alone', () => {
    for (const text of DURABLE) expect(isProgressLogText(text), text).toBe(false);
  });

  it('caps the defaulted importance of a progress log at write time', () => {
    const quality = assessRememberQuality({
      text: LOGS[0]!,
      kind: 'task_outcome',
      anchors: [{ type: 'file', path: 'a.ts' }],
      tags: ['bug-hunt'],
    });
    expect(quality.reasons).toContain('progress_log');
    expect(quality.importanceCap).toBeLessThanOrEqual(0.55);
  });

  it('goes idle 30 days after the last write or use, never when permanent', () => {
    const day = 86_400_000;
    const now = Date.parse('2026-10-25T00:00:00Z');
    const base = { text: LOGS[1]!, createdAt: new Date(now - 40 * day).toISOString() };
    expect(isIdleProgressLog(base, now)).toBe(true);
    expect(
      isIdleProgressLog({ ...base, lastUsedAt: new Date(now - 3 * day).toISOString() }, now),
    ).toBe(false);
    expect(isIdleProgressLog({ ...base, persistence: 'permanent' }, now)).toBe(false);
    expect(
      isIdleProgressLog({ ...base, createdAt: new Date(now - 5 * day).toISOString() }, now),
    ).toBe(false);
    expect(isIdleProgressLog({ ...base, text: DURABLE[0]! }, now)).toBe(false);
  });
});

describe('tool-call injection of progress logs', () => {
  let tmpDir: string;
  let store: SqliteSageStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-progress-log-'));
    store = new SqliteSageStore({ projectRoot: tmpDir });
  });

  afterEach(async () => {
    vi.useRealTimers();
    store.close();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function injectedFor(file: string, session: string): Promise<string> {
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
      toolUse: { type: 'tool_use', id: `tu_${session}`, name: 'read', input: { path: file } },
      result: {
        type: 'tool_result',
        tool_use_id: `tu_${session}`,
        name: 'read',
        content: 'source',
      },
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

  it('injects a fresh progress log but not the same log once it is idle', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'));
    const file = 'packages/core/src/storage/session-write-buffer.ts';
    await store.rememberSage({
      text: `${LOGS[1]} SessionWriteBuffer in ${file} gains FlushBufferOptions.`,
      kind: 'decision',
      importance: 0.85,
      anchors: [{ type: 'file', path: file }],
    });

    expect(await injectedFor(file, 'fresh')).toContain('Datasync durability LANDED');

    vi.setSystemTime(new Date('2026-10-25T00:00:00Z'));
    expect(await injectedFor(file, 'idle')).toBe('');
  });

  it('keeps injecting an idle-aged durable memory on the same file', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'));
    const file = 'packages/core/src/storage/session-write-buffer.ts';
    await store.rememberSage({
      text: `SessionWriteBuffer in ${file} must fsync before rename; a crash otherwise loses the tail.`,
      kind: 'warning',
      importance: 0.85,
      anchors: [{ type: 'file', path: file }],
    });

    vi.setSystemTime(new Date('2026-10-25T00:00:00Z'));
    expect(await injectedFor(file, 'durable')).toContain('must fsync before rename');
  });
});
