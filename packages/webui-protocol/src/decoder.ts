import { isRegisteredMessageType } from './registry.js';
import type {
  CanonicalClientMessage,
  CanonicalServerMessage,
  ProtocolDecodeIssue,
  ProtocolDecodeResult,
  ProtocolDirection,
  ProtocolEnvelope,
} from './types.js';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_PAYLOAD_DEPTH = 32;

/**
 * The first unsafe spot in `value`, as an issue whose `path` is relative to
 * `value` (callers prefix their own segment). Paths are assembled only on the
 * way out of a failure: every server frame passes through here, and a replay
 * payload has tens of thousands of keys that would each build a path string
 * nobody reads.
 */
type PathedIssue = ProtocolDecodeIssue & { path: string };

function inspectValue(value: unknown, depth: number): PathedIssue | null {
  if (depth > MAX_PAYLOAD_DEPTH) {
    return { code: 'too_deep', message: 'Protocol payload exceeds the nesting limit', path: '' };
  }
  if (value === null || typeof value !== 'object') return null;

  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      return { code: 'unsafe_key', message: `Unsafe protocol key: ${key}`, path: `.${key}` };
    }
    const issue = inspectValue((value as Record<string, unknown>)[key], depth + 1);
    if (issue) return { ...issue, path: `.${key}${issue.path}` };
  }
  return null;
}

export function decodeProtocolMessage(
  input: unknown,
  direction: 'client',
): ProtocolDecodeResult<CanonicalClientMessage>;
export function decodeProtocolMessage(
  input: unknown,
  direction: 'server',
): ProtocolDecodeResult<CanonicalServerMessage>;
export function decodeProtocolMessage(
  input: unknown,
  direction: ProtocolDirection,
): ProtocolDecodeResult<ProtocolEnvelope> {
  try {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      return {
        ok: false,
        issue: { code: 'invalid_envelope', message: 'Protocol message must be an object' },
      };
    }

    const envelope = input as Record<string, unknown>;
    if (typeof envelope['type'] !== 'string' || envelope['type'].length === 0) {
      return {
        ok: false,
        issue: {
          code: 'invalid_type',
          message: 'Protocol message type must be a non-empty string',
        },
      };
    }
    if (!isRegisteredMessageType(envelope['type'], direction)) {
      return {
        ok: false,
        issue: {
          code: 'unknown_type',
          message: `Unknown ${direction} message: ${envelope['type']}`,
        },
      };
    }
    if (direction === 'server' && !Object.hasOwn(envelope, 'payload')) {
      return {
        ok: false,
        issue: { code: 'invalid_envelope', message: 'Server protocol messages require a payload' },
      };
    }

    const issue = inspectValue(envelope, 0);
    if (issue) return { ok: false, issue: { ...issue, path: `$${issue.path}` } };
    return { ok: true, message: input as ProtocolEnvelope };
  } catch {
    return {
      ok: false,
      issue: { code: 'invalid_envelope', message: 'Protocol message contains unreadable values' },
    };
  }
}

export function decodeProtocolFrame(
  frame: string,
  direction: 'client',
): ProtocolDecodeResult<CanonicalClientMessage>;
export function decodeProtocolFrame(
  frame: string,
  direction: 'server',
): ProtocolDecodeResult<CanonicalServerMessage>;
export function decodeProtocolFrame(
  frame: string,
  direction: ProtocolDirection,
): ProtocolDecodeResult<ProtocolEnvelope> {
  try {
    return decodeProtocolMessage(JSON.parse(frame), direction as 'client');
  } catch {
    return {
      ok: false,
      issue: { code: 'invalid_envelope', message: 'Protocol frame is not valid JSON' },
    };
  }
}
