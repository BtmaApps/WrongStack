/**
 * Argument parsing and per-operation request validation for the Session
 * Catalog project server. Split out of project-server.ts.
 */
import * as path from 'node:path';
import { canonicalProjectRoot } from '../utils/wstack-paths.js';
import type { SessionCatalogEventKind, SessionCatalogOperationName } from './protocol.js';

export interface ParsedArgs {
  projectDir: string;
  projectRoot: string;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (key?.startsWith('--') && argv[index + 1] !== undefined) values.set(key, argv[++index]!);
  }
  const projectDir = values.get('--project-dir');
  const projectRoot = values.get('--project-root');
  if (!projectDir) throw new Error('Session Catalog project server requires --project-dir');
  if (!projectRoot) throw new Error('Session Catalog project server requires --project-root');
  return { projectDir: path.resolve(projectDir), projectRoot: path.resolve(projectRoot) };
}

const OPERATION_KEYS: Record<SessionCatalogOperationName, readonly string[]> = {
  ping: [],
  claim_new: ['entry', 'ownerInstanceId', 'leaseMs'],
  reconnect_lease: ['sessionId', 'leaseId', 'leaseSecret', 'ownerInstanceId', 'expiresAt'],
  reserve_resume: ['targetSessionId', 'requesterInstanceId', 'currentSessionId', 'reservationMs'],
  activate_reservation: ['reservation', 'entry', 'leaseMs'],
  renew_reservation: ['reservationId', 'requesterInstanceId', 'reservationMs'],
  cancel_reservation: ['reservationId', 'requesterInstanceId'],
  heartbeat: ['credential', 'status'],
  publish_agents: ['credential', 'revision', 'agents'],
  mark_closing: ['credential'],
  release: ['credential'],
  list_live: [],
  get_live: ['sessionId'],
  subscribe: ['cursor'],
  unsubscribe: [],
  upsert_summary: [
    'summary',
    'transcriptRelativePath',
    'summaryRelativePath',
    'storageState',
    'codec',
    'uncompressedSize',
    'compressedSize',
    'contentSha256',
    'archivedAt',
  ],
  list_catalog: [
    'limit',
    'search',
    'since',
    'until',
    'provider',
    'model',
    'minTokens',
    'titleContains',
  ],
  resolve_id: ['query'],
  get_summary: ['sessionId'],
  list_session_agents: ['sessionId'],
  rename: ['sessionId', 'name'],
  acquire_maintenance: ['sessionId', 'operation', 'holderId', 'leaseMs', 'holderPid'],
  release_maintenance: ['lease'],
  delete: ['sessionId', 'lease'],
  prune: ['maxAgeDays', 'holderId'],
  rebuild_catalog: [],
};

export function validateOperationArgs(
  op: string,
  args: unknown,
  canonicalRoot: string,
): asserts args is Record<string, unknown> {
  if (!(op in OPERATION_KEYS)) throw new TypeError(`Unknown Session Catalog operation: ${op}`);
  if (!args || typeof args !== 'object' || Array.isArray(args))
    throw new TypeError(`Session Catalog ${op} args must be an object`);
  const allowed = new Set(OPERATION_KEYS[op as SessionCatalogOperationName]);
  const unknown = Object.keys(args).filter((key) => !allowed.has(key));
  if (unknown.length > 0)
    throw new TypeError(`Session Catalog ${op} rejected unknown field(s): ${unknown.join(', ')}`);
  const record = args as Record<string, unknown>;
  const exact = (value: unknown, label: string, keys: readonly string[]): void => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new TypeError(`${label} must be an object`);
    const permitted = new Set(keys);
    const extra = Object.keys(value).filter((key) => !permitted.has(key));
    if (extra.length > 0)
      throw new TypeError(`${label} rejected unknown field(s): ${extra.join(', ')}`);
  };
  const credentialKeys = ['sessionId', 'leaseId', 'leaseSecret', 'ownerInstanceId', 'expiresAt'];
  const reservationKeys = ['reservationId', 'targetSessionId', 'requesterInstanceId', 'expiresAt'];
  const maintenanceKeys = ['sessionId', 'operation', 'holderId', 'leaseId', 'expiresAt'];
  const entryKeys = [
    'sessionId',
    'projectSlug',
    'projectRoot',
    'projectName',
    'workingDir',
    'clientType',
    'gitBranch',
    'status',
    'pid',
    'startedAt',
    'lastHeartbeatAt',
    'agentCount',
    'agents',
    'webuiEndpoint',
  ];
  if (record['credential'] !== undefined)
    exact(record['credential'], `${op}.credential`, credentialKeys);
  if (record['reservation'] !== undefined)
    exact(record['reservation'], `${op}.reservation`, reservationKeys);
  if (record['lease'] !== undefined) exact(record['lease'], `${op}.lease`, maintenanceKeys);
  if (record['entry'] !== undefined) exact(record['entry'], `${op}.entry`, entryKeys);
  if (record['entry'] && typeof record['entry'] === 'object') {
    const entry = record['entry'] as Record<string, unknown>;
    // An entry may come from any checkout of this repository (linked git
    // worktrees share this daemon), so identity is the canonical root and the
    // working directory is contained by the entry's own checkout.
    if (
      typeof entry['projectRoot'] !== 'string' ||
      (process.platform === 'win32'
        ? canonicalProjectRoot(entry['projectRoot']).toLowerCase() !== canonicalRoot.toLowerCase()
        : canonicalProjectRoot(entry['projectRoot']) !== canonicalRoot)
    ) {
      throw new TypeError(`${op}.entry project identity does not match this daemon`);
    }
    if (typeof entry['workingDir'] !== 'string')
      throw new TypeError(`${op}.entry workingDir is required`);
    const relative = path.relative(
      path.resolve(entry['projectRoot']),
      path.resolve(entry['workingDir']),
    );
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new TypeError(`${op}.entry workingDir is outside the project root`);
    }
  }
}

export function eventForOperation(
  op: SessionCatalogOperationName,
): SessionCatalogEventKind | undefined {
  switch (op) {
    case 'claim_new':
    case 'activate_reservation':
      return 'session.claimed';
    case 'publish_agents':
      return 'session.presence_changed';
    case 'mark_closing':
      return 'session.closing';
    case 'release':
      return 'session.released';
    case 'upsert_summary':
    case 'rename':
      return 'session.catalog_changed';
    case 'delete':
      return 'session.deleted';
    case 'rebuild_catalog':
      return 'session.rebuild_completed';
    default:
      return undefined;
  }
}
