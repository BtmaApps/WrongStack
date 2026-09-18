import { describe, expect, it } from 'vitest';
import { AuditPanel } from '../src/components/audit-panel.js';
import { MailboxPanel } from '../src/components/mailbox-panel.js';
import { MonitorViewportProvider } from '../src/components/monitor-shell.js';
import { renderRealTty, settle } from './helpers/real-tty.js';

describe.each([
  [80, 18],
  [40, 8],
])('slash scroll panels %ix%i', (columns, rows) => {
  it.each(['audit', 'mailbox'])('%s keeps close controls visible while scrolling', async (kind) => {
    const entries = Array.from({ length: 35 }, (_, i) => `record-${i}`);
    const element =
      kind === 'audit' ? (
        <AuditPanel
          onClose={() => {}}
          sideEffects={
            entries.map((toolUseId) => ({
              toolUseId,
              toolName: 'bash',
              risk: 'shell',
              input: { command: toolUseId },
              ts: '2026-09-18T12:00:00.000Z',
            })) as never
          }
        />
      ) : (
        <MailboxPanel
          open
          unreadCount={35}
          agents={entries.slice(0, 8).map((agentId) => ({
            agentId,
            name: agentId,
            sessionId: 's',
            status: 'running',
            lastSeenAt: '2026-09-18T12:00:00.000Z',
            online: true,
          }))}
          messages={entries.map((id) => ({
            id,
            from: 'agent',
            to: 'all',
            type: 'note',
            subject: id,
            body: 'Long message body '.repeat(5),
            priority: 'normal',
            timestamp: '2026-09-18T12:00:00.000Z',
            readByCount: 0,
            readByMe: false,
            completed: false,
          }))}
        />
      );
    const view = renderRealTty(
      <MonitorViewportProvider value={{ columns, rows }}>{element}</MonitorViewportProvider>,
      { columns, rows: 100 },
    );
    try {
      await settle();
      const before = view.lastFrame();
      expect(before).toContain('Esc');
      expect(before.trimEnd().split('\n').length).toBeLessThanOrEqual(rows);
      view.stdin.write('\x1b[6;3~');
      await settle();
      expect(view.lastFrame()).not.toBe(before);
      expect(view.lastFrame()).toContain('Esc');
      expect(view.lastFrame().trimEnd().split('\n').length).toBeLessThanOrEqual(rows);
    } finally {
      view.unmount();
    }
  });
});
