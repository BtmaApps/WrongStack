import type { AgentTimelineEntry } from '@wrongstack/core/coordination';
import type { KanbanBoard } from '@wrongstack/kanban';
import { describe, expect, it, vi } from 'vitest';
import type { FleetEntry } from '../src/app-state.js';
import { AgentsMonitor } from '../src/components/agents-monitor.js';
import { KanbanPanel } from '../src/components/kanban-panel.js';
import { MonitorViewportProvider } from '../src/components/monitor-shell.js';
import { renderRealTty, settle } from './helpers/real-tty.js';

const mocks = vi.hoisted(() => ({ getBoard: vi.fn(), listBoards: vi.fn() }));
vi.mock('@wrongstack/kanban', async (original) => ({
  ...(await original<typeof import('@wrongstack/kanban')>()),
  ...mocks,
}));

describe('F3 pinned transcript viewport', () => {
  it.each([
    [120, 40],
    [90, 30],
    [80, 24],
  ])(
    'keeps the newest transcript row visible at %ix%i with tool telemetry',
    async (columns, rows) => {
      const leader: FleetEntry = {
        id: 'leader',
        name: 'LEADER',
        status: 'running',
        streamingText: '',
        iterations: 1,
        toolCalls: 1,
        recentTools: [{ name: 'read', at: 1000, ok: true }],
        recentMessages: [],
        cost: 0,
        startedAt: 1000,
        lastEventAt: 1000,
      };
      const timeline = (length: number): AgentTimelineEntry[] =>
        Array.from({ length }, (_, index) => ({
          id: String(index),
          subagentId: 'leader',
          agentName: 'LEADER',
          ts: '',
          iteration: 0,
          kind: 'text',
          content: `transcript-line-${index}`,
        }));
      let entries = timeline(60);
      const element = () => (
        <MonitorViewportProvider value={{ columns, rows }}>
          <AgentsMonitor
            entries={{ leader }}
            totalCost={0}
            nowTick={2000}
            leaderTranscript={() => entries}
            transcripts={{ getTranscript: () => [] }}
          />
        </MonitorViewportProvider>
      );
      const view = renderRealTty(element(), { columns, rows });
      try {
        await settle();
        expect(view.lastFrame()).toContain('transcript-line-59');
        view.stdin.write('\x1b[5~');
        await settle();
        expect(view.lastFrame()).not.toContain('transcript-line-59');
        view.stdin.write('\x1b[6~');
        await settle();
        expect(view.lastFrame()).toContain('transcript-line-59');
        entries = timeline(1);
        view.rerender(element());
        await settle();
        expect(view.lastFrame()).toContain('transcript-line-0');
        entries = [];
        view.rerender(element());
        await settle();
        expect(view.lastFrame()).toContain('0 entries');
      } finally {
        view.unmount();
      }
    },
  );
});

describe('F12 shared-board polling', () => {
  it('observes repeated external changes, discovers a new board and stops polling on unmount', async () => {
    vi.useFakeTimers();
    const base: KanbanBoard = {
      version: 1,
      id: 'board',
      title: 'Original board',
      columns: [],
      tasks: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    mocks.listBoards.mockReset().mockResolvedValue([]);
    mocks.getBoard.mockReset().mockResolvedValue(base);
    const view = renderRealTty(
      <KanbanPanel projectRoot="/audit/project" sessionId="audit" onClose={() => {}} />,
      { columns: 120, rows: 40 },
    );
    try {
      await vi.advanceTimersByTimeAsync(100);
      expect(view.lastFrame()).toContain('No kanban boards');
      mocks.listBoards.mockResolvedValue([{ ...base, taskCount: 0 }]);
      await vi.advanceTimersByTimeAsync(4100);
      expect(view.lastFrame()).toContain('Original board');
      for (const title of ['External update one', 'External update two']) {
        mocks.getBoard.mockResolvedValue({ ...base, title, updatedAt: '2026-01-01T00:00:01.000Z' });
        await vi.advanceTimersByTimeAsync(4100);
        expect(view.lastFrame()).toContain(title);
      }
      view.unmount();
      const calls = mocks.listBoards.mock.calls.length;
      await vi.advanceTimersByTimeAsync(8000);
      expect(mocks.listBoards).toHaveBeenCalledTimes(calls);
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });
});
