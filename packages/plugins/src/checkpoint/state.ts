import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHostStates } from '../runtime/host-state.js';
import type { Snapshot } from './index.js';

export interface CheckpointState {
  root: string;
  sessionId: string;
  abort: AbortController;
  snapshots: Snapshot[];
  captures: number;
  restores: number;
  skippedLarge: number;
  evictedForBytes: number;
}

export const hosts = createHostStates(
  () => ({
    abort: new AbortController(),
    extensionUnregister: null as (() => void) | null,
    sessionUnregister: null as (() => void) | null,
    scopes: new Map<string, CheckpointState>(),
  }),
  (host) => {
    try {
      host.sessionUnregister?.();
    } catch {
      /* Host may already have disposed event subscriptions. */
    }
    for (const state of host.scopes.values()) state.abort.abort();
    host.scopes.clear();
  },
);
export type CheckpointHost = ReturnType<typeof hosts.reset>;
let nextId = 0;
export function nextSnapshotId(): string {
  return `cp-${++nextId}`;
}

interface ScopeContext {
  cwd?: string | undefined;
  projectRoot?: string | undefined;
  sessionId?: string | undefined;
  session?: { id?: string | undefined } | undefined;
}
export async function scopeFor(
  host: CheckpointHost,
  baseRoot: string,
  ctx?: ScopeContext,
): Promise<CheckpointState> {
  host.abort.signal.throwIfAborted();
  const root = await realpath(resolve(ctx?.projectRoot ?? ctx?.cwd ?? baseRoot));
  host.abort.signal.throwIfAborted();
  const sessionId = ctx?.session?.id ?? ctx?.sessionId ?? '';
  const key = JSON.stringify([sessionId, root]);
  let state = host.scopes.get(key);
  if (!state) {
    state = {
      root,
      sessionId,
      abort: new AbortController(),
      snapshots: [],
      captures: 0,
      restores: 0,
      skippedLarge: 0,
      evictedForBytes: 0,
    };
    host.scopes.set(key, state);
  }
  return state;
}
export function scopeSignal(
  host: CheckpointHost,
  state: CheckpointState,
  signal?: AbortSignal,
): AbortSignal {
  return AbortSignal.any([host.abort.signal, state.abort.signal, ...(signal ? [signal] : [])]);
}
export function endSession(host: CheckpointHost, id?: string): void {
  for (const [key, state] of host.scopes) {
    if (id !== undefined && state.sessionId !== id) continue;
    state.abort.abort();
    state.snapshots = [];
    host.scopes.delete(key);
  }
}
export function states(): CheckpointState[] {
  return [...hosts.values()].flatMap((host) => [...host.scopes.values()]);
}
export function stateBytes(state: CheckpointState): number {
  return state.snapshots.reduce(
    (sum, snapshot) =>
      sum +
      snapshot.files.reduce(
        (total, file) =>
          total + (file.content === null ? 0 : Buffer.byteLength(file.content, 'utf8')),
        0,
      ),
    0,
  );
}
