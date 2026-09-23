import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { taskContractEndpoint } from '../src/contract-graph.js';
import { addTask, createBoard, getBoard, upsertContractNode } from './helpers/session-manager.js';

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-contract-edge-'));
});

describe('contract relation-edge enforcement', () => {
  it('refreshes the auto-created relation edge when a node upsert changes enforcement', async () => {
    const board = await createBoard(projectRoot, { title: 'Contract graph' });
    const added = await addTask(projectRoot, board.id, { title: 'Ship the feature' });
    const taskId = added!.task.id;

    const relationOf = async (boardId: string, nodeId: string) => {
      const current = await getBoard(projectRoot, boardId);
      expect(current).not.toBeNull();
      const graph = current!.contractGraph;
      expect(graph).toBeDefined();
      return graph!.edges.find(
        (candidate) =>
          candidate.from === taskContractEndpoint(taskId) &&
          candidate.to === nodeId &&
          candidate.type === 'targets',
      );
    };

    // First upsert: an objective defaults to blocking, and ensureTaskRelation
    // creates the task→node 'targets' edge mirroring that enforcement.
    const first = await upsertContractNode(projectRoot, board.id, {
      taskId,
      kind: 'objective',
      title: 'Objective A',
    });
    expect(first).not.toBeNull();
    expect(first!.node.enforcement).toBe('blocking');

    const initialEdge = await relationOf(board.id, first!.node.id);
    expect(initialEdge).toBeDefined();
    expect(initialEdge!.enforcement).toBe('blocking');

    // Second upsert relaxes the node to informational. The relation edge is
    // derived metadata: it must not keep the stale blocking verdict.
    const second = await upsertContractNode(projectRoot, board.id, {
      id: first!.node.id,
      taskId,
      kind: 'objective',
      title: 'Objective A',
      enforcement: 'informational',
    });
    expect(second!.node.enforcement).toBe('informational');

    const refreshedEdge = await relationOf(board.id, first!.node.id);
    expect(refreshedEdge).toBeDefined();
    expect(refreshedEdge!.enforcement).toBe('informational');
  });
});
