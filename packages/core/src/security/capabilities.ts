/** Tool capabilities moved to `@wrongstack/primitives/tool-capabilities`; re-exported here for existing core importers. */
export {
  capabilityDowngradesToConfirm,
  clampSubagentCapabilities,
  DANGEROUS_FOR_SUBAGENTS,
  getDangerousCapabilities,
  hasCapability,
  hasDangerousCapabilityForSubagents,
  ToolCapabilities,
  type ToolCapability,
  WIDE_SUBAGENT_CAPABILITIES,
} from '@wrongstack/primitives/tool-capabilities';
