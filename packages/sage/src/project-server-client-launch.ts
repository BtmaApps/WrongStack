/**
 * Locating the SAGE project-server daemon from the client side: entrypoint
 * resolution (dist file or standalone binary) and the owner-only
 * `server.json` token read. The detached spawn itself stays in
 * `project-server-client.ts` (the audited spawn site).
 */
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isStandaloneBinary, standaloneDaemonUrl } from '@wrongstack/persistence';
import { sageProjectServerMetadataPath } from './project-server-endpoint.js';
import type { SageProjectServerMetadata } from './project-server-protocol.js';

export function resolveProjectServerUrl(): URL | null {
  if (process.env['WRONGSTACK_SAGE_SERVER'] === '0') return null;
  if (isStandaloneBinary()) return standaloneDaemonUrl('sage');
  try {
    const url = new URL('./project-server.js', import.meta.url);
    if (url.protocol !== 'file:') return null;
    const file = fileURLToPath(url);
    // Primary probe: the seam existing callers and tests mock, and the fast
    // path for the common available case.
    if (fs.existsSync(file)) return url;
    // existsSync folds transient stat errors (EMFILE/EPERM/EBUSY spikes
    // under full-suite parallel load) into false. Verify with statSync
    // before declaring the build missing: ENOENT = genuinely absent; any
    // other error (or a contradictory success) = assume present — the
    // recoverable direction, since a spawn against a missing file is a
    // guarded dead child the retry loop survives, while a false negative
    // was fatal to the connect window (mailbox sibling flake, observed
    // 2026-09-15, shard 3/4).
    try {
      fs.statSync(file);
      return url;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
      return url;
    }
  } catch {
    // The package may be running directly from TypeScript source.
  }
  return null;
}

export function isSageProjectServerAvailable(): boolean {
  return resolveProjectServerUrl() !== null;
}

/**
 * Read the daemon's per-process auth token from its owner-only
 * `server.json`; `undefined` when the file is missing, unreadable or has no
 * token (see `SageProjectServerConnection.currentAuthToken`).
 */
export function readSageServerAuthToken(
  projectRoot: string,
  directory: string | undefined,
): string | undefined {
  try {
    const raw = fs.readFileSync(sageProjectServerMetadataPath(projectRoot, directory), 'utf8');
    const parsed = JSON.parse(raw) as Partial<SageProjectServerMetadata>;
    return typeof parsed.authToken === 'string' && parsed.authToken.length > 0
      ? parsed.authToken
      : undefined;
  } catch {
    return undefined;
  }
}
