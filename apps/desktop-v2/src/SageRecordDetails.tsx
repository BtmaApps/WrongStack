import { Anchor, Clock, ShieldCheck, Users } from 'lucide-react';
import { entries, record } from './engine-values';
import type { SageEditor } from './sage-model';
export function SageEditorFields({
  value,
  onChange,
  existing = false,
}: {
  value: SageEditor;
  onChange: (value: SageEditor) => void;
  existing?: boolean;
}) {
  const set = (key: keyof SageEditor, v: string | number) => onChange({ ...value, [key]: v });
  return (
    <details className="sage-editor-details">
      <summary>
        <ShieldCheck size={14} />
        Retention, evidence & audience
      </summary>
      {existing && (
        <label>
          Lifecycle status
          <select
            aria-label="Memory lifecycle status"
            value={value.status}
            onChange={(event) => set('status', event.target.value)}
          >
            {[...new Set(['active', 'stale', 'archived', value.status])].map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <small>Deletion and recovery use separate, explicit actions.</small>
        </label>
      )}
      <label>
        Retention
        <select
          aria-label="Memory retention"
          value={value.persistence}
          onChange={(event) => set('persistence', event.target.value)}
        >
          <option value="long_lived">Long lived · reviewed by hygiene</option>
          <option value="permanent">Permanent · protected from automatic retirement</option>
          <option value="short_lived">Short lived · eligible for time-based review</option>
        </select>
      </label>
      <label>
        Confidence <strong>{Math.round(value.confidence * 100)}%</strong>
        <input
          aria-label="Memory confidence"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={value.confidence}
          onChange={(event) => set('confidence', Number(event.target.value))}
        />
      </label>
      <label>
        File anchors
        <textarea
          aria-label="Memory file anchors"
          rows={3}
          placeholder="src/security/vault.ts\nOne project-relative path per line"
          value={value.anchors}
          onChange={(event) => set('anchors', event.target.value)}
        />
        <small>Existing symbol, command, and directory anchors are preserved.</small>
      </label>
      <label>
        Applicability assumptions
        <textarea
          aria-label="Memory applicability"
          rows={3}
          placeholder="When should this knowledge apply?"
          value={value.validity}
          onChange={(event) => set('validity', event.target.value)}
        />
        <small>Existing literal source checks remain attached.</small>
      </label>
      <div className="sage-audience-editor">
        <h3>
          <Users size={14} />
          Automatic injection audience
        </h3>
        <label>
          Agent roles
          <input
            aria-label="Memory audience roles"
            placeholder="reviewer, security-scanner"
            value={value.roles}
            onChange={(event) => set('roles', event.target.value)}
          />
        </label>
        <label>
          Task types
          <input
            aria-label="Memory audience task types"
            placeholder="review, refactor"
            value={value.tasks}
            onChange={(event) => set('tasks', event.target.value)}
          />
        </label>
        <label>
          Runtime modes
          <input
            aria-label="Memory audience modes"
            placeholder="code-review"
            value={value.modes}
            onChange={(event) => set('modes', event.target.value)}
          />
        </label>
        <small>Leave empty for general project knowledge.</small>
      </div>
    </details>
  );
}
export function SageRecordDetails({
  memory,
  onOpen,
}: {
  memory: Record<string, unknown>;
  onOpen?: (id: string) => void;
}) {
  const anchors = entries(memory['anchors']),
    sources = entries(memory['sources']),
    validity = record(memory['validity']),
    audience = record(memory['audience']);
  return (
    <div className="sage-record-details">
      <div className="sage-record-badges">
        <span>{String(memory['scope'] ?? 'project')} scope</span>
        <span>{String(memory['persistence'] ?? 'long_lived').replaceAll('_', ' ')}</span>
        <span>Revision {String(memory['revision'] ?? '—')}</span>
      </div>
      <dl className="sage-usage-grid">
        <div>
          <dt>Injections</dt>
          <dd>{String(memory['injectionCount'] ?? 'Not reported')}</dd>
        </div>
        <div>
          <dt>Useful references</dt>
          <dd>{String(memory['useCount'] ?? 'Not reported')}</dd>
        </div>
        <div>
          <dt>Freshness</dt>
          <dd>
            {typeof memory['freshness'] === 'number'
              ? `${Math.round(memory['freshness'] * 100)}%`
              : 'Not reported'}
          </dd>
        </div>
        <div>
          <dt>Stale reason</dt>
          <dd>{String(memory['staleReason'] ?? 'None reported')}</dd>
        </div>
      </dl>
      {typeof validity['statement'] === 'string' && (
        <section>
          <h3>
            <ShieldCheck size={13} />
            Applicability
          </h3>
          <p>{validity['statement']}</p>
          {entries(validity['checks']).map((check, index) => (
            <div className="sage-source-evidence" key={index}>
              <strong>{String(check['path'])}</strong>
              <code>{String(check['text'])}</code>
            </div>
          ))}
        </section>
      )}
      {anchors.length > 0 && (
        <section>
          <h3>
            <Anchor size={13} />
            Anchored evidence
          </h3>
          {anchors.map((anchor, index) => (
            <div className="sage-source-evidence" key={index}>
              <span>{String(anchor['type'])}</span>
              <strong>
                {String(
                  anchor['path'] ??
                    anchor['symbol'] ??
                    anchor['command'] ??
                    anchor['role'] ??
                    'Anchor',
                )}
              </strong>
              {typeof anchor['lineStart'] === 'number' && (
                <small>
                  Line {anchor['lineStart']}
                  {anchor['lineEnd'] ? `–${anchor['lineEnd']}` : ''}
                </small>
              )}
            </div>
          ))}
        </section>
      )}
      {sources.length > 0 && (
        <section>
          <h3>Sources</h3>
          {sources.map((source, index) => (
            <p key={index}>
              {String(source['type'])} ·{' '}
              {String(
                source['path'] ?? source['command'] ?? source['sessionId'] ?? 'User evidence',
              )}
            </p>
          ))}
        </section>
      )}
      {Object.keys(audience).some(
        (key) => Array.isArray(audience[key]) && audience[key].length > 0,
      ) && (
        <section>
          <h3>
            <Users size={13} />
            Audience
          </h3>
          {['roles', 'taskTypes', 'modes'].map((key) =>
            Array.isArray(audience[key]) && audience[key].length > 0 ? (
              <p key={key}>
                {key === 'taskTypes' ? 'Task types' : key}: {audience[key].join(', ')}
              </p>
            ) : null,
          )}
        </section>
      )}
      <section>
        <h3>
          <Clock size={13} />
          Lifecycle
        </h3>
        {[
          ['Created', 'createdAt'],
          ['Updated', 'updatedAt'],
          ['Last verified', 'lastVerifiedAt'],
          ['Last referenced', 'lastUsedAt'],
          ['Expires', 'expiresAt'],
        ].map(([label, key]) =>
          typeof memory[key!] === 'string' ? (
            <div className="sage-lifecycle-row" key={key}>
              <span>{label}</span>
              <time>{new Date(String(memory[key!])).toLocaleString()}</time>
            </div>
          ) : null,
        )}
        {['supersedes', 'contradicts'].map((key) =>
          Array.isArray(memory[key]) && memory[key].length > 0 ? (
            <div key={key}>
              <h4>{key}</h4>
              {(memory[key] as string[]).map((id) => (
                <button type="button" key={id} onClick={() => onOpen?.(id)}>
                  {id}
                </button>
              ))}
            </div>
          ) : null,
        )}
        {typeof memory['supersededBy'] === 'string' && (
          <button type="button" onClick={() => onOpen?.(String(memory['supersededBy']))}>
            Open successor memory
          </button>
        )}
      </section>
      {entries(memory['feedback']).length > 0 && (
        <section>
          <h3>Observed feedback</h3>
          {entries(memory['feedback']).map((feedback, index) => (
            <article key={index}>
              <strong>{String(feedback['verdict'])}</strong>
              <p>{String(feedback['evidence'])}</p>
              <small>
                Observed revision {String(feedback['observedRevision'])} ·{' '}
                {String(feedback['at'] ?? '')}
              </small>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
