import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { client, ndJsonStream } from '@agentclientprotocol/sdk';
import { expect, it, vi } from 'vitest';

it('serves an official SDK client over real stdio and cancels before the turn completes', async () => {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', fileURLToPath(new URL('./fixtures/cancellable-agent.ts', import.meta.url))],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  let started = false;
  const connection = client()
    .onNotification('session/update', ({ params }) => {
      if (params.update.sessionUpdate === 'agent_message_chunk') started = true;
    })
    .connect(ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout)));
  try {
    const init = await connection.agent.request('initialize', { protocolVersion: 1 });
    expect(init.protocolVersion).toBe(1);
    const session = await connection.agent.request('session/new', {
      cwd: process.cwd(),
      mcpServers: [],
    });
    expect(session.modes?.currentModeId).toBe('code');
    const result = connection.agent.request('session/prompt', {
      sessionId: session.sessionId,
      prompt: [{ type: 'text', text: 'wait until cancelled' }],
    });
    await vi.waitFor(() => expect(started, stderr).toBe(true), { timeout: 5000 });
    await connection.agent.notify('session/cancel', { sessionId: session.sessionId });
    await expect(result).resolves.toEqual({ stopReason: 'cancelled' });
  } finally {
    connection.close();
    child.stdin.end();
    child.kill();
  }
}, 10_000);
