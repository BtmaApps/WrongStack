import {
  type AutomationJobInput,
  VERSIONED_AUTOMATION_TEMPLATES,
} from '@wrongstack/webui-protocol';
import { Box, Check, KeyRound, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Modal } from './Modal';

export function AutomationTemplates({
  onApply,
  disabled,
}: {
  onApply: (id: string) => void;
  disabled: boolean;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const template = VERSIONED_AUTOMATION_TEMPLATES.find((item) => item.id === chosen);
  return (
    <section className="automation-templates">
      <header>
        <h3>Start with a workflow</h3>
        <p>
          A starting point for the job's name and instructions. Runtime choices stay in your draft.
        </p>
      </header>
      <div>
        {VERSIONED_AUTOMATION_TEMPLATES.map((item) => (
          <button
            type="button"
            disabled={disabled}
            key={item.id}
            onClick={() => setChosen(item.id)}
          >
            <strong>{item.name}</strong>
            <p>{item.prompt}</p>
            <small>{item.requirements.join(' · ')}</small>
          </button>
        ))}
      </div>
      {template && (
        <Modal title="Use automation template" onClose={() => setChosen(null)}>
          <div className="automation-template-review">
            <h2>{template.name}</h2>
            <p>
              This replaces the current draft's name and instructions. It does not save or start a
              job.
            </p>
            <blockquote>{template.prompt}</blockquote>
            <h3>Required setup</h3>
            <ul>
              {template.requirements.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <button type="button" className="button secondary" onClick={() => setChosen(null)}>
              Keep current instructions
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                onApply(template.id);
                setChosen(null);
              }}
            >
              Use template in draft
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

export function AutomationConfiguration({
  draft,
  update,
  onEditEnvironment,
}: {
  draft: AutomationJobInput;
  update: <K extends keyof AutomationJobInput>(key: K, value: AutomationJobInput[K]) => void;
  onEditEnvironment: () => void;
}) {
  const [lastGithub, setLastGithub] = useState(
    draft.github ?? {
      repository: '',
      events: ['issue_comment.created'],
      secretEnv: 'GITHUB_WEBHOOK_SECRET',
    },
  );
  const credentials = draft.credentials ?? [];
  const changeGithub = (next: NonNullable<AutomationJobInput['github']>) => {
    setLastGithub(next);
    update('github', next);
  };
  const environment = draft.environment;
  return (
    <>
      <section className="automation-config-section">
        <header>
          <div>
            <span className="eyebrow">WORKSPACE</span>
            <h3>
              <Box size={16} />
              Reusable environment
            </h3>
          </div>
          <button type="button" className="button secondary" onClick={onEditEnvironment}>
            {environment ? 'Edit environment' : 'Configure environment'}
          </button>
        </header>
        {environment ? (
          <>
            <div className="automation-environment-summary">
              <strong>
                {environment.name} <small>v{environment.version}</small>
              </strong>
              <code>{environment.image}</code>
              <div>
                <span>{environment.setupCommands.length} setup steps</span>
                <span>{environment.services.length} services</span>
                <span>{environment.caches.length} caches</span>
                <span>{environment.ports.length} preview ports</span>
              </div>
            </div>
            <p>
              Setup deadline: {environment.setupTimeoutMs / 1000} seconds. The worker prepares this
              environment for the copied workspace.
            </p>
            {environment.services.length > 0 && (
              <ul>
                {environment.services.map((service) => (
                  <li key={service.name}>
                    {service.name} · {service.image} · health:{' '}
                    <code>{service.healthCommand.join(' ')}</code>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="text-link"
              onClick={() => update('environment', undefined)}
            >
              Remove environment from draft
            </button>
          </>
        ) : (
          <p>
            Attach setup steps, service containers, package caches and local preview ports. No
            environment is attached.
          </p>
        )}
      </section>
      <section className="automation-config-section">
        <header>
          <div>
            <span className="eyebrow">SAVED REFERENCES</span>
            <h3>
              <KeyRound size={16} />
              Credentials
            </h3>
          </div>
          <button
            type="button"
            className="button secondary"
            disabled={credentials.length >= 16}
            onClick={() =>
              update('credentials', [
                ...credentials,
                { envName: '', profile: 'default', provider: '', keyLabel: '' },
              ])
            }
          >
            <Plus size={13} />
            Add credential reference
          </button>
        </header>
        <p>
          Reference a saved profile/provider/key label. The engine resolves its vault value when the
          job runs. Configure keys in WrongStack settings.
        </p>
        {!credentials.length && <p className="quiet-state">No saved credentials referenced.</p>}
        {credentials.map((ref, index) => (
          <fieldset
            key={index}
            className="automation-credential-row"
            aria-label={`Automation credential ${index + 1}`}
          >
            <legend>Credential {index + 1}</legend>
            <div className="automation-config-grid">
              {(
                [
                  ['envName', 'Destination environment name'],
                  ['profile', 'Profile'],
                  ['provider', 'Provider ID'],
                  ['keyLabel', 'Saved key label'],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    aria-label={`Credential ${index + 1} ${key}`}
                    required
                    value={ref[key]}
                    onChange={(event) =>
                      update(
                        'credentials',
                        credentials.map((item, i) =>
                          i === index ? { ...item, [key]: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder={key === 'envName' ? 'OPENAI_API_KEY' : undefined}
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              className="text-link"
              aria-label={`Remove automation credential ${index + 1}`}
              onClick={() =>
                update(
                  'credentials',
                  credentials.filter((_, i) => i !== index),
                )
              }
            >
              <Trash2 size={13} />
              Remove reference
            </button>
          </fieldset>
        ))}
      </section>
      <section className="automation-config-section">
        <header>
          <div>
            <span className="eyebrow">EVENT TRIGGER</span>
            <h3>GitHub events</h3>
          </div>
          <label className="feature-checkbox">
            <input
              aria-label="Use GitHub automation trigger"
              type="checkbox"
              checked={!!draft.github}
              onChange={(event) => {
                if (!event.target.checked && draft.github) setLastGithub(draft.github);
                update('github', event.target.checked ? lastGithub : undefined);
              }}
            />
            Configure GitHub trigger
          </label>
        </header>
        {draft.github ? (
          <>
            <p>
              Signed events for this repository may queue the job when enabled. The webhook secret
              is an environment name configured on the worker.
            </p>
            <div className="automation-config-grid">
              <label>
                Repository
                <input
                  aria-label="Automation GitHub repository"
                  required
                  placeholder="owner/repository"
                  value={draft.github.repository}
                  onChange={(event) =>
                    changeGithub({ ...draft.github!, repository: event.target.value })
                  }
                />
              </label>
              <label>
                Event names
                <input
                  aria-label="Automation GitHub events"
                  required
                  placeholder="issue_comment.created, pull_request.opened"
                  value={draft.github.events.join(', ')}
                  onChange={(event) =>
                    changeGithub({
                      ...draft.github!,
                      events: event.target.value.split(',').map((value) => value.trim()),
                    })
                  }
                />
              </label>
              <label>
                Secret environment name
                <input
                  aria-label="Automation GitHub secret name"
                  required
                  value={draft.github.secretEnv}
                  onChange={(event) =>
                    changeGithub({ ...draft.github!, secretEnv: event.target.value })
                  }
                />
              </label>
            </div>
            <details>
              <summary>Event filters</summary>
              <div className="automation-config-grid">
                {(
                  [
                    ['mention', 'Required mention'],
                    ['label', 'Required label'],
                    ['branch', 'Branch'],
                    ['conclusion', 'Workflow conclusion'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      aria-label={`Automation GitHub ${key}`}
                      value={draft.github!.filters?.[key] ?? ''}
                      onChange={(event) =>
                        changeGithub({
                          ...draft.github!,
                          filters: {
                            ...draft.github!.filters,
                            [key]: event.target.value || undefined,
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="feature-checkbox">
                <input
                  aria-label="Automation GitHub exclude bots"
                  type="checkbox"
                  checked={draft.github.filters?.excludeBots ?? false}
                  onChange={(event) =>
                    changeGithub({
                      ...draft.github!,
                      filters: { ...draft.github!.filters, excludeBots: event.target.checked },
                    })
                  }
                />
                Exclude bot events
              </label>
              <label>
                Pull request draft status
                <select
                  aria-label="Automation GitHub draft filter"
                  value={
                    draft.github.filters?.draft === undefined
                      ? 'any'
                      : String(draft.github.filters.draft)
                  }
                  onChange={(event) =>
                    changeGithub({
                      ...draft.github!,
                      filters: {
                        ...draft.github!.filters,
                        draft:
                          event.target.value === 'any' ? undefined : event.target.value === 'true',
                      },
                    })
                  }
                >
                  <option value="any">Any status</option>
                  <option value="false">Ready for review</option>
                  <option value="true">Draft only</option>
                </select>
              </label>
            </details>
            <p className="automation-reference-note">
              <Check size={13} />
              Saving trigger settings does not install a webhook. Event delivery and worker
              execution are separate.
            </p>
          </>
        ) : (
          <p>No GitHub trigger configured. Manual and scheduled runs remain available.</p>
        )}
      </section>
    </>
  );
}
