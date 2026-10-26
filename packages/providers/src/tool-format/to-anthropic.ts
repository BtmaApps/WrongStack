import type { Tool } from '@wrongstack/contracts/types';
import {
  compactToolDefinitionForWire,
  SCHEMA_DESCRIPTION_MAX_CHARS,
  TOOL_DESCRIPTION_MAX_CHARS,
} from '@wrongstack/core/utils';

export interface AnthropicToolSchema {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * WeakMap cache keyed by the Tool[] array reference and a content fingerprint so
 * in-place tool array or schema mutations invalidate the cached wire declarations.
 */
const _cache = new WeakMap<Tool[], { fingerprint: string; result: AnthropicToolSchema[] }>();

export function toolsToAnthropic(tools: Tool[]): AnthropicToolSchema[] {
  const fingerprint = JSON.stringify(
    tools.map((tool) => [tool.name, tool.description, tool.inputSchema]),
  );
  const hit = _cache.get(tools);
  if (hit?.fingerprint === fingerprint) return hit.result;
  const sorted = tools.length > 1 ? [...tools].sort((a, b) => a.name.localeCompare(b.name)) : tools;
  const result = sorted.map((t) => {
    const compact = compactToolDefinitionForWire(t, {
      descriptionMaxChars: TOOL_DESCRIPTION_MAX_CHARS,
      schemaDescriptionMaxChars: SCHEMA_DESCRIPTION_MAX_CHARS,
    });
    return {
      name: compact.name,
      description: compact.description,
      input_schema: compact.inputSchema,
    };
  });
  _cache.set(tools, { fingerprint, result });
  return result;
}
