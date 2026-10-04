import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expectDefined } from '@wrongstack/core/utils/expect-defined';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentDetailSection } from '../../src/components/agents/AgentDetailSection.js';
import {
  AgentTabs,
  shouldAutoClearSubagentFocus,
} from '../../src/components/ChatView/AgentTabs.js';
import { SubagentTranscriptView } from '../../src/components/ChatView/SubagentTranscriptView.js';
import { taskBriefPreview } from '../../src/lib/task-brief-preview.js';
import type { AgentTranscriptEntry, SubagentView } from '../../src/stores/index.js';
import { useChatStore, useFleetStore, useUIStore } from '../../src/stores/index.js';
import { SESSION_DEFAULT_LANE_ID, useSessionLanes } from '../../src/stores/session-lanes.js';

const mockSendAbort = vi.fn();
vi.mock('../../src/lib/ws-client.js', () => ({
  getWSClient: () => ({
    sendAbort: mockSendAbort,
  }),
}));

function makeAgent(id: string, overrides: Partial<{ name: string; status: string }> = {}) {
  return {
    id,
    name: overrides.name ?? id,
    status: overrides.status ?? 'running',
    iteration: 0,
    toolCalls: 0,
    costUsd: 0,
    ctxPct: 0,
    ctxTokens: 0,
    maxContext: 0,
    extensions: 0,
    startedAt: Date.now(),
    toolLog: [],
    sparklineBins: Array(12).fill(0),
  } as SubagentView;
}

function entry(
  partial: Partial<AgentTranscriptEntry> & { kind: AgentTranscriptEntry['kind'] },
): AgentTranscriptEntry {
  return {
    id: `e_${Math.random().toString(36).slice(2, 8)}`,
    subagentId: 's1',
    agentName: 'Alpha',
    content: partial.content ?? '',
    kind: partial.kind,
    iteration: partial.iteration ?? 1,
    ts: new Date().toISOString(),
    toolName: partial.toolName,
    toolOk: partial.toolOk,
  };
}

/**
 * AgentTabs ↔ ui-store focus wiring and the read-only subagent transcript.
 *
 * Acceptance anchors:
 * - Tab strip lists the leader once plus each subagent; clicking moves
 *   `subagentChatFocusId` (null = leader).
 * - The strip disappears when there is nothing to switch between.
 * - SubagentTranscriptView renders every entry kind and contains NO form
 *   controls — subagent history is strictly read-only (ChatView hides the
 *   input area entirely in this mode).
 */
describe('subagent chat tabs', () => {
  beforeEach(async () => {
    // Pre-warm the lazy markdown chunk (LazyMarkdown = React.lazy(() =>
    // import('react-markdown'))). Without this any text entry renders empty
    // until the chunk loads, and under full-suite worker contention that can
    // exceed waitFor's 1s default. Keep this — the component is otherwise
    // correct; pre-warming makes the render deterministic.
    await import('react-markdown');
    useFleetStore.setState({
      agents: new Map(),
      agentTranscripts: new Map(),
      leaderId: undefined,
      eventTimeline: [],
      agentTimeline: [],
    });
    useSessionLanes.setState({ activeSessionId: SESSION_DEFAULT_LANE_ID, lanes: {} });
    useUIStore.setState({ subagentChatFocusId: null });
  });

  afterEach(() => cleanup());

  it('lists leader + subagents and routes clicks through subagentChatFocusId', () => {
    const agents = new Map([
      ['ldr', makeAgent('ldr', { name: 'Main' })],
      ['s1', makeAgent('s1', { name: 'Alpha' })],
      ['s2', makeAgent('s2', { name: 'Beta' })],
    ]);
    useFleetStore.setState({ agents, leaderId: 'ldr' });

    render(<AgentTabs />);

    // Leader appears exactly once even though it is also in the roster.
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(3);

    fireEvent.click(screen.getByRole('tab', { name: /Beta/ }));
    expect(useUIStore.getState().subagentChatFocusId).toBe('s2');
    expect(useUIStore.getState().currentView).toBe('chat');

    // First tab is the leader — selecting it returns to the normal chat.
    fireEvent.click(screen.getAllByRole('tab')[0]!);
    expect(useUIStore.getState().subagentChatFocusId).toBeNull();

    // Active state follows the focus field.
    act(() => {
      useUIStore.setState({ subagentChatFocusId: 's1' });
    });
    expect(screen.getByRole('tab', { name: /Alpha/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('collapses subagents beyond the inline budget into the +N overflow trigger', () => {
    const agents = new Map<string, SubagentView>([
      ['ldr', makeAgent('ldr', { name: 'Main' })],
      ...['s1', 's2', 's3', 's4', 's5'].map((id) => [id, makeAgent(id)] as const),
    ]);
    useFleetStore.setState({ agents, leaderId: 'ldr' });

    render(<AgentTabs />);

    // Leader + the first 3 subagents stay inline as tabs; the remaining 2
    // live behind the "+2" overflow trigger so the bar cannot overflow into
    // the Stop/summary cluster.
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    const trigger = screen.getByTestId('agent-tabs-overflow');
    expect(trigger.textContent).toContain('+2');

    // Focusing an agent that lives in the overflow keeps it visible: the
    // trigger takes the active styling while collapsed.
    act(() => {
      useUIStore.setState({ subagentChatFocusId: 's4' });
    });
    expect(trigger.getAttribute('class')).toContain('bg-primary/15');
  });

  it('offers a close affordance on finished agent tabs only, and removing clears the roster entry', () => {
    const agents = new Map<string, SubagentView>([
      ['ldr', makeAgent('ldr', { name: 'Main' })],
      ['s1', makeAgent('s1', { name: 'Alpha', status: 'completed' })],
      ['s2', makeAgent('s2', { name: 'Beta' })], // running — never closable
    ]);
    useFleetStore.setState({
      agents,
      leaderId: 'ldr',
      agentTranscripts: new Map([['s1', [entry({ kind: 'status', content: 'done' })]]]),
    });

    render(<AgentTabs />);

    // Only the finished tab carries the close affordance.
    const closeButtons = screen.getAllByTestId('agent-tab-close');
    expect(closeButtons).toHaveLength(1);

    // Selecting the other tab first proves closing does not steal focus.
    fireEvent.click(screen.getByRole('tab', { name: /Beta/ }));
    expect(useUIStore.getState().subagentChatFocusId).toBe('s2');

    fireEvent.click(closeButtons[0]!);
    expect(useFleetStore.getState().agents.has('s1')).toBe(false);
    // The transcript follows the agent out (same contract as clear-finished).
    expect(useFleetStore.getState().agentTranscripts.has('s1')).toBe(false);
    // The ✕ removed the agent without switching the focused tab.
    expect(useUIStore.getState().subagentChatFocusId).toBe('s2');
    expect(screen.queryByRole('tab', { name: /Alpha/ })).toBeNull();
  });

  // Regression guard for the blocking a11y finding: the close affordance was a
  // `span role="button" tabIndex={-1}` nested in the tab (a real <button>
  // inside a <button> is invalid HTML, so the span stood in). tabIndex={-1}
  // put it OUT of the tab order entirely, which is why the suite above only
  // ever fireEvent.click()ed it and nothing caught the keyboard gap. It is now
  // a native <button>, and the tab hosting it is a focusable `role="tab"`.
  it('keeps the tab close affordance keyboard-reachable', () => {
    const agents = new Map<string, SubagentView>([
      ['ldr', makeAgent('ldr', { name: 'Main' })],
      ['s1', makeAgent('s1', { name: 'Alpha', status: 'completed' })],
      ['s2', makeAgent('s2', { name: 'Beta' })], // running — never closable
    ]);
    useFleetStore.setState({
      agents,
      leaderId: 'ldr',
      agentTranscripts: new Map([['s1', [entry({ kind: 'status', content: 'done' })]]]),
    });

    render(<AgentTabs />);

    const close = screen.getAllByTestId('agent-tab-close')[0]!;

    // A native <button> is in the tab order by default: no `tabindex`
    // override, and .tabIndex resolves to 0 rather than -1.
    expect(close.tagName).toBe('BUTTON');
    expect(close.getAttribute('tabindex')).toBeNull();
    expect((close as HTMLElement).tabIndex).toBe(0);
    expect((close as HTMLButtonElement).disabled).toBe(false);
    // Keyboard/AT users need a name for the action, not just a glyph.
    expect(close.getAttribute('aria-label')).toBeTruthy();

    // The hosting tab is itself focusable, so Tab can walk tab → close.
    const tab = close.closest('[role="tab"]')!;
    expect((tab as HTMLElement).tabIndex).toBe(0);

    // Enter on the CLOSE button must not bubble into the tab's own Enter
    // handler and select the agent while removing it.
    fireEvent.keyDown(close, { key: 'Enter' });
    expect(useUIStore.getState().subagentChatFocusId).toBeNull();

    // The tab itself is keyboard-activatable (it is a div, not a button, so
    // nothing activates it for free any more).
    fireEvent.keyDown(tab, { key: 'Enter' });
    expect(useUIStore.getState().subagentChatFocusId).toBe('s1');

    // Space activates it too — move away first so this is a real transition,
    // not an idempotent re-selection of the already-focused tab.
    fireEvent.click(screen.getByRole('tab', { name: /Beta/ }));
    expect(useUIStore.getState().subagentChatFocusId).toBe('s2');

    fireEvent.keyDown(tab, { key: ' ' });
    expect(useUIStore.getState().subagentChatFocusId).toBe('s1');
  });

  it('keeps the bar structural with a large fleet: inline budget, +9 trigger, summary pill intact', () => {
    const agents = new Map<string, SubagentView>([
      ['ldr', makeAgent('ldr', { name: 'Main' })],
      ...['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12'].map(
        (id) => [id, makeAgent(id)] as const,
      ),
    ]);
    useFleetStore.setState({ agents, leaderId: 'ldr' });

    render(<AgentTabs />);

    // The collapse is what keeps the bar from overflowing: leader + 3 tabs,
    // the rest behind "+9", and the right-hand Stop/summary cluster still
    // present in the same bar (it must never be pushed out of view).
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.getByTestId('agent-tabs-overflow').textContent).toContain('+9');
    expect(screen.getByText(/Waiting for next prompt/i)).toBeTruthy();
  });

  it('renders Stop button in summary pill when isLoading is true and clicks sendAbort', () => {
    mockSendAbort.mockClear();
    const agents = new Map([
      ['ldr', makeAgent('ldr', { name: 'Main' })],
      ['s1', makeAgent('s1', { name: 'Alpha' })],
    ]);
    useFleetStore.setState({ agents, leaderId: 'ldr' });
    useChatStore.setState({ isLoading: true });

    render(<AgentTabs />);

    const stopBtn = screen.getByRole('button', { name: /abort|stop/i });
    expect(stopBtn).toBeDefined();

    fireEvent.click(stopBtn);
    expect(mockSendAbort).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().isLoading).toBe(false);
  });

  it('does not throw when a subagent has a non-canonical status', () => {
    const agents = new Map([
      ['ldr', makeAgent('ldr', { name: 'Main' })],
      ['s1', makeAgent('s1', { name: 'Alpha', status: 'cancelled' })],
    ]);
    useFleetStore.setState({ agents, leaderId: 'ldr' });
    expect(() => render(<AgentTabs />)).not.toThrow();
    expect(screen.getByRole('tab', { name: /Alpha/ })).toBeTruthy();
  });

  it('clips a long subagent description on the tab tooltip', () => {
    const longTask = 'Review the session.\n'.repeat(80);
    const agents = new Map([
      ['ldr', makeAgent('ldr', { name: 'Main' })],
      ['s1', { ...makeAgent('s1', { name: 'Alpha' }), description: longTask }],
    ]);
    useFleetStore.setState({ agents, leaderId: 'ldr' });

    render(<AgentTabs />);
    const tab = screen.getByRole('tab', { name: /Alpha/ });
    expect(tab.getAttribute('title')).toBe(taskBriefPreview(longTask, 180));
    expect((tab.getAttribute('title') ?? '').length).toBeLessThan(200);
  });

  it('keeps the AGENTS strip visible when only the leader exists', () => {
    const agents = new Map([['ldr', makeAgent('ldr', { name: 'Solo' })]]);
    useFleetStore.setState({ agents, leaderId: 'ldr' });

    render(<AgentTabs />);
    expect(screen.getByRole('tablist', { name: /Switch agent view/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Solo/ })).toBeTruthy();
    expect(screen.getByText('AGENTS')).toBeTruthy();
  });

  it('renders the full transcript with the leader chat presentation', async () => {
    const agents = new Map([['s1', makeAgent('s1', { name: 'Alpha' })]]);
    const entries = [
      entry({ kind: 'text', content: 'Final answer with **markdown**' }),
      entry({ kind: 'thinking', content: 'pondering the task deeply' }),
      entry({
        kind: 'tool_use',
        content: 'read_file({"path":"a.ts"})\n{\n  "path": "a.ts"\n}',
        toolName: 'read_file',
      }),
      entry({
        kind: 'tool_result',
        content: 'Completed read_file (12ms)\nfile body',
        toolName: 'read_file',
        toolOk: true,
      }),
      entry({ kind: 'error', content: 'provider exploded' }),
      entry({ kind: 'status', content: 'iteration 3 complete' }),
    ];
    useFleetStore.setState({
      agents,
      agentTranscripts: new Map([['s1', entries]]),
    });

    render(<SubagentTranscriptView agentId="s1" />);
    const root = screen.getByTestId('subagent-transcript-view');

    // Read-only contract: the subagent pane must never contain an editor.
    expect(root.querySelector('textarea')).toBeNull();
    expect(root.querySelector('input')).toBeNull();

    // Leader-parity contract: the agent's reasoning, replies and tool calls
    // render through the SAME components the leader screen uses — the
    // reasoning card, the assistant bubble, and the terminal-ledger tool card.
    await waitFor(() => expect(root.textContent).toContain('Final answer'));
    expect(root.textContent).toContain('pondering the task deeply');
    expect(root.textContent).toContain('read_file');
    expect(root.textContent).toContain('provider exploded');
    expect(root.textContent).toContain('iteration 3 complete');

    // The tool result is folded into the SAME card as its call, so a finished
    // call reads as one completed ledger entry rather than two events.
    expect(root.textContent).toContain('Succeeded');

    // The card is collapsed exactly as on the leader screen, so the input and
    // output live behind its expander.
    const ledger = root.querySelector('.ws-ledger');
    expect(ledger).not.toBeNull();
    fireEvent.click(expectDefined(ledger).querySelector('button')!);
    await waitFor(() => expect(root.textContent).toContain('file body'));

    // A subagent is not the leader's conversation, so the actions that would
    // act on THAT conversation must not be offered here.
    expect(root.textContent).not.toContain('Pin');
    expect(screen.queryByRole('button', { name: /regenerate|retry/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /continue/i })).toBeNull();
  });

  it('leaves a tool call with no result rendered as in-flight', async () => {
    const agents = new Map([['s1', makeAgent('s1', { name: 'Alpha' })]]);
    const entries = [
      entry({
        kind: 'tool_use',
        content: 'bash({"command":"ls"})\n{"command":"ls"}',
        toolName: 'bash',
      }),
    ];
    useFleetStore.setState({ agents, agentTranscripts: new Map([['s1', entries]]) });

    render(<SubagentTranscriptView agentId="s1" />);
    const root = screen.getByTestId('subagent-transcript-view');

    // Matches how the leader renders a call whose result has not landed yet.
    await waitFor(() => expect(root.textContent).toContain('Running'));
  });

  it('shows the empty state for an agent without history', () => {
    const agents = new Map([['s1', makeAgent('s1', { name: 'Alpha' })]]);
    useFleetStore.setState({ agents });

    render(<SubagentTranscriptView agentId="s1" />);
    const root = screen.getByTestId('subagent-transcript-view');
    expect(root.querySelector('textarea')).toBeNull();
    expect(root.querySelector('input')).toBeNull();
  });

  it('collapses a long task brief to one line and expands it in a modal', async () => {
    const longTask = `Review the session diff.\nScope: everything.\nOut of scope: nothing.`.repeat(
      40,
    );
    const agents = new Map([
      ['s1', { ...makeAgent('s1', { name: 'Alpha' }), description: longTask }],
    ]);
    useFleetStore.setState({ agents });

    render(<SubagentTranscriptView agentId="s1" />);
    const root = screen.getByTestId('subagent-transcript-view');
    const preview = screen.getByTestId('subagent-task-preview');

    // Compact contract: the pin holds a short one-line preview, never the
    // full multi-KB brief. The complete text lives behind the modal.
    expect(preview.textContent).toBe(taskBriefPreview(longTask));
    expect(preview.textContent!.length).toBeLessThan(160);
    expect(root.textContent).not.toContain(longTask);
    expect(root.querySelector('[data-testid="subagent-task-strip"]')?.className).toContain(
      'max-h-8',
    );

    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /show full task brief/i }));
    const dialog = await screen.findByRole('dialog');
    expect(screen.getByTestId('subagent-task-full').textContent).toBe(longTask);
    expect(dialog.textContent).toContain('Review the session diff.');
  });

  it('taskBriefPreview collapses whitespace and clips long briefs', () => {
    expect(taskBriefPreview('short')).toBe('short');
    expect(taskBriefPreview('line one\n\nline two', 20)).toBe('line one line two');
    const clipped = taskBriefPreview('alpha beta gamma delta', 12);
    expect(clipped.endsWith('…')).toBe(true);
    expect(clipped.length).toBeLessThanOrEqual(13);
    expect(clipped.startsWith('alpha')).toBe(true);
  });

  it('renders no task preview when the agent has no description', () => {
    const agents = new Map([['s1', makeAgent('s1', { name: 'Alpha' })]]);
    useFleetStore.setState({ agents });

    render(<SubagentTranscriptView agentId="s1" />);
    expect(screen.queryByTestId('subagent-task-preview')).toBeNull();
    expect(screen.queryByRole('button', { name: /show full task brief/i })).toBeNull();
  });

  it('returns focus to the leader chat from the compact header', () => {
    const agents = new Map([['s1', makeAgent('s1', { name: 'Alpha' })]]);
    useFleetStore.setState({ agents });
    useUIStore.setState({ subagentChatFocusId: 's1' });

    render(<SubagentTranscriptView agentId="s1" />);
    fireEvent.click(screen.getByRole('button', { name: /return to chat/i }));
    expect(useUIStore.getState().subagentChatFocusId).toBeNull();
  });
});

/**
 * ChatView consumes this predicate in its stale-focus effect: a focused
 * subagent id may only survive while the agent still exists in the fleet
 * roster (removed / clear-finished / session stop must fall back to the
 * leader chat instead of rendering a dead pane).
 */
describe('shouldAutoClearSubagentFocus', () => {
  it('clears only when a focused id no longer exists in the roster', () => {
    expect(shouldAutoClearSubagentFocus('s1', true)).toBe(false);
    expect(shouldAutoClearSubagentFocus('s1', false)).toBe(true);
    expect(shouldAutoClearSubagentFocus(null, false)).toBe(false);
    expect(shouldAutoClearSubagentFocus(null, true)).toBe(false);
  });
});

/**
 * The leader lives INSIDE the roster map, so its own detail card also
 * renders an "Open chat" action — but focusing the leader id would swap
 * the main pane for the leader's fleet-event transcript and hide the
 * input. The guard must ignore the leader and focus only real subagents.
 */
describe('AgentDetailSection quick-open', () => {
  beforeEach(() => {
    useFleetStore.setState({ agents: new Map(), leaderId: undefined });
    useUIStore.setState({ subagentChatFocusId: null });
  });

  it('ignores open-chat on the leader card', () => {
    const agents = new Map([['ldr', makeAgent('ldr', { name: 'Main' })]]);
    useFleetStore.setState({ agents, leaderId: 'ldr' });

    render(<AgentDetailSection agent={makeAgent('ldr', { name: 'Main' })} isExpanded />);
    fireEvent.click(screen.getByRole('button', { name: /open chat/i }));

    expect(useUIStore.getState().subagentChatFocusId).toBeNull();
  });

  it('focuses a real subagent and jumps to the chat view', () => {
    const agents = new Map([['s1', makeAgent('s1', { name: 'Alpha' })]]);
    useFleetStore.setState({ agents });

    render(<AgentDetailSection agent={makeAgent('s1', { name: 'Alpha' })} isExpanded />);
    fireEvent.click(screen.getByRole('button', { name: /open chat/i }));

    expect(useUIStore.getState().subagentChatFocusId).toBe('s1');
    expect(useUIStore.getState().currentView).toBe('chat');
  });
});
