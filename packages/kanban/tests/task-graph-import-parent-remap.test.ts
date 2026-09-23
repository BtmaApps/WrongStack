import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBoardFromTaskGraph } from '../src/manager/task-graph-bridge.js';
import { readBoard } from '../src/storage.js';
import type { TaskGraph, TaskNode } from '../src/types/task-graph.js';

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-graph-import-'));
});

function node(overrides: Partial<TaskNode> & { id: string; title: string }): TaskNode {
  return {
    description: '',
    type: 'feature',
    priority: 'medium',
    status: 'pending',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function graphWithParentAndChild(): TaskGraph {
  return {
    id: 'graph-1',
    specId: 'spec-1',
    title: 'Imported graph',
    nodes: new Map<string, TaskNode>([
      [
        'parent-node',
        node({ id: 'parent-node', title: 'Parent', status: 'completed', children: ['child-node'] }),
      ],
      [
        'child-node',
        node({ id: 'child-node', title: 'Child', status: 'pending', parentId: 'parent-node' }),
      ],
    ]),
    edges: [],
    rootNodes: ['parent-node'],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('createBoardFromTaskGraph parent remap', () => {
  it('keeps a resolvable parent link when every node is imported', async () => {
    const { board, taskIdMap } = await createBoardFromTaskGraph(
      projectRoot,
      graphWithParentAndChild(),
    );
    const childTaskId = taskIdMap.get('child-node');
    const parentTaskId = taskIdMap.get('parent-node');
    expect(childTaskId).toBeDefined();
    expect(parentTaskId).toBeDefined();
    const child = board.tasks.find((task) => task.id === childTaskId);
    expect(child?.parentTaskId).toBe(parentTaskId);
  });

  it('drops the parent link instead of keeping a graph id when the parent is filtered out', async () => {
    const { board, taskIdMap } = await createBoardFromTaskGraph(
      projectRoot,
      graphWithParentAndChild(),
      { includeCompletedTasks: false },
    );
    // The completed parent is excluded; only the child is imported.
    expect(taskIdMap.has('parent-node')).toBe(false);
    const childTaskId = taskIdMap.get('child-node');
    expect(childTaskId).toBeDefined();

    const childOf = (tasks: ReadonlyArray<{ id: string; parentTaskId?: string }>) =>
      tasks.find((task) => task.id === childTaskId);

    // The returned board must not carry the raw graph id as a parent link.
    const inMemory = childOf(board.tasks);
    expect(inMemory).toBeDefined();
    expect(inMemory!.parentTaskId).toBeUndefined();

    // And the persisted payload is pinned too.
    const stored = await readBoard(projectRoot, board.id);
    expect(stored).not.toBeNull();
    const persisted = childOf(stored!.tasks);
    expect(persisted).toBeDefined();
    expect(persisted!.parentTaskId).toBeUndefined();
  });
});
