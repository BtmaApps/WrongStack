export {
  createKanbanMcpServer,
  createKanbanMcpToolHost,
  type KanbanMcpDependencies,
  type KanbanMcpToolHostOptions,
} from './adapter.js';
// Side-effect free: hosts (the `wstack` binary) run the server in-process.
export { main as runKanbanMcpServer } from './main.js';
export {
  KANBAN_DESTRUCTIVE_ACTIONS,
  KANBAN_MANAGE_ACTIONS,
  KANBAN_READ_ACTIONS,
  type KanbanDestructiveAction,
  type KanbanManageAction,
  type KanbanMcpAction,
  type KanbanMcpPolicyOptions,
  type KanbanMcpToolName,
  type KanbanReadAction,
  selectKanbanMcpTools,
} from './policy.js';
export { SERVER_INFO } from './version.js';
