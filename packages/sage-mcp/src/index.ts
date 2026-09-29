/**
 * Public exports of `@wrongstack/sage-mcp`.
 *
 * The two things a host needs are:
 *   - `createSageMcpServer(port, opts)` — build an `MCPServer` over a SAGE
 *     memory port. Pass the port, hand the result to `serveStdio` /
 *     `serveHttp` from `@wrongstack/mcp`.
 *   - `createSageMcpToolHost(port, opts)` — finer-grained: build just the
 *     host if you want to compose the server differently.
 *
 * The standalone `wstack-sage-mcp` binary lives at `src/cli.ts` (the
 * `bin` entry in `package.json`); it is not re-exported here.
 */
export {
  createSageMcpServer,
  createSageMcpToolHost,
  requireSageService,
  type SageMcpToolHostOptions,
} from './adapter.js';
export {
  type AttachedSageMcpOptions,
  createAttachedSageMcp,
  DEFAULT_IDLE_RELEASE_MS,
  serveAttachedSageMcpStdio,
} from './attached-server.js';
export {
  proposalOnlyCandidatesTool,
  type SageMcpAllowedTool,
  type SageMcpPolicyOptions,
  selectAllowedTools,
} from './policy.js';
export {
  SAGE_MCP_INSTRUCTIONS,
  SAGE_MCP_SERVER_NAME,
  SAGE_SKILL_BODY,
  SAGE_SKILL_DESCRIPTION,
  SAGE_SKILL_NAME,
} from './usage-guide.js';
export { SERVER_INFO } from './version.js';
