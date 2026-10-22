import {
  type AutomationJobInput,
  type EnvironmentProfile,
  type EnvironmentReceipt,
  automationRequest,
  exportEnvironmentProfile,
  parseEnvironmentProfile,
} from '@wrongstack/webui-protocol';
import { useEffect, useRef, useState } from 'react';

export function AutomationJobFields({
  spec,
  onChange,
  onEnvironmentChange,
}: {
  spec: AutomationJobInput;
  onChange<K extends keyof AutomationJobInput>(key: K, value: AutomationJobInput[K]): void;
  onEnvironmentChange(profile: EnvironmentProfile | undefined): void;
}) {
  const [document, setDocument] = useState('');
  const [error, setError] = useState('');
  const sequence = useRef(0);
  useEffect(() => {
    sequence.current++;
    setDocument(spec.environment ? exportEnvironmentProfile(spec.environment) : '');
    setError('');
  }, [spec.environment]);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  const load = () => {
    try {
      onEnvironmentChange(parseEnvironmentProfile(document));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return (
    <>
      <label>
        Name
        <input
          required
          maxLength={128}
          value={spec.name}
          onChange={(event) => onChange('name', event.target.value)}
        />
      </label>
      <label>
        Runtime image
        <input
          required
          readOnly={Boolean(spec.environment)}
          placeholder="wrongstack-sandbox"
          value={spec.image}
          onChange={(event) => onChange('image', event.target.value)}
        />
      </label>
      <label>
        Task
        <textarea
          required
          rows={4}
          value={spec.prompt}
          onChange={(event) => onChange('prompt', event.target.value)}
        />
      </label>
      <fieldset className="automation-environment">
        <legend>Reusable environment</legend>
        {spec.environment ? (
          <>
            <h3>
              {spec.environment.name} · v{spec.environment.version}
            </h3>
            <p>
              Image: <code>{spec.environment.image}</code> · Setup limit:{' '}
              {spec.environment.setupTimeoutMs / 1000} s
            </p>
            <p>
              {spec.environment.setupCommands.length} setup commands ·{' '}
              {spec.environment.services.length} services · {spec.environment.caches.length} caches
              · {spec.environment.ports.length} local ports
            </p>
            {spec.environment.setupCommands.length > 0 && (
              <ol>
                {spec.environment.setupCommands.map((argv, index) => (
                  <li key={index}>
                    <code>{argv.map((arg) => JSON.stringify(arg)).join(' ')}</code>
                  </li>
                ))}
              </ol>
            )}
            {spec.environment.services.map((service) => (
              <p key={service.name}>
                Service <strong>{service.name}</strong>: {service.image} · Health:{' '}
                <code>{service.healthCommand.join(' ')}</code>
                {service.envNames.length > 0 && <> · References: {service.envNames.join(', ')}</>}
              </p>
            ))}
            {spec.environment.caches.map((cache) => (
              <p key={cache.name}>
                Cache <strong>{cache.name}</strong>: <code>{cache.target}</code>
              </p>
            ))}
            {spec.environment.ports.map((port) => (
              <p key={port.name}>
                Local preview <strong>{port.name}</strong>: {port.port} ({port.protocol})
              </p>
            ))}
            <button type="button" onClick={() => onEnvironmentChange(undefined)}>
              Remove environment
            </button>
          </>
        ) : (
          <p>
            Attach setup commands, service containers, package caches and local preview ports to
            this job.
          </p>
        )}
        <p>
          Verification starts fresh services and empty caches. Environment variables contain names
          only; values resolve on the worker.
        </p>
        <details>
          <summary>Import, edit or export environment JSON</summary>
          <label>
            Environment profile file
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                const selected = ++sequence.current;
                if (!file) return;
                if (file.size > 64 * 1024) {
                  setError('Environment profile exceeds 64 KiB');
                  return;
                }
                void file
                  .text()
                  .then((text) => {
                    if (selected === sequence.current) {
                      setDocument(text);
                      setError('');
                    }
                  })
                  .catch((cause) => {
                    if (selected === sequence.current) setError(String(cause));
                  });
              }}
            />
          </label>
          <label>
            Environment profile JSON
            <textarea
              rows={8}
              value={document}
              onChange={(event) => {
                sequence.current++;
                setDocument(event.target.value);
              }}
            />
          </label>
          <button type="button" onClick={load}>
            Load environment for review
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                sequence.current++;
                setDocument(
                  exportEnvironmentProfile({
                    version: 1,
                    name: 'project',
                    image: spec.image || 'wrongstack-sandbox',
                    setupCommands: [],
                    setupTimeoutMs: 300_000,
                    services: [],
                    caches: [],
                    ports: [],
                  }),
                );
                setError('');
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : String(cause));
              }
            }}
          >
            Create profile draft
          </button>
          {spec.environment && (
            <a
              download={`${spec.environment.name}.environment.json`}
              href={`data:application/json;charset=utf-8,${encodeURIComponent(exportEnvironmentProfile(spec.environment))}`}
            >
              Download environment JSON
            </a>
          )}
        </details>
        {error && <p role="alert">{error}</p>}
      </fieldset>
    </>
  );
}

export function AutomationEnvironmentRun({
  runId,
  sessionId,
  running,
}: {
  runId: string;
  sessionId?: string | undefined;
  running: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [receipt, setReceipt] = useState<EnvironmentReceipt | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    let pending = false;
    setReceipt(null);
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await automationRequest<{ content: string }>(
          `runs/${runId}/artifact?name=environment.json`,
          'GET',
          undefined,
          abort.signal,
          sessionId,
        );
        if (!abort.signal.aborted) {
          setReceipt(JSON.parse(result.content) as EnvironmentReceipt);
          setError('');
        }
      } catch {
        if (!abort.signal.aborted) {
          setReceipt(null);
          setError('Environment receipt is not available yet.');
        }
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = running
      ? setInterval(() => {
          void refresh();
        }, 5000)
      : undefined;
    return () => {
      abort.abort();
      clearInterval(timer);
    };
  }, [open, runId, sessionId, running]);
  return (
    <details
      className="automation-environment"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Environment status</summary>
      {error && <p role="status">{error}</p>}
      {receipt && (
        <>
          {receipt.failure && <p role="alert">{receipt.failure}</p>}
          <p>
            {receipt.name} · {receipt.status} · {receipt.phase}
          </p>
          <p>
            Profile fingerprint: <code>{receipt.fingerprint}</code>
          </p>
          {receipt.services.map((service) => (
            <p key={service.name}>
              Service {service.name}: <code>{service.imageId}</code>
            </p>
          ))}
          {receipt.caches.map((cache) => (
            <p key={cache.name}>
              Cache {cache.name}:{' '}
              {cache.persistent ? 'Reusable project cache' : 'Fresh verification cache'}
            </p>
          ))}
          {receipt.setup.map((step, index) => (
            <details key={index}>
              <summary>
                Setup {index + 1}: exit {step.exitCode} · {step.durationMs} ms
              </summary>
              <code>{step.argv.join(' ')}</code>
              <pre>{step.output}</pre>
            </details>
          ))}
          {receipt.ports.map((port) => (
            <p key={port.name}>
              {port.name}:{' '}
              {running &&
              receipt.status === 'ready' &&
              port.protocol === 'http' &&
              Number.isInteger(port.hostPort) &&
              port.hostPort > 0 &&
              port.hostPort <= 65535 ? (
                <a target="_blank" rel="noreferrer" href={`http://127.0.0.1:${port.hostPort}`}>
                  Open local preview
                </a>
              ) : (
                `container port ${port.port} · inactive`
              )}
            </p>
          ))}
          <p>
            Local preview links open on the Docker worker machine and stay available while the run
            is active.
          </p>
        </>
      )}
    </details>
  );
}
