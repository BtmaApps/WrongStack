#!/usr/bin/env node

import type * as net from 'node:net';

import * as path from 'node:path';

import type { SqliteMemoryPort } from './memory-port.js';

import type { SageServiceLike } from './service-contract.js';

import type {
  FindMemoriesForFileOptions,
  FindMemoriesForFileResponse,
  SageBackfillOptions,
  SageBackfillReport,
} from './types.js';

export interface ParsedArgs {
  projectRoot: string;
  directory?: string | undefined;
}

export interface ClientState {
  socket: net.Socket;
  buffer: string;
  active: Map<number, AbortController>;
  /** Wall clock at accept, so the silent-client sweep can age this socket. */
  connectedAt: number;
  /** Set on the first inbound byte. A socket that never speaks is reaped. */
  spoken: boolean;
  /** Set only after a request or shutdown frame proves access to server.json. */
  authenticated: boolean;
  /**
   * Request ids whose dispatch has not produced a response yet. `stop()`
   * answers each of these with a clean stopping rejection BEFORE the socket
   * is destroyed — otherwise an in-flight caller sees nothing but a bare
   * connection close and can only give up via its own call timeout.
   */
  unsettled: Set<number>;
  /**
   * Server-assigned per-connection nonce. The server stamps this on
   * every request's `meta.clientId` and never honours the client-supplied
   * value, so two different connections can never claim the same
   * `clientId` in the audit log.
   */
  clientId: string;
}

export type CompleteSageStore = SqliteMemoryPort &
  SageServiceLike & {
    recoverSage(id: string, reason?: string): Promise<import('./types.js').Sage>;
    backfillRecoverable(options?: SageBackfillOptions): Promise<SageBackfillReport>;
    findMemoriesForFile(
      filePath: string,
      options?: FindMemoriesForFileOptions,
    ): Promise<FindMemoriesForFileResponse>;
  };

export function parseArgs(argv: string[]): ParsedArgs {
  let projectRoot: string | undefined;
  let directory: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--project-root') projectRoot = argv[++index];
    else if (arg === '--directory') directory = argv[++index];
  }
  if (!projectRoot) throw new Error('SAGE project server requires --project-root');
  return {
    projectRoot: path.resolve(projectRoot),
    ...(directory ? { directory } : {}),
  };
}
