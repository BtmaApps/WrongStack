import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { webuiSessionFrameLog } from '../src/server/session-frame-log.js';
import {
  createSessionPromptQueue,
  type SessionPromptQueueDeps,
} from '../src/server/session-prompt-queue.js';
import { broadcast } from '../src/server/ws-utils.js';

const roots = new Set<string>();

async function tempDir(label: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `wrongstack-webui-audit-${label}-`));
  roots.add(root);
  return root;
}

afterEach(async () => {
  await Promise.all([...roots].map((root) => fs.rm(root, { recursive: true, force: true })));
  roots.clear();
});

describe('high-risk audit regressions', () => {
  it('F322 never widens a blank or malformed EXPLICIT session target into a global broadcast', () => {
    let sends = 0;
    const ws = {
      readyState: 1,
      bufferedAmount: 0,
      send: () => {
        sends++;
      },
    } as never;
    const clients = new Map([[ws, { sessionId: 'real' } as never]]);

    // An explicit `targetSessionId` argument is the caller's own routing
    // decision, so a blank or non-string one is dropped outright rather than
    // widened. This is the invariant F322 protects.
    broadcast(clients, { type: 'scoped' }, '   ');
    broadcast(clients, { type: 'scoped' }, 42 as never);
    expect(sends).toBe(0);

    // A sessionId carried INSIDE the payload is a different case and is
    // deliberately NOT dropped: `sessionPayload` materializes the key
    // unconditionally, so host events with a legitimately optional
    // `e.sessionId` (tool.started, subagent.event) arrive here as undefined.
    // Dropping them would silence those events for every client. An unusable
    // value therefore carries no scope and degrades to project-wide — see the
    // note in `broadcast`.
    broadcast(clients, { type: 'scoped', payload: { sessionId: '' } });
    broadcast(clients, { type: 'scoped', payload: { sessionId: 42 } } as never);
    expect(sends).toBe(2);

    // A real session id still scopes to the client displaying it.
    broadcast(clients, { type: 'scoped', payload: { sessionId: 'real' } });
    expect(sends).toBe(3);

    broadcast(clients, { type: 'global' });
    expect(sends).toBe(4);
  });

  it('F336 retains legacy prompts that do not fit the 100-item live queue', async () => {
    const sessionsDir = await tempDir('sessions');
    const legacyDir = await tempDir('legacy');
    const legacyFile = path.join(legacyDir, 'session.json');
    await fs.writeFile(
      legacyFile,
      JSON.stringify(Array.from({ length: 101 }, (_, index) => ({ text: `prompt-${index}` }))),
    );
    const deps: SessionPromptQueueDeps = {
      sessionsDir,
      legacyDir,
      isBusy: () => true,
      startTurn: async () => false,
      broadcast: () => undefined,
    };
    const queue = createSessionPromptQueue(deps);
    expect(await queue.list('session')).toHaveLength(100);
    expect(JSON.parse(await fs.readFile(legacyFile, 'utf8'))).toHaveLength(1);
    // The migrated queue is written in the background; wait for it so the
    // temp-dir teardown does not race the write (ENOTEMPTY on Linux).
    await vi.waitFor(() => fs.access(path.join(sessionsDir, 'session', 'queue.json')));
  });

  it('F338 does not retain a single frame larger than the per-session byte cap', () => {
    const log = webuiSessionFrameLog();
    const sessionId = `audit-large-${Date.now()}`;
    const frame = JSON.parse(
      log.sequence(sessionId, {
        type: 'large',
        payload: { text: 'x'.repeat(4 * 1024 * 1024 + 100) },
      }),
    );
    expect(frame.seq).toBe(1);
    expect(log.since(sessionId, 0)).toBeNull();
  });

  it('F339 serialization failures do not consume sequence numbers', () => {
    const log = webuiSessionFrameLog();
    const sessionId = `audit-failed-${Date.now()}`;
    const circular: Record<string, unknown> = { type: 'bad' };
    circular['self'] = circular;
    expect(() => log.sequence(sessionId, circular)).toThrow();
    expect(JSON.parse(log.sequence(sessionId, { type: 'ok' })).seq).toBe(1);
  });

  it('F340 rejects blank session keys', () => {
    expect(() => webuiSessionFrameLog().sequence('   ', { type: 'frame' })).toThrow(
      /non-empty session id/i,
    );
  });

  it('F341 rejects array messages without consuming sequence numbers', () => {
    const log = webuiSessionFrameLog();
    const sessionId = `audit-array-${Date.now()}`;
    expect(() => log.sequence(sessionId, ['bad'] as never)).toThrow(/object message/i);
    expect(JSON.parse(log.sequence(sessionId, { type: 'ok' })).seq).toBe(1);
  });

  it('F342 strips caller routing metadata and stamps the authoritative stream', () => {
    const log = webuiSessionFrameLog();
    const sessionId = `audit-stream-${Date.now()}`;
    const own = JSON.parse(
      log.sequence(sessionId, {
        type: 'own',
        seq: 99,
        stream: 'spoofed',
        payload: { sessionId },
      }),
    );
    expect(own).toMatchObject({ seq: 1 });
    expect(own).not.toHaveProperty('stream');
    const child = JSON.parse(
      log.sequence(sessionId, {
        type: 'child',
        seq: 99,
        stream: 'spoofed',
        payload: { sessionId: 'child' },
      }),
    );
    expect(child).toMatchObject({ seq: 2, stream: sessionId });
  });
});
