import { objectRecord } from './modern-protocol.js';
import type { MCPServerMetadata } from './protocol.js';

export const MCP_TASKS_EXTENSION = 'io.modelcontextprotocol/tasks';
export const TASK_METHODS = new Set(['tasks/get', 'tasks/update', 'tasks/cancel']);

export interface MCPTask {
  taskId: string;
  status: 'working' | 'input_required' | 'completed' | 'cancelled' | 'failed';
  statusMessage?: string | undefined;
  createdAt: string;
  lastUpdatedAt: string;
  ttlMs: number | null;
  pollIntervalMs?: number | undefined;
  inputRequests?: Record<string, unknown> | undefined;
  result?: Record<string, unknown> | undefined;
  error?: { code: number; message: string; data?: unknown } | undefined;
}

export interface MCPTaskOptions {
  /** Total wait, including polls and user interaction. Default 30 minutes; maximum 24 hours. */
  timeoutMs?: number | undefined;
  /** Called before polling the newly created task. Hosts can durably save its ID here. */
  onStatus?: ((task: MCPTask) => void | Promise<void>) | undefined;
  /** Host detachment pauses observation without requesting remote cancellation. */
  pauseSignal?: AbortSignal | undefined;
  /** Persisted fingerprints of inputs whose task update was acknowledged. No answers are stored. */
  answeredInputs?: Record<string, string> | undefined;
  onInputAcknowledged?: ((inputs: Record<string, string>) => void | Promise<void>) | undefined;
  /** Host revalidates the account and session before each task RPC. */
  beforeRequest?: (() => void | Promise<void>) | undefined;
}

export class MCPTaskError extends Error {
  constructor(
    message: string,
    public readonly taskId: string,
    name = 'MCPTaskError',
    public readonly code?: number | undefined,
  ) {
    super(`${message} (MCP task ${taskId})`);
    this.name = name;
  }
}

export function supportsTasks(metadata: MCPServerMetadata | undefined): boolean {
  return (
    objectRecord(objectRecord(metadata?.capabilities['extensions'])?.[MCP_TASKS_EXTENSION]) !==
    undefined
  );
}

/** Tasks are opted into per request, only after the server has advertised the extension. */
export function taskCapabilities(
  capabilities: Record<string, unknown>,
  method: string,
  metadata: MCPServerMetadata | undefined,
  enabled = true,
): Record<string, unknown> {
  return enabled && supportsTasks(metadata) && (method === 'tools/call' || TASK_METHODS.has(method))
    ? {
        ...capabilities,
        extensions: { ...objectRecord(capabilities['extensions']), [MCP_TASKS_EXTENSION]: {} },
      }
    : capabilities;
}

export function validateTaskId(taskId: unknown): asserts taskId is string {
  if (
    typeof taskId !== 'string' ||
    !taskId ||
    taskId.length > 1024 ||
    /[\x00-\x1f\x7f]/.test(taskId)
  )
    throw new Error('Malformed MCP task ID');
}

export function taskWaitMs(options?: MCPTaskOptions | false): number {
  const value = options ? options.timeoutMs : undefined;
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1 || value > 86_400_000))
    throw new Error('MCP task timeoutMs must be an integer from 1 to 86400000');
  return value ?? 30 * 60_000;
}

export function parseTask(value: unknown, expectedId?: string, detailed = false): MCPTask {
  const task = objectRecord(value);
  validateTaskId(task?.['taskId']);
  if (!task) throw new Error('Malformed MCP task');
  if (expectedId !== undefined && task['taskId'] !== expectedId)
    throw new Error('MCP task ID changed in a status response');
  const status = task['status'];
  const isoDate = (date: unknown) =>
    typeof date === 'string' && /^\d{4}-\d\d-\d\dT/.test(date) && Number.isFinite(Date.parse(date));
  if (
    !['working', 'input_required', 'completed', 'cancelled', 'failed'].includes(String(status)) ||
    !isoDate(task['createdAt']) ||
    !isoDate(task['lastUpdatedAt']) ||
    !(
      task['ttlMs'] === null ||
      (Number.isSafeInteger(task['ttlMs']) && Number(task['ttlMs']) >= 0)
    ) ||
    (task['pollIntervalMs'] !== undefined &&
      (!Number.isSafeInteger(task['pollIntervalMs']) || Number(task['pollIntervalMs']) < 0)) ||
    (task['statusMessage'] !== undefined &&
      (typeof task['statusMessage'] !== 'string' || task['statusMessage'].length > 4096))
  )
    throw new Error('Malformed MCP task status');
  if (detailed) {
    if (status === 'input_required' && !objectRecord(task['inputRequests']))
      throw new Error('Malformed MCP task inputRequests');
    if (status === 'completed' && !objectRecord(task['result']))
      throw new Error('Malformed MCP task result');
    if (status === 'failed') {
      const error = objectRecord(task['error']);
      if (!error || !Number.isInteger(error['code']) || typeof error['message'] !== 'string')
        throw new Error('Malformed MCP task error');
    }
  }
  return structuredClone(task) as unknown as MCPTask;
}
