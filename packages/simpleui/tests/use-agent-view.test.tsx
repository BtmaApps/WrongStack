// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAgentView } from '../src/hooks/use-agent-view.js';
import type { ChatMessage, ToolCallInfo } from '../src/types.js';

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

type AgentViewOptions = Parameters<typeof useAgentView>[0];

function mountAgentView() {
  const holder: { current: ReturnType<typeof useAgentView> | null } = { current: null };
  let currentOptions: AgentViewOptions;
  function Probe(): null {
    holder.current = useAgentView(currentOptions);
    return null;
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  return {
    holder,
    render(options: AgentViewOptions): void {
      currentOptions = options;
      act(() => root.render(<Probe />));
    },
  };
}

function baseOptions(overrides: Partial<AgentViewOptions> = {}): AgentViewOptions {
  return {
    running: false,
    messages: [] as ChatMessage[],
    toolCalls: [] as ToolCallInfo[],
    groupedModels: [] as unknown as AgentViewOptions['groupedModels'],
    showModelReasoning: true,
    ...overrides,
  };
}

describe('useAgentView — projections', () => {
  it('filters thinking blocks only when reasoning display is off', () => {
    const { holder, render } = mountAgentView();
    const messages = [
      { id: 'm1', role: 'thinking', text: 'plan', streaming: false },
      { id: 'm2', role: 'user', text: 'kept', streaming: false },
    ] as unknown as ChatMessage[];

    render(baseOptions({ messages, showModelReasoning: true }));
    expect(holder.current!.displayMessages).toHaveLength(2);

    render(baseOptions({ messages, showModelReasoning: false }));
    const shown = holder.current!.displayMessages;
    expect(shown).toHaveLength(1);
    expect(shown[0]!.role).toBe('user');
  });

  it('shows the leader tool calls on the leader lane', () => {
    const { holder, render } = mountAgentView();
    const toolCalls = [
      { id: 't1', name: 'read', input: {}, status: 'done' },
    ] as unknown as ToolCallInfo[];

    render(baseOptions({ toolCalls }));
    // No subagents exist, so the leader tab is selected: identity passes
    // straight through.
    expect(holder.current!.selectedToolCalls).toBe(toolCalls);
    expect(holder.current!.leaderSelected).toBe(true);
  });

  it('flattens grouped models into lane pairs, dropping empty providers', () => {
    const { holder, render } = mountAgentView();
    const groupedModels = [
      ['openai', [{ id: 'gpt-4o', name: 'GPT-4o' }]],
      ['anthropic', []],
    ] as unknown as AgentViewOptions['groupedModels'];

    render(baseOptions({ groupedModels }));
    expect(holder.current!.subagentModelOptions).toEqual([{ provider: 'openai', model: 'gpt-4o' }]);
  });

  it('aggregates file edits from tool calls', () => {
    const { holder, render } = mountAgentView();
    render(baseOptions());
    expect(holder.current!.fileEditSummary.files).toEqual([]);
    expect(holder.current!.fileEdits).toEqual([]);
  });
});
