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
import type { ChronicleJournal } from './journal.js';

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

const DEFAULT_IDLE_MS = 5 * 60_000;
const DEFAULT_SILENT_CLIENT_MS = 120_000;

/**
 * A socket that connects and then never sends a single byte pins this daemon
 * open forever: `clients.size` stays above zero, so `scheduleIdleStop()`
 * returns early and the idle shutdown is never armed. Measured before this
 * existed — with idle=2s, a silent connection kept the daemon alive past 20s,
 * three runs out of three. It needs no auth token either, because
 * `clients.add` happens on connect, before any message is validated.
 *
 * Reaping ONLY sockets that have never spoken is what makes this safe. A real
 * client sends its first frame immediately; one that goes quiet after working
 * has spoken and keeps its connection. Dropping a never-spoken socket cannot
 * fail a caller: nothing can be in flight on it, and the client re-establishes
 * on its next request (`ensureConnected` in the project-server client).
 *
 * The sweep deliberately does NOT call `scheduleIdleStop()` — that is the
 * re-arm starvation fixed in the mailbox and kanban daemons. `destroy()` fires
 * `close`, and the existing close handler owns the idle bookkeeping.
 */
export function resolveChronicleServerTimings(env: NodeJS.ProcessEnv): {
  idleMs: number;
  silentClientMs: number;
  silentSweepMs: number;
} {
  const idleInput = Number(env['WRONGSTACK_CHRONICLE_SERVER_IDLE_MS']);
  // Node clamps a timer delay above 2^31-1 ms to 1 ms: a huge "never idle out"
  // value would stop the daemon at once.
  const idleMs =
    Number.isFinite(idleInput) && idleInput >= 100
      ? Math.min(idleInput, 2_147_483_647)
      : DEFAULT_IDLE_MS;
  const silentInput = Number(env['WRONGSTACK_CHRONICLE_SERVER_SILENT_CLIENT_MS']);
  const silentClientMs =
    Number.isFinite(silentInput) && silentInput >= 1_000 ? silentInput : DEFAULT_SILENT_CLIENT_MS;
  const silentSweepMs = Math.min(30_000, Math.max(1_000, Math.floor(silentClientMs / 4)));
  return { idleMs, silentClientMs, silentSweepMs };
}

/**
 * Days of journal to keep open. Yesterday stays available because events can
 * still arrive for it right after midnight; anything older can only accumulate.
 */
export const MAX_OPEN_JOURNAL_DAYS = 2;

/**
 * Drop journals for days we will not write to again.
 *
 * `journals` was only ever `get`/`set`/iterated — there was no `delete` and no
 * cap — so a daemon that lived across midnight kept one open `ChronicleJournal`
 * (with its write buffer and file handle) per day, forever. These daemons
 * routinely stay up for many hours.
 */
export function pruneJournals(journals: Map<string, ChronicleJournal>, currentDay: string): void {
  if (journals.size <= MAX_OPEN_JOURNAL_DAYS) return;
  const keep = new Set([...journals.keys()].sort().reverse().slice(0, MAX_OPEN_JOURNAL_DAYS));
  keep.add(currentDay);
  for (const [day, journal] of journals) {
    if (keep.has(day)) continue;
    journals.delete(day);
    // Flush what is still buffered before letting it go. Detached, so a slow
    // disk cannot stall an append — but never unhandled.
    void journal.flush().catch(() => {
      /* best-effort: the daemon is dropping this day either way */
    });
  }
}

/** Compose the legacy partition path a `ChronicleJournal` writes to. */
export function legacyPartitionPath(location: { chronicleDirectory: string; day: string }): string {
  return path.join(location.chronicleDirectory, `${location.day}.events.jsonl`);
}

/**
 * SQLite is the daemon's store; `WRONGSTACK_CHRONICLE_STORE=jsonl` restores the
 * partition writer. This is the production write path — the inline one only
 * runs in explicit recovery mode — so the cut-over lives here.
 */
export function useSqliteStore(): boolean {
  return process.env['WRONGSTACK_CHRONICLE_STORE'] !== 'jsonl';
}
