import type { ToolResultBlock, ToolUseBlock } from '../types/blocks.js';
import type { Tool } from '../types/tool.js';

/** Give the model the registered contract on the failing call itself. */
export function toolInputCorrection(tool: Tool): string {
  const declared = Object.keys(tool.inputSchema.properties ?? {});
  const required = tool.inputSchema.required ?? [];
  const selection = tool.selection;
  return (
    `\n\nRegistered usage for "${tool.name}":\n` +
    `${tool.description}` +
    (tool.usageHint ? `\nUsage: ${tool.usageHint}` : '') +
    (declared.length > 0 ? `\nDeclared top-level fields: ${declared.join(', ')}` : '') +
    (required.length > 0 ? `\nRequired top-level fields: ${required.join(', ')}` : '') +
    (selection
      ? `\nDo not use this tool when: ${selection.doNotUseWhen}` +
        (selection.useInstead?.length ? `\nUse instead: ${selection.useInstead.join(', ')}` : '')
      : '') +
    `\nInput schema:\n${JSON.stringify(tool.inputSchema, null, 2)}\n` +
    `Recovery steps: First check whether this tool actually fits the task. ` +
    `If it does, apply the validation error above: remove unsupported fields, add missing required fields, and correct types or values using the schema and usage hint. ` +
    `Do not repeat the same arguments unchanged. If the tool is wrong for the task, choose a registered alternative. ` +
    `If a required value cannot be determined, ask for that value instead of inventing it.`
  );
}

export function unknownToolResult(use: ToolUseBlock, listFns: () => string[]): ToolResultBlock {
  return {
    type: 'tool_result',
    tool_use_id: use.id,
    content: `Tool "${use.name}" is not registered. Available tools: ${listFns().join(', ')}`,
    is_error: true,
  };
}

export function malformedInputResult(use: ToolUseBlock, tool: Tool, raw?: string): ToolResultBlock {
  let content =
    `Tool "${use.name}" received arguments that were not a valid JSON object, so they ` +
    `could not be parsed. Re-issue the call with the arguments encoded as a single ` +
    `well-formed JSON object matching the tool's input schema.`;
  if (raw) {
    const max = 800;
    const excerpt =
      raw.length > max ? `${raw.slice(0, max)}… (truncated, ${raw.length} chars total)` : raw;
    content +=
      ` Common cause: a string field (e.g. code in old_string/new_string) ` +
      `contains literal newlines, quotes, or backslashes that must be JSON-escaped, ` +
      `or the payload was cut off mid-stream. The raw arguments received were:\n${excerpt}`;
  }
  content += toolInputCorrection(tool);
  return {
    type: 'tool_result',
    tool_use_id: use.id,
    content,
    is_error: true,
  };
}

export function deniedResult(use: ToolUseBlock, reason?: string): ToolResultBlock {
  return {
    type: 'tool_result',
    tool_use_id: use.id,
    content: `Tool "${use.name}" denied: ${reason ?? 'policy'}`,
    is_error: true,
  };
}

export function blockedByHookResult(use: ToolUseBlock, reason?: string): ToolResultBlock {
  return {
    type: 'tool_result',
    tool_use_id: use.id,
    content: `Tool "${use.name}" was blocked by a PreToolUse hook: ${reason ?? 'no reason given'}`,
    is_error: true,
  };
}
