import { LoaderCircle, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { request } from './platform';

export function RuntimeGate({
  scope,
  projectId,
  children,
}: {
  scope: 'project' | 'profile';
  projectId?: string;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState('starting');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const params = scope === 'project' ? { projectId } : {};
    setStatus('starting');
    setError('');
    const poll = async () => {
      try {
        const result = await request<{ status: string; error: string | null }>(
          `${scope}.status`,
          params,
        );
        if (stopped) return;
        setStatus(result.status);
        setError(result.error ?? '');
        if (result.status === 'starting' || result.status === 'running')
          timer = setTimeout(poll, 1000);
      } catch (error) {
        if (!stopped) {
          setError(error instanceof Error ? error.message : String(error));
          setStatus('error');
        }
      }
    };
    void request(`${scope}.open`, { ...params, retry: retry > 0 })
      .then(() => {
        if (!stopped) void poll();
      })
      .catch((error: unknown) => {
        if (!stopped) {
          setStatus('error');
          setError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [scope, projectId, retry]);
  if (status === 'error' || status === 'stopped')
    return (
      <section className="runtime-state">
        <h2>We couldn’t open this workspace.</h2>
        <p role="alert">{error || 'The workspace connection stopped.'}</p>
        <button
          type="button"
          className="button secondary"
          onClick={() => setRetry((retry) => retry + 1)}
        >
          <RefreshCw size={15} />
          Try again
        </button>
      </section>
    );
  if (status !== 'running')
    return (
      <section className="runtime-state">
        <LoaderCircle className="spin" size={25} />
        <h2>{scope === 'project' ? 'Opening your project…' : 'Opening WrongStack settings…'}</h2>
        <p>Your workspace will be ready in a moment.</p>
      </section>
    );
  return children;
}
