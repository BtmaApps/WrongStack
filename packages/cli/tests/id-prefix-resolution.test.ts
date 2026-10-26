// `/coordinator claim`, `/fleet retry` and `/fleet kill` resolve an id prefix only when
// it names exactly one target; an ambiguous or truncated id used to act on the wrong one(s).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { buildCoordinatorCommand } from '../src/slash-commands/coordinator.js';
import { createFleetCommandHandlers } from '../src/wiring/fleet-command-handlers.js';

const TASKS = [
  { id: 'abc11111-aaaa', title: 'first', priority: 'normal', tags: [] },
  { id: 'abc22222-bbbb', title: 'second', priority: 'normal', tags: [] },
  { id: 'abc', title: 'exact-short', priority: 'normal', tags: [] },
];

describe('/coordinator claim id resolution', () => {
  const claim = vi.fn(async (id: string) => ({ id, description: `do ${id}` }));
  const ambiguousCmd = buildCoordinatorCommand({
    onCoordinatorTasks: async () => TASKS.slice(0, 2),
    onCoordinatorClaim: claim,
  } as never);
  const exactCmd = buildCoordinatorCommand({
    onCoordinatorTasks: async () => TASKS,
    onCoordinatorClaim: claim,
  } as never);

  it('ambiguous prefix refused, repeatedly, with no claim', async () => {
    claim.mockClear();
    for (let i = 0; i < 3; i++) {
      const out = await ambiguousCmd.run('claim abc');
      expect(out?.message).toMatch(/matches 2 coordinator tasks/);
    }
    expect(claim).not.toHaveBeenCalled();
  });

  it('exact id wins over prefix siblings; unique prefix and unknown', async () => {
    claim.mockClear();
    await exactCmd.run('claim abc');
    expect(claim.mock.calls[0]?.[0]).toBe('abc');
    await exactCmd.run('claim abc1');
    expect(claim.mock.calls[1]?.[0]).toBe('abc11111-aaaa');
    const miss = await exactCmd.run('claim zzz');
    expect(miss?.message).toMatch(/No pending coordinator task matched/);
    expect(claim).toHaveBeenCalledTimes(2);
  });
});

describe('/fleet retry id resolution', () => {
  const root = mkdtempSync(join(tmpdir(), 'fleet-retry-prefix-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, 'director-state.json'),
    JSON.stringify({
      version: 1,
      subagents: [{ id: 'sub-1', name: 'w', provider: 'p', model: 'm' }],
      tasks: [
        { taskId: 'abc11111-aaaa', status: 'running', subagentId: 'sub-1', description: 'one' },
        { taskId: 'abc22222-bbbb', status: 'pending', subagentId: 'sub-1', description: 'two' },
        { taskId: 'abc', status: 'pending', subagentId: 'sub-1', description: 'three' },
        { taskId: 'done-1', status: 'completed', subagentId: 'sub-1', description: 'x' },
      ],
    }),
  );
  const spawn = vi.fn(async () => 'new-sub');
  const assign = vi.fn(async () => 'new-task');
  const handlers = createFleetCommandHandlers({
    multiAgentHost: { ensureDirector: async () => ({ spawn, assign }) },
    getDirector: () => null,
    events: {},
    getSessionId: () => '',
    fleetRoot: root,
  } as never);

  it('ambiguous prefix refused with no spawn', async () => {
    spawn.mockClear();
    const out = await handlers.onFleetRetry!('ab');
    expect(String(out)).toMatch(/matches 3 interrupted tasks/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('exact id retries only that task even when it prefixes others', async () => {
    spawn.mockClear();
    const out = await handlers.onFleetRetry!('abc');
    expect(String(out)).toMatch(/Retried 1 task/);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('unique prefix, unknown, and all', async () => {
    spawn.mockClear();
    await handlers.onFleetRetry!('abc2');
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(String(await handlers.onFleetRetry!('nope'))).toMatch(/No interrupted task matched/);
    spawn.mockClear();
    expect(String(await handlers.onFleetRetry!('all'))).toMatch(/Retried 3 tasks/);
    expect(spawn).toHaveBeenCalledTimes(3);
  });
});

describe('/fleet kill id resolution', () => {
  // The host's kill() returns true whenever a director exists, and the
  // coordinator's stop() is a silent no-op for an unknown id.
  function setup(live: Array<{ subagentId: string; status: string }>) {
    const stopped: string[] = [];
    const handlers = createFleetCommandHandlers({
      multiAgentHost: {
        status: () => ({ summary: '', live, pending: [], completed: [] }),
        kill: async (id: string) => {
          if (live.some((agent) => agent.subagentId === id)) stopped.push(id);
          return true;
        },
      },
      getDirector: () => null,
      events: { emit() {} },
      getSessionId: () => '',
      fleetRoot: '',
    } as never);
    return { stopped, kill: (target: string) => handlers.onFleet!('kill', target) };
  }

  it('stops the subagent behind the 8-char id that status views print', async () => {
    const { stopped, kill } = setup([{ subagentId: 'coder-1a2b3c4d5e6f', status: 'running' }]);
    expect(await kill('coder-1a')).toBe('Sent stop signal to coder-1a2b3c4d5e6f.');
    expect(stopped).toEqual(['coder-1a2b3c4d5e6f']);
  });

  it('never reports a stop for an ambiguous or unknown id', async () => {
    const { stopped, kill } = setup([
      { subagentId: 'coder-1a2b3c4d5e6f', status: 'running' },
      { subagentId: 'coder-1a99ffffeeee', status: 'idle' },
    ]);
    expect(await kill('coder-1a')).toMatch(/matches 2 subagents/);
    expect(await kill('zzz')).toMatch(/No subagent matched/);
    expect(stopped).toEqual([]);
  });
});
