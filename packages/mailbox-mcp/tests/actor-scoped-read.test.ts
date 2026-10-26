import { type ChildProcess, spawn } from 'node:child_process';
import { access, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createProjectMailbox,
  MailboxEventEmitter,
  MailboxProjectServerConnection,
} from '@wrongstack/coordination';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  removeProjectFixtureDirectory,
  waitForProcessExit,
} from '../../core/tests/helpers/project-server-harness.js';
import { createMailboxMcpToolHost } from '../src/adapter.js';

function objectContent(result: { content: unknown; isError: boolean }): Record<string, unknown> {
  expect(result.isError, JSON.stringify(result.content)).toBe(false);
  expect(result.content).toBeTypeOf('object');
  return result.content as Record<string, unknown>;
}

function messageIds(result: Record<string, unknown>): string[] {
  const messages = result['messages'];
  expect(Array.isArray(messages)).toBe(true);
  return (messages as Array<{ id: string }>).map((message) => message.id);
}

function messageBodies(result: Record<string, unknown>): string[] {
  const messages = result['messages'];
  expect(Array.isArray(messages)).toBe(true);
  return (messages as Array<{ body: string }>).map((message) => message.body);
}

async function waitForServer(metadataPath: string, child: ChildProcess, stderr: () => string) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Mailbox project server exited before ready (${child.exitCode}): ${stderr()}`,
      );
    }
    try {
      await access(metadataPath);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`Mailbox project server readiness timed out: ${stderr()}`);
}

describe('Mailbox MCP actor-scoped reads', () => {
  let projectDir = '';
  let serverProcess: ChildProcess | undefined;
  let serverClosed: Promise<void> | undefined;
  let mailbox: ReturnType<typeof createProjectMailbox> | undefined;
  let emitter: MailboxEventEmitter | undefined;

  beforeAll(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'wrongstack-mailbox-mcp-scope-'));
    const projectServer = fileURLToPath(
      new URL('../../coordination/dist/mailbox-project-server.js', import.meta.url),
    );
    let stderr = '';
    serverProcess = spawn(process.execPath, [projectServer, '--project-dir', projectDir], {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
      env: { ...process.env, NODE_ENV: 'production', VITEST: 'false' },
    });
    serverClosed = new Promise((resolve) => serverProcess?.once('close', () => resolve()));
    serverProcess.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    await waitForServer(join(projectDir, '.mailbox-server.json'), serverProcess, () => stderr);

    emitter = new MailboxEventEmitter();
    mailbox = createProjectMailbox({ projectDir, eventEmitter: emitter, isolatedConnection: true });
    await mailbox.initialize();
  });

  afterAll(async () => {
    await mailbox?.close().catch(() => {});
    emitter?.clear();
    let stoppedPid: number | undefined;
    if (projectDir) {
      const connection = new MailboxProjectServerConnection(projectDir);
      try {
        const stopped = await connection.shutdown('Mailbox MCP actor-scope test complete');
        stoppedPid = stopped.pid;
      } finally {
        connection.close();
      }
    }
    if (stoppedPid !== undefined) await waitForProcessExit(stoppedPid);
    if (serverProcess?.exitCode === null && serverProcess.pid !== stoppedPid) {
      serverProcess.kill('SIGTERM');
    }
    if (serverClosed) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          serverClosed,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              serverProcess?.kill('SIGTERM');
              reject(new Error('Mailbox daemon did not close after shutdown'));
            }, 10_000);
          }),
        ]);
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
    }
    if (serverProcess?.pid !== undefined) await waitForProcessExit(serverProcess.pid);
    if (projectDir) {
      await removeProjectFixtureDirectory(projectDir, { maxRetries: 20, retryDelay: 100 });
    }
  });

  it('keeps another actor mail out of the default read tier', async () => {
    if (!mailbox || !emitter) throw new Error('Mailbox test backend was not initialized');

    const foreign = await mailbox.send({
      from: 'other-agent',
      to: 'other-agent',
      type: 'note',
      subject: 'Foreign mail',
      body: 'other-actor-body',
    });
    const foreignDeleted = await mailbox.send({
      from: 'other-agent',
      to: 'other-agent',
      type: 'note',
      subject: 'Foreign mail, deleted',
      body: 'other-actor-deleted-body',
    });
    await mailbox.softDelete(foreignDeleted.id, 'other-agent');
    const own = await mailbox.send({
      from: 'other-agent',
      to: 'external-agent',
      type: 'note',
      subject: 'Mail for this actor',
      body: 'own-actor-body',
    });

    const host = createMailboxMcpToolHost(mailbox, emitter, {
      actor: 'external-agent',
      sessionId: 'mcp-scope',
    });

    // `includeDeleted` must not turn the default tier into a project-wide
    // read: another actor deleted mail is still another actor mail.
    const result = objectContent(
      await host.callTool('mailbox_read', { action: 'query', includeDeleted: true }),
    );
    const ids = messageIds(result);
    expect(ids).not.toContain(foreign.id);
    expect(ids).not.toContain(foreignDeleted.id);
    expect(ids).toContain(own.id);
    expect(messageBodies(result)).not.toContain('other-actor-body');
    expect(messageBodies(result)).not.toContain('other-actor-deleted-body');
    expect(messageBodies(result)).toContain('own-actor-body');

    // The same holds without the deleted flag.
    const live = objectContent(await host.callTool('mailbox_read', { action: 'query' }));
    expect(messageIds(live)).not.toContain(foreign.id);
    expect(messageIds(live)).toContain(own.id);

    // A caller cannot widen the scope by naming another recipient.
    const foreignRecipient = objectContent(
      await host.callTool('mailbox_read', { action: 'query', to: 'other-agent' }),
    );
    expect(messageIds(foreignRecipient)).toEqual([]);
  });

  it('keeps the full-access tier able to read every actor mail', async () => {
    if (!mailbox || !emitter) throw new Error('Mailbox test backend was not initialized');

    const foreign = await mailbox.send({
      from: 'other-agent',
      to: 'other-agent',
      type: 'note',
      subject: 'Foreign mail for the admin tier',
      body: 'admin-visible-body',
    });
    const foreignDeleted = await mailbox.send({
      from: 'other-agent',
      to: 'other-agent',
      type: 'note',
      subject: 'Foreign deleted mail for the admin tier',
      body: 'admin-visible-deleted-body',
    });
    await mailbox.softDelete(foreignDeleted.id, 'other-agent');

    const host = createMailboxMcpToolHost(mailbox, emitter, {
      actor: 'external-agent',
      sessionId: 'mcp-scope',
      admin: true,
    });
    const result = objectContent(
      await host.callTool('mailbox_read', { action: 'query', includeDeleted: true }),
    );
    const ids = messageIds(result);
    expect(ids).toContain(foreign.id);
    expect(ids).toContain(foreignDeleted.id);
    expect(messageBodies(result)).toContain('admin-visible-body');
    expect(messageBodies(result)).toContain('admin-visible-deleted-body');
  });
});
