import type { AutomationResultView } from '@wrongstack/webui-protocol';

export function AutomationVerificationFields({
  commands,
  timeoutMs,
  onCommandsChange,
  onTimeoutChange,
}: {
  commands: string;
  timeoutMs: number;
  onCommandsChange(text: string): void;
  onTimeoutChange(timeoutMs: number): void;
}) {
  return (
    <>
      <label>
        Verification commands
        <textarea
          rows={4}
          placeholder={'bun install --frozen-lockfile\nbun run test'}
          value={commands}
          onChange={(event) => onCommandsChange(event.target.value)}
        />
      </label>
      <p>One command per line. Required checks run in a fresh isolated workspace.</p>
      <label>
        Verification timeout in seconds
        <input
          type="number"
          min={1}
          max={3600}
          value={timeoutMs / 1000}
          onChange={(event) => onTimeoutChange(Number(event.target.value) * 1000)}
        />
      </label>
    </>
  );
}

export function AutomationRunResult({ result }: { result: AutomationResultView }) {
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
      <p>
        {result.validation.status === 'not-verified'
          ? 'Tests not independently verified.'
          : `Independent checks: ${result.validation.status}.`}{' '}
        Evidence: {result.validation.evidence.join(', ')}.
      </p>
      {result.validation.reason && <p>{result.validation.reason}</p>}
      {result.validation.checks && (
        <ul>
          {result.validation.checks.map((check) => (
            <li key={check.binding.checkId}>
              {check.argv.join(' ')} · exit {check.exitCode} · {check.durationMs} ms
            </li>
          ))}
        </ul>
      )}
      <pre>{result.finalText ?? 'No structured final message.'}</pre>
      <p>
        Changed files{result.changedFilesTruncated ? ' (first 200)' : ''}:{' '}
        {result.changedFiles.join(', ') || 'none detected'}
      </p>
    </details>
  );
}
