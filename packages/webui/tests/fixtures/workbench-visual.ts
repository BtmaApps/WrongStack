import { getWSClient } from '@/lib/ws-client';
import { useFleetStore } from '@/stores';
import { useKanbanStore } from '@/stores/kanban-store';

/** Isolated browser-only data. Never connects to a provider or writes project state. */
export function seedWorkbenchVisualData() {
  const sent: Array<{ type: string; payload?: unknown }> = [];
  const now = '2026-10-17T12:00:00.000Z';
  const columns = [
    { id: 'ready', title: 'Ready', order: 0, color: 'hsl(var(--info))' },
    { id: 'doing', title: 'In progress', order: 1, color: 'hsl(var(--primary))' },
    { id: 'review', title: 'Review', order: 2, color: 'hsl(var(--brand-orange))' },
  ];
  const tasks = [
    ['Theme tokens and surfaces', 'ready', 'high'],
    ['Responsive workspace navigation', 'ready', 'medium'],
    ['Accessible motion system', 'doing', 'high'],
    ['SVG illustration library', 'doing', 'medium'],
    ['Keyboard and touch review', 'review', 'low'],
  ].map(([title, columnId, priority], i) => ({
    id: `visual-task-${i}`,
    title,
    columnId,
    priority,
    order: i,
    status: 'ready',
    description: 'Visual fixture task for layout and interaction checks.',
    createdAt: now,
    updatedAt: now,
  }));
  const board = {
    id: 'visual-board',
    title: 'Workbench visual refresh',
    columns,
    tasks,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  // The production Kanban envelope accepts these same shapes over the wire.
  useKanbanStore.setState({
    activeBoard: board as NonNullable<ReturnType<typeof useKanbanStore.getState>['activeBoard']>,
    activeBoardId: board.id,
    boardTotal: 1,
    activeBoardTotal: 1,
    boards: [
      {
        id: board.id,
        title: board.title,
        columnCount: 3,
        taskCount: tasks.length,
        completedTaskCount: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
    loading: false,
  });
  useFleetStore.setState({
    agents: new Map(
      ['Design agent', 'Review agent', 'Test agent'].map((name, i) => [
        `visual-agent-${i}`,
        {
          id: `visual-agent-${i}`,
          name,
          status: i === 1 ? 'completed' : 'running',
          model: 'workspace-model',
          provider: 'visual-fixture',
          description: 'Check the workspace layout and accessibility.',
          iteration: 4 + i,
          toolCalls: 8 + i,
          costUsd: 0.04,
          ctxPct: 24 + i * 6,
          ctxTokens: 2400,
          maxContext: 10000,
          extensions: 0,
          startedAt: Date.now() - 60000,
          toolLog: [],
          sparklineBins: [1, 3, 2, 5, 3, 2, 4, 1, 3, 2, 4, 2],
        },
      ]),
    ),
  });
  const memories = [
    'Use semantic theme tokens for surfaces.',
    'Respect reduced motion in every animation.',
    'Keep keyboard focus visible on controls.',
  ].map((text, i) => ({
    id: `visual-memory-${i}`,
    revision: 1,
    kind: 'project_fact',
    scope: 'project',
    status: 'active',
    text,
    summary: text,
    importance: 0.8,
    confidence: 0.9,
    freshness: 1,
    tags: ['workspace', i === 0 ? 'theme' : 'accessibility'],
    anchors: [],
    createdAt: now,
    updatedAt: now,
  }));
  const handlers = new Map<string, Set<(message: unknown) => void>>();
  const client = getWSClient();
  client.on = ((type: string, handler: (message: unknown) => void) => {
    const set = handlers.get(type) ?? new Set();
    set.add(handler);
    handlers.set(type, set);
    return () => set.delete(handler);
  }) as typeof client.on;
  client.off = ((type: string, handler: (message: unknown) => void) => {
    handlers.get(type)?.delete(handler);
  }) as typeof client.off;
  client.send = ((message: { type: string; payload?: Record<string, unknown> }) => {
    sent.push(message);
    queueMicrotask(() => {
      if (message.type.startsWith('kanban.')) useKanbanStore.setState({ loading: false });
      if (message.type === 'memory.sage.listPage') {
        const query = String(message.payload?.query ?? '').toLowerCase();
        const payload = {
          memories: memories.filter((memory) => memory.text.toLowerCase().includes(query)),
          nextCursor: null,
          statusCounts: { active: 3 },
          stats: { total: 3, edges: 0, byStatus: { active: 3 }, byKind: { project_fact: 3 } },
        };
        for (const handler of handlers.get(message.type) ?? [])
          handler({ type: message.type, payload });
      }
      if (message.type === 'memory.sage.graph') {
        for (const handler of handlers.get(message.type) ?? [])
          handler({
            type: message.type,
            payload: { query: message.payload?.query, memories, edges: [] },
          });
      }
    });
    return true;
  }) as typeof client.send;
  return { sent };
}
