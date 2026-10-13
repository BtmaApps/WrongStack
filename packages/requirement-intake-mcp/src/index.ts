export {
  createRequirementIntakeMcpServer,
  createRequirementIntakeMcpToolHost,
  type RequirementIntakeMcpDependencies,
  type RequirementIntakeMcpToolHostOptions,
} from './adapter.js';
// Side-effect free: hosts (the `wstack` binary) run the server in-process.
export { main as runRequirementIntakeMcpServer } from './main.js';
export {
  REQUIREMENT_INTAKE_READ_TOOLS,
  REQUIREMENT_INTAKE_WRITE_TOOLS,
  type RequirementIntakeMcpPolicyOptions,
  type RequirementIntakeMcpToolName,
  type RequirementIntakeMcpToolPolicy,
  selectRequirementIntakeTools,
} from './policy.js';
export { SERVER_INFO } from './version.js';
