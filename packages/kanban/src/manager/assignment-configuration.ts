import type { KanbanAgentAssignment } from '../types.js';

const CONFIGURATION_KEYS = [
  'agentId',
  'name',
  'role',
  'provider',
  'model',
  'modelRouting',
  'fallbackProfile',
  'fallbackModels',
  'tier',
  'skills',
  'tools',
  'allowedCapabilities',
  'maxAttempts',
  'costCeilingUsd',
  'retryPolicy',
] as const satisfies readonly (keyof KanbanAgentAssignment)[];

/** New work may inherit routing, never an execution claim or predecessor output. */
export function cloneAssignmentConfiguration(source: KanbanAgentAssignment): KanbanAgentAssignment {
  const result: KanbanAgentAssignment = { status: 'assigned' };
  for (const key of CONFIGURATION_KEYS) {
    const value = source[key];
    if (value !== undefined) {
      (result as unknown as Record<string, unknown>)[key] = Array.isArray(value)
        ? [...value]
        : value;
    }
  }
  return result;
}
