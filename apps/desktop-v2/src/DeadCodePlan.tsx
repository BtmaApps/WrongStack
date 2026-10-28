import { FileCode2 } from 'lucide-react';
import { deadCodeLabel } from './dead-code-model';
import { entries } from './engine-values';

export function DeadCodePlan({
  plan,
  onOpenFile,
}: {
  plan: Record<string, unknown>;
  onOpenFile: (path: string) => void;
}) {
  return (
    <section className="dead-code-plan" aria-label="Dead-code change preview">
      <h2>Review the exact changes</h2>
      <p>
        {entries(plan['changes']).filter((item) => item['action'] === 'edit').length} files to edit
        · {entries(plan['changes']).filter((item) => item['action'] === 'delete').length} files to
        delete
      </p>
      {(Array.isArray(plan['notes']) ? plan['notes'] : []).map((note, index) => (
        <p className="field-help" key={index}>
          {String(note)}
        </p>
      ))}
      {entries(plan['changes']).map((change) => (
        <article key={String(change['file'])} aria-label={`Preview diff for ${change['file']}`}>
          <header>
            <button
              type="button"
              className="button secondary small"
              onClick={() => onOpenFile(String(change['file']))}
            >
              <FileCode2 size={13} />
              {String(change['file'])}
            </button>
            <strong>{deadCodeLabel(change['action'])}</strong>
          </header>
          <pre className="dead-code-diff">
            {String(change['diff'] ?? '')
              .split('\n')
              .map((line, index) => (
                <span
                  key={index}
                  className={
                    line.startsWith('+') && !line.startsWith('+++')
                      ? 'dead-diff-add'
                      : line.startsWith('-') && !line.startsWith('---')
                        ? 'dead-diff-remove'
                        : line.startsWith('@@')
                          ? 'dead-diff-location'
                          : ''
                  }
                >
                  {line}
                </span>
              ))}
          </pre>
        </article>
      ))}
      {entries(plan['skipped']).length > 0 && (
        <details>
          <summary>Skipped findings ({entries(plan['skipped']).length})</summary>
          {entries(plan['skipped']).map((item, index) => (
            <p key={index}>
              <code>{String(item['id'])}</code> · {String(item['reason'])}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
export function DeadCodeResult({ result }: { result: Record<string, unknown> }) {
  return (
    <section className="dead-code-result" aria-label="Dead-code execution result" role="status">
      <h2>
        {result['rolledBack'] === true
          ? 'Changes rolled back'
          : result['ok'] === true
            ? 'Cleanup completed'
            : 'Cleanup did not complete'}
      </h2>
      <p>
        {Array.isArray(result['changed']) ? result['changed'].length : 0} files changed ·{' '}
        {Array.isArray(result['deleted']) ? result['deleted'].length : 0} files deleted ·{' '}
        {String(result['attempts'] ?? 0)} attempts
      </p>
      {['changed', 'deleted'].map((key) =>
        Array.isArray(result[key]) && result[key].length > 0 ? (
          <details key={key}>
            <summary>{deadCodeLabel(key)} files</summary>
            <ul>
              {result[key].map((file: unknown, index: number) => (
                <li key={index}>{String(file)}</li>
              ))}
            </ul>
          </details>
        ) : null,
      )}
      {entries(result['verify']).length ? (
        entries(result['verify']).map((step, index) => (
          <details key={index}>
            <summary>
              {String(step['package'])} · {step['ok'] === true ? 'Check passed' : 'Check failed'} ·{' '}
              {Number(step['durationMs']) / 1000}s
            </summary>
            <code>{String(step['command'])}</code>
            <pre>{String(step['output'] ?? '')}</pre>
          </details>
        ))
      ) : (
        <p>No verification steps were reported.</p>
      )}
      {entries(result['excluded']).length > 0 && (
        <details>
          <summary>Excluded findings ({entries(result['excluded']).length})</summary>
          {entries(result['excluded']).map((item, index) => (
            <p key={index}>
              {String(item['id'])} · {String(item['reason'])}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
