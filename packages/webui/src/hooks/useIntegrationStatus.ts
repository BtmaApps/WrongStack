import { useEffect, useState } from 'react';
import { useLocalPrefs } from '@/stores/local-prefs';

export type IntegrationHealthStatus = 'disabled' | 'checking' | 'connected' | 'error';

export interface IntegrationProbeState {
  status: IntegrationHealthStatus;
  latencyMs: number | null;
  url: string;
  error?: string | undefined;
}

async function probeIntegration(
  kind: 'hq' | 'wrong-proxy',
  signal: AbortSignal,
): Promise<{
  connected: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const response = await fetch(`/api/integrations/${kind}/status`, {
    method: 'GET',
    signal,
    headers: { accept: 'application/json' },
  });
  const body = (await response.json()) as {
    connected?: unknown;
    latencyMs?: unknown;
    error?: unknown;
  };
  return {
    connected: response.ok && body.connected === true,
    ...(typeof body.latencyMs === 'number' ? { latencyMs: body.latencyMs } : {}),
    ...(typeof body.error === 'string' ? { error: body.error } : {}),
  };
}

export function useWrongProxyStatus(): IntegrationProbeState {
  const enabled = useLocalPrefs((s) => s.wrongProxyEnabled);
  const url = useLocalPrefs((s) => s.wrongProxyUrl);

  const [state, setState] = useState<IntegrationProbeState>(() => ({
    status: enabled && url.trim() ? 'checking' : 'disabled',
    latencyMs: null,
    url: url || 'http://localhost:3444',
  }));

  useEffect(() => {
    if (!enabled || !url.trim()) {
      setState({
        status: 'disabled',
        latencyMs: null,
        url: url || 'http://localhost:3444',
      });
      return;
    }

    setState({ status: 'checking', latencyMs: null, url: url.trim().replace(/\/+$/, '') });
    let disposed = false;
    const probe = async () => {
      const trimmed = url.trim().replace(/\/+$/, '');
      const start = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);

      try {
        const result = await probeIntegration('wrong-proxy', controller.signal);
        clearTimeout(timer);
        if (disposed) return;
        const ok = result.connected;
        setState({
          status: ok ? 'connected' : 'error',
          latencyMs: result.latencyMs ?? Date.now() - start,
          url: trimmed,
          error: ok ? undefined : (result.error ?? 'Unreachable'),
        });
      } catch (err) {
        clearTimeout(timer);
        if (disposed) return;
        setState({
          status: 'error',
          latencyMs: Date.now() - start,
          url: trimmed,
          error: err instanceof Error ? err.message : 'Unreachable',
        });
      }
    };

    void probe();
    const interval = setInterval(() => void probe(), 10_000);
    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [enabled, url]);

  return state;
}

export function useHqStatus(): IntegrationProbeState {
  const enabled = useLocalPrefs((s) => s.hqEnabled);
  const url = useLocalPrefs((s) => s.hqUrl);
  const token = useLocalPrefs((s) => s.hqToken);

  const [state, setState] = useState<IntegrationProbeState>(() => ({
    status: enabled && url.trim() ? 'checking' : 'disabled',
    latencyMs: null,
    url: url || '',
  }));

  useEffect(() => {
    if (!enabled || !url.trim()) {
      setState({
        status: 'disabled',
        latencyMs: null,
        url: url || '',
      });
      return;
    }

    setState({ status: 'checking', latencyMs: null, url: url.trim().replace(/\/+$/, '') });
    let disposed = false;
    const probe = async () => {
      const trimmed = url.trim().replace(/\/+$/, '');
      const start = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);

      try {
        const result = await probeIntegration('hq', controller.signal);
        clearTimeout(timer);
        if (disposed) return;
        const ok = result.connected;
        setState({
          status: ok ? 'connected' : 'error',
          latencyMs: result.latencyMs ?? Date.now() - start,
          url: trimmed,
          error: ok ? undefined : (result.error ?? 'Unreachable'),
        });
      } catch (err) {
        clearTimeout(timer);
        if (disposed) return;
        setState({
          status: 'error',
          latencyMs: Date.now() - start,
          url: trimmed,
          error: err instanceof Error ? err.message : 'Unreachable',
        });
      }
    };

    void probe();
    const interval = setInterval(() => void probe(), 10_000);
    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [enabled, url, token]);

  return state;
}
