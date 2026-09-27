import packageInfo from '../package.json' with { type: 'json' };

/** Bundled at build time and retained by a running process across upgrades. */
export const WRONGSTACK_RUNTIME_VERSION: string = packageInfo.version;

/** Explicit upgrade/restart succeeds only after the replacement reports our release. */
export function assertDaemonRuntimeVersion(daemonVersion: unknown): void {
  if (daemonVersion === WRONGSTACK_RUNTIME_VERSION) return;
  const actual =
    typeof daemonVersion === 'string' && daemonVersion ? daemonVersion : 'unknown (legacy)';
  throw new Error(
    `Daemon version ${actual}; expected ${WRONGSTACK_RUNTIME_VERSION}. Align the daemon and client installations before retrying restart.`,
  );
}

/** A release mismatch is advisory; wire compatibility is checked separately. */
export function withDaemonVersion<T extends { status: string; detail: string }>(
  service: T,
  daemonVersion: unknown,
  clientVersion = WRONGSTACK_RUNTIME_VERSION,
): T & { versionMismatch?: boolean } {
  if (service.status === 'offline' || service.status === 'unavailable') return service;
  const known = typeof daemonVersion === 'string' && daemonVersion.length > 0;
  if (known && daemonVersion === clientVersion) {
    return { ...service, detail: `${service.detail} WrongStack ${daemonVersion}.` };
  }
  return {
    ...service,
    status: service.status === 'healthy' ? 'degraded' : service.status,
    versionMismatch: true,
    detail: `${service.detail} ${known ? `Daemon WrongStack ${daemonVersion}; client ${clientVersion}. Version mismatch: align client and daemon installations, then restart the daemon from Connections.` : `Daemon version unknown (legacy); client ${clientVersion}. Restart the daemon from Connections to load the installed version.`}`,
  };
}
