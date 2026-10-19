import { describe, expect, it, vi } from 'vitest';
import { handleSageDoctor } from '../src/server/memory-doctor-handler.js';
import { handleMemoryRoute } from '../src/server/memory-routes.js';
import { WebSocket } from '../src/ws-runtime.js';

function fakeWs() {
  const sent: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const ws = {
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,
    send: (data: string) => sent.push(JSON.parse(data)),
  } as unknown as WebSocket;
  return { ws, sent };
}

function portWith(surface: Record<string, unknown>) {
  return { getCapability: () => surface } as never;
}

const report = {
  generatedAt: '2026-10-19T00:00:00.000Z',
  metrics: { total: 1, active: 1, byStatus: { active: 1 }, edges: 0 },
  checks: [{ id: 'graph-hubs', title: 'Hubs', severity: 'warn', summary: 's', fix: 'graph-hubs' }],
};

describe('memory.sage.doctor', () => {
  it('routes validated fix ids and the configured hygiene options to the surface', async () => {
    const doctor = vi.fn(async () => ({
      ...report,
      fixesApplied: [{ fix: 'graph-hubs', changed: 3, detail: 'removed 3 edges' }],
    }));
    const { ws, sent } = fakeWs();
    await handleSageDoctor(
      ws,
      { payload: { fix: ['graph-hubs', 'hygiene', 'graph-hubs'], requestId: 'req-1' } },
      portWith({ doctor }),
      () => ({ Sage: { hygiene: { retentionDays: 9 } } }) as never,
    );
    expect(doctor).toHaveBeenCalledWith({
      fix: ['graph-hubs', 'hygiene'],
      hygieneOptions: expect.objectContaining({ retentionDays: 9 }),
    });
    expect(sent[0]?.type).toBe('memory.sage.doctor');
    expect(sent[0]?.payload.requestId).toBe('req-1');
    const sentReport = sent[0]?.payload.report as { fixesApplied?: unknown[] } | undefined;
    expect(sentReport?.fixesApplied).toHaveLength(1);
  });

  it('runs a read-only report without fix and without config', async () => {
    const doctor = vi.fn(async () => report);
    const { ws, sent } = fakeWs();
    await handleSageDoctor(ws, { payload: {} }, portWith({ doctor }));
    expect(doctor).toHaveBeenCalledWith({});
    expect(sent[0]?.payload.report).toEqual(report);
  });

  it('rejects unknown fix ids before touching the store', async () => {
    const doctor = vi.fn(async () => report);
    const { ws, sent } = fakeWs();
    await handleSageDoctor(
      ws,
      { payload: { fix: ['graph-hubs', 'drop-tables'], requestId: 'req-2' } },
      portWith({ doctor }),
    );
    expect(doctor).not.toHaveBeenCalled();
    expect(sent[0]?.payload.error).toContain('drop-tables');
    expect(sent[0]?.payload.requestId).toBe('req-2');
  });

  it('errors when the surface has no doctor', async () => {
    const { ws, sent } = fakeWs();
    await handleSageDoctor(ws, { payload: { requestId: 'req-3' } }, portWith({}));
    expect(sent[0]?.payload.error).toMatch(/requires the SAGE/);
    expect(sent[0]?.payload.requestId).toBe('req-3');
  });

  it('errors clearly when an old daemon returns a report without checks', async () => {
    const { ws, sent } = fakeWs();
    await handleSageDoctor(
      ws,
      { payload: {} },
      portWith({ doctor: async () => ({ generatedAt: 'x' }) }),
    );
    expect(sent[0]?.payload.error).toContain('predates `doctor`');
  });

  it('is reachable through the memory route with the host config', async () => {
    const doctor = vi.fn(async () => report);
    const { ws, sent } = fakeWs();
    const handled = await handleMemoryRoute(
      {
        getMemoryStore: () => portWith({ doctor }),
        getConfig: () => ({}) as never,
        send: (_ws, message) => sent.push(message as never),
        sendResult: () => {},
      },
      ws,
      { type: 'memory.sage.doctor', payload: { fix: ['fts-rebuild'] } } as never,
    );
    expect(handled).toBe(true);
    expect(doctor).toHaveBeenCalledWith(
      expect.objectContaining({ fix: ['fts-rebuild'], hygieneOptions: expect.any(Object) }),
    );
  });
});
