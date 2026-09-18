import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import { AgentsMonitor } from '../src/components/agents-monitor.js';
import { CoordinatorPanel } from '../src/components/coordinator-panel.js';
import { FleetMonitor } from '../src/components/fleet-monitor.js';
import { GoalPanel } from '../src/components/goal-panel.js';
import { KanbanPanel } from '../src/components/kanban-panel.js';
import {
  MonitorShell,
  MonitorViewportProvider,
  PanelInputProvider,
} from '../src/components/monitor-shell.js';
import { PlanPanel } from '../src/components/plan-panel.js';
import { ProcessListMonitor } from '../src/components/process-list.js';
import { ProjectPicker } from '../src/components/project-picker.js';
import { QueuePanel } from '../src/components/queue-panel.js';
import { SessionsPanel } from '../src/components/sessions-panel.js';
import { TodosMonitor } from '../src/components/todos-monitor.js';
import { WorktreeMonitor } from '../src/components/worktree-monitor.js';
import { Text } from '../src/ink.js';
import { displayWidth } from '../src/terminal-width.js';
import { createTestState } from './helpers/create-test-state.js';
import { renderRealTty, settle } from './helpers/real-tty.js';

vi.mock('@wrongstack/kanban', async (original) => ({
  ...(await original<typeof import('@wrongstack/kanban')>()),
  listBoards: vi.fn(async () => []),
}));
const noop = () => {};
const panels = [
  [
    'F1',
    'PROJECTS',
    () => (
      <ProjectPicker
        items={Array.from({ length: 25 }, (_, i) => ({
          key: `p${i}`,
          label: `project-${i} 界面 👩‍💻`,
          kind: 'project' as const,
        }))}
        selected={18}
        filter=""
      />
    ),
  ],
  [
    'F2',
    'FLEET CONTROL',
    () => (
      <FleetMonitor
        entries={{}}
        totalCost={0}
        totalTokens={{ input: 0, output: 0 }}
        maxConcurrent={4}
        nowTick={1000}
      />
    ),
  ],
  [
    'F3',
    'AGENTS',
    () => <AgentsMonitor entries={{}} totalCost={0} nowTick={1000} onClose={noop} />,
  ],
  [
    'F4',
    'WORKTREES',
    () => <WorktreeMonitor worktrees={{}} baseBranch="main" nowTick={1000} onClose={noop} />,
  ],
  [
    'F5',
    'PLAN',
    () => <PlanPanel projectRoot="D:/nonexistent-fpanel-layout" sessionId={null} onClose={noop} />,
  ],
  [
    'F6',
    'TODOS',
    () => (
      <TodosMonitor
        todos={Array.from({ length: 24 }, (_, i) => ({
          id: String(i),
          content: `Task ${i} 界面`,
          status: 'pending' as const,
        }))}
      />
    ),
  ],
  [
    'F7',
    'MESSAGE QUEUE',
    () => (
      <QueuePanel
        items={Array.from({ length: 24 }, (_, i) => ({
          id: i,
          displayText: `queued message ${i} 界面`,
          blocks: [],
        }))}
      />
    ),
  ],
  ['F8', 'PROCESSES', () => <ProcessListMonitor />],
  [
    'F9',
    'GOAL',
    () => (
      <GoalPanel
        goal={{
          goal: 'Finish the panel audit',
          goalState: 'active',
          iterations: 2,
          deliverables: Array.from({ length: 20 }, (_, i) => `Deliverable ${i}`),
        }}
      />
    ),
  ],
  ['F10', 'SESSIONS', () => <SessionsPanel sessions={[]} busy={false} selected={0} />],
  [
    'F11',
    'COORDINATOR',
    () => (
      <CoordinatorPanel coordinator={createTestState().coordinator} nowTick={1000} onClose={noop} />
    ),
  ],
  [
    'F12',
    'KANBAN',
    () => (
      <KanbanPanel
        projectRoot="D:/nonexistent-fpanel-layout"
        sessionId="layout-test"
        onClose={noop}
      />
    ),
  ],
] as const;

describe.each([
  [120, 40],
  [80, 24],
  [52, 16],
  [40, 12],
])('F-key panels at %ix%i', (columns, rows) => {
  it.each(panels)(
    '%s keeps its title and exit control inside the viewport',
    async (_key, title, element) => {
      const view = renderRealTty(
        <MonitorViewportProvider value={{ columns, rows }}>{element()}</MonitorViewportProvider>,
        { columns, rows },
      );
      try {
        await settle(100);
        const frame = view.lastFrame();
        expect(frame).toContain(title);
        expect(frame).toContain('Esc');
        const selected = {
          F1: 'project-18',
          F6: 'Task 0',
          F7: 'queued message 0',
          F9: 'Deliverable 0',
        }[_key as string];
        if (selected) expect(frame).toContain(selected);
        const lines = frame.trimEnd().split('\n');
        expect(lines.length).toBeLessThanOrEqual(rows);
        expect(Math.max(...lines.map(displayWidth))).toBeLessThanOrEqual(columns);
      } finally {
        view.unmount();
      }
    },
  );
});

describe('modified keys are not panel letter actions', () => {
  it('Ctrl+C does not start the F9 coordinator', async () => {
    const start = vi.fn();
    const view = render(
      <GoalPanel
        goal={{ goal: 'mission', goalState: 'active', iterations: 0 }}
        onCoordinatorStart={start}
      />,
    );
    try {
      await settle();
      view.stdin.write('\x03');
      await settle();
      expect(start).not.toHaveBeenCalled();
      view.stdin.write('c');
      await settle();
      expect(start).toHaveBeenCalledOnce();
    } finally {
      view.unmount();
    }
  });
  it('Ctrl+D does not delete a queued message', async () => {
    const remove = vi.fn();
    const view = render(
      <QueuePanel items={[{ id: 1, displayText: 'keep', blocks: [] }]} onDelete={remove} />,
    );
    try {
      await settle();
      view.stdin.write('\x04');
      await settle();
      expect(remove).not.toHaveBeenCalled();
      view.stdin.write('d');
      await settle();
      expect(remove).toHaveBeenCalledOnce();
    } finally {
      view.unmount();
    }
  });
});

describe('panel overflow access', () => {
  it('scrolls hidden content with Alt+PgDn and wheel while keeping the frame controls visible', async () => {
    const view = renderRealTty(
      <MonitorViewportProvider value={{ columns: 52, rows: 12 }}>
        <MonitorShell title="LONG PANEL" icon="+" accent="cyan" footer={<Text>Esc close</Text>}>
          {Array.from({ length: 30 }, (_, i) => (
            <Text key={i}>content-row-{i}</Text>
          ))}
        </MonitorShell>
      </MonitorViewportProvider>,
      { columns: 52, rows: 12 },
    );
    try {
      await settle(100);
      expect(view.lastFrame()).toContain('Alt+PgUp/Dn');
      expect(view.lastFrame()).not.toContain('content-row-29');
      for (let i = 0; i < 12; i++) {
        view.stdin.write('\x1b[6;3~');
        await settle();
      }
      expect(view.lastFrame()).toContain('content-row-29');
      expect(view.lastFrame()).toContain('LONG PANEL');
      expect(view.lastFrame()).toContain('Esc close');
      view.stdin.write('\x1b[<64;10;4M');
      await settle();
      expect(view.lastFrame()).not.toContain('content-row-29');
      expect(view.lines().length).toBeLessThanOrEqual(12);
    } finally {
      view.unmount();
    }
  });
});

describe('foreground prompt ownership', () => {
  it('suspends both queue navigation and actions until the prompt closes', async () => {
    const remove = vi.fn();
    const panel = (active: boolean) => (
      <PanelInputProvider value={active}>
        <QueuePanel
          items={[
            { id: 1, displayText: 'first', blocks: [] },
            { id: 2, displayText: 'second', blocks: [] },
          ]}
          onDelete={remove}
        />
      </PanelInputProvider>
    );
    const view = render(panel(false));
    try {
      await settle();
      view.stdin.write('\x1b[B');
      view.stdin.write('d');
      await settle();
      expect(remove).not.toHaveBeenCalled();
      view.rerender(panel(true));
      await settle();
      view.stdin.write('d');
      await settle();
      expect(remove).toHaveBeenCalledWith(0);
    } finally {
      view.unmount();
    }
  });
});
