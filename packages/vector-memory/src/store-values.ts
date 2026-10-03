import { createHash } from 'node:crypto';
import { VectorMemoryError } from './errors.js';
import type { VectorKind, VectorScope } from './types.js';

/** Default file-lock acquire timeout. 5s is enough for embedding + insert. */
export const DEFAULT_LOCK_TIMEOUT_MS = 5_000;

export const VECTOR_SCOPES: ReadonlySet<string> = new Set(['project', 'user', 'session']);

export const VECTOR_KINDS: ReadonlySet<string> = new Set([
  'note',
  'fact',
  'summary',
  'snippet',
  'link',
]);

export function assertVectorScope(value: unknown, operation: string): asserts value is VectorScope {
  if (typeof value !== 'string' || !VECTOR_SCOPES.has(value)) {
    throw new VectorMemoryError(`${operation}: scope must be project, user, or session`);
  }
}

export function assertVectorKind(value: unknown, operation: string): asserts value is VectorKind {
  if (typeof value !== 'string' || !VECTOR_KINDS.has(value)) {
    throw new VectorMemoryError(`${operation}: kind must be note, fact, summary, snippet, or link`);
  }
}

export function cloneJsonMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  let serialized: string;
  try {
    serialized = JSON.stringify(metadata);
  } catch {
    throw new Error('VectorMemoryStore.remember: metadata must be JSON-serializable');
  }
  const cloned = JSON.parse(serialized) as Record<string, unknown>;
  if (!jsonValuesEqual(metadata, cloned)) {
    throw new Error('VectorMemoryStore.remember: metadata must contain lossless JSON values');
  }
  return cloned;
}

export function jsonValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left === 'number' && typeof right === 'number') return Object.is(left, right);
  if (Array.isArray(left)) {
    return (
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => index in left && jsonValuesEqual(value, right[index]))
    );
  }
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(left);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const leftKeys = Object.keys(left as Record<string, unknown>);
  const rightRecord = right as Record<string, unknown>;
  return (
    leftKeys.length === Object.keys(rightRecord).length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(rightRecord, key) &&
        jsonValuesEqual((left as Record<string, unknown>)[key], rightRecord[key]),
    )
  );
}

function safeParseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function safeParseMetadata(value: unknown): Record<string, unknown> {
  const parsed = safeParseJson<unknown>(value, undefined);
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

export function safeParseTags(value: unknown): string[] {
  const parsed = safeParseJson<unknown>(value, undefined);
  return Array.isArray(parsed) && parsed.every((tag) => typeof tag === 'string') ? parsed : [];
}

export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function vectorContentHash(text: string): string {
  return createHash('sha256').update(text.normalize('NFKC').trim()).digest('hex');
}
