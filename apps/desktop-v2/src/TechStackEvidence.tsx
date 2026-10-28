import { FileCode2, Sparkles } from 'lucide-react';
import { entries } from './engine-values';
import { techInterpretation, techLabel, techVersion } from './techstack-model';

export function TechEvidence({
  items,
  onOpenFile,
}: {
  items: Record<string, unknown>[];
  onOpenFile: (path: string) => void;
}) {
  return items.length ? (
    <ul className="tech-evidence">
      {items.map((item, index) => (
        <li key={index}>
          <header>
            <strong>{techLabel(item['kind'])}</strong>
            <time>{String(item['retrievedAt'] ?? '')}</time>
          </header>
          {['manifest', 'lockfile'].includes(String(item['kind'])) ? (
            <button
              type="button"
              className="button secondary small"
              onClick={() => onOpenFile(String(item['source']))}
            >
              <FileCode2 size={13} />
              {String(item['source'])}
            </button>
          ) : /^https?:\/\//.test(String(item['source'])) ? (
            <a href={String(item['source'])} target="_blank" rel="noreferrer">
              {String(item['source'])}
            </a>
          ) : (
            <span>{String(item['source'] ?? '')}</span>
          )}
          {typeof item['detail'] === 'string' && <p>{item['detail']}</p>}
        </li>
      ))}
    </ul>
  ) : (
    <p className="field-help">No evidence recorded.</p>
  );
}
export function TechFinding({
  finding,
  onOpenFile,
}: {
  finding: Record<string, unknown>;
  onOpenFile: (path: string) => void;
}) {
  return (
    <article className={`tech-finding severity-${finding['severity']}`}>
      <header>
        <strong>{techLabel(finding['type'])}</strong>
        <span>
          {techLabel(finding['severity'])} · {techLabel(finding['action'])}
        </span>
      </header>
      {techInterpretation(finding) && (
        <small>
          <Sparkles size={12} />
          Model interpretation ·{' '}
          {typeof finding['confidence'] === 'number'
            ? `${Math.round(finding['confidence'] * 100)}% confidence`
            : 'confidence not reported'}
        </small>
      )}
      <p>{String(finding['rationale'] ?? '')}</p>
      {typeof finding['breakingRisk'] === 'string' && (
        <p className="tech-breaking-risk">Breaking risk: {finding['breakingRisk']}</p>
      )}
      <details>
        <summary>Finding evidence ({entries(finding['evidence']).length})</summary>
        <TechEvidence items={entries(finding['evidence'])} onOpenFile={onOpenFile} />
      </details>
    </article>
  );
}
export function TechDependencyDetail({
  dependency,
  findings,
  canResearch,
  researching,
  researchNote,
  onResearch,
  onOpenFile,
}: {
  dependency: Record<string, unknown>;
  findings: Record<string, unknown>[];
  canResearch: boolean;
  researching: boolean;
  researchNote: string;
  onResearch: () => void;
  onOpenFile: (path: string) => void;
}) {
  return (
    <article className="tech-dependency-detail" aria-label="Dependency details">
      <header>
        <span className="eyebrow">
          {String(dependency['ecosystem'])} ·{' '}
          {dependency['direct'] === true ? 'Direct' : 'Transitive'} ·{' '}
          {techLabel(dependency['scope'])}
        </span>
        <h2>{String(dependency['name'])}</h2>
        <span className={`tech-status status-${dependency['status']}`}>
          {techLabel(dependency['status'])}
        </span>
        <p>
          {techVersion(dependency)}
          {dependency['latestStable'] && dependency['latestStable'] !== techVersion(dependency)
            ? ` → ${dependency['latestStable']}`
            : ''}
        </p>
      </header>
      <dl className="tech-version-grid">
        {[
          ['Requested constraint', 'requested'],
          ['Locked version', 'locked'],
          ['Installed version', 'installed'],
          ['Latest within constraint', 'wanted'],
          ['Resolvable version', 'resolvable'],
          ['Latest stable registry version', 'latestStable'],
          ['License', 'license'],
          ['Package URL', 'purl'],
          ['Source type', 'sourceType'],
        ].map(([label, key]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{String(dependency[key!] ?? 'Not reported')}</dd>
          </div>
        ))}
        <div>
          <dt>Registry flags</dt>
          <dd>
            {[
              dependency['deprecated'] === true && 'Deprecated',
              dependency['yanked'] === true && 'Yanked',
            ]
              .filter(Boolean)
              .join(', ') ||
              (dependency['deprecated'] === false || dependency['yanked'] === false
                ? 'No flags reported'
                : 'Not reported')}
          </dd>
        </div>
      </dl>
      <section>
        <header className="tech-section-heading">
          <h3>Findings ({findings.length})</h3>
          <button
            type="button"
            className="button secondary small"
            disabled={!canResearch || researching}
            onClick={onResearch}
          >
            <Sparkles size={13} />
            {researching ? 'Researching…' : 'Research this dependency'}
          </button>
        </header>
        {!canResearch && (
          <p className="field-help">
            Connect a model in WrongStack settings to research a dependency.
          </p>
        )}
        {researchNote && <p role="status">{researchNote}</p>}
        {findings.map((finding, index) => (
          <TechFinding
            key={String(finding['id'] ?? index)}
            finding={finding}
            onOpenFile={onOpenFile}
          />
        ))}
        {!findings.length && (
          <p>No findings recorded. This does not establish that the package is safe.</p>
        )}
      </section>
      <section>
        <h3>Observed evidence</h3>
        <TechEvidence items={entries(dependency['evidence'])} onOpenFile={onOpenFile} />
      </section>
    </article>
  );
}
