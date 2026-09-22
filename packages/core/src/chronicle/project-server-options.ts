#!/usr/bin/env node
/**
 * One detached Chronicle owner per local project.
 *
 * Event mapping and secret scrubbing remain in the originating process. This
 * server owns ordering/hash chaining, partition rotation, retention, the
 * project file watcher, derived metrics, and journal queries.
 */

import type * as net from 'node:net';

import * as path from 'node:path';

import {
  CHRONICLE_PROJECT_SERVER_MAX_FRAME_CHARS,
  type ChronicleProjectServerMessage,
  encodeChronicleProjectServerMessage,
} from './project-server-protocol.js';

/** Outbound bytes queued for one client before it is dropped as unresponsive. */
export const MAX_CLIENT_WRITE_BUFFER_BYTES = 8 * 1024 * 1024;

export interface ParsedArgs {
  projectRoot: string;
  globalRoot: string;
  projectId: string;
  projectDir: string;
  workspaceId: string;
  retentionDays: number;
  maxEvents: number;
  maxBytes: number;
  metricsRowRetentionDays: number | undefined;
  durability: 'normal' | 'full';
}

/**
 * Storage ceilings applied when the client does not pass its own.
 *
 * Bound burst growth independently of age retention: a single busy day can
 * outrun any `retentionDays` setting, and prefix eviction keeps the chain
 * verifiable via retention checkpoints where a plain delete would not.
 */
export const DEFAULT_MAX_EVENTS = 100_000;

export const DEFAULT_MAX_BYTES = 512 * 1024 * 1024;

export interface ClientState {
  socket: net.Socket;
  buffer: string;
  /** Wall clock at accept, so the silent-client sweep can age this socket. */
  connectedAt: number;
  /** Set on the first inbound byte. A socket that never speaks is reaped. */
  spoken: boolean;
  /**
   * Request ids whose dispatch has not produced a response yet. `stop()`
   * answers each of these with a clean stopping rejection BEFORE the socket
   * is destroyed — otherwise an in-flight caller sees nothing but a bare
   * connection close and can only give up via its own call timeout.
   */
  unsettled: Set<number>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (key?.startsWith('--') && argv[index + 1] !== undefined) {
      values.set(key, argv[++index]!);
    }
  }
  const required = [
    '--project-root',
    '--global-root',
    '--project-id',
    '--project-dir',
    '--workspace-id',
  ] as const;
  for (const key of required) {
    if (!values.get(key)) throw new Error(`Chronicle project server requires ${key}`);
  }
  const retentionInput = Number(values.get('--retention-days'));
  const metricsRowsInput = Number(values.get('--metrics-row-retention-days'));
  const positive = (flag: string, fallback: number): number => {
    const value = Number(values.get(flag));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  // Durability is an operator escape hatch rather than per-session config, so
  // it is read from the environment the daemon already inherits instead of
  // being threaded through the client's spawn arguments. Anything other than
  // an explicit 'full' keeps the WAL default of NORMAL.
  const durabilityInput =
    values.get('--durability') ?? process.env['WRONGSTACK_CHRONICLE_DURABILITY'] ?? '';
  return {
    projectRoot: path.resolve(values.get('--project-root')!),
    globalRoot: path.resolve(values.get('--global-root')!),
    projectId: values.get('--project-id')!,
    projectDir: path.resolve(values.get('--project-dir')!),
    workspaceId: values.get('--workspace-id')!,
    retentionDays: Number.isFinite(retentionInput) && retentionInput > 0 ? retentionInput : 30,
    maxEvents: Math.floor(positive('--max-events', DEFAULT_MAX_EVENTS)),
    maxBytes: Math.floor(positive('--max-bytes', DEFAULT_MAX_BYTES)),
    metricsRowRetentionDays:
      Number.isFinite(metricsRowsInput) && metricsRowsInput > 0 ? metricsRowsInput : undefined,
    durability: durabilityInput.trim().toLowerCase() === 'full' ? 'full' : 'normal',
  };
}

export function encodeResponse(
  state: ClientState,
  message: ChronicleProjectServerMessage,
): string | undefined {
  if (state.socket.destroyed || state.socket.writableEnded) return undefined;
  const encoded = encodeChronicleProjectServerMessage(message);
  if (encoded.length > CHRONICLE_PROJECT_SERVER_MAX_FRAME_CHARS) {
    state.socket.destroy(new Error('Chronicle project server response exceeded frame limit'));
    return undefined;
  }
  // The frame cap above bounds one message; this bounds the queue. Ignoring
  // `socket.write()`'s `false` return lets a client that stopped reading grow
  // the owner's heap without limit — see the identical guard in the mailbox,
  // kanban, SAGE and index owners.
  if (state.socket.writableLength > MAX_CLIENT_WRITE_BUFFER_BYTES) {
    state.socket.destroy(new Error('Chronicle client fell too far behind on reads'));
    return undefined;
  }
  return encoded;
}
