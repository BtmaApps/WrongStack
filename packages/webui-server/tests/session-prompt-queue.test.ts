/**
 * The host-owned prompt queue: prompts queued for a session run one after
 * another as its turns end, on the server — with no page watching — and
 * survive a host restart.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { createConversationOperations } from '../src/server/conversation-operations.js';
import {
  createSessionPromptQueue,
  handlePromptQueueMessage,
  promptQueueDirFor,
  type QueuedPrompt,
} from '../src/server/session-prompt-queue.js';

type Outbound = { type: string; payload: unknown };

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'prompt-queue-'));
  dirs.push(dir);
  return dir;
}

const flush = () => new Promise((r) => setImmediate(r));

/** Real session ids are date-scoped, with a `/` in them. */
const SESSION = '2026-09-23/sess_01ABC';
const SESSION_FILE = '2026-09-23%2fsess_01ABC.json';

function queueHarness(opts: { dir?: string; busy?: boolean; start?: boolean } = {}) {
  const broadcasts: Outbound[] = [];
  const started: QueuedPrompt[] = [];
  let busy = opts.busy ?? false;
  const queue = createSessionPromptQueue({
    dir: opts.dir,
    isBusy: () => busy,
    startTurn: async (_sid, prompt, onStart) => {
      if (opts.start === false) return false;
      onStart();
      started.push(prompt);
      return true;
    },
    broadcast: (m) => broadcasts.push(m),
  });
  return {
    queue,
    broadcasts,
    started,
    setBusy: (value: boolean) => {
      busy = value;
    },
  };
}

describe('createSessionPromptQueue', () => {
  it('holds prompts while the session is busy and runs the front one when drained', async () => {
    const h = queueHarness({ busy: true });
    await h.queue.add('s1', { text: 'first' });
    await h.queue.add('s1', { text: '  second  ' });
    await flush();
    expect(h.started).toEqual([]);
    expect((await h.queue.list('s1')).map((p) => p.text)).toEqual(['first', 'second']);

    h.setBusy(false);
    await h.queue.drain('s1');

    expect(h.started.map((p) => p.text)).toEqual(['first']);
    expect((await h.queue.list('s1')).map((p) => p.text)).toEqual(['second']);
    // Pages learn which prompt started (to show it as the user's message)
    // before the updated list.
    const tail = h.broadcasts.slice(-2);
    expect(tail[0]).toMatchObject({ type: 'queue.drained', payload: { item: { text: 'first' } } });
    expect(tail[1]).toMatchObject({
      type: 'queue.state',
      payload: { sessionId: 's1', items: [{ text: 'second', imageCount: 0 }] },
    });
  });

  it('starts a prompt queued while idle right away', async () => {
    const h = queueHarness();
    await h.queue.add('s1', { text: 'now' });
    await flush();
    expect(h.started.map((p) => p.text)).toEqual(['now']);
  });

  it('keeps a prompt whose turn could not start at the front of the queue', async () => {
    const h = queueHarness({ start: false });
    await h.queue.add('s1', { text: 'a' });
    await h.queue.add('s1', { text: 'b' });
    await h.queue.drain('s1');
    expect((await h.queue.list('s1')).map((p) => p.text)).toEqual(['a', 'b']);
    expect(h.broadcasts.some((m) => m.type === 'queue.drained')).toBe(false);
  });

  it('removes and clears, publishing the list each time', async () => {
    const h = queueHarness({ busy: true });
    const a = await h.queue.add('s1', { text: 'a' });
    await h.queue.add('s1', { text: 'b' });
    if (!a.ok) throw new Error('add failed');

    expect(await h.queue.remove('s1', a.item.id)).toBe(true);
    expect(await h.queue.remove('s1', 'nope')).toBe(false);
    expect(h.broadcasts.at(-1)).toMatchObject({ payload: { items: [{ text: 'b' }] } });
    expect(await h.queue.clear('s1')).toBe(1);
    expect(h.broadcasts.at(-1)).toMatchObject({ type: 'queue.state', payload: { items: [] } });
  });

  it('refuses empty prompts and a full queue', async () => {
    const h = queueHarness({ busy: true });
    expect(await h.queue.add('s1', { text: '   ' })).toMatchObject({ ok: false });
    for (let i = 0; i < 100; i++) await h.queue.add('s1', { text: `p${i}` });
    expect(await h.queue.add('s1', { text: 'one too many' })).toMatchObject({
      ok: false,
      reason: expect.stringContaining('full'),
    });
  });

  it('survives a host restart and runs what was left once the session is opened', async () => {
    const dir = await tempDir();
    const before = queueHarness({ dir, busy: true });
    await before.queue.add(SESSION, { text: 'left over', images: [{ data: 'aGk=', mediaType: 'image/png' }] });
    const file = path.join(dir, SESSION_FILE);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual([
      expect.objectContaining({ text: 'left over', images: [{ data: 'aGk=', mediaType: 'image/png' }] }),
    ]);

    const after = queueHarness({ dir });
    const replies: Outbound[] = [];
    await handlePromptQueueMessage(after.queue, {
      sessionId: SESSION,
      type: 'queue.get',
      payload: {},
      reply: (m) => replies.push(m),
    });
    expect(replies[0]).toMatchObject({
      type: 'queue.state',
      payload: { items: [{ text: 'left over', imageCount: 1 }] },
    });
    await flush();
    expect(after.started.map((p) => p.text)).toEqual(['left over']);
    // Emptied queue: the file goes away rather than lingering as `[]`.
    await vi.waitFor(() => expect(readFile(file, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' }));
  });

  it('ignores a corrupt queue file and never lets an id climb out of the directory', async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'sess_2.json'), '{not json', 'utf8');
    const h = queueHarness({ dir, busy: true });
    expect(await h.queue.list('sess_2')).toEqual([]);

    await h.queue.add('../escape', { text: 'x' });
    await expect(readFile(path.join(dir, '..', 'escape.json'), 'utf8')).rejects.toBeDefined();
    expect(JSON.parse(await readFile(path.join(dir, '%2e%2e%2fescape.json'), 'utf8'))).toEqual([
      expect.objectContaining({ text: 'x' }),
    ]);
  });

  it('puts the queue directory next to the sessions directory', () => {
    expect(promptQueueDirFor(path.join('root', 'projects', 'p', 'sessions'))).toBe(
      path.join('root', 'projects', 'p', 'prompt-queue'),
    );
  });
});

describe('handlePromptQueueMessage', () => {
  it('refuses a bad image while the user is still there to see why', async () => {
    const h = queueHarness({ busy: true });
    const replies: Outbound[] = [];
    await handlePromptQueueMessage(h.queue, {
      sessionId: 's1',
      type: 'queue.add',
      payload: { text: 'look', images: [{ data: 'not base64 !!', mediaType: 'text/html' }] },
      reply: (m) => replies.push(m),
    });
    expect(replies[0]).toMatchObject({ type: 'error', payload: { phase: 'queue.add' } });
    expect(await h.queue.list('s1')).toEqual([]);
  });
});

// ── Through the host's turn path ───────────────────────────────────────────

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function hostHarness() {
  const broadcasts: Outbound[] = [];
  const sent: Outbound[] = [];
  const locks = new Map<string, AbortController>();
  const gates: Array<ReturnType<typeof deferred>> = [];
  const inputs: unknown[] = [];
  const run = vi.fn(async (input: unknown) => {
    inputs.push(input);
    const gate = deferred();
    gates.push(gate);
    await gate.promise;
    return { status: 'done', iterations: 1, finalText: `answered ${String(input)}` };
  });
  const ops = createConversationOperations({
    getAgent: () =>
      ({
        run,
        ctx: {
          provider: { id: 'p', capabilities: { vision: true } },
          model: 'm',
          messages: [],
          meta: {},
        },
        tools: { list: () => [] },
      }) as never,
    getSessionId: () => 'sess_live',
    runControl: {
      begin: (_ws, sid) => {
        if (locks.has(sid)) return undefined;
        const c = new AbortController();
        locks.set(sid, c);
        return c;
      },
      end: (_ws, sid, c) => {
        if (locks.get(sid) === c) locks.delete(sid);
      },
      abort: (_ws, sid) => locks.get(sid)?.abort(),
    },
    pendingConfirms: new Map(),
    submitUserInput: vi.fn(),
    send: (_ws, m) => sent.push(m),
    notifyAbort: vi.fn(),
    broadcast: (m) => broadcasts.push(m),
  });
  const ws = {} as WebSocket;
  const finishRun = async (index: number) => {
    gates[index]?.resolve();
    for (let i = 0; i < 5; i++) await flush();
  };
  return { ops, ws, run, inputs, broadcasts, sent, finishRun };
}

describe('conversation operations with the prompt queue', () => {
  it('runs queued prompts one after another as each turn ends, with no page involved', async () => {
    const h = hostHarness();
    void h.ops.userMessage(h.ws, { type: 'user_message', payload: { content: 'first' } } as never);
    await flush();
    await h.ops.queue?.(h.ws, { type: 'queue.add', payload: { text: 'second' } } as never);
    await h.ops.queue?.(h.ws, { type: 'queue.add', payload: { text: 'third' } } as never);
    await flush();
    expect(h.inputs).toEqual(['first']);

    await h.finishRun(0);
    expect(h.inputs).toEqual(['first', 'second']);
    const types = h.broadcasts.map((m) => m.type);
    // The drained prompt is announced before its own run reports anything.
    expect(types.indexOf('queue.drained')).toBeGreaterThan(-1);
    expect(h.broadcasts.find((m) => m.type === 'queue.drained')).toMatchObject({
      payload: { sessionId: 'sess_live', item: { text: 'second' } },
    });

    await h.finishRun(1);
    expect(h.inputs).toEqual(['first', 'second', 'third']);
    await h.finishRun(2);
    expect(h.inputs).toHaveLength(3);
    // Every turn reports to the session's pages, the page's own turn included
    // (its socket may have dropped meanwhile); a queued turn never as a refusal.
    expect(h.broadcasts.filter((m) => m.type === 'run.result')).toHaveLength(3);
    expect(h.sent.filter((m) => m.type === 'run.result')).toEqual([]);
    expect(h.sent.filter((m) => m.type === 'error')).toEqual([]);
  });

  it('starts a prompt queued on an idle session immediately', async () => {
    const h = hostHarness();
    await h.ops.queue?.(h.ws, { type: 'queue.add', payload: { text: 'go' } } as never);
    await flush();
    await flush();
    expect(h.inputs).toEqual(['go']);
    await h.finishRun(0);
  });
});
