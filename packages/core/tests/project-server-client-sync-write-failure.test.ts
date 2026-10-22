import { describe, expect, it } from 'vitest';
import { ChronicleProjectServerClient } from '../src/chronicle/project-server-client.js';
import { MailboxProjectServerConnection } from '../src/coordination/mailbox-project-server-client.js';

interface PendingEntry {
  timer: ReturnType<typeof setTimeout>;
}

interface ClientProbe {
  socket: { destroyed: boolean; write(encoded: string): boolean } | null;
  pending: Map<number, PendingEntry>;
  request<T>(message: object, timeoutMs: number): Promise<T>;
}

function clients(): object[] {
  const root = process.cwd();
  return [
    new ChronicleProjectServerClient({
      projectRoot: root,
      globalRoot: root,
      projectId: 'sync-write-failure',
      projectDir: root,
      workspaceId: 'sync-write-failure',
    }),
    new MailboxProjectServerConnection(root),
  ];
}

describe('project-server client synchronous write failures', () => {
  it('rejects without retaining pending entries or timeout handles', async () => {
    for (const client of clients()) {
      const target = client as ClientProbe;
      target.socket = {
        destroyed: false,
        write() {
          throw new Error('synthetic write failure');
        },
      };

      await expect(
        target.request({ type: 'request', op: 'ping', args: {} }, 60_000),
      ).rejects.toThrow('synthetic write failure');
      expect(target.pending.size).toBe(0);
      target.socket = null;
    }
  });
});
