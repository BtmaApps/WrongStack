import { describe, expect, it } from 'vitest';
import {
  applyGraphNodeToTask,
  applyTaskGraphRelationships,
} from '../src/manager/task-graph-internal.js';
import { createBoardObject } from '../src/storage.js';
import type { TaskGraph, TaskNode } from '../src/types/task-graph.js';
import type { KanbanTask } from '../src/types.js';

it('keeps enriched description and same-graph manual dependencies through repeated todo sync', () => {
  const board = createBoardObject({ title: 'Session' });
  const task: KanbanTask = {
    id: 'a',
    title: 'A',
    description: 'Detailed outcome and scope',
    status: 'pending',
    columnId: 'todo',
    order: 0,
    priority: 'medium',
    createdAt: '',
    updatedAt: '',
    origin: {
      system: 'session-todo',
      taskId: 'a',
      graphId: 'todo:s',
      sourceDescription: 'Doing A',
      sourceDependencyTaskIds: [],
    },
    dependsOn: ['b'],
    childTaskIds: ['child'],
  };
  const node: TaskNode = {
    id: 'a',
    title: 'A',
    description: 'Doing A',
    type: 'chore',
    priority: 'medium',
    status: 'in_progress',
    createdAt: 0,
    updatedAt: 0,
  };
  const graph: TaskGraph = {
    id: 'todo:s',
    specId: 'todo:s',
    title: 'Todo',
    nodes: new Map([['a', node]]),
    edges: [],
    rootNodes: ['a'],
    createdAt: 0,
    updatedAt: 0,
  };
  board.tasks = [task];
  task.origin!.sourcePriority = 'medium';
  task.priority = 'high';
  for (let pass = 0; pass < 2; pass++) {
    applyGraphNodeToTask(
      board,
      graph,
      task,
      node,
      { sourceSystem: 'session-todo' },
      new Date().toISOString(),
    );
    applyTaskGraphRelationships(
      board,
      graph,
      new Map([
        ['a', 'a'],
        ['b', 'b'],
      ]),
      { preserveManualDependencies: true },
    );
  }
  expect(task.description).toBe('Detailed outcome and scope');
  expect(task.dependsOn).toEqual(['b']);
  expect(task.childTaskIds).toEqual(['child']);
  expect(task.priority).toBe('high');
  expect(task.status).toBe('in_progress');
  // Board -> todo feedback must not make enrichment source-owned again.
  node.description = task.description!;
  applyGraphNodeToTask(board, graph, task, node, { sourceSystem: 'session-todo' }, 'now');
  node.description = 'Doing A again';
  applyGraphNodeToTask(board, graph, task, node, { sourceSystem: 'session-todo' }, 'now');
  expect(task.description).toBe('Detailed outcome and scope');
});

describe('source-owned descriptions', () => {
  it('continues accepting source updates until a card is independently enriched', () => {
    const board = createBoardObject({ title: 'Session' });
    const task = {
      id: 'a',
      title: 'A',
      description: 'Old',
      status: 'pending',
      columnId: 'todo',
      order: 0,
      priority: 'medium',
      createdAt: '',
      updatedAt: '',
      origin: { system: 'session-task', sourceDescription: 'Old' },
    } as KanbanTask;
    const node = {
      id: 'a',
      title: 'A',
      description: 'New',
      type: 'chore',
      priority: 'medium',
      status: 'pending',
      createdAt: 0,
      updatedAt: 0,
    } as TaskNode;
    const graph = { id: 'g', specId: 'g' } as TaskGraph;
    board.tasks = [task];
    applyGraphNodeToTask(board, graph, task, node, { sourceSystem: 'session-task' }, 'now');
    expect(task.description).toBe('New');
  });
});
