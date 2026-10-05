import type { KanbanBoard, KanbanBoardHistoryEntry, KanbanEvent } from '../types.js';
import { emitBoardEvent } from './event-emitter.js';
import { assertWorkflowId, assertWorkflowPrefix, invalid } from './project-server-validation.js';
import type { KanbanWorkflowCommand, KanbanWorkflowState } from './protocol.js';
import type { SqliteKanbanStorage } from './sqlite-storage.js';
export // ─── Method registrations ────────────────────────────────────────────────────
//
// All handlers are async to give the call site a uniform shape. The `direct`
// wrapper strips the `Promise` so we can access `.id` and other properties
// on the resolved value.

// biome-ignore lint/suspicious/noExplicitAny: JSON wire params of method-specific shape — handlers narrow per method.
type Handler = (params: any) => Promise<unknown>;
export function registerStorageMethods(
  defineMethod: (name: string, handler: Handler) => void,
  ownerStorage: () => SqliteKanbanStorage,
): void {
  defineMethod('storageListBoardIds', async () => ownerStorage().listBoardIds());

  defineMethod('storageReadBoard', async ({ boardRef }: { boardRef: string }) => {
    if (!boardRef) invalid('storageReadBoard requires boardRef');
    return ownerStorage().readBoard(boardRef);
  });

  defineMethod(
    'storageWriteBoard',
    async ({ board, expectedRevision }: { board: KanbanBoard; expectedRevision?: number }) => {
      if (!board?.id) invalid('storageWriteBoard requires board.id');
      await ownerStorage().writeBoard(board, expectedRevision);
      return { written: true };
    },
  );

  defineMethod('workflowReadState', async ({ workflowId }: { workflowId: string }) => {
    assertWorkflowId(workflowId);
    return ownerStorage().readWorkflowState(workflowId);
  });

  defineMethod(
    'workflowWriteState',
    async ({
      workflowId,
      value,
      expectedRevision,
    }: {
      workflowId: string;
      value: unknown;
      expectedRevision?: number;
    }): Promise<KanbanWorkflowState> => {
      assertWorkflowId(workflowId);
      if (value === undefined) invalid('workflowWriteState requires a JSON value');
      if (
        expectedRevision !== undefined &&
        (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      ) {
        invalid('workflowWriteState expectedRevision must be a non-negative integer');
      }
      const state = await ownerStorage().writeWorkflowState(workflowId, value, expectedRevision);
      emitBoardEvent('workflow.state.updated', workflowId, {
        workflowId,
        revision: state.revision,
      });
      return state;
    },
  );

  defineMethod(
    'workflowListStates',
    async ({ prefix, limit }: { prefix: string; limit?: number }) => {
      assertWorkflowPrefix(prefix);
      const normalizedLimit = limit === undefined ? 100 : Math.floor(limit);
      if (!Number.isFinite(normalizedLimit) || normalizedLimit < 1 || normalizedLimit > 1_000) {
        invalid('workflowListStates limit must be between 1 and 1000');
      }
      return ownerStorage().listWorkflowStates(prefix, normalizedLimit);
    },
  );

  defineMethod('workflowDeleteState', async ({ workflowId }: { workflowId: string }) => {
    assertWorkflowId(workflowId);
    const deleted = await ownerStorage().deleteWorkflowState(workflowId);
    if (deleted) emitBoardEvent('workflow.state.deleted', workflowId, { workflowId });
    return deleted;
  });

  defineMethod(
    'storageAppendEvent',
    async ({ boardId, event }: { boardId: string; event: KanbanEvent }) => {
      if (!boardId || !event) invalid('storageAppendEvent requires boardId and event');
      await ownerStorage().appendEvent(boardId, event);
      return { appended: true };
    },
  );

  defineMethod('storageReadEvents', async ({ boardRef }: { boardRef: string }) => {
    if (!boardRef) invalid('storageReadEvents requires boardRef');
    return ownerStorage().readEvents(boardRef);
  });

  defineMethod(
    'storageAppendBoardHistory',
    async ({ entry }: { entry: KanbanBoardHistoryEntry }) => {
      if (!entry) invalid('storageAppendBoardHistory requires entry');
      await ownerStorage().appendBoardHistory(entry);
      return { appended: true };
    },
  );

  defineMethod('storageReadBoardHistory', async ({ boardId }: { boardId?: string }) => {
    return ownerStorage().readBoardHistory(boardId);
  });

  defineMethod('storageDeleteBoard', async ({ boardRef }: { boardRef: string }) => {
    if (!boardRef) invalid('storageDeleteBoard requires boardRef');
    return ownerStorage().deleteBoard(boardRef);
  });

  defineMethod('storageReadMetadata', async ({ key }: { key: string }) => {
    if (!key) invalid('storageReadMetadata requires key');
    return ownerStorage().readMetadata(key);
  });

  defineMethod('storageWriteMetadata', async ({ key, value }: { key: string; value: string }) => {
    if (!key || typeof value !== 'string') {
      invalid('storageWriteMetadata requires key and string value');
    }
    await ownerStorage().writeMetadata(key, value);
    return { written: true };
  });

  defineMethod(
    'workflowEnqueueCommand',
    async ({ workflowId, command }: { workflowId: string; command: KanbanWorkflowCommand }) => {
      assertWorkflowId(workflowId);
      if (
        !command ||
        command.workflowId !== workflowId ||
        typeof command.id !== 'string' ||
        command.id.length === 0 ||
        command.id.length > 128 ||
        typeof command.createdAt !== 'string' ||
        !Number.isFinite(Date.parse(command.createdAt)) ||
        typeof command.type !== 'string' ||
        command.type.length === 0 ||
        command.type.length > 128
      ) {
        invalid('workflowEnqueueCommand requires a valid command');
      }
      const enqueued = await ownerStorage().enqueueWorkflowCommand(workflowId, command);
      if (enqueued) {
        emitBoardEvent('workflow.command', workflowId, {
          workflowId,
          commandId: command.id,
          type: command.type,
        });
      }
      return { enqueued };
    },
  );

  defineMethod(
    'workflowDrainCommands',
    async ({ workflowId, limit }: { workflowId: string; limit?: number }) => {
      assertWorkflowId(workflowId);
      const normalizedLimit = limit === undefined ? 100 : Math.floor(limit);
      if (!Number.isFinite(normalizedLimit) || normalizedLimit < 1 || normalizedLimit > 1_000) {
        invalid('workflowDrainCommands limit must be between 1 and 1000');
      }
      return ownerStorage().drainWorkflowCommands(workflowId, normalizedLimit);
    },
  );
}
