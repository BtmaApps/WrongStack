import { toErrorMessage } from '@wrongstack/core/utils';
import type { MCPRegistry } from '@wrongstack/mcp';
import type { WebSocket } from 'ws';
import type { WSClientMessage } from './types.js';
import { send } from './ws-utils.js';

/**
 * MCP content handlers (resources, prompts, and explicit user selection of a
 * resource/prompt for insertion) plus their payload validation helpers.
 */

/** mcp.resources — list cached resources/templates, refreshing only when explicitly requested. */
export async function handleMcpResources(
  ws: WebSocket,
  msg: WSClientMessage,
  _globalConfigPath: string,
  mcpRegistry?: MCPRegistry,
): Promise<void> {
  if (!mcpRegistry) return sendContentError(ws, 'resources', '', 'MCP registry is not available.');
  const payload = payloadRecord(msg);
  let serverName = '';
  try {
    serverName = requiredPayloadString(payload, 'name');
    const refresh = payload['refresh'] === true;
    const [resources, resourceTemplates] = await Promise.all([
      mcpRegistry.listResources(serverName, { refresh }),
      mcpRegistry.listResourceTemplates(serverName, { refresh }),
    ]);
    send(ws, {
      type: 'mcp.resources',
      payload: { name: serverName, resources, resourceTemplates },
    });
  } catch (err) {
    sendContentError(ws, 'resources', serverName, errorMessage(err));
  }
}

/** mcp.prompts — list cached prompts, refreshing only when explicitly requested. */
export async function handleMcpPrompts(
  ws: WebSocket,
  msg: WSClientMessage,
  _globalConfigPath: string,
  mcpRegistry?: MCPRegistry,
): Promise<void> {
  if (!mcpRegistry) return sendContentError(ws, 'prompts', '', 'MCP registry is not available.');
  const payload = payloadRecord(msg);
  let serverName = '';
  try {
    serverName = requiredPayloadString(payload, 'name');
    const prompts = await mcpRegistry.listPrompts(serverName, {
      refresh: payload['refresh'] === true,
    });
    send(ws, { type: 'mcp.prompts', payload: { name: serverName, prompts } });
  } catch (err) {
    sendContentError(ws, 'prompts', serverName, errorMessage(err));
  }
}

/** mcp.resource.read — explicit user selection; returns an untrusted provenance envelope. */
export async function handleMcpResourceRead(
  ws: WebSocket,
  msg: WSClientMessage,
  _globalConfigPath: string,
  mcpRegistry?: MCPRegistry,
): Promise<void> {
  if (!mcpRegistry)
    return sendContentError(ws, 'resource.read', '', 'MCP registry is not available.');
  const payload = payloadRecord(msg);
  let serverName = '';
  try {
    serverName = requiredPayloadString(payload, 'name');
    const insertion = await mcpRegistry.selectResourceForInsertion(
      serverName,
      requiredPayloadString(payload, 'uri'),
    );
    send(ws, { type: 'mcp.content.selected', payload: insertion });
  } catch (err) {
    sendContentError(ws, 'resource.read', serverName, errorMessage(err));
  }
}

/** mcp.prompt.get — explicit user selection; prompt argument values stay out of provenance. */
export async function handleMcpPromptGet(
  ws: WebSocket,
  msg: WSClientMessage,
  _globalConfigPath: string,
  mcpRegistry?: MCPRegistry,
): Promise<void> {
  if (!mcpRegistry) return sendContentError(ws, 'prompt.get', '', 'MCP registry is not available.');
  const payload = payloadRecord(msg);
  let serverName = '';
  try {
    serverName = requiredPayloadString(payload, 'name');
    const insertion = await mcpRegistry.selectPromptForInsertion(
      serverName,
      requiredPayloadString(payload, 'prompt'),
      promptArguments(payload['arguments']),
    );
    send(ws, { type: 'mcp.content.selected', payload: insertion });
  } catch (err) {
    sendContentError(ws, 'prompt.get', serverName, errorMessage(err));
  }
}

function payloadRecord(msg: WSClientMessage): Record<string, unknown> {
  return msg.payload && typeof msg.payload === 'object' && !Array.isArray(msg.payload)
    ? (msg.payload as Record<string, unknown>)
    : {};
}

function requiredPayloadString(payload: Record<string, unknown>, field: string): string {
  const value = payload[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`MCP payload field "${field}" must be a non-empty string`);
  }
  return value;
}

function promptArguments(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('MCP prompt arguments must be an object');
  }
  const args: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item !== 'string') throw new Error(`MCP prompt argument "${key}" must be a string`);
    args[key] = item;
  }
  return args;
}

function sendContentError(ws: WebSocket, action: string, name: string, error: string): void {
  send(ws, { type: 'mcp.content.error', payload: { action, name, error } });
}

function errorMessage(err: unknown): string {
  return toErrorMessage(err);
}
