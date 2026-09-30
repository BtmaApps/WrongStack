import * as fs from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { mailboxProjectServerMetadataPath } from '../../src/coordination/mailbox-project-server-endpoint.js';
import {
  importDaemonInstance,
  makeTempRoot,
  sleep,
  waitForMetadataRemoval,
} from '../helpers/project-server-harness.js';

const permissions = vi.hoisted(() => ({
  entered: false,
  release: undefined as (() => void) | undefined,
}));

vi.mock('../../src/security/file-permissions.js', () => ({
  restrictFilePermissions: async () => {
    permissions.entered = true;
    await new Promise<void>((resolve) => {
      permissions.release = resolve;
    });
  },
}));

it('starts the idle countdown only after metadata permissions are ready', async () => {
  const temp = await makeTempRoot('mailbox-startup-idle');
  const previousIdle = process.env['WRONGSTACK_MAILBOX_SERVER_IDLE_MS'];
  const previousLease = process.env['WRONGSTACK_MAILBOX_SERVER_CLIENT_LEASE_MS'];
  process.env['WRONGSTACK_MAILBOX_SERVER_IDLE_MS'] = '100';
  process.env['WRONGSTACK_MAILBOX_SERVER_CLIENT_LEASE_MS'] = '300';
  const metadataPath = mailboxProjectServerMetadataPath(temp.root);
  try {
    await importDaemonInstance(
      '../../src/coordination/mailbox-project-server.ts',
      ['--project-dir', temp.root],
      1,
    );
    await vi.waitFor(() => expect(permissions.entered).toBe(true));
    // Multiple lease sweeps and a whole idle window pass during ACL work.
    await sleep(400);
    await expect(fs.access(metadataPath)).resolves.toBeUndefined();
  } finally {
    permissions.release?.();
    try {
      await waitForMetadataRemoval(metadataPath);
    } finally {
      if (previousIdle === undefined) delete process.env['WRONGSTACK_MAILBOX_SERVER_IDLE_MS'];
      else process.env['WRONGSTACK_MAILBOX_SERVER_IDLE_MS'] = previousIdle;
      if (previousLease === undefined)
        delete process.env['WRONGSTACK_MAILBOX_SERVER_CLIENT_LEASE_MS'];
      else process.env['WRONGSTACK_MAILBOX_SERVER_CLIENT_LEASE_MS'] = previousLease;
      await temp.release();
    }
  }
});
