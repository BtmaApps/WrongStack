import type { AutomationPreview, AutomationStateView } from '@wrongstack/webui-protocol';
import { useAppTranslation } from '@/i18n';

type AutomationRunResultRecord = NonNullable<AutomationStateView['runs'][number]['result']>;

/** The dry-run preview of a job draft: next fire times and reference checks. */
export function AutomationPreviewPanel({
  preview,
  timeZone,
}: {
  preview: AutomationPreview;
  timeZone: string | undefined;
}) {
  const { t } = useAppTranslation();
  return (
    <div role="status">
      <h3>{t('activity:automation.nextRuns', { defaultValue: 'Next scheduled runs' })}</h3>
      {preview.nextRunTimes.length ? (
        <ul>
          {preview.nextRunTimes.map((time) => (
            <li key={time}>
              {new Date(time).toLocaleString(undefined, {
                timeZone,
                timeZoneName: 'short',
              })}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          {t('activity:automation.manualOnly', {
            defaultValue: 'Manual or event-triggered.',
          })}
        </p>
      )}
      {preview.missingReferences.length > 0 && (
        <p>Missing credentials: {preview.missingReferences.join(', ')}</p>
      )}
      {preview.filterPreview && (
        <p>
          Sample event:{' '}
          {preview.filterPreview.matches
            ? 'matches'
            : `does not match (${preview.filterPreview.reasons.join(', ')})`}
        </p>
      )}
      <p>
        {t('activity:automation.previewNote', {
          defaultValue: 'Preview starts no container or model request.',
        })}
      </p>
    </div>
  );
}

/** A finished run's result: duration, cost estimate, usage and changed files. */
export function AutomationRunResult({ result }: { result: AutomationRunResultRecord }) {
  return (
    <details>
      <summary>
        Result · {(result.durationMs / 1000).toFixed(1)} s ·{' '}
        {result.usage.costUsd === null
          ? 'Cost unknown'
          : `$${result.usage.costUsd.toFixed(4)} (estimate)`}
      </summary>
      <p>
        Agent: {result.agentStatus ?? 'unknown'} · Tokens: {result.usage.inputTokens ?? '?'} in /{' '}
        {result.usage.outputTokens ?? '?'} out · Iterations: {result.usage.iterations ?? '?'}
      </p>
      <p>Tests not independently verified. Evidence: {result.validation.evidence.join(', ')}.</p>
      <pre>{result.finalText ?? 'No structured final message.'}</pre>
      <p>
        Changed files{result.changedFilesTruncated ? ' (first 200)' : ''}:{' '}
        {result.changedFiles.join(', ') || 'none detected'}
      </p>
    </details>
  );
}
