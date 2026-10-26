import { FlaskConical, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { EngineSend } from './engine-operations';
import type { EngineState } from './engine-state';
import { providerChoices } from './provider-settings-model';

export function ProviderDiagnostics({ state, send }: { state: EngineState; send: EngineSend }) {
  const [provider, setProvider] = useState(state.needsSetup ? '' : state.provider);
  const [models, setModels] = useState(state.model);
  const [timeout, setTimeoutMs] = useState(45000);
  const [tokens, setTokens] = useState(32);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [queued, setQueued] = useState(false);
  useEffect(() => {
    void Promise.all([send('providers.list'), send('providers.saved')]).catch((error: unknown) =>
      setError(String(error)),
    );
  }, [send]);
  const runs = Object.values(state.providerTests);
  const run = selected ? state.providerTests[selected] : runs.at(-1);
  const busy = queued || Boolean(run && !run.complete);
  useEffect(() => {
    if (selected && state.providerTests[selected]) setQueued(false);
  }, [selected, state.providerTests]);
  useEffect(() => {
    if (!queued) return;
    const timer = setTimeout(() => {
      setQueued(false);
      setError(
        'The engine did not acknowledge this test request. Check the provider status before retrying.',
      );
    }, 15000);
    return () => clearTimeout(timer);
  }, [queued]);
  const start = async () => {
    setError('');
    const ids = [
      ...new Set(
        models
          .split(/[\n,]/)
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ];
    if (!provider || !ids.length || ids.length > 200) {
      setError('Choose a saved provider and between 1 and 200 model IDs.');
      return;
    }
    const requestId = crypto.randomUUID();
    setSelected(requestId);
    setQueued(true);
    try {
      await send('provider.test.run', {
        requestId,
        providerId: provider,
        modelIds: ids,
        timeoutMs: timeout,
        maxTokens: tokens,
      });
    } catch (error) {
      setQueued(false);
      setError(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <section className="feature-editor provider-test-workspace">
      <h3>Model access tests</h3>
      <p>
        Test the saved connection against the selected models. Each model test sends a small
        provider request.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void start();
        }}
      >
        <div className="feature-field-grid">
          <label>
            Provider
            <select
              aria-label="Test provider"
              required
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
            >
              <option value="">Choose a saved provider</option>
              {providerChoices(state)
                .filter((item) => item.saved)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Timeout per model (seconds)
            <input
              aria-label="Model test timeout"
              type="number"
              min={1}
              max={120}
              value={timeout / 1000}
              onChange={(event) => setTimeoutMs(Number(event.target.value) * 1000)}
            />
          </label>
          <label>
            Maximum output tokens
            <input
              aria-label="Model test output limit"
              type="number"
              min={1}
              max={4096}
              value={tokens}
              onChange={(event) => setTokens(Number(event.target.value))}
            />
          </label>
        </div>
        <label>
          Model IDs
          <textarea
            aria-label="Models to test"
            required
            rows={3}
            value={models}
            onChange={(event) => setModels(event.target.value)}
            placeholder="Separate model IDs with commas or new lines"
          />
        </label>
        {error && (
          <p className="session-error" role="alert">
            {error}
          </p>
        )}
        <div className="feature-actions">
          <button type="submit" className="button primary" disabled={busy || !state.connected}>
            <FlaskConical size={13} />
            Start model tests
          </button>
          {busy && run && (
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                void send('provider.test.cancel', { requestId: run.id }).catch((error: unknown) =>
                  setError(String(error)),
                )
              }
            >
              <Square size={13} />
              Stop model tests
            </button>
          )}
        </div>
      </form>
      {runs.length > 0 && (
        <label>
          Test run
          <select
            aria-label="Model test run"
            value={run?.id ?? ''}
            onChange={(event) => setSelected(event.target.value)}
          >
            {[...runs].reverse().map((item) => (
              <option value={item.id} key={item.id}>
                {item.provider} · {Object.keys(item.results).length}/{item.total} ·{' '}
                {item.complete ? 'finished' : 'running'}
              </option>
            ))}
          </select>
        </label>
      )}
      {run && (
        <>
          <p role="status">
            {run.complete
              ? `Finished: ${run.complete['passed'] ?? 0} passed, ${run.complete['failed'] ?? 0} failed, ${run.complete['cancelled'] ?? 0} cancelled`
              : `Testing: ${Object.keys(run.results).length} of ${run.total} models`}
          </p>
          {run.complete?.['error'] && (
            <p className="session-error">{String(run.complete['error'])}</p>
          )}
          <div className="provider-test-table">
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Status</th>
                  <th>Latency</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(run.results).map((item) => (
                  <tr key={String(item['modelId'])}>
                    <td>{String(item['modelId'])}</td>
                    <td>{String(item['status'])}</td>
                    <td>{String(item['latencyMs'] ?? '—')} ms</td>
                    <td>{String(item['error'] ?? item['diagnosis'] ?? '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
