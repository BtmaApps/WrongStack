import { describe, expect, it } from 'vitest';
import { createDelegateTool } from '../../src/coordination/delegate-tool.js';
import { Director } from '../../src/coordination/director.js';

/**
 * A delegated worker that crashed was reported with
 * `stopReason: "budget_exhausted"` — every non-success, non-timeout,
 * non-stopped result fell through to it, steering the leader toward raising a
 * budget instead of reading the error (audit 2026-09-15).
 */
function buildDelegate(runner: ConstructorParameters<typeof Director>[0]['runner']) {
  const director = new Director({
    sessionId: 'sess_delegate_crash',
    config: {
      coordinatorId: 'coord-delegate-crash',
      doneCondition: { type: 'all_tasks_done' },
      maxConcurrent: 2,
    },
    runner,
  });
  const tool = createDelegateTool({
    host: {
      isDirectorMode: () => true,
      ensureDirector: async () => director,
      promoteToDirector: async () => director,
    },
  });
  const ctx = {
    cwd: process.cwd(),
    meta: {},
    session: { id: 'sess_delegate_crash' },
    agentId: 'leader',
  };
  return { director, tool, ctx };
}

const boundary = { scope: 'the audit fixture only', outOfScope: ['any real project file'] };

describe('delegate stop reason for a crashed worker', () => {
  it('reports error, not budget_exhausted', async () => {
    const { director, tool, ctx } = buildDelegate(async () => {
      throw new Error('worker crashed on purpose');
    });
    try {
      const out = (await tool.execute(
        { name: 'worker', task: 'crash please', ...boundary, wait: true },
        ctx as never,
        { signal: new AbortController().signal },
      )) as Record<string, unknown>;
      expect(out).toMatchObject({ ok: false, status: 'failed', stopReason: 'error' });
    } finally {
      await director.shutdown();
    }
  });
});
