import type * as http from 'node:http';

export type IntegrationProbeKind = 'hq' | 'wrong-proxy';

export type IntegrationTargetResolver = (kind: IntegrationProbeKind) => string | undefined;

const PROBE_PATHS: Record<IntegrationProbeKind, string> = {
  hq: '/api/auth/status',
  'wrong-proxy': '/api/health',
};

function probeUrl(rawTarget: string, kind: IntegrationProbeKind): URL | undefined {
  try {
    const target = new URL(rawTarget.trim());
    // This endpoint is a fixed, data-free health probe, not a generic proxy.
    // In particular, do not accept credentials or an operator-provided path.
    if (
      (target.protocol !== 'http:' && target.protocol !== 'https:') ||
      target.username ||
      target.password
    ) {
      return undefined;
    }
    target.pathname = PROBE_PATHS[kind];
    target.search = '';
    target.hash = '';
    return target;
  } catch {
    return undefined;
  }
}

/**
 * Same-origin relay for the two operator-configured integration health probes.
 *
 * HQ deliberately rejects browser requests from another origin to prevent
 * cross-origin reads. The WebUI used to make that request directly, so its
 * status chip reported a healthy HQ as unreachable. Keep the browser on the
 * WebUI origin and allow the server to make only these fixed health requests.
 */
export async function handleIntegrationStatus(
  res: http.ServerResponse,
  kind: IntegrationProbeKind,
  getTarget: IntegrationTargetResolver | undefined,
): Promise<void> {
  const rawTarget = getTarget?.(kind);
  const target = typeof rawTarget === 'string' ? probeUrl(rawTarget, kind) : undefined;
  if (!target) {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ connected: false, error: 'Integration is not configured' }));
    return;
  }

  const startedAt = Date.now();
  try {
    const upstream = await fetch(target, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(2_000),
    });
    // HQ returns 401 when it is online but browser authentication is enabled.
    const connected = upstream.ok || (kind === 'hq' && upstream.status === 401);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(
      JSON.stringify({
        connected,
        latencyMs: Date.now() - startedAt,
        upstreamStatus: upstream.status,
      }),
    );
  } catch {
    res.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ connected: false, error: 'Integration is unreachable' }));
  }
}
