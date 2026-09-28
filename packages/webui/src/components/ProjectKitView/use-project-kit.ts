import { useEffect, useState } from 'react';
import { useActiveSessionId, useConfigStore } from '@/stores';
import type { KitCatalog, KitDetail } from './types';

async function request<T>(
  sessionId: string | null | undefined,
  name: string | undefined,
  signal: AbortSignal,
): Promise<T> {
  const query = new URLSearchParams();
  if (sessionId) query.set('sessionId', sessionId);
  if (name) query.set('name', name);
  const response = await fetch(`/api/project-kit?${query}`, {
    signal,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data as T;
}

export function useProjectKit() {
  const sessionId = useActiveSessionId();
  const connected = useConfigStore((s) => s.wsConnected);
  const [generation, setGeneration] = useState(0);
  const scope = `${sessionId ?? 'host'}:${connected}:${generation}`;
  const [selected, setSelected] = useState('');
  const [catalogState, setCatalog] = useState<{ scope: string; data: KitCatalog } | null>(null);
  const [detailState, setDetail] = useState<{ scope: string; data: KitDetail } | null>(null);
  const [catalogError, setCatalogError] = useState<{ scope: string; text: string } | null>(null);
  const [detailError, setDetailError] = useState<{
    scope: string;
    name: string;
    text: string;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setCatalogError(null);
    request<KitCatalog>(sessionId, undefined, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setCatalog({ scope, data });
        setSelected((current) => (data.tools.some((kit) => kit.name === current) ? current : ''));
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setCatalogError({ scope, text: error.message });
      });
    return () => controller.abort();
  }, [scope, sessionId]);
  const catalog = catalogState?.scope === scope ? catalogState.data : null;
  useEffect(() => {
    if (!selected || !catalog?.tools.some((kit) => kit.name === selected)) return;
    const controller = new AbortController();
    setDetailError(null);
    request<{ kit: KitDetail }>(sessionId, selected, controller.signal)
      .then(({ kit }) => {
        if (!controller.signal.aborted) setDetail({ scope, data: kit });
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted)
          setDetailError({ scope, name: selected, text: error.message });
      });
    return () => controller.abort();
  }, [catalog, scope, selected, sessionId]);
  return {
    sessionId,
    selected,
    setSelected,
    catalog,
    detail:
      detailState?.scope === scope && detailState.data.name === selected ? detailState.data : null,
    error: catalogError?.scope === scope ? catalogError.text : null,
    detailError:
      detailError?.scope === scope && detailError.name === selected ? detailError.text : null,
    refresh: () => setGeneration((g) => g + 1),
  };
}
