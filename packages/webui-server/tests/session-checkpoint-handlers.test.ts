/**
 * Regression tests for the session checkpoint handlers.
 *
 * The journal revision is an optional staleness signal. It must never be the
 * reason a checkpoint list is blanked or a rewind is refused with a raw
 * filesystem error (ENOENT) instead of an actionable message.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fsState = vi.hoisted(() => ({ flip: false, jsonlReads: 0 }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: (async (file: unknown, ...rest: unknown[]) => {
      if (typeof file === 'string' && file.endsWith('.jsonl')) {
        fsState.jsonlReads += 1;
        if (fsState.flip) return fsState.jsonlReads === 1 ? 'first-revision' : 'second-revision';
      }
      return (actual.readFile as (...args: unknown[]) => Promise<unknown>)(file, ...rest);
    }) as unknown as typeof actual.readFile,
  };
});

const { createSessionCheckpointHandlers } = await import(
  '../src/server/session-checkpoint-handlers.js'
);

interface SentMessage {
  type: string;
  payload: Record<string, unknown>;
}

const SESSION_ID = 'sess_current';

let root: string;
let sessionsDir: string;

beforeEach(async () => {
  fsState.flip = false;
  fsState.jsonlReads = 0;
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-checkpoint-'));
  sessionsDir = path.join(root, 'sessions');
  await fs.mkdir(sessionsDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true }).catch(() => {});
});

async function writeJournal(): Promise<void> {
  const lines = [
    {
      type: 'checkpoint',
      promptIndex: 0,
      promptPreview: 'first prompt',
      ts: '2026-10-01T00:00:00.000Z',
    },
    { type: 'user_input', content: 'hello', ts: '2026-10-01T00:00:01.000Z' },
  ].map((event) => JSON.stringify(event));
  await fs.writeFile(
    path.join(sessionsDir, `${SESSION_ID}.jsonl`),
    `${lines.join('\n')}\n`,
    'utf8',
  );
}

function makeHarness() {
  const sent: SentMessage[] = [];
  const ws = { readyState: 1, send: () => undefined };
  const handlers = createSessionCheckpointHandlers({
    ctx: {
      getProjectRoot: () => root,
      isRunActive: () => false,
    },
    sendTo: (_ws: unknown, message: { type: string; payload: Record<string, unknown> }) => {
      sent.push(message);
    },
    broadcastToAll: () => undefined,
    result: (_ws: unknown, success: boolean, message: string) => {
      sent.push({ type: 'key.operation_result', payload: { success, message } });
    },
    actingSessionId: () => SESSION_ID,
    ensureCurrentSession: () => true,
    serializeSessionTransition: async (fn: () => Promise<void>) => fn(),
    contextForMessage: () => ({
      session: { id: SESSION_ID },
      state: {},
      meta: {},
    }),
    sessionsDirectory: () => sessionsDir,
  } as never);
  return { handlers, sent, ws };
}

describe('session checkpoint handlers — journal revision', () => {
  it('lists checkpoints with a journal revision when the journal is readable', async () => {
    await writeJournal();
    const h = makeHarness();

    await h.handlers.listCheckpoints(
      h.ws as never,
      {
        type: 'session.checkpoints',
        payload: { includeRevision: true },
      } as never,
    );

    const frame = h.sent.find((m) => m.type === 'session.checkpoints');
    expect(frame).toBeDefined();
    expect(frame?.payload['checkpoints']).toHaveLength(1);
    expect(frame?.payload['journalRevision']).toMatch(/^[0-9a-f]{64}$/);
    expect(frame?.payload['error']).toBeUndefined();
  });

  it('keeps the loaded checkpoint list when the journal changes during loading', async () => {
    await writeJournal();
    fsState.flip = true;
    const h = makeHarness();

    await h.handlers.listCheckpoints(
      h.ws as never,
      {
        type: 'session.checkpoints',
        payload: { includeRevision: true },
      } as never,
    );

    const frame = h.sent.find((m) => m.type === 'session.checkpoints');
    expect(frame).toBeDefined();
    // The list the client was reviewing must survive the staleness warning.
    expect(frame?.payload['checkpoints']).toHaveLength(1);
    expect(String(frame?.payload['error'])).toContain(
      'The session journal changed while checkpoints were loading',
    );
  });

  it('refuses a rewind with an actionable message when the journal cannot be verified', async () => {
    // No journal on disk: the revision hash is unavailable, not a failure.
    const h = makeHarness();

    await h.handlers.rewindSession(
      h.ws as never,
      {
        type: 'session.rewind',
        payload: { checkpointIndex: 0, expectedJournalRevision: 'a'.repeat(64) },
      } as never,
    );

    const frame = h.sent.find((m) => m.type === 'key.operation_result');
    expect(frame?.payload['success']).toBe(false);
    expect(frame?.payload['message']).toBe(
      'Cannot verify the session journal; refresh checkpoints before rewinding.',
    );
    expect(String(frame?.payload['message'])).not.toContain('ENOENT');
  });

  it('refuses a rewind when the journal revision no longer matches', async () => {
    await writeJournal();
    const h = makeHarness();

    await h.handlers.rewindSession(
      h.ws as never,
      {
        type: 'session.rewind',
        payload: { checkpointIndex: 0, expectedJournalRevision: 'b'.repeat(64) },
      } as never,
    );

    const frame = h.sent.find((m) => m.type === 'key.operation_result');
    expect(frame?.payload['success']).toBe(false);
    expect(frame?.payload['message']).toBe(
      'The session journal changed after review. Refresh checkpoints before rewinding.',
    );
  });
});
