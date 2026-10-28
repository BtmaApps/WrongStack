import { useCallback, useEffect, useState } from 'react';
import type { EngineHttp } from './engine-http';
import { entries, record } from './engine-values';
import { techLabel, techPlanKey, techPlanSelectionIsCurrent } from './techstack-model';

export function TechStackRemediation({
  http,
  snapshotId,
  onChanged,
}: {
  http: EngineHttp;
  snapshotId: string;
  onChanged: () => void;
}) {
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const load = useCallback(async () => {
    setError('');
    setPlan(null);
    setSelected([]);
    setReview(false);
    try {
      const response = record(await http('/api/techstack/remediation'));
      setPlan(record(response['plan']));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [http]);
  useEffect(() => {
    void load();
  }, [load, snapshotId]);
  const apply = async () => {
    if (!plan || busy || !selected.length) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const latest = record(record(await http('/api/techstack/remediation'))['plan']);
      if (!techPlanSelectionIsCurrent(plan, latest, selected)) {
        setPlan(latest);
        setSelected([]);
        setReview(false);
        throw Error('The plan changed. Review its current targets and select items again.');
      }
      const response = record(
        await http('/api/techstack/remediation/apply', 'POST', {
          approvedItems: selected,
          expectedSnapshotId: plan['snapshotId'],
          expectedItems: entries(plan['items']).filter((item) =>
            selected.includes(techPlanKey(item)),
          ),
        }),
      );
      setResult(record(response['result']));
      setSelected([]);
      setReview(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const items = entries(plan?.['items']);
  return (
    <section className="tech-remediation" aria-label="Dependency remediation">
      <header className="tech-section-heading">
        <div>
          <h2>Review the next changes</h2>
          <p>
            Choose individual package operations and review their targets before requesting
            execution.
          </p>
        </div>
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => void load()}
        >
          Refresh plan
        </button>
      </header>
      {error && (
        <p className="composer-error" role="alert">
          {error}
        </p>
      )}
      {!plan ? (
        !error && <p role="status">Building the upgrade plan…</p>
      ) : (
        <>
          <p className="field-help">
            Plan generated {String(plan['generatedAt'])}. Execution uses the engine’s package
            permission flow.
          </p>
          {items.length ? (
            items.map((item, index) => {
              const key = techPlanKey(item);
              return (
                <article className="tech-plan-item" key={`${key}:${index}`}>
                  <label>
                    <input
                      type="checkbox"
                      aria-label={`Select ${item['dependencyName']} in ${item['workspaceId']}`}
                      checked={selected.includes(key)}
                      disabled={busy || review}
                      onChange={(e) =>
                        setSelected((old) =>
                          e.target.checked ? [...old, key] : old.filter((value) => value !== key),
                        )
                      }
                    />
                    <strong>{String(item['dependencyName'])}</strong>
                    <span>
                      {techLabel(item['severity'])} · {techLabel(item['action'])}
                    </span>
                  </label>
                  <small>
                    {String(item['ecosystem'])} · workspace {String(item['workspaceId'])}
                  </small>
                  <p>
                    {String(item['currentVersion'] ?? 'Not reported')} →{' '}
                    {String(item['targetVersion'] ?? 'No explicit version target')}
                  </p>
                  <p>{String(item['rationale'] ?? '')}</p>
                  {typeof item['breakingRisk'] === 'string' && (
                    <p className="tech-breaking-risk">{item['breakingRisk']}</p>
                  )}
                  {typeof item['suggestedCommand'] === 'string' && (
                    <details>
                      <summary>Informational command</summary>
                      <code>{item['suggestedCommand']}</code>
                    </details>
                  )}
                </article>
              );
            })
          ) : (
            <p>No remediation actions in this snapshot.</p>
          )}
          {review ? (
            <div className="tech-plan-confirm">
              <h3>Execute {selected.length} selected operations?</h3>
              <p>
                These operations can change project manifests and lockfiles. Review the selected
                versions above.
              </p>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setReview(false)}
              >
                Keep reviewing plan
              </button>
              <button
                type="button"
                className="button primary"
                disabled={busy}
                onClick={() => void apply()}
              >
                {busy ? 'Waiting for the engine…' : 'Execute selected operations'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="button primary"
              disabled={busy || !selected.length}
              onClick={() => setReview(true)}
            >
              Review {selected.length} selected operations
            </button>
          )}
        </>
      )}
      {result && (
        <section role="status">
          <h3>{result['dryRun'] === true ? 'Plan preview' : 'Execution results'}</h3>
          {entries(result['items']).map((item, index) => (
            <article className="tech-plan-item" key={index}>
              <strong>
                {String(item['dependencyName'])} · {techLabel(item['status'])}
              </strong>
              {typeof item['detail'] === 'string' && <p>{item['detail']}</p>}
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
