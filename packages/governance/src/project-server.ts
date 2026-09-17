import * as fs from 'node:fs/promises';
import * as net from 'node:net';
import * as path from 'node:path';
import type { GovernanceAttachmentBrokerLifecycleEvent } from './attachment-broker-controller.js';
import { AuthenticatedGovernanceProjectService } from './authenticated-project-service.js';
import {
  GovernanceCapabilityGrantRegistry,
  type GovernanceCapabilityGrantRegistryOptions,
  type GovernanceGrantAuditEvent,
  type IssuedGovernanceCapabilityGrant,
  type IssueGovernanceCapabilityGrantOptions,
} from './capability-grant.js';
import type {
  GovernanceDaemonControlPort,
  GovernanceDaemonShutdownNotice,
} from './daemon-control.js';
import { type GovernanceObservationCategory, SqliteGovernanceEventStore } from './event-store.js';
import { governanceProjectDatabasePath, governanceProjectServerEndpoint } from './ipc-endpoint.js';
import {
  decodeGovernanceIpcEnvelope,
  encodeGovernanceIpcFrame,
  GOVERNANCE_IPC_MAX_FRAME_BYTES,
} from './ipc-protocol.js';
import {
  type GovernanceDecisionContextProvider,
  GovernanceProjectService,
  type GovernanceServiceResponse,
} from './project-service.js';

type ServerState = 'idle' | 'starting' | 'ready' | 'closing' | 'closed';

const GOVERNANCE_IPC_MAX_CONNECTIONS = 128;
const GOVERNANCE_IPC_SOCKET_TIMEOUT_MS = 10_000;
/**
 * Idle window before the daemon asks its host to stop.
 *
 * Deliberately much longer than the five minutes the sibling project daemons
 * use, because governance is request-per-connection: the client opens a socket,
 * writes one frame and closes it, so `sockets.size === 0` is the NORMAL state
 * between calls and says nothing about whether a session is alive. The real
 * heartbeat is the credential lease, which rotates on a 60 minute TTL renewed
 * 5 minutes early (`credential-lease-controller.ts`) — roughly every 55
 * minutes. A window shorter than that would kill a daemon out from under a live
 * admin session that simply had nothing to say yet.
 */
const GOVERNANCE_DEFAULT_IDLE_MS = 90 * 60_000;

interface GovernanceProjectServerOptions {
  readonly projectRoot: string;
  readonly projectId: string;
  readonly resolveDecisionContext?: GovernanceDecisionContextProvider | undefined;
  readonly grantRegistry?: Omit<GovernanceCapabilityGrantRegistryOptions, 'auditSink'> | undefined;
  readonly daemonControl?: GovernanceDaemonControlPort | undefined;
  readonly onDaemonShutdownResponseFlushed?:
    | ((notice: GovernanceDaemonShutdownNotice) => void)
    | undefined;
  /**
   * Idle window in milliseconds; defaults to {@link GOVERNANCE_DEFAULT_IDLE_MS}.
   *
   * A constructor option rather than an environment variable on purpose:
   * `governanceDaemonEnvironment()` passes the child an ALLOWLIST (PATH, TMP,
   * TZ, …), so a `WRONGSTACK_*` knob would be stripped before the daemon ever
   * read it — and widening that allowlist would loosen a deliberate
   * sanitization boundary. Threading it through the bootstrap request instead
   * would mean versioning the IPC protocol. This keeps both untouched and is
   * what lets tests drive a short window.
   */
  readonly idleMs?: number | undefined;
  /**
   * Called once the server has been idle for {@link idleMs}. The daemon wires
   * this to its own `stop(0)`. When omitted NO idle timer is armed at all, so
   * a server constructed without it behaves exactly as before.
   */
  readonly onIdle?: (() => void) | undefined;
}

function requestIdFromUnknown(input: unknown): string {
  if (!input || typeof input !== 'object') return 'unknown';
  const request = 'request' in input ? input.request : input;
  return request &&
    typeof request === 'object' &&
    'requestId' in request &&
    typeof request.requestId === 'string'
    ? request.requestId
    : 'unknown';
}

function transportError(
  requestId: string,
  code: 'invalid_request' | 'store_failure',
  message: string,
  details?: readonly { readonly path: string; readonly message: string }[],
): GovernanceServiceResponse {
  return {
    ok: false,
    requestId,
    error: {
      code,
      message,
      ...(details
        ? {
            details: details.map((detail) => ({
              code: 'invalid_transport_envelope',
              path: detail.path,
              message: detail.message,
            })),
          }
        : {}),
    },
  };
}

function grantObservationCategory(event: GovernanceGrantAuditEvent): GovernanceObservationCategory {
  switch (event.type) {
    case 'grant_issued':
      return 'capability_grant_issued';
    case 'grant_revoked':
      return 'capability_grant_revoked';
    case 'grant_expired':
      return 'capability_grant_expired';
    case 'grant_rotated':
      return 'capability_grant_rotated';
  }
}

export class GovernanceProjectServer {
  readonly projectRoot: string;
  readonly projectId: string;
  readonly endpoint: string;
  readonly databasePath: string;

  private readonly options: GovernanceProjectServerOptions;
  private readonly sockets = new Set<net.Socket>();
  private readonly pendingSockets = new Set<net.Socket>();
  private state: ServerState = 'idle';
  private listener: net.Server | null = null;
  private store: SqliteGovernanceEventStore | null = null;
  private authenticated: AuthenticatedGovernanceProjectService | null = null;
  private grants: GovernanceCapabilityGrantRegistry | null = null;
  private lastListenerError: Error | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private lastActivityAt = Date.now();

  constructor(options: GovernanceProjectServerOptions) {
    if (options.projectId.trim().length === 0) throw new Error('projectId must not be empty.');
    this.options = options;
    this.projectRoot = path.resolve(options.projectRoot);
    this.projectId = options.projectId;
    this.endpoint = governanceProjectServerEndpoint(this.projectRoot);
    this.databasePath = governanceProjectDatabasePath(this.projectRoot);
  }

  get storageOpen(): boolean {
    return this.store !== null;
  }

  get ready(): boolean {
    return this.state === 'ready';
  }

  get listenerError(): Error | null {
    return this.lastListenerError;
  }

  async start(): Promise<void> {
    if (this.state !== 'idle')
      throw new Error(`Governance server cannot start from ${this.state}.`);
    this.state = 'starting';
    try {
      const root = await fs.stat(this.projectRoot);
      if (!root.isDirectory()) throw new Error('Governance project root must be a directory.');
      await this.ensureEndpointParent();
    } catch (error) {
      this.state = 'closed';
      throw error;
    }

    const listener = net.createServer((socket) => this.onConnection(socket));
    listener.maxConnections = GOVERNANCE_IPC_MAX_CONNECTIONS;
    this.listener = listener;
    try {
      await this.listen(listener);
      await fs.mkdir(path.dirname(this.databasePath), { recursive: true });
      const store = SqliteGovernanceEventStore.open(this.databasePath);
      this.store = store;
      const service = new GovernanceProjectService(
        this.projectId,
        store,
        this.options.resolveDecisionContext,
      );
      const grants = new GovernanceCapabilityGrantRegistry(this.projectId, {
        ...this.options.grantRegistry,
        auditSink: (event) => this.persistGrantAuditEvent(event),
      });
      this.grants = grants;
      this.authenticated = new AuthenticatedGovernanceProjectService(
        service,
        grants,
        undefined,
        this.options.daemonControl,
      );
      this.state = 'ready';
      for (const socket of this.pendingSockets) this.accept(socket);
      this.pendingSockets.clear();
      this.lastActivityAt = Date.now();
      this.scheduleIdleStop();
    } catch (error) {
      this.state = 'closing';
      for (const socket of this.pendingSockets) socket.destroy();
      this.pendingSockets.clear();
      await this.closeListener();
      if (this.authenticated) this.authenticated.close();
      else this.store?.close();
      this.authenticated = null;
      this.store = null;
      this.grants = null;
      this.state = 'closed';
      throw error;
    }
  }

  issueGrant(options: IssueGovernanceCapabilityGrantOptions): IssuedGovernanceCapabilityGrant {
    if (!this.grants || this.state !== 'ready') throw new Error('Governance server is not ready.');
    return this.grants.issue(options);
  }

  revokeGrant(grantId: string, reason?: string): boolean {
    if (!this.grants || this.state !== 'ready') throw new Error('Governance server is not ready.');
    return this.grants.revoke(grantId, reason);
  }

  recordAttachmentBrokerEvent(event: GovernanceAttachmentBrokerLifecycleEvent): void {
    if (!this.store || this.state !== 'ready') {
      throw new Error('Governance event store is unavailable for attachment broker audit.');
    }
    if (event.projectId !== this.projectId) {
      throw new Error('Attachment broker event belongs to another governance project.');
    }
    const result = this.store.appendObservation({
      observationId: `daemon:${event.instanceId}:attachment-broker:${event.sequence}`,
      projectId: this.projectId,
      taskId: null,
      source: 'governance-daemon-attachment-broker',
      category: 'daemon_attachment_broker_lifecycle',
      observedAt: event.occurredAt,
      payload: { ...event },
    });
    if (!result.handled) throw new Error(result.message);
  }

  async close(): Promise<void> {
    if (this.state === 'closed') return;
    this.state = 'closing';
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    this.pendingSockets.clear();
    await this.closeListener();
    if (this.authenticated) this.authenticated.close();
    else this.store?.close();
    this.authenticated = null;
    this.store = null;
    this.grants = null;
    this.state = 'closed';
  }

  /**
   * Arm the idle shutdown. NEVER re-arms an already-armed timer.
   *
   * The `this.idleTimer` guard matters: re-arming from a caller that runs more
   * often than the window resets the countdown forever, which is exactly how
   * the mailbox and kanban daemons ended up never idling out. The only place
   * that re-arms here is the timer's own callback, after it has decided the
   * daemon is still busy — so the interval between arms is always `idleMs`.
   *
   * "Busy" is three things, in order: a request is in flight (`sockets`), a
   * usable credential grant exists (its rotation is the session's heartbeat),
   * or the activity clock moved since this timer was armed.
   */
  private scheduleIdleStop(): void {
    const onIdle = this.options.onIdle;
    if (!onIdle || this.state !== 'ready' || this.idleTimer) return;
    const idleMs = this.options.idleMs ?? GOVERNANCE_DEFAULT_IDLE_MS;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      if (this.state !== 'ready') return;
      if (this.sockets.size > 0 || this.pendingSockets.size > 0) {
        this.scheduleIdleStop();
        return;
      }
      if (this.grants?.hasActiveGrants()) {
        this.scheduleIdleStop();
        return;
      }
      if (Date.now() - this.lastActivityAt < idleMs) {
        this.scheduleIdleStop();
        return;
      }
      onIdle();
    }, idleMs);
    this.idleTimer.unref?.();
  }

  private async ensureEndpointParent(): Promise<void> {
    if (process.platform === 'win32') return;
    const directory = path.dirname(this.endpoint);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.chmod(directory, 0o700);
  }

  private listen(listener: net.Server): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error): void => {
        listener.off('listening', onListening);
        reject(error);
      };
      const onListening = (): void => {
        listener.off('error', onError);
        listener.on('error', (error) => {
          this.lastListenerError = error;
        });
        resolve();
      };
      listener.once('error', onError);
      listener.once('listening', onListening);
      listener.listen(this.endpoint);
    });
  }

  private onConnection(socket: net.Socket): void {
    this.sockets.add(socket);
    socket.setTimeout(GOVERNANCE_IPC_SOCKET_TIMEOUT_MS, () => socket.destroy());
    socket.once('close', () => {
      this.sockets.delete(socket);
      this.pendingSockets.delete(socket);
    });
    socket.once('error', () => {
      this.sockets.delete(socket);
      this.pendingSockets.delete(socket);
    });
    if (this.state === 'ready') this.accept(socket);
    else if (this.state === 'starting') this.pendingSockets.add(socket);
    else socket.destroy();
  }

  private accept(socket: net.Socket): void {
    // Chunks are held and joined once, at the frame delimiter. Re-concatenating
    // the whole buffer on every `data` event made framing quadratic in the
    // frame size: an 8 MB request arriving in 64 KB reads copied ~524 MB before
    // the size check could even reject it, so a client could burn a core by
    // repeatedly sending junk it knew would be refused. The delimiter is a
    // single byte, so it can never straddle a chunk boundary and each chunk can
    // be searched on its own.
    const chunks: Buffer[] = [];
    let size = 0;
    let handled = false;
    socket.on('data', (chunk: Buffer) => {
      if (handled) return;
      const newline = chunk.indexOf(0x0a);
      // The cap applies to the frame itself, not to whatever the peer happened
      // to pack in after the delimiter.
      const frameBytes = size + (newline < 0 ? chunk.byteLength : newline);
      if (frameBytes > GOVERNANCE_IPC_MAX_FRAME_BYTES) {
        handled = true;
        this.send(
          socket,
          transportError('unknown', 'invalid_request', 'Governance IPC request is too large.'),
        );
        return;
      }
      if (newline < 0) {
        chunks.push(chunk);
        size = frameBytes;
        return;
      }
      handled = true;
      chunks.push(chunk.subarray(0, newline));
      const line = Buffer.concat(chunks).toString('utf8').replace(/\r$/, '');
      this.handleLine(socket, line);
    });
  }

  private handleLine(socket: net.Socket, line: string): void {
    // Single funnel for every request on every connection, so this is the one
    // honest activity signal. Connection churn is not: governance opens a fresh
    // socket per request, so counting sockets would read "idle" between calls.
    this.lastActivityAt = Date.now();
    let input: unknown;
    try {
      input = JSON.parse(line);
    } catch {
      this.send(
        socket,
        transportError('unknown', 'invalid_request', 'Invalid governance IPC JSON.'),
      );
      return;
    }
    const decoded = decodeGovernanceIpcEnvelope(input);
    if (!decoded.decoded) {
      this.send(
        socket,
        transportError(
          requestIdFromUnknown(input),
          'invalid_request',
          'Governance IPC envelope failed strict decoding.',
          decoded.issues,
        ),
      );
      return;
    }
    if (!this.authenticated) {
      this.send(
        socket,
        transportError(
          requestIdFromUnknown(input),
          'store_failure',
          'Governance project service is unavailable.',
        ),
      );
      return;
    }
    try {
      const response = this.authenticated.handleUnknown(
        decoded.envelope.request,
        decoded.envelope.credential,
      );
      const shutdownNotice =
        response.ok && response.result.type === 'daemon_shutdown_accepted'
          ? {
              requestId: response.requestId,
              expectedInstanceId: response.result.instanceId,
              requestedBy: response.result.requestedBy,
              reason: response.result.reason,
            }
          : undefined;
      if (shutdownNotice) {
        try {
          this.persistDaemonShutdownAudit(shutdownNotice);
        } catch {
          this.send(
            socket,
            transportError(
              response.requestId,
              'store_failure',
              'Governance daemon shutdown audit could not be persisted.',
            ),
          );
          return;
        }
      }
      this.send(
        socket,
        response,
        shutdownNotice && this.options.onDaemonShutdownResponseFlushed
          ? () => {
              try {
                this.options.onDaemonShutdownResponseFlushed?.(shutdownNotice);
              } catch {
                // The response was delivered; lifecycle callback failures stay process-local.
              }
            }
          : undefined,
      );
    } catch {
      this.send(
        socket,
        transportError(
          requestIdFromUnknown(input),
          'store_failure',
          'Governance project service request failed.',
        ),
      );
    }
  }

  private send(
    socket: net.Socket,
    response: GovernanceServiceResponse,
    onFlushed?: (() => void) | undefined,
  ): void {
    try {
      socket.end(encodeGovernanceIpcFrame(response), onFlushed);
    } catch {
      socket.end(
        encodeGovernanceIpcFrame(
          transportError(
            response.requestId,
            'store_failure',
            'Governance IPC response is too large.',
          ),
        ),
      );
    }
  }

  private persistGrantAuditEvent(event: GovernanceGrantAuditEvent): void {
    if (!this.store) throw new Error('Governance event store is unavailable for grant audit.');
    const result = this.store.appendObservation({
      observationId: `grant:${event.grantId}:${event.type}:${event.sequence}`,
      projectId: this.projectId,
      taskId: null,
      source: 'governance-capability-registry',
      category: grantObservationCategory(event),
      observedAt: event.occurredAt,
      payload: { ...event },
    });
    if (!result.handled) throw new Error(result.message);
  }

  private persistDaemonShutdownAudit(notice: GovernanceDaemonShutdownNotice): void {
    if (!this.store) throw new Error('Governance event store is unavailable for daemon audit.');
    const result = this.store.appendObservation({
      observationId: `daemon:${notice.expectedInstanceId}:shutdown:${notice.requestId}`,
      projectId: this.projectId,
      taskId: null,
      source: 'governance-daemon-control',
      category: 'daemon_shutdown_requested',
      observedAt: new Date().toISOString(),
      payload: { ...notice },
    });
    if (!result.handled) throw new Error(result.message);
  }

  private closeListener(): Promise<void> {
    const listener = this.listener;
    this.listener = null;
    if (!listener?.listening) return Promise.resolve();
    return new Promise((resolve) => listener.close(() => resolve()));
  }
}
