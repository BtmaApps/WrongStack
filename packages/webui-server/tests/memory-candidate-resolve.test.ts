/**
 * The review queue's accept button on a hygiene/triage `memory_review`
 * proposal must resolve the proposal against its target memory. The store
 * refuses `acceptCandidate` for review proposals, so routing accept there left
 * every deletion/archive proposal impossible to apply from the WebUI.
 */
import { describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { handleSageCandidateResolve } from '../src/server/memory-handlers.js';

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

describe('memory.sage.candidateResolve', () => {
  it.each([
    ['archive', 'archive'],
    ['delete', 'delete'],
    ['investigate', 'delete'],
  ])('accept on a %s review proposal resolves with %s', async (suggested, decision) => {
    const resolveCandidate = vi.fn(async () => ({
      candidateId: 'c1',
      decision,
      applied: true,
    }));
    const acceptCandidate = vi.fn();
    const surface = {
      listCandidates: async () => [
        { id: 'c1', kind: 'memory_review', status: 'pending', suggestedAction: suggested },
      ],
      resolveCandidate,
      acceptCandidate,
    };
    const { ws, sent } = fakeWs();

    await handleSageCandidateResolve(
      ws,
      { payload: { candidateId: 'c1', action: 'accept' } },
      portWith(surface),
    );

    expect(resolveCandidate).toHaveBeenCalledWith('c1', decision, undefined);
    expect(acceptCandidate).not.toHaveBeenCalled();
    expect(sent[0]?.payload).toMatchObject({
      candidate: { id: 'c1', status: 'accepted' },
      resolvedAction: 'accept',
      applied: true,
    });
  });

  it('accept on an ordinary proposal still stores it as a memory', async () => {
    const acceptCandidate = vi.fn(async () => ({ id: 'mem_1', status: 'active' }));
    const resolveCandidate = vi.fn();
    const surface = {
      listCandidates: async () => [{ id: 'c2', kind: 'fact', status: 'pending' }],
      resolveCandidate,
      acceptCandidate,
    };
    const { ws, sent } = fakeWs();

    await handleSageCandidateResolve(
      ws,
      { payload: { candidateId: 'c2', action: 'accept' } },
      portWith(surface),
    );

    expect(acceptCandidate).toHaveBeenCalledWith('c2');
    expect(resolveCandidate).not.toHaveBeenCalled();
    expect(sent[0]?.payload).toMatchObject({ candidate: { id: 'mem_1', status: 'active' } });
  });

  it('surfaces a resolution that failed to mutate its target', async () => {
    const surface = {
      listCandidates: async () => [
        { id: 'c3', kind: 'memory_review', status: 'pending', suggestedAction: 'delete' },
      ],
      resolveCandidate: async () => ({
        candidateId: 'c3',
        decision: 'delete',
        applied: false,
        error: 'target locked',
      }),
      acceptCandidate: vi.fn(),
    };
    const { ws, sent } = fakeWs();

    await handleSageCandidateResolve(
      ws,
      { payload: { candidateId: 'c3', action: 'accept' } },
      portWith(surface),
    );

    expect(String(sent[0]?.payload.error)).toContain('target locked');
  });
});
