import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isStandaloneBinary } from '@wrongstack/persistence';
import { GovernanceAttachmentBrokerController } from './attachment-broker-controller.js';
import {
  acquireGovernanceDaemonStartupLease,
  createGovernanceDaemonMetadata,
  type GovernanceDaemonStartupLease,
  GovernanceDaemonStartupLeaseError,
  inspectGovernanceDaemon,
  removeOwnedGovernanceDaemonMetadata,
  shouldRecoverGovernanceEndpoint,
  writeGovernanceDaemonMetadata,
} from './daemon-metadata.js';
import {
  decodeGovernanceDaemonBootstrapRequest,
  GOVERNANCE_DAEMON_BOOTSTRAP_PROTOCOL_VERSION,
  type GovernanceDaemonBootstrapErrorCode,
  type GovernanceDaemonBootstrapMessage,
} from './daemon-protocol.js';
import { canonicalGovernanceProjectRoot, governanceProjectServerEndpoint } from './ipc-endpoint.js';
import { GovernanceProjectServer } from './project-server.js';

const BOOTSTRAP_REQUEST_TIMEOUT_MS = 10_000;

interface GovernanceDaemonArguments {
  readonly projectRoot: string;
  readonly projectId: string;
}

export function parseGovernanceDaemonArguments(argv: readonly string[]): GovernanceDaemonArguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag || !value || !['--project-root', '--project-id'].includes(flag)) {
      throw new Error('Governance daemon requires only --project-root and --project-id pairs.');
    }
    if (values.has(flag)) throw new Error(`Governance daemon argument ${flag} was provided twice.`);
    values.set(flag, value);
  }
  const projectRoot = values.get('--project-root');
  const projectId = values.get('--project-id');
  if (!projectRoot || !projectId || projectId.trim().length === 0 || projectId.length > 512) {
    throw new Error('Governance daemon requires valid --project-root and --project-id values.');
  }
  return { projectRoot: path.resolve(projectRoot), projectId };
}

export function isGovernanceProjectDaemonEntrypoint(
  entrypoint = process.argv[1],
  moduleUrl = import.meta.url,
): boolean {
  // In the standalone binary every module shares the executable's URL, so
  // this comparison is true everywhere; the binary dispatches explicitly.
  if (isStandaloneBinary(entrypoint)) return false;
  return Boolean(entrypoint && path.resolve(entrypoint) === path.resolve(fileURLToPath(moduleUrl)));
}

function send(message: GovernanceDaemonBootstrapMessage, callback?: (error?: Error) => void): void {
  if (!process.send || !process.connected) {
    callback?.(new Error('Governance daemon bootstrap channel is unavailable.'));
    return;
  }
  process.send(message, (error) => callback?.(error ?? undefined));
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

async function run(): Promise<void> {
  if (!process.send || !process.connected) {
    throw new Error('Governance daemon must be launched with a private bootstrap IPC channel.');
  }
  const parsed = parseGovernanceDaemonArguments(process.argv.slice(2));
  const instanceId = randomUUID();
  const startedAt = new Date().toISOString();
  const metadata = createGovernanceDaemonMetadata({
    projectRoot: parsed.projectRoot,
    projectId: parsed.projectId,
    pid: process.pid,
    instanceId,
    startedAt,
  });
  let stop: (exitCode: number) => Promise<void>;
  let attachmentBrokerController: GovernanceAttachmentBrokerController | undefined;
  const createServer = (): GovernanceProjectServer =>
    new GovernanceProjectServer({
      projectRoot: parsed.projectRoot,
      projectId: parsed.projectId,
      daemonControl: {
        status: () => ({
          projectId: parsed.projectId,
          pid: process.pid,
          instanceId,
          startedAt,
          ...(attachmentBrokerController
            ? { attachmentBroker: attachmentBrokerController.snapshot() }
            : {}),
        }),
      },
      onDaemonShutdownResponseFlushed: () => void stop(0),
      // No client has spoken for the idle window and no credential grant is
      // live: nothing is using this project's control plane, so release it.
      // Every sibling project daemon does this; governance was the only one
      // with no idle path at all, so once started it lived until killed.
      onIdle: () => void stop(0),
    });
  let server = createServer();
  let startupLease: GovernanceDaemonStartupLease | undefined;
  let metadataWritten = false;
  let stopping = false;
  let bootstrapComplete = false;
  let bootstrapTimer: ReturnType<typeof setTimeout> | undefined;

  stop = async (exitCode: number): Promise<void> => {
    if (stopping) return;
    stopping = true;
    if (bootstrapTimer) clearTimeout(bootstrapTimer);
    await attachmentBrokerController?.stop().catch(() => undefined);
    attachmentBrokerController = undefined;
    await server.close().catch(() => {});
    if (metadataWritten) {
      await removeOwnedGovernanceDaemonMetadata(parsed.projectRoot, metadata).catch(() => false);
      metadataWritten = false;
    }
    await startupLease?.release().catch(() => false);
    startupLease = undefined;
    if (process.connected) process.disconnect?.();
    process.exitCode = exitCode;
  };
  const failBootstrap = (message: string): void => {
    send(
      {
        type: 'bootstrap_error',
        protocolVersion: GOVERNANCE_DAEMON_BOOTSTRAP_PROTOCOL_VERSION,
        code: 'invalid_bootstrap',
        message,
      },
      () => void stop(1),
    );
  };

  process.once('SIGINT', () => void stop(0));
  process.once('SIGTERM', () => void stop(0));
  process.once('disconnect', () => {
    // DO NOT stop on a post-bootstrap disconnect. This IPC channel is one-shot:
    // `daemon-launcher.ts` calls `child.disconnect()` + `child.unref()` as soon
    // as the bootstrap handshake succeeds (the daemon is spawned `detached`
    // with `stdio: ['ignore','ignore','ignore','ipc']`), precisely so the
    // daemon outlives the CLI that started it. So a disconnect AFTER bootstrap
    // is the success signal, not an orphan signal — treating it as "nobody is
    // attached" kills every daemon the instant it finishes launching (13
    // governance tests fail with `connected: false`, tried 2026-09-17).
    // Only a disconnect BEFORE bootstrap is a failed launch.
    if (!bootstrapComplete) void stop(1);
  });

  const failStartup = (
    code: GovernanceDaemonBootstrapErrorCode,
    message: string,
    exitCode: number,
  ): void => {
    send(
      {
        type: 'bootstrap_error',
        protocolVersion: GOVERNANCE_DAEMON_BOOTSTRAP_PROTOCOL_VERSION,
        code,
        message,
      },
      () => void stop(exitCode),
    );
  };

  try {
    startupLease = await acquireGovernanceDaemonStartupLease({
      projectRoot: parsed.projectRoot,
      pid: process.pid,
      instanceId,
      startedAt,
    });
  } catch (error) {
    if (error instanceof GovernanceDaemonStartupLeaseError) {
      failStartup(error.code === 'busy' ? 'startup_busy' : 'endpoint_invalid', error.message, 2);
    } else {
      failStartup('startup_failed', 'Governance daemon could not acquire its startup lease.', 1);
    }
    return;
  }

  try {
    await server.start();
  } catch (error) {
    if (errorCode(error) !== 'EADDRINUSE') {
      failStartup(
        'startup_failed',
        'Governance daemon failed before acquiring project ownership.',
        1,
      );
      return;
    }
    const inspection = await inspectGovernanceDaemon(parsed.projectRoot).catch(() => null);
    if (inspection?.kind === 'live') {
      failStartup('owner_conflict', 'A governance daemon already owns this project endpoint.', 2);
      return;
    }
    if (!inspection || !shouldRecoverGovernanceEndpoint(process.platform, inspection)) {
      failStartup(
        'endpoint_invalid',
        inspection?.kind === 'endpoint_invalid'
          ? inspection.reason
          : 'Governance endpoint is occupied and cannot be recovered safely.',
        2,
      );
      return;
    }
    if (inspection.metadata) {
      await removeOwnedGovernanceDaemonMetadata(parsed.projectRoot, inspection.metadata).catch(
        () => false,
      );
    }
    await fs.rm(governanceProjectServerEndpoint(parsed.projectRoot), { force: true });
    server = createServer();
    try {
      await server.start();
    } catch {
      failStartup(
        'startup_failed',
        'Governance stale-endpoint recovery lost project ownership.',
        1,
      );
      return;
    }
  }

  try {
    attachmentBrokerController = new GovernanceAttachmentBrokerController({
      projectRoot: parsed.projectRoot,
      metadata,
      grants: {
        issueGrant: (options) => server.issueGrant(options),
        revokeGrant: (grantId, reason) => server.revokeGrant(grantId, reason),
      },
      onEvent: (event) => server.recordAttachmentBrokerEvent(event),
    });
    await attachmentBrokerController.start();
    await writeGovernanceDaemonMetadata(parsed.projectRoot, metadata);
    metadataWritten = true;
    if (!(await startupLease.release())) {
      failStartup('startup_failed', 'Governance daemon startup lease ownership was lost.', 1);
      return;
    }
    startupLease = undefined;
  } catch {
    failStartup(
      'startup_failed',
      'Governance daemon metadata or attachment broker could not be committed.',
      1,
    );
    return;
  }

  send({
    type: 'ready',
    protocolVersion: GOVERNANCE_DAEMON_BOOTSTRAP_PROTOCOL_VERSION,
    projectRoot: canonicalGovernanceProjectRoot(parsed.projectRoot),
    projectId: parsed.projectId,
    pid: process.pid,
    instanceId,
    startedAt,
  });

  bootstrapTimer = setTimeout(() => {
    failBootstrap('Governance daemon bootstrap request timed out.');
  }, BOOTSTRAP_REQUEST_TIMEOUT_MS);

  process.once('message', (input: unknown) => {
    if (bootstrapTimer) clearTimeout(bootstrapTimer);
    const decoded = decodeGovernanceDaemonBootstrapRequest(input);
    if (!decoded.decoded) {
      failBootstrap(
        `Governance daemon bootstrap request is invalid: ${decoded.issues[0]?.message ?? 'unknown issue'}`,
      );
      return;
    }
    try {
      const issued = server.issueGrant({
        clientId: decoded.request.clientId,
        issuedBy: 'governance-daemon-bootstrap',
        capabilities: decoded.request.capabilities,
        ttlMs: decoded.request.ttlMs,
      });
      bootstrapComplete = true;
      send(
        {
          type: 'bootstrap_result',
          protocolVersion: GOVERNANCE_DAEMON_BOOTSTRAP_PROTOCOL_VERSION,
          nonce: decoded.request.nonce,
          projectRoot: canonicalGovernanceProjectRoot(parsed.projectRoot),
          projectId: parsed.projectId,
          pid: process.pid,
          instanceId,
          startedAt,
          grantId: issued.grant.grantId,
          expiresAt: issued.grant.expiresAt,
          credential: {
            token: issued.token,
            projectId: parsed.projectId,
            clientId: decoded.request.clientId,
          },
        },
        (error) => {
          if (error) {
            bootstrapComplete = false;
            void stop(1);
            return;
          }
          if (process.connected) process.disconnect?.();
        },
      );
    } catch (error) {
      failBootstrap(
        `Governance daemon refused the requested capability grant: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
}

/** Daemon main; the standalone binary's `__wstack_daemon governance` dispatch. */
export function runGovernanceProjectDaemon(): void {
  void run().catch(() => {
    process.exitCode = 1;
    if (process.connected) process.disconnect?.();
  });
}

if (isGovernanceProjectDaemonEntrypoint()) runGovernanceProjectDaemon();
