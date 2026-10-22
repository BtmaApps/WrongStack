import { MCP_CONSTANTS, MCPUnsupportedProtocolVersionError } from './constants.js';
import type { JsonRpcResponse } from './contracts.js';
import { type MCPServerMetadata, parseServerMetadata } from './protocol.js';

/** The handshake-based revisions in constants.ts remain a separate compatibility path. */
export const MODERN_PROTOCOL_VERSION = '2026-07-28';
export const VERSION_META = 'io.modelcontextprotocol/protocolVersion';
export const INFO_META = 'io.modelcontextprotocol/clientInfo';
export const CAPABILITIES_META = 'io.modelcontextprotocol/clientCapabilities';

export function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function modernParams(
  params: unknown,
  capabilities: Record<string, unknown> = {},
): Record<string, unknown> {
  const input = objectRecord(params) ?? {};
  return {
    ...input,
    _meta: {
      ...objectRecord(input['_meta']),
      [VERSION_META]: MODERN_PROTOCOL_VERSION,
      [INFO_META]: MCP_CONSTANTS.CLIENT_INFO,
      // Only capabilities with a host handler are advertised. Optional extensions stay opt-in.
      [CAPABILITIES_META]: capabilities,
    },
  };
}

export function requestVersion(params: unknown): unknown {
  return objectRecord(objectRecord(params)?.['_meta'])?.[VERSION_META];
}

export function hasModernMetadata(params: unknown): boolean {
  const meta = objectRecord(objectRecord(params)?.['_meta']);
  return (
    meta !== undefined &&
    [VERSION_META, INFO_META, CAPABILITIES_META, 'io.modelcontextprotocol/logLevel'].some((key) =>
      Object.hasOwn(meta, key),
    )
  );
}

export function isModernError(error: JsonRpcResponse['error']): boolean {
  return typeof error?.code === 'number' && [-32020, -32021, -32022].includes(error.code);
}

export function parseDiscovery(name: string, response: JsonRpcResponse): MCPServerMetadata {
  if (response.error) {
    throw new MCPUnsupportedProtocolVersionError(
      name,
      MODERN_PROTOCOL_VERSION,
      `MCP "${name}" modern discovery failed: ${response.error.message}`,
    );
  }
  const result = objectRecord(response.result);
  const versions = result?.['supportedVersions'];
  if (
    result?.['resultType'] !== 'complete' ||
    !Array.isArray(versions) ||
    !versions.every((version) => typeof version === 'string')
  )
    throw new Error(`Malformed MCP "${name}" server/discover result`);
  if (!versions.includes(MODERN_PROTOCOL_VERSION))
    throw new MCPUnsupportedProtocolVersionError(
      name,
      versions.join(', '),
      `MCP "${name}" has no mutually supported modern revision (${versions.join(', ')})`,
    );
  const info = objectRecord(result['_meta'])?.['io.modelcontextprotocol/serverInfo'];
  return parseServerMetadata({
    protocolVersion: MODERN_PROTOCOL_VERSION,
    capabilities: result['capabilities'],
    serverInfo: info ?? { name, version: 'unknown' },
    instructions: result['instructions'],
  });
}

export function assertCompleteResult(response: JsonRpcResponse): JsonRpcResponse {
  if (!response.error && objectRecord(response.result)?.['resultType'] !== 'complete') {
    const kind = objectRecord(response.result)?.['resultType'];
    throw new Error(
      kind === 'input_required'
        ? 'MCP server requires an unsupported multi-round-trip client interaction'
        : 'Malformed modern MCP response: expected resultType complete',
    );
  }
  return response;
}
