import { describe, expect, it } from 'vitest';
import {
  buildAgentMailActivities,
  buildAgentToolCalls,
  buildMailRoutes,
  buildSnapshotMailActivities,
  buildSnapshotToolCalls,
  classifyOfficeTool,
  type OfficeMailActivity,
  synthesizeCurrentTool,
} from '../../src/lib/agent-office.js';
import type { VizEvent } from '../../src/stores/viz-store.js';

function event(kind: VizEvent['kind'], timestamp: number, data: Record<string, unknown>): VizEvent {
  return {
    id: `viz-${timestamp}-${kind}`,
    kind,
    timestamp,
    source: typeof data['agentId'] === 'string' ? data['agentId'] : String(data['name'] ?? 'tool'),
    target: typeof data['name'] === 'string' ? data['name'] : undefined,
    label: String(data['name'] ?? kind),
    data,
  };
}

describe('agent office tool model', () => {
  it('classifies the visual tool families', () => {
    expect(classifyOfficeTool('read_file')).toBe('read');
    expect(classifyOfficeTool('apply_patch')).toBe('edit');
    expect(classifyOfficeTool('shell_command')).toBe('terminal');
    expect(classifyOfficeTool('web.search')).toBe('web');
  });

  it('merges a tool start and completion while preserving exact line metrics', () => {
    const events = [
      event('tool:executed', 1_200, {
        id: 'tu-1',
        agentId: 'agent-a',
        sessionId: 'session-1',
        name: 'read',
        ok: true,
        durationMs: 200,
        input: { file_path: 'src/app.ts', offset: 20, limit: 40 },
        fileTargets: [{ filePath: 'src/app.ts', operation: 'read', line: 20, endLine: 59 }],
        outputLines: 40,
        outputBytes: 2_048,
      }),
      event('tool:started', 1_000, {
        id: 'tu-1',
        agentId: 'agent-a',
        sessionId: 'session-1',
        name: 'read',
        input: { file_path: 'src/app.ts', offset: 20, limit: 40 },
      }),
    ];

    const [call] = buildAgentToolCalls(events, 'agent-a', 'session-1');
    expect(call).toMatchObject({
      id: 'agent-a:tu-1',
      kind: 'read',
      status: 'succeeded',
      startedAt: 1_000,
      completedAt: 1_200,
      summary: '40 lines read',
      lineLabel: 'L20–59',
      target: 'src/app.ts',
      outputBytes: 2_048,
    });
  });

  it('reports exact edit deltas from patches', () => {
    const events = [
      event('tool:executed', 2_000, {
        id: 'tu-2',
        agentId: 'agent-a',
        name: 'apply_patch',
        ok: true,
        input: {
          file_path: 'src/store.ts',
          patch: '@@\n-old one\n-old two\n+new one\n+new two\n+new three',
        },
      }),
    ];
    expect(buildAgentToolCalls(events, 'agent-a')[0]?.summary).toBe('+3 / −2 lines');
  });

  it('counts an in-hunk ---/+++ content pair instead of treating it as a header', () => {
    // Removed `-- old comment` → diff line `--- old comment`; added
    // `++ new comment` → `+++ new comment`. Declared counts (1/1) put the
    // pair inside the hunk body, so both lines are content — the same rule
    // core's countUnifiedDiffLines enforces.
    const events = [
      event('tool:executed', 2_000, {
        id: 'tu-pair',
        agentId: 'agent-a',
        name: 'apply_patch',
        ok: true,
        input: {
          file_path: 'src/store.ts',
          patch: ['@@ -1,2 +1,2 @@', '--- old comment', '+++ new comment', ''].join('\n'),
        },
      }),
    ];
    expect(buildAgentToolCalls(events, 'agent-a')[0]?.summary).toBe('+1 / −1 lines');
  });

  it('counts a --- content line inside a mixed hunk alongside its neighbours', () => {
    const events = [
      event('tool:executed', 2_000, {
        id: 'tu-mixed',
        agentId: 'agent-a',
        name: 'apply_patch',
        ok: true,
        input: {
          file_path: 'src/store.ts',
          patch: ['@@ -3,3 +3,3 @@', '-a', '--- old comment', '+++ new comment', ''].join('\n'),
        },
      }),
    ];
    expect(buildAgentToolCalls(events, 'agent-a')[0]?.summary).toBe('+1 / −2 lines');
  });

  it('ignores +/- lines before the first hunk, such as a commit message', () => {
    const events = [
      event('tool:executed', 2_000, {
        id: 'tu-preamble',
        agentId: 'agent-a',
        name: 'apply_patch',
        ok: true,
        input: {
          file_path: 'src/store.ts',
          patch: [
            'commit message',
            '- bullet about the fix',
            '--- a/f.txt',
            '+++ b/f.txt',
            '@@ -1,1 +1,1 @@',
            '-a',
            '+b',
            '',
          ].join('\n'),
        },
      }),
    ];
    expect(buildAgentToolCalls(events, 'agent-a')[0]?.summary).toBe('+1 / −1 lines');
  });

  it('skips the patch(1) header pair that precedes the first hunk', () => {
    const events = [
      event('tool:executed', 2_000, {
        id: 'tu-header',
        agentId: 'agent-a',
        name: 'apply_patch',
        ok: true,
        input: {
          file_path: 'src/store.ts',
          patch: ['--- a/f.txt', '+++ b/f.txt', '@@ -1,1 +1,1 @@', '-a', '+b', ''].join('\n'),
        },
      }),
    ];
    expect(buildAgentToolCalls(events, 'agent-a')[0]?.summary).toBe('+1 / −1 lines');
  });

  it('keeps calls scoped to the selected session', () => {
    const events = [
      event('tool:executed', 2_000, {
        id: 'same',
        agentId: 'leader',
        sessionId: 'session-b',
        name: 'bash',
        ok: true,
      }),
      event('tool:executed', 1_000, {
        id: 'same',
        agentId: 'leader',
        sessionId: 'session-a',
        name: 'read',
        ok: true,
      }),
    ];
    expect(buildAgentToolCalls(events, 'leader', 'session-a').map((call) => call.toolName)).toEqual(
      ['read'],
    );
  });

  it('can synthesize a live action from a remote fleet snapshot', () => {
    expect(synthesizeCurrentTool('worker', 'fetch', 'session-1')).toMatchObject({
      agentId: 'worker',
      sessionId: 'session-1',
      kind: 'web',
      status: 'running',
      summary: 'Working online',
    });
  });

  it('turns cross-process registry receipts into completed Office calls', () => {
    const [call] = buildSnapshotToolCalls(
      [
        {
          id: 'tu-write',
          name: 'write_file',
          startedAt: 1_000,
          completedAt: 1_025,
          durationMs: 25,
          ok: true,
          input: { file_path: 'src/new.ts' },
          inputLines: 18,
        },
      ],
      'worker-a',
      'session-a',
    );

    expect(call).toMatchObject({
      id: 'worker-a:tu-write',
      kind: 'write',
      status: 'succeeded',
      summary: '18 lines written',
      target: 'src/new.ts',
      sessionId: 'session-a',
    });
  });

  it('routes direct, session, and project mail to the correct agent desk', () => {
    const agent = { serverId: 'leader', mailboxId: 'leader@abc', name: 'Leader' };
    const activities = buildAgentMailActivities(
      [
        {
          id: 'direct',
          from: 'worker@abc',
          to: 'leader@abc',
          type: 'result',
          subject: 'Done',
          body: 'Finished the task',
          priority: 'normal',
          timestamp: '2026-07-17T10:00:00.000Z',
          readBy: {},
        },
        {
          id: 'session',
          from: 'critic@abc',
          to: '@session:session-a',
          type: 'note',
          subject: 'Session note',
          body: 'Heads up',
          priority: 'normal',
          timestamp: '2026-07-17T09:59:00.000Z',
        },
        {
          id: 'broadcast',
          from: 'coordinator',
          to: '*',
          type: 'broadcast',
          subject: 'Project update',
          body: 'All hands',
          priority: 'high',
          timestamp: '2026-07-17T09:58:00.000Z',
        },
      ],
      agent,
      'session-a',
    );

    expect(activities.map((mail) => mail.id)).toEqual(['direct', 'session', 'broadcast']);
    expect(activities[0]).toMatchObject({ direction: 'incoming', unread: true });
  });

  it('turns registry mail receipts into clickable Office parcels', () => {
    expect(
      buildSnapshotMailActivities([
        {
          id: 'mail-1',
          direction: 'outgoing',
          from: 'worker-a',
          to: 'leader',
          type: 'result',
          subject: 'Implementation done',
          at: Date.parse('2026-07-17T10:00:00.000Z'),
        },
      ])[0],
    ).toMatchObject({
      id: 'mail-1',
      direction: 'outgoing',
      subject: 'Implementation done',
      timestamp: '2026-07-17T10:00:00.000Z',
      timestampMs: Date.parse('2026-07-17T10:00:00.000Z'),
      unread: false,
    });
  });

  it('shows project and session mail once on the lead desk, not every worker', () => {
    const messages = [
      {
        id: 'broadcast',
        from: 'coordinator',
        to: '*',
        type: 'broadcast',
        subject: 'Project update',
        body: 'All hands',
        priority: 'normal',
        timestamp: '2026-07-17T10:00:00.000Z',
      },
    ];

    expect(
      buildAgentMailActivities(messages, { serverId: 'leader', name: 'Leader' }, 'session-a'),
    ).toHaveLength(1);
    expect(
      buildAgentMailActivities(messages, { serverId: 'worker-a', name: 'Worker' }, 'session-a'),
    ).toHaveLength(0);
  });

  it('does not project leaders-only direct mail onto a worker desk', () => {
    const messages = [
      {
        id: 'private-control',
        from: 'webui',
        to: 'worker-a',
        type: 'note',
        audience: 'leaders' as const,
        subject: 'Leader context',
        body: 'Hidden from workers',
        priority: 'normal',
        timestamp: '2026-07-17T10:00:00.000Z',
      },
    ];

    expect(
      buildAgentMailActivities(messages, { serverId: 'worker-a', name: 'Worker' }, 'session-a'),
    ).toHaveLength(0);
  });
});

describe('office mail routes', () => {
  const NOW = Date.parse('2026-07-20T12:00:00.000Z');

  function mailActivity(
    id: string,
    from: string,
    to: string,
    timestampMs: number,
  ): OfficeMailActivity {
    return {
      id,
      from,
      to,
      type: 'note',
      subject: `subject-${id}`,
      body: '',
      priority: 'normal',
      timestamp: new Date(timestampMs).toISOString(),
      direction: 'outgoing',
      timestampMs,
      unread: false,
    };
  }

  function lane(
    serverId: string,
    name: string,
    mail: OfficeMailActivity[],
    mailboxId?: string,
  ): {
    agent: { serverId: string; name: string; mailboxId?: string | undefined };
    mail: OfficeMailActivity[];
  } {
    return { agent: { serverId, name, mailboxId }, mail };
  }

  it('routes fresh mail between two desks in the same office', () => {
    const routes = buildMailRoutes(
      [
        lane('leader', 'Leader', [mailActivity('m1', 'leader', 'worker-a', NOW - 5_000)]),
        lane('worker-a', 'Worker A', []),
        lane('worker-b', 'Worker B', []),
      ],
      NOW,
    );

    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ id: 'm1', fromIndex: 0, toIndex: 1 });
  });

  it('matches endpoints case-insensitively across serverId, mailboxId and name', () => {
    const routes = buildMailRoutes(
      [
        lane('leader', 'Leader', [mailActivity('m2', 'LEADER', 'Mailbox-A', NOW - 2_000)]),
        lane('worker-a', 'Worker A', [], 'mailbox-a'),
      ],
      NOW,
    );

    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ fromIndex: 0, toIndex: 1 });
  });

  it('ignores stale mail, self-send, terminal mail, and mail with an outside endpoint', () => {
    const lanes = [
      lane('leader', 'Leader', [mailActivity('old', 'leader', 'worker-a', NOW - 60_000)]),
      lane('worker-a', 'Worker A', [
        mailActivity('self', 'worker-a', 'worker-a', NOW - 1_000),
        mailActivity('terminal', 'worker-a', '*', NOW - 1_000),
      ]),
      lane('worker-b', 'Worker B', [mailActivity('outside', 'worker-b', 'ghost', NOW - 1_000)]),
    ];

    expect(buildMailRoutes(lanes, NOW)).toHaveLength(0);
  });

  it('emits each mail id once even when both endpoints list it as their latest', () => {
    const shared = mailActivity('shared', 'leader', 'worker-a', NOW - 3_000);
    const routes = buildMailRoutes(
      [
        lane('leader', 'Leader', [{ ...shared, direction: 'outgoing' }]),
        lane('worker-a', 'Worker A', [{ ...shared, direction: 'incoming' }]),
      ],
      NOW,
    );

    expect(routes).toHaveLength(1);
    expect(routes[0]?.id).toBe('shared');
  });
});
