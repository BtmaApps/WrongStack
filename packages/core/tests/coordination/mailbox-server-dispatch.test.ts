import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dispatchMailboxOperation } from '../../src/coordination/mailbox-server-dispatch.js';
import { SqliteMailbox } from '../../src/coordination/sqlite-mailbox.js';

let dir: string;
let mailbox: SqliteMailbox;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'mailbox-dispatch-'));
  mailbox = new SqliteMailbox(dir);
});
afterEach(async () => {
  await mailbox.close();
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

describe('mailbox owner dispatch', () => {
  it('sends, queries, deletes and restores messages in the owner store', async () => {
    const message = (await dispatchMailboxOperation(mailbox, 'send', {
      input: { from: 'worker', to: 'leader', type: 'info', subject: 'Done', body: 'Result' },
    })) as { id: string };
    expect(await dispatchMailboxOperation(mailbox, 'unreadCount', { forAgentId: 'leader' })).toBe(
      1,
    );
    expect(
      await dispatchMailboxOperation(mailbox, 'query', { query: { forAgentId: 'leader' } }),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: message.id, body: 'Result' })]),
    );
    await dispatchMailboxOperation(mailbox, 'softDelete', { mailId: message.id, by: 'leader' });
    expect(await dispatchMailboxOperation(mailbox, 'unreadCount', { forAgentId: 'leader' })).toBe(
      0,
    );
    const restored = await dispatchMailboxOperation(mailbox, 'restore', { mailId: message.id });
    expect(restored).toMatchObject({ id: message.id, body: 'Result' });
    expect(restored).not.toHaveProperty('deletedAt');
    expect(await dispatchMailboxOperation(mailbox, 'unreadCount', { forAgentId: 'leader' })).toBe(
      0,
    );
  });

  it('revives wire dates and redacts credential read and verification results', async () => {
    const issued = (await dispatchMailboxOperation(mailbox, 'credentialIssue', {
      options: {
        principalId: 'leader',
        kind: 'agent',
        capabilities: ['mail.read.self'],
        ttlMs: 60_000,
        notBefore: new Date(Date.now() - 1000).toISOString(),
      },
    })) as ReturnType<SqliteMailbox['credentialIssue']>;
    const credentialId = issued.credential.credentialId;
    const stored = mailbox.credentialGet(credentialId)!;
    expect(stored).toHaveProperty('verifier');
    const read = await dispatchMailboxOperation(mailbox, 'credentialGet', { credentialId });
    expect(read).toMatchObject({ credentialId, principalId: 'leader' });
    expect(read).not.toHaveProperty('verifier');
    const verified = await dispatchMailboxOperation(mailbox, 'credentialVerify', {
      credentialId,
      secret: issued.secret,
    });
    expect(verified).toMatchObject({ valid: true, credential: { credentialId } });
    expect((verified as { credential: unknown }).credential).not.toHaveProperty('verifier');
    await expect(
      dispatchMailboxOperation(mailbox, 'credentialIssue', { options: { notBefore: 'invalid' } }),
    ).rejects.toThrow('Credential notBefore must be an ISO date-time string');
  });
});
