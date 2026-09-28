/**
 * ClientTransport tells its close listeners when the agent connection ends
 * (the process exits, a frame limit trips, stop()), naming the cause, so
 * ACPSession can fail in-flight requests at once instead of at their timeout.
 * See agent-connection-close.test.ts for the session side.
 */
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('node:child_process', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, spawn: (...a: unknown[]) => spawnMock.fn(...a) };
});

import { ClientTransport } from '../src/agent/stdio-transport.js';

class FakeChildStream extends EventEmitter {
  setEncoding = vi.fn();
  write(_data: string, _enc?: unknown, cb?: (err?: Error) => void): boolean {
    cb?.();
    return true;
  }
}
class FakeChild extends EventEmitter {
  stdout = new FakeChildStream();
  stdin = new FakeChildStream();
  stderr = new FakeChildStream();
  pid = 4321;
  kill = vi.fn();
}

async function startedChild(maxFrameChars?: number) {
  const child = new FakeChild();
  // Reset first: stopping an earlier child spawns the platform tree-kill
  // through this same mock.
  spawnMock.fn.mockReset();
  spawnMock.fn.mockReturnValue(child);
  const transport = new ClientTransport({
    command: 'agent',
    skipHandshakeMarker: true,
    maxFrameChars,
  });
  const started = transport.start();
  await vi.waitFor(() => expect(spawnMock.fn).toHaveBeenCalled());
  child.emit('spawn');
  await started;
  return { transport, child };
}

describe('ClientTransport onClose', () => {
  it('reports the exit code once and isolates a faulty listener', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { transport, child } = await startedChild();
    const reasons: string[] = [];
    const dropped = vi.fn();
    transport.onClose(() => {
      throw new Error('faulty listener');
    });
    transport.onClose((r) => reasons.push(r));
    transport.onClose(dropped)();
    child.emit('close', 3);
    transport.stop();
    expect(reasons).toEqual(['agent process exited with code 3']);
    expect(dropped).not.toHaveBeenCalled();
    stderr.mockRestore();
  });

  it('names the frame limit and a local stop as the cause', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const pending = await startedChild(8);
    const reasons: string[] = [];
    pending.transport.onClose((r) => reasons.push(r));
    pending.child.stdout.emit('data', '123456789');

    const complete = await startedChild(8);
    complete.transport.onClose((r) => reasons.push(r));
    complete.child.stdout.emit('data', '{"method":"too-long"}\n');

    const stopped = await startedChild();
    stopped.transport.onClose((r) => reasons.push(r));
    stopped.transport.stop();
    expect(reasons).toEqual([
      'agent frame exceeds 8 characters',
      'agent frame exceeds 8 characters',
      'transport stopped',
    ]);
    stderr.mockRestore();
  });

  it('refuses to send once the connection is closed, even before the child is reaped', async () => {
    const { transport, child } = await startedChild();
    child.emit('error', new Error('post-ready crash'));
    await expect(transport.send({ jsonrpc: '2.0', method: 'x' } as never)).rejects.toThrow(
      'ClientTransport is closed',
    );
    transport.stop();
  });
});
