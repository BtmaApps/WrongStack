import { expect, it } from 'vitest';
import { resolveClients } from '../../src/components/OfficeMapCanvas/resolve.js';
import type { LiveSession } from '../../src/stores/monitor-store.js';

it('keeps session node identities unique and stable across shared, missing and replaced PIDs', () => {
  const session = (sessionId: string, pid?: number): LiveSession => ({
    sessionId,
    ...(pid === undefined ? {} : { pid }),
    clientType: 'webui',
    agents: [{ id: 'leader', name: 'Leader', status: 'running' }],
  });
  const resolve = (sessions: LiveSession[]) => resolveClients(sessions, new Map());
  for (const pid of [undefined, 42]) {
    const input = [session('first', pid), session('second', pid)];
    const clients = resolve(input);
    expect(new Set(clients.map((client) => client.id)).size).toBe(2);
    expect(
      new Set(clients.flatMap((client) => client.agents.map((agent) => agent.officeId))).size,
    ).toBe(2);
    expect(resolve([...input].reverse()).map((client) => client.id)).toEqual(
      clients.map((client) => client.id).reverse(),
    );
  }
  expect(resolve([session('first', 100)])[0]?.id).toBe(resolve([session('first', 200)])[0]?.id);
  expect(resolve([])[0]?.id).toBe('client-self');
});
