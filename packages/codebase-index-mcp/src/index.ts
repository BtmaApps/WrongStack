export {
  type CodebaseIndexMcpDependencies,
  type CodebaseIndexMcpToolHostOptions,
  createCodebaseIndexMcpServer,
  createCodebaseIndexMcpToolHost,
} from './adapter.js';
// Side-effect free: hosts (the `wstack` binary) run the server in-process.
export { main as runCodebaseIndexMcpServer } from './main.js';
export {
  CODEBASE_INDEX_READ_TOOLS,
  CODEBASE_INDEX_WRITE_TOOLS,
  type CodebaseIndexMcpPolicyOptions,
  type CodebaseIndexMcpToolName,
  selectCodebaseIndexMcpTools,
} from './policy.js';
export { SERVER_INFO } from './version.js';
