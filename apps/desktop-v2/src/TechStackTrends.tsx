import { useEffect, useState } from 'react';
import type { EngineHttp } from './engine-http';
import { entries, record } from './engine-values';

export function TechStackTrends({ http, snapshotId }: { http: EngineHttp; snapshotId: string }) {
  const [trend, setTrend] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setTrend(null);
    setError('');
    void http('/api/techstack/trends')
      .then((data) => {
        if (active) setTrend(record(record(data)['trend']));
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [http, snapshotId]);
  if (error) return <p role="alert">{error}</p>;
  if (!trend) return <p role="status">Reading dependency history…</p>;
  const points = entries(trend['points']);
  const max = Math.max(
    1,
    ...points.map((point) =>
      Math.max(Number(point['outdated']) || 0, Number(point['vulnerable']) || 0),
    ),
  );
  return (
    <section className="tech-trends" aria-label="Dependency trends">
      <h2>Health over time</h2>
      <p>
        {String(trend['snapshots'] ?? 0)} recorded snapshots
        {trend['from'] ? ` · ${trend['from']} → ${trend['to']}` : ''}
      </p>
      {typeof trend['vulnerabilityHalfLifeMs'] === 'number' && (
        <p>
          Median vulnerability resolution:{' '}
          {(trend['vulnerabilityHalfLifeMs'] / 86400000).toFixed(1)} days.
        </p>
      )}
      {points.length ? (
        <>
          <div
            className="tech-trend-chart"
            role="img"
            aria-label="Outdated and vulnerable dependency counts by snapshot"
          >
            {points.map((point, i) => (
              <div
                key={String(point['snapshotId'])}
                title={`${point['createdAt']}: ${point['outdated']} outdated, ${point['vulnerable']} vulnerable`}
              >
                <div>
                  <i
                    className="tech-outdated-bar"
                    style={{ height: `${(Number(point['outdated']) / max) * 150}px` }}
                  />
                  <i
                    className="tech-vulnerable-bar"
                    style={{ height: `${(Number(point['vulnerable']) / max) * 150}px` }}
                  />
                </div>
                <small>{i + 1}</small>
              </div>
            ))}
          </div>
          <p className="field-help">
            Accent: outdated · red: vulnerable. Snapshot numbers follow oldest to newest.
          </p>
          <div className="tech-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Observed</th>
                  <th>Dependencies</th>
                  <th>Outdated</th>
                  <th>Vulnerable</th>
                </tr>
              </thead>
              <tbody>
                {points.map((point) => (
                  <tr key={String(point['snapshotId'])}>
                    <td>{String(point['createdAt'])}</td>
                    <td>{String(point['dependencies'])}</td>
                    <td>{String(point['outdated'])}</td>
                    <td>{String(point['vulnerable'])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p>No snapshots recorded yet.</p>
      )}
      <h3>Version movement</h3>
      <div className="tech-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Dependency</th>
              <th>Version</th>
              <th>Observed age</th>
              <th>Changes</th>
              <th>Changes/day</th>
            </tr>
          </thead>
          <tbody>
            {entries(trend['dependencies']).map((item) => (
              <tr key={String(item['key'])}>
                <td>
                  {String(item['name'])}
                  <small>{String(item['ecosystem'])}</small>
                </td>
                <td>{String(item['currentVersion'] ?? 'Not reported')}</td>
                <td>{(Number(item['lockedVersionAgeMs']) / 86400000).toFixed(1)} days</td>
                <td>{String(item['versionChanges'])}</td>
                <td>{Number(item['upgradeVelocityPerDay']).toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
