import { randomUUID } from 'node:crypto';
import type { GovernanceAdminSession, GovernanceAdminSessionSnapshot } from './admin-session.js';
import type { GovernanceCapabilityGrant } from './capability-grant.js';
import type { GovernanceDaemonMetadata } from './daemon-metadata.js';
import type { GovernanceProjectClient } from './project-client.js';
import type { GovernanceServiceResponse } from './project-service.js';
import {
  GOVERNANCE_SERVICE_PROTOCOL_VERSION,
  type GovernanceRuntimeModelCapability,
} from './service-protocol.js';

export type GovernanceModelCapability = GovernanceRuntimeModelCapability;

export interface GovernanceModelSessionSnapshot {
  readonly projectId: string;
  readonly clientId: string;
  readonly grantId: string;
  readonly capabilities: readonly GovernanceModelCapability[];
  readonly expiresAt: string;
}

export const GOVERNANCE_MODEL_SESSION_CONSTRUCTION = Symbol(
  'governance-model-session-construction',
);

export class GovernanceModelSession {
  readonly #client: GovernanceProjectClient;
  readonly #snapshot: GovernanceModelSessionSnapshot;

  constructor(
    construction: typeof GOVERNANCE_MODEL_SESSION_CONSTRUCTION,
    client: GovernanceProjectClient,
    grant: GovernanceCapabilityGrant,
  ) {
    if (construction !== GOVERNANCE_MODEL_SESSION_CONSTRUCTION) {
      throw new Error(
        'Governance model sessions must be created through the compatibility factory.',
      );
    }
    this.#client = client;
    this.#snapshot = Object.freeze({
      projectId: grant.projectId,
      clientId: grant.clientId,
      grantId: grant.grantId,
      capabilities: Object.freeze([...grant.capabilities]) as readonly GovernanceModelCapability[],
      expiresAt: grant.expiresAt,
    });
  }

  request(input: unknown): Promise<GovernanceServiceResponse> {
    return this.#client.request(input);
  }

  snapshot(): GovernanceModelSessionSnapshot {
    return this.#snapshot;
  }
}

export interface GovernanceCompatibilityRuntimeSnapshot {
  readonly source: 'attached' | 'launched';
  readonly closed: boolean;
  readonly daemon: GovernanceAdminSessionSnapshot['daemon'];
  readonly control: {
    readonly kind: 'admin' | 'attachment';
    readonly clientId: string;
    readonly grantId: string;
    readonly expiresAt: string;
  };
  readonly admin: GovernanceAdminSessionSnapshot | null;
  readonly model: GovernanceModelSessionSnapshot;
}

export type GovernanceCompatibilityControl =
  | { readonly kind: 'admin'; readonly session: GovernanceAdminSession }
  | {
      readonly kind: 'attachment';
      readonly client: GovernanceProjectClient;
      readonly metadata: GovernanceDaemonMetadata;
      readonly grant: GovernanceCapabilityGrant;
    };

export const GOVERNANCE_COMPATIBILITY_RUNTIME_CONSTRUCTION = Symbol(
  'governance-compatibility-runtime-construction',
);

export class GovernanceCompatibilityRuntime {
  readonly model: GovernanceModelSession;
  readonly #control: GovernanceCompatibilityControl;
  readonly #source: 'attached' | 'launched';
  readonly #modelGrantId: string;
  #closed = false;
  #closePromise: Promise<GovernanceServiceResponse | null> | undefined;

  constructor(
    construction: typeof GOVERNANCE_COMPATIBILITY_RUNTIME_CONSTRUCTION,
    source: 'attached' | 'launched',
    control: GovernanceCompatibilityControl,
    model: GovernanceModelSession,
  ) {
    if (construction !== GOVERNANCE_COMPATIBILITY_RUNTIME_CONSTRUCTION) {
      throw new Error('Governance compatibility runtimes must be created through the factory.');
    }
    this.#source = source;
    this.#control = control;
    this.model = model;
    this.#modelGrantId = model.snapshot().grantId;
  }

  snapshot(): GovernanceCompatibilityRuntimeSnapshot {
    const control = this.#control;
    const admin = control.kind === 'admin' ? control.session.snapshot() : null;
    const daemon =
      control.kind === 'admin'
        ? admin!.daemon
        : Object.freeze({
            projectRoot: control.metadata.projectRoot,
            projectId: control.metadata.projectId,
            pid: control.metadata.pid,
            instanceId: control.metadata.instanceId,
            startedAt: control.metadata.startedAt,
          });
    const controlGrant = control.kind === 'admin' ? admin!.lease : control.grant;
    return Object.freeze({
      source: this.#source,
      closed: this.#closed,
      daemon,
      control: Object.freeze({
        kind: control.kind,
        clientId: controlGrant.clientId,
        grantId: controlGrant.grantId,
        expiresAt: controlGrant.expiresAt,
      }),
      admin,
      model: this.model.snapshot(),
    });
  }

  close(): Promise<GovernanceServiceResponse | null> {
    if (this.#closed) return Promise.resolve(null);
    if (this.#closePromise) return this.#closePromise;
    if (this.#control.kind === 'attachment') {
      this.#closePromise = this.#control.client
        .request({
          protocolVersion: GOVERNANCE_SERVICE_PROTOCOL_VERSION,
          requestId: `compat-release-${randomUUID()}`,
          type: 'release_runtime_attachment',
        })
        .then((response) => {
          if (response.ok && response.result.type === 'runtime_attachment_released') {
            this.#closed = true;
          }
          return response;
        })
        .finally(() => {
          this.#closePromise = undefined;
        });
      return this.#closePromise;
    }
    const adminSession = this.#control.session;
    this.#closePromise = this.revokeModelGrant()
      .then((response) => {
        if (response.ok && response.result.type === 'capability_grant_revoked') {
          this.#closed = true;
        }
        return response;
      })
      .finally(() => {
        // Local teardown is unconditional, and deliberately not tied to whether
        // the *remote* revoke succeeded. Stopping only on success meant that the
        // most likely failure — closing when the daemon is already gone, so the
        // revoke request errors — left the admin lease renewing a
        // capability_admin credential forever, with its timer still armed in a
        // process that was trying to exit.
        //
        // Stopping the lease only stops renewal; the credential already held
        // stays valid until its own TTL, so a prompt retry of `close()` can
        // still authenticate, and an abandoned runtime now expires on its own.
        // `#closed` still reflects the remote outcome rather than the local one.
        adminSession.stop();
        this.#closePromise = undefined;
      });
    return this.#closePromise;
  }

  async shutdownDaemon(
    reason = 'governance compatibility runtime requested graceful shutdown',
  ): Promise<GovernanceServiceResponse> {
    if (this.#control.kind === 'attachment') {
      return {
        ok: false,
        requestId: `compat-shutdown-denied-${randomUUID()}`,
        error: {
          code: 'permission_denied',
          message: 'Attached runtimes cannot shut down the project governance daemon.',
        },
      };
    }
    if (!this.#closed) await this.close().catch(() => null);
    const response = await this.#control.session.shutdownDaemon(reason);
    if (response.ok && response.result.type === 'daemon_shutdown_accepted') this.#closed = true;
    return response;
  }

  recordWorkspaceSnapshot(manifestHash: string): Promise<GovernanceServiceResponse> {
    const client = this.#control.kind === 'admin' ? this.#control.session : this.#control.client;
    return client.request({
      protocolVersion: GOVERNANCE_SERVICE_PROTOCOL_VERSION,
      requestId: `workspace-snapshot-${randomUUID()}`,
      type: 'record_workspace_snapshot',
      manifestHash,
    });
  }

  private revokeModelGrant(): Promise<GovernanceServiceResponse> {
    if (this.#control.kind !== 'admin') {
      throw new Error('Attached runtimes release their paired grants through the control grant.');
    }
    return this.#control.session.request({
      protocolVersion: GOVERNANCE_SERVICE_PROTOCOL_VERSION,
      requestId: `compat-revoke-${randomUUID()}`,
      type: 'revoke_capability_grant',
      grantId: this.#modelGrantId,
      reason: 'governance compatibility runtime closed',
    });
  }
}
