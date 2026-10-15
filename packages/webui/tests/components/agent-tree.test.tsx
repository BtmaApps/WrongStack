import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentTree } from '../../src/components/agents/AgentTree';
import type { SubagentView } from '../../src/stores/types';

vi.mock('../../src/i18n', () => ({
  useAppTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function agent(
  id: string,
  overrides: Partial<Pick<SubagentView, 'isLeader' | 'provider' | 'model' | 'status'>> = {},
): SubagentView {
  return {
    id,
    name: id,
    status: 'running',
    iteration: 0,
    toolCalls: 0,
    costUsd: 0,
    ctxPct: 0,
    ctxTokens: 0,
    maxContext: 0,
    extensions: 0,
    startedAt: Date.now(),
    toolLog: [],
    sparklineBins: [],
    ...overrides,
  };
}

describe('AgentTree', () => {
  it('renders the announced leader above workers with full provider/model identities', () => {
    const leader = agent('Leader', {
      isLeader: true,
      provider: 'anthropic',
      model: 'claude-sonnet',
    });
    const worker = agent('Worker', {
      provider: 'openai',
      model: 'openai/gpt-5.4',
    });

    render(
      <AgentTree
        agents={[worker, leader]}
        leaderId={leader.id}
        selectedAgentId={worker.id}
        onSelectAgent={() => undefined}
        ariaLabel="Session agents"
      />,
    );

    const tree = screen.getByRole('tree', { name: 'Session agents' });
    const items = screen.getAllByRole('treeitem');
    expect(tree).toBeDefined();
    expect(items).toHaveLength(2);
    expect(items[0]?.getAttribute('aria-level')).toBe('1');
    expect(items[0]?.getAttribute('aria-expanded')).toBe('true');
    expect(items[1]?.getAttribute('aria-level')).toBe('2');
    expect(items[1]?.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('anthropic/claude-sonnet')).toBeDefined();
    expect(screen.getByText('openai/gpt-5.4')).toBeDefined();
    expect(screen.queryByText('openai/openai/gpt-5.4')).toBeNull();
  });

  it('wraps long agent identity and status details instead of clipping or overlapping them', () => {
    const longName = 'agent-with-an-extremely-long-unbroken-name-that-needs-to-wrap';
    const route = 'provider-with-a-long-name/model-with-an-equally-long-unbroken-name';

    render(
      <AgentTree
        agents={[
          agent(longName, {
            provider: 'provider-with-a-long-name',
            model: 'model-with-an-equally-long-unbroken-name',
            status: 'stopped',
          }),
        ]}
        onSelectAgent={() => undefined}
        ariaLabel="Session agents"
      />,
    );

    const item = screen.getByRole('treeitem');
    const name = screen.getByText(longName);
    const model = screen.getByText(route);
    const status = screen.getByText('activity:fleet.statusStopped');

    expect(item.className).toContain('grid-cols-[1.75rem_minmax(0,1fr)]');
    expect(name.className).toContain('[overflow-wrap:anywhere]');
    expect(name.className).not.toContain('truncate');
    expect(name.parentElement?.className).toContain('flex-wrap');
    expect(model.className).toContain('[overflow-wrap:anywhere]');
    expect(status.className).not.toContain('ml-auto');
  });

  it('uses roving focus and tree arrow keys before activating with Enter', () => {
    const onSelectAgent = vi.fn();
    const leader = agent('Leader', { isLeader: true });
    const firstWorker = agent('Worker A');
    const secondWorker = agent('Worker B');

    render(
      <AgentTree
        agents={[leader, firstWorker, secondWorker]}
        leaderId={leader.id}
        onSelectAgent={onSelectAgent}
        ariaLabel="Session agents"
      />,
    );

    const [leaderItem, firstWorkerItem, secondWorkerItem] = screen.getAllByRole('treeitem');
    leaderItem?.focus();
    fireEvent.keyDown(leaderItem!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(firstWorkerItem);

    fireEvent.keyDown(firstWorkerItem!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(secondWorkerItem);

    fireEvent.keyDown(secondWorkerItem!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(leaderItem);

    fireEvent.keyDown(leaderItem!, { key: 'ArrowLeft' });
    expect(leaderItem?.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('group')).toBeNull();
    fireEvent.keyDown(leaderItem!, { key: 'ArrowRight' });
    expect(leaderItem?.getAttribute('aria-expanded')).toBe('true');

    const expandedSecondWorkerItem = screen.getAllByRole('treeitem')[2];
    fireEvent.keyDown(leaderItem!, { key: 'End' });
    expect(document.activeElement).toBe(expandedSecondWorkerItem);
    fireEvent.keyDown(expandedSecondWorkerItem!, { key: 'Enter' });
    expect(onSelectAgent).toHaveBeenCalledWith(secondWorker);
  });

  it('does not invent a hierarchy before a leader is announced', () => {
    render(
      <AgentTree
        agents={[agent('Worker A'), agent('Worker B')]}
        onSelectAgent={() => undefined}
        ariaLabel="Session agents"
      />,
    );

    const items = screen.getAllByRole('treeitem');
    expect(items.map((item) => item.getAttribute('aria-level'))).toEqual(['1', '1']);
    expect(screen.queryByRole('group')).toBeNull();
  });
});
