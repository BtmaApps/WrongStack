import { useCallback, useEffect, useRef, useState } from 'react';
import { type EngineHttp, EngineHttpError } from './engine-http';
import { record } from './engine-values';
import { techRunning } from './techstack-model';

export function useTechStack(http: EngineHttp, projectId: string) {
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);
  const [models, setModels] = useState<Record<string, unknown>>({});
  const [job, setJob] = useState<Record<string, unknown> | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState(() => {
    try {
      return localStorage.getItem(`wrongstack.desktop.techstack.job.${projectId}`) ?? '';
    } catch {
      return '';
    }
  });
  const current = useRef(0);
  const reload = useCallback(async () => {
    const own = ++current.current;
    setLoading(true);
    setError('');
    const outcomes = await Promise.allSettled([
      http('/api/techstack/snapshot'),
      http('/api/techstack/models'),
    ]);
    if (own !== current.current) return;
    const [saved, available] = outcomes;
    if (saved.status === 'fulfilled') {
      const result = record(saved.value);
      setSnapshot(record(result['snapshot']));
      setStale(result['stale'] === true);
    } else if (
      saved.reason instanceof EngineHttpError &&
      saved.reason.status === 404 &&
      record(saved.reason.data)['snapshot'] === null
    ) {
      setSnapshot(null);
      setStale(false);
    } else setError(saved.reason instanceof Error ? saved.reason.message : String(saved.reason));
    if (available.status === 'fulfilled') setModels(record(available.value));
    else
      setError((message) =>
        [message, 'Could not read available analysis models.'].filter(Boolean).join(' '),
      );
    setLoading(false);
  }, [http]);
  useEffect(() => {
    void reload();
    return () => {
      current.current++;
    };
  }, [reload]);
  useEffect(() => {
    if (!jobId) return;
    try {
      localStorage.setItem(`wrongstack.desktop.techstack.job.${projectId}`, jobId);
    } catch {
      /* Engine job ownership does not depend on browser storage. */
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const poll = async () => {
      try {
        const next = record(
          record(await http(`/api/techstack/jobs/${encodeURIComponent(jobId)}`))['job'],
        );
        if (cancelled) return;
        setJob(next);
        if (!techRunning(next)) {
          await reload();
          return;
        }
      } catch (e) {
        if (cancelled) return;
        if (!(e instanceof EngineHttpError && e.status === 404 && Date.now() - started < 30000))
          setError(`Could not update analysis job: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (!cancelled) timer = setTimeout(() => void poll(), 1500);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, projectId, http, reload]);
  const start = async (depth: string, model: string) => {
    if (busy || techRunning(job)) return;
    setBusy(true);
    setError('');
    try {
      const accepted = record(
        await http(
          depth === 'inventory' ? '/api/techstack/inventory' : '/api/techstack/analyze',
          'POST',
          depth === 'inventory'
            ? undefined
            : { depth, ...(depth === 'full' && model ? { model } : {}) },
        ),
      );
      if (typeof accepted['jobId'] !== 'string')
        throw Error('The engine did not return an analysis job.');
      setJob({
        id: accepted['jobId'],
        status: 'queued',
        kind: accepted['kind'],
        depth: accepted['depth'],
        model: accepted['model'],
      });
      setJobId(accepted['jobId']);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    if (!jobId || busy) return;
    setBusy(true);
    setError('');
    try {
      await http(`/api/techstack/jobs/${encodeURIComponent(jobId)}/cancel`, 'POST');
      setJob((old) => ({ ...old, status: 'cancelled' }));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return { snapshot, models, job, stale, error, setError, loading, busy, start, cancel, reload };
}
