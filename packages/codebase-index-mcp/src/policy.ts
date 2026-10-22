export const CODEBASE_INDEX_READ_TOOLS = [
  'codebase_context',
  'codebase_search',
  'codebase_stats',
  'codebase_package_graph',
  'codebase_file_graph',
  'codebase_symbol_graph',
  'codebase_incoming_calls',
  'codebase_outgoing_calls',
  'codebase_read_symbol',
  'codebase_skeleton',
  'codebase_impact_analysis',
  'codebase_repo_map',
  'codebase_invariant_check',
  'codebase_diff_impact',
  'codebase_flow_trace',
  'codebase_onboard',
  'codebase_atlas',
  'dead_code_scan',
] as const;

export const CODEBASE_INDEX_WRITE_TOOLS = [
  'codebase_index',
  'codebase_ast_replace',
  'codebase_targeted_test',
  'dead_code_fix',
] as const;

export type CodebaseIndexMcpReadToolName = (typeof CODEBASE_INDEX_READ_TOOLS)[number];
export type CodebaseIndexMcpWriteToolName = (typeof CODEBASE_INDEX_WRITE_TOOLS)[number];
export type CodebaseIndexMcpToolName = CodebaseIndexMcpReadToolName | CodebaseIndexMcpWriteToolName;

export interface CodebaseIndexMcpPolicyOptions {
  writable?: boolean;
}

export function selectCodebaseIndexMcpTools(
  opts: CodebaseIndexMcpPolicyOptions = {},
): CodebaseIndexMcpToolName[] {
  return opts.writable === true
    ? [...CODEBASE_INDEX_READ_TOOLS, ...CODEBASE_INDEX_WRITE_TOOLS]
    : [...CODEBASE_INDEX_READ_TOOLS];
}

/**
 * Read tools whose arguments can make them write `.wrongstack/atlas/`. Listing
 * them as read tools exposed those writes on a server started without
 * `--writable`; the variant is refused there instead.
 */
const READ_TOOL_WRITE_VARIANTS: Partial<
  Record<CodebaseIndexMcpReadToolName, (args: Record<string, unknown>) => string | null>
> = {
  codebase_atlas: (args) => (args['mode'] === 'write' ? 'mode "write"' : null),
  codebase_flow_trace: (args) => (args['persist'] === true ? '"persist": true' : null),
  codebase_diff_impact: (args) => (args['persist'] === true ? '"persist": true' : null),
};

/** Why this call writes and needs `--writable`, or null when it only reads. */
export function codebaseIndexMcpWriteVariant(
  name: CodebaseIndexMcpToolName,
  args: Record<string, unknown>,
): string | null {
  const variant = READ_TOOL_WRITE_VARIANTS[name as CodebaseIndexMcpReadToolName]?.(args);
  return variant ? `${name} ${variant} writes files; start the server with --writable` : null;
}
