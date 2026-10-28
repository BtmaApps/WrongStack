import type {
  AutomationRunRecord,
  AutomationValidation,
  EnvironmentReceipt,
} from '@wrongstack/webui-protocol';
import { Copy, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AutomationPublication } from './AutomationPublication';
import {
  parseAutomationEnvironmentReceipt,
  parseAutomationVerification,
} from './automation-evidence';
import type { EngineHttp } from './engine-http';
import { record } from './engine-values';
import { MarkdownContent } from './MarkdownContent';
import { Modal } from './Modal';

const labels = {
  'output.log': 'Execution log',
  'verification.log': 'Verification log',
  'changes.patch': 'Proposed changes',
  'verification.json': 'Independent verification',
  'environment.json': 'Environment receipt',
};
type Artifact = keyof typeof labels;
export function AutomationRunInspector({
  run,
  http,
  onClose,
}: {
  run: AutomationRunRecord;
  http: EngineHttp;
  onClose: () => void;
}) {
  const [artifact, setArtifact] = useState<{ name: Artifact; text: string } | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const alive = useRef(true),
    sequence = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      sequence.current++;
    };
  }, []);
  const read = async (name: Artifact) => {
    const version = ++sequence.current;
    setBusy(true);
    setArtifact(null);
    setError('');
    setNotice('');
    try {
      const value = await http(
        `/api/automation/runs/${run.id}/artifact?name=${encodeURIComponent(name)}`,
      );
      if (alive.current && version === sequence.current)
        setArtifact({ name, text: String(record(value)['content'] ?? '') });
    } catch (error) {
      if (alive.current && version === sequence.current) {
        const message = error instanceof Error ? error.message : String(error);
        setError(
          /ENOENT|no such file or directory/i.test(message)
            ? 'This evidence has not been recorded for this run.'
            : message,
        );
      }
    } finally {
      if (alive.current && version === sequence.current) setBusy(false);
    }
  };
  const result = run.result;
  return (
    <Modal title={`Automation run ${run.id}`} onClose={onClose}>
      <div className="automation-run-inspector">
        <header>
          <div>
            <span className="eyebrow">AUTOMATION RUN · {run.id.slice(0, 8)}</span>
            <h2>Execution & evidence</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close automation run"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="automation-run-status">
          <strong>{run.status}</strong>
          <span>{run.trigger}</span>
          <span>{new Date(run.createdAt).toLocaleString()}</span>
        </div>
        {run.error && <p className="session-error">{run.error}</p>}
        {run.exitCode !== undefined && <p>Process exit code: {run.exitCode}</p>}
        {result ? (
          <>
            <div className="automation-run-metrics">
              <div>
                <small>Duration</small>
                <strong>{(result.durationMs / 1000).toFixed(1)} s</strong>
              </div>
              <div>
                <small>Input / output tokens</small>
                <strong>
                  {result.usage.inputTokens ?? 'Unknown'} / {result.usage.outputTokens ?? 'Unknown'}
                </strong>
              </div>
              <div>
                <small>Iterations</small>
                <strong>{result.usage.iterations ?? 'Unknown'}</strong>
              </div>
              <div>
                <small>
                  {result.usage.costSource === 'catalog-estimate'
                    ? 'Catalog cost estimate'
                    : 'Cost'}
                </small>
                <strong>
                  {result.usage.costUsd === null
                    ? 'Unknown'
                    : `$${result.usage.costUsd.toFixed(4)}`}
                </strong>
              </div>
            </div>
            <section>
              <h3>Agent result</h3>
              <p>Agent status: {result.agentStatus ?? 'Not recorded'}</p>
              <MarkdownContent
                text={result.finalText || 'No structured final response was recorded.'}
              />
            </section>
            <VerificationReport value={result.validation} />
            <section>
              <h3>Changed files{result.changedFilesTruncated ? ' (first 200)' : ''}</h3>
              {result.changedFiles.length ? (
                <ul>
                  {result.changedFiles.map((path) => (
                    <li key={path}>
                      <code>{path}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No file changes were detected.</p>
              )}
            </section>
          </>
        ) : (
          <p className="quiet-state">
            This run has no structured execution result. Queued, cancelled and interrupted runs may
            have no worker evidence.
          </p>
        )}
        <section>
          <h3>Recorded evidence</h3>
          <div className="feature-actions">
            {(Object.entries(labels) as [Artifact, string][]).map(([name, label]) => (
              <button
                type="button"
                key={name}
                className="button secondary"
                disabled={busy}
                onClick={() => void read(name)}
              >
                {label}
              </button>
            ))}
          </div>
          <p>Evidence is loaded only when requested. Missing files are reported by the engine.</p>
          {error && (
            <p className="session-error" role="alert">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          {busy && <p role="status">Reading recorded evidence…</p>}
          {artifact && (
            <section className="automation-recorded-artifact" aria-label={labels[artifact.name]}>
              <header>
                <h3>{labels[artifact.name]}</h3>
                <div className="feature-actions">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void read(artifact.name)}
                  >
                    <RefreshCw size={13} />
                    Refresh evidence
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(artifact.text)
                        .then(() => setNotice('Recorded evidence copied.'))
                        .catch((error) => setError(String(error)))
                    }
                  >
                    <Copy size={13} />
                    Copy recorded evidence
                  </button>
                </div>
              </header>
              <ArtifactContent name={artifact.name} text={artifact.text} />
            </section>
          )}
        </section>
        <AutomationPublication run={run} http={http} />
      </div>
    </Modal>
  );
}

function ArtifactContent({ name, text }: { name: Artifact; text: string }) {
  if (!text) return <p>No content was recorded.</p>;
  if (name === 'verification.json' || name === 'environment.json') {
    try {
      if (name === 'verification.json') {
        return <VerificationReport value={parseAutomationVerification(text)} />;
      }
      return <EnvironmentReport value={parseAutomationEnvironmentReceipt(text)} />;
    } catch (error) {
      return (
        <p role="alert" className="session-error">
          This evidence could not be read as its expected report: {String(error)}. Copy the document
          for inspection.
        </p>
      );
    }
  }
  if (name === 'changes.patch')
    return (
      <pre className="automation-patch">
        {text.split('\n').map((line, index) => (
          <span
            key={index}
            className={
              line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ')
                ? 'patch-file'
                : line.startsWith('+')
                  ? 'patch-add'
                  : line.startsWith('-')
                    ? 'patch-remove'
                    : line.startsWith('@@')
                      ? 'patch-hunk'
                      : ''
            }
          >
            {line}
            {'\n'}
          </span>
        ))}
      </pre>
    );
  return <pre className="automation-run-log">{text}</pre>;
}

function VerificationReport({ value }: { value: AutomationValidation }) {
  return (
    <section className="automation-verification-report">
      <h3>Independent checks · {value.status}</h3>
      <p>
        {value.reason ||
          (value.status === 'not-verified'
            ? 'No independent check evidence was recorded.'
            : 'Recorded host-authored verification status; agent prose alone is not check evidence.')}
      </p>
      {value.evidence.length > 0 && <p>Evidence: {value.evidence.join(', ')}</p>}
      {value.checks?.length ? (
        <div className="automation-check-list">
          {value.checks.map((check, index) => (
            <article key={index}>
              <strong>{check.argv.join(' ')}</strong>
              <span>
                Exit {check.exitCode} · {check.durationMs} ms
              </span>
              <small>
                {check.binding?.checkId} · {check.binding?.evidenceKind}
              </small>
              <details>
                <summary>Evidence identity</summary>
                <dl>
                  <dt>Output SHA-256</dt>
                  <dd>
                    <code>{check.outputSha256}</code>
                  </dd>
                  <dt>Handler</dt>
                  <dd>{check.binding?.handlerVersion}</dd>
                  <dt>Registry fingerprint</dt>
                  <dd>
                    <code>{check.binding?.registryFingerprint}</code>
                  </dd>
                </dl>
              </details>
            </article>
          ))}
        </div>
      ) : null}
      {(value.imageId || value.workspaceTree || value.planFingerprint) && (
        <details>
          <summary>Verified workspace identity</summary>
          <dl>
            <dt>Image</dt>
            <dd>
              <code>{value.imageId ?? 'Not recorded'}</code>
            </dd>
            <dt>Workspace tree</dt>
            <dd>
              <code>{value.workspaceTree ?? 'Not recorded'}</code>
            </dd>
            <dt>Plan fingerprint</dt>
            <dd>
              <code>{value.planFingerprint ?? 'Not recorded'}</code>
            </dd>
          </dl>
        </details>
      )}
    </section>
  );
}

function EnvironmentReport({ value }: { value: EnvironmentReceipt }) {
  return (
    <section className="automation-environment-report">
      <h3>
        {value.name} · {value.phase}
      </h3>
      <p>
        Environment: {value.status}
        {value.failure ? ` · ${value.failure}` : ''}
      </p>
      <dl>
        <dt>Workspace image</dt>
        <dd>
          <code>{value.imageId ?? 'Not captured'}</code>
        </dd>
        <dt>Network</dt>
        <dd>{value.network ?? 'None recorded'}</dd>
        <dt>Fingerprint</dt>
        <dd>
          <code>{value.fingerprint}</code>
        </dd>
      </dl>
      <h4>Services</h4>
      {value.services.length ? (
        value.services.map((service) => (
          <p key={service.name}>
            <strong>{service.name}</strong> · <code>{service.imageId}</code> · container{' '}
            <code>{service.containerId}</code>
          </p>
        ))
      ) : (
        <p>No service receipts.</p>
      )}
      <h4>Caches</h4>
      {value.caches.length ? (
        value.caches.map((cache) => (
          <p key={cache.name}>
            {cache.name} · <code>{cache.target}</code> ·{' '}
            {cache.persistent ? 'Persistent' : 'Ephemeral'}
            {cache.volume ? ` · ${cache.volume}` : ''}
          </p>
        ))
      ) : (
        <p>No package caches recorded.</p>
      )}
      <h4>Local ports</h4>
      {value.ports.length ? (
        value.ports.map((port) => (
          <p key={port.name}>
            {port.name} · container {port.port} → loopback {port.hostPort} ({port.protocol})
          </p>
        ))
      ) : (
        <p>No published ports recorded.</p>
      )}
      <h4>Setup steps</h4>
      {value.setup.length ? (
        value.setup.map((step, index) => (
          <details key={index}>
            <summary>
              {step.argv.join(' ')} · exit {step.exitCode} · {step.durationMs} ms
            </summary>
            <p>
              Output SHA-256: <code>{step.outputSha256}</code>
            </p>
            <pre className="automation-run-log">{step.output}</pre>
          </details>
        ))
      ) : (
        <p>No setup command receipts.</p>
      )}
    </section>
  );
}
