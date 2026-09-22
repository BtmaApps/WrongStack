/**
 * Shared WebSocket message handlers.
 *
 * Re-exports all handler groups so callers (the standalone `startWebUI`
 * and eventually the CLI's embedded server) can import from a single path.
 *
 * Each handler group lives in its own file and is parameterized by a
 * context interface — the host server provides its own runtime access to
 * agent state, broadcasting, and socket sending.
 */
export {
  handlePlanGet,
  handlePlanItemUpdate,
  handlePlanTemplateUse,
  handleTasksGet,
  handleTaskUpdate,
  handleTodosClear,
  handleTodosGet,
  handleTodosRemove,
  handleTodoUpdate,
  handleWorklistMessage,
  type WorklistContext,
  type WorklistMessage,
} from './worklist-handlers.js';
