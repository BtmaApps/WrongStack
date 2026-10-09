import { beforeEach, describe, expect, it } from 'vitest';
import { buildAgentTabs, resetAgentNameCache } from '../src/lib/agent-model.js';
import type { SimpleSubagent } from '../src/types.js';

const agent = (id: string, task?: string): SimpleSubagent => ({
  id,
  name: id,
  status: 'running',
  ...(task ? { task } : {}),
});
const workerNames = (agents: SimpleSubagent[]): string[] =>
  buildAgentTabs(agents, true)
    .filter((tab) => !tab.isLeader)
    .map((tab) => tab.name);

beforeEach(() => {
  resetAgentNameCache();
});

describe('agent display names are unique', () => {
  it('separates workers that share a task-derived label', () => {
    const names = workerNames([
      agent('aaaa1111', 'Run tests'),
      agent('bbbb2222', 'Run tests'),
      agent('cccc3333', 'Run tests'),
    ]);
    expect(new Set(names).size).toBe(3);
    expect(names[0]).toBe('Run tests');
  });

  it('separates ids that share their first four characters', () => {
    const names = workerNames([
      agent('abcd0001', 'Same'),
      agent('abcd0002', 'Same'),
      agent('abcd0003', 'Same'),
    ]);
    expect(new Set(names).size).toBe(3);
  });

  it('never reuses a pool name while the worker holding it is listed', () => {
    for (const count of [31, 70]) {
      resetAgentNameCache();
      const names = workerNames(
        Array.from({ length: count }, (_, index) => agent(`id-${String(index).padStart(4, '0')}`)),
      );
      expect(new Set(names).size).toBe(count);
    }
  });

  it('keeps a worker name stable across calls and list reordering', () => {
    const list = [agent('aaaa1111', 'Run tests'), agent('bbbb2222', 'Run tests')];
    const first = workerNames(list);
    const second = workerNames([...list].reverse()).reverse();
    expect(second).toEqual(first);
  });
});
