/**
 * Failure-injection coverage for the last defensive callbacks.
 *
 * Each case here reaches a `.catch(() => {})` / `.then(() => {})` whose
 * only trigger is a normally-succeeding operation failing. They are real
 * guards (a broken store or a dead wire must not take the turn down), so the
 * tests inject the failure and assert the turn still settles.
 */

import type { Agent } from '@wrongstack/core/agent';
import { describe, expect, it, vi } from 'vitest';
import { makeACPServerAgentTurn } from '../src/agent/server-agent-turn.js';

const stdio = vi.hoisted(() => ({ read: vi.fn(), send: vi.fn(), close: vi.fn() }));

vi.mock('../src/agent/stdio-transport.js', () => ({
  StdioTransport: class {
    read = stdio.read;
    send = stdio.send;
    close = stdio.close;
    onMessage() {
      return () => {};
    }
    onMessageClaim() {
      return () => {};
    }
    sendStartupMarker() {}
  },
}));

const { WrongStackACPServer } = await import('../src/agent/wrongstack-acp-agent.js');

describe('dispose() tolerates a rejecting agent teardown', () => {
  it('does not surface a teardown rejection as an unhandled error', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => void unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const agent = {
        async run() {
          return { text: 'done' };
        },
        // A teardown that blows up must not take the server down with it.
        async teardown() {
          throw new Error('teardown exploded');
        },
        events: { on: () => () => {} },
      } as unknown as Agent;

      const turn = makeACPServerAgentTurn({ agentFor: () => agent });
      const result = await turn(
        {
          sessionId: 's1',
          prompt: [{ type: 'text', text: 'hi' }],
          signal: new AbortController().signal,
        } as never,
        () => {},
      );
      expect(result.stopReason).toBe('end_turn');

      // dispose() awaits teardown through a .catch; nothing may escape.
      turn.dispose('s1');
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});

describe('stdio server prompt dispatch', () => {
  /** The handler chain awaits real I/O (cwd resolution), so poll, don't tick once. */
  async function waitFor(predicate: () => boolean, label: string): Promise<void> {
    for (let i = 0; i < 500; i++) {
      if (predicate()) return;
      await new Promise((r) => setImmediate(r));
    }
    throw new Error(`timed out waiting for ${label}`);
  }

  it('runs a prompt to completion over the stdio transport', async () => {
    const queue: unknown[] = [];
    const sent: { id?: unknown; result?: unknown; error?: unknown }[] = [];
    let finished = false;
    // read() must NOT return null while the queue is merely empty — the server
    // loop treats null as "stdin closed" and exits. Wait for a message instead,
    // and only report EOF once the test has said the stream is done.
    stdio.read.mockImplementation(
      () =>
        new Promise((resolve) => {
          const poll = (): void => {
            if (queue.length > 0) {
              resolve(queue.shift());
              return;
            }
            if (finished) {
              resolve(null);
              return;
            }
            setImmediate(poll);
          };
          poll();
        }),
    );
    stdio.send.mockImplementation(async (m: { id?: unknown }) => {
      sent.push(m);
    });

    const server = new WrongStackACPServer({ defaultCwd: process.cwd() });
    const started = server.start();

    queue.push({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1 } });
    await waitFor(() => sent.some((m) => m.id === 1), 'initialize response');

    queue.push({ jsonrpc: '2.0', id: 2, method: 'session/new', params: { cwd: process.cwd() } });
    await waitFor(() => sent.some((m) => m.id === 2), 'session/new response');
    const created = sent.find((m) => m.id === 2) as { result?: { sessionId?: string } };
    const sessionId = created.result?.sessionId;
    expect(sessionId).toBeTruthy();

    queue.push({
      jsonrpc: '2.0',
      id: 3,
      method: 'session/prompt',
      params: { sessionId, prompt: [{ type: 'text', text: 'hi' }] },
    });
    await waitFor(() => sent.some((m) => m.id === 3), 'prompt response');
    // Now close the stream: the loop's finally awaits the in-flight prompt.
    finished = true;
    await started;

    expect(sent.find((m) => m.id === 3)).toMatchObject({ result: { stopReason: 'end_turn' } });
    await server.stop();
  });

  it('logs a prompt dispatch that rejects instead of letting it go unhandled', async () => {
    const queue: unknown[] = [];
    const sent: { id?: unknown; result?: unknown; error?: unknown }[] = [];
    let finished = false;
    stdio.read.mockImplementation(
      () =>
        new Promise((resolve) => {
          const poll = (): void => {
            if (queue.length > 0) {
              resolve(queue.shift());
              return;
            }
            if (finished) {
              resolve(null);
              return;
            }
            setImmediate(poll);
          };
          poll();
        }),
    );
    // Reject the WRITE of error responses. The handler's catch block awaits
    // sendError(), so a failed write makes handleMessage() itself reject — the
    // only way the dispatch's rejection handler can be reached.
    stdio.send.mockImplementation(async (m: { id?: unknown; error?: unknown }) => {
      sent.push(m);
      if (m.error !== undefined) throw new Error('transport write failed');
    });

    // Guard for the V8 fnMap finding: coverage reports the prompt-dispatch
    // REJECTION callback as wrongstack-acp-agent.ts:145. Asserting only that
    // start() resolves cannot tell whether that callback ran, so assert the
    // stderr line it alone is responsible for.
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const server = new WrongStackACPServer({ defaultCwd: process.cwd() });
    const started = server.start();

    queue.push({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1 } });
    await waitFor(() => sent.some((m) => m.id === 1), 'initialize response');

    // A prompt for a session that does not exist makes handleSessionPromptOp
    // fail, which routes through the handler's catch -> sendError.
    queue.push({
      jsonrpc: '2.0',
      id: 2,
      method: 'session/prompt',
      params: { sessionId: 'no-such-session', prompt: [{ type: 'text', text: 'hi' }] },
    });
    await waitFor(() => sent.some((m) => m.id === 2), 'prompt error response');

    finished = true;
    // Must not throw and must not hang: the rejection is logged, not fatal.
    await expect(started).resolves.toBeUndefined();
    // The regression guard proper: this line is written ONLY by the
    // prompt-dispatch rejection handler, so it fails if that callback stops
    // being reached even though start() still resolves.
    expect(stderr.mock.calls.flat().join('')).toContain('prompt dispatch failed');
    stderr.mockRestore();
    await server.stop();
  });
});
