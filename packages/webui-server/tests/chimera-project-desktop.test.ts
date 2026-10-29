import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { JsonlReportStore } from '@wrongstack/builtin-plugins';
import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { createChimeraRouteHandlers, handleChimeraRoute } from '../src/server/chimera-routes.js';

describe('Project-owned desktop Chimera routes', () => {
  async function fixture(
    action: (
      dir: string,
      call: (type: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>,
    ) => Promise<void>,
  ) {
    const base = resolve(tmpdir()),
      dir = await mkdtemp(join(base, 'desktop-chimera-'));
    const frames: { type: string; payload: Record<string, unknown> }[] = [];
    const ws = {
      readyState: 1,
      send(this: unknown, text: string) {
        expect(this).toBe(ws);
        frames.push(JSON.parse(text));
      },
    };
    const handlers = createChimeraRouteHandlers({
      projectDir: () => dir,
      send: (socket, frame) => socket.send(JSON.stringify(frame)),
    });
    const call = async (type: string, payload: Record<string, unknown> = {}) => {
      frames.length = 0;
      await handleChimeraRoute(
        ws as unknown as WebSocket,
        { type, payload: { ...payload, requestId: `request-${type}` } } as never,
        handlers,
      );
      return frames[0]?.payload ?? {};
    };
    try {
      await action(dir, call);
    } finally {
      expect(dir.startsWith(base + sep)).toBe(true);
      await rm(dir, { recursive: true, force: true });
    }
  }
  it('keeps project-wide report filtering independent of the native carrier session', async () => {
    await fixture(async (dir, call) => {
      const store = new JsonlReportStore(dir);
      const base = {
        agentId: 'reviewer',
        reviewerModel: 'fixture-model',
        source: 'chimera' as const,
        reviewStatus: 'success' as const,
        files: [],
        counts: { critical: 0, high: 1, medium: 0, low: 0 },
        totalFindings: 1,
        unparseableCount: 0,
        rawText: '# Fixture review',
      };
      await store.persist({ ...base, id: 'report-a', sessionId: 'recorded-session-a' });
      await store.persist({ ...base, id: 'report-b', sessionId: 'recorded-session-b' });
      const control = await call('chimera.reports.query', {
        all: true,
        sessionId: 'recorded-session-a',
      });
      expect((control['reports'] as { reportId: string }[]).map((item) => item.reportId)).toEqual([
        'report-a',
      ]);
      const project = await call('chimera.reports.query', {
        all: true,
        projectWide: true,
        sessionId: 'native-carrier',
      });
      expect(
        (project['reports'] as { reportId: string }[]).map((item) => item.reportId).sort(),
      ).toEqual(['report-a', 'report-b']);
      expect(project['sessionId']).toBe('native-carrier');
    });
  });
  it.each([
    'chimera.reports.list',
    'chimera.reports.query',
    'chimera.report.get',
    'chimera.report.transition',
    'chimera.report.add_note',
    'chimera.finding.transition',
  ])('correlates real %s acknowledgements and refusals', async (type) => {
    await fixture(async (_dir, call) => {
      const payload = await call(type, { all: true });
      expect(payload['requestId']).toBe(`request-${type}`);
      if (!type.startsWith('chimera.reports.'))
        expect(payload['error']).toEqual(expect.any(String));
    });
  });
  it('does not report an unreadable store as an empty successful catalog', async () => {
    const base = resolve(tmpdir()),
      dir = await mkdtemp(join(base, 'desktop-chimera-error-'));
    try {
      await mkdir(join(dir, 'review-reports.jsonl'));
      const frames: { payload: Record<string, unknown> }[] = [];
      const handlers = createChimeraRouteHandlers({
        projectDir: () => dir,
        send: (_ws, message) => frames.push(message as never),
      });
      await handlers.listReports({} as WebSocket, {
        type: 'chimera.reports.query',
        payload: { all: true },
      });
      expect(frames[0]?.payload['error']).toEqual(expect.any(String));
    } finally {
      expect(dir.startsWith(base + sep)).toBe(true);
      await rm(dir, { recursive: true, force: true });
    }
  });
});
