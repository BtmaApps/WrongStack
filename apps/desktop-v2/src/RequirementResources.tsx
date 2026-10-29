import { useState } from 'react';
import type { FormDraftStorage } from './durable-form-draft';
import { entries, record } from './engine-state';
import { usePersistedFields } from './usePersistedFields';

const editorDefaults = {
  name: '',
  kind: 'file',
  location: '',
  locationType: 'path',
  resourceTitle: '',
  resourceKind: 'doc',
  reference: '',
};
const appendDefaults = {
  category: 'attachment',
  kind: 'file',
  name: '',
  reference: '',
  isUrl: 'false',
};

export interface RequirementAttachment {
  name: string;
  kind: string;
  path?: string;
  url?: string;
}
export interface RequirementResource {
  kind: string;
  reference: string;
  title?: string;
}
export function isRequirementUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function RequirementResourceEditor({
  attachments,
  resources,
  onAttachments,
  onResources,
  disabled,
  storage,
}: {
  attachments: RequirementAttachment[];
  resources: RequirementResource[];
  onAttachments: (items: RequirementAttachment[]) => void;
  onResources: (items: RequirementResource[]) => void;
  disabled: boolean;
  /** Keeps typed-but-not-added inputs across reloads. */
  storage?: FormDraftStorage;
}) {
  const input = usePersistedFields(storage, 'requirement-resource-input:new', editorDefaults);
  const { name, kind, location, resourceTitle, resourceKind, reference } = input.fields;
  const locationType = input.fields.locationType === 'url' ? 'url' : 'path';
  const setName = (value: string) => input.set({ name: value });
  const setKind = (value: string) => input.set({ kind: value });
  const setLocation = (value: string) => input.set({ location: value });
  const setLocationType = (value: 'path' | 'url') => input.set({ locationType: value });
  const setResourceTitle = (value: string) => input.set({ resourceTitle: value });
  const setResourceKind = (value: string) => input.set({ resourceKind: value });
  const setReference = (value: string) => input.set({ reference: value });
  const [error, setError] = useState('');
  return (
    <section className="requirement-resource-editor" aria-label="Requirement supporting resources">
      <h4>Supporting resources</h4>
      <p>Record file paths and links with the request so reviewers can find its evidence.</p>
      {input.notice}
      {input.restored && (name || location || reference || resourceTitle) && (
        <p className="field-help" role="status">
          Restored resource input you had not added yet.
        </p>
      )}
      {error && (
        <p className="session-error" role="alert">
          {error}
        </p>
      )}
      <div className="requirement-resource-list">
        {attachments.map((item, index) => (
          <article key={`attachment-${index}`}>
            <div>
              <strong>{item.name}</strong>
              <small>
                {item.kind} · {item.path ?? item.url}
              </small>
            </div>
            <button
              type="button"
              className="button secondary"
              disabled={disabled}
              onClick={() => onAttachments(attachments.filter((_, i) => i !== index))}
            >
              Remove reference
            </button>
          </article>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled || !name.trim() || !location.trim() || attachments.length >= 20) return;
          if (locationType === 'url' && !isRequirementUrl(location.trim())) {
            setError('Use a valid HTTP or HTTPS attachment link.');
            return;
          }
          onAttachments([
            ...attachments,
            {
              name: name.trim(),
              kind,
              ...(locationType === 'path' ? { path: location.trim() } : { url: location.trim() }),
            },
          ]);
          setName('');
          setLocation('');
          setError('');
        }}
      >
        <div className="requirement-pair">
          <label>
            Attachment name
            <input
              aria-label="Attachment name"
              value={name}
              maxLength={200}
              disabled={disabled}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Attachment kind
            <select
              aria-label="Attachment kind"
              value={kind}
              disabled={disabled}
              onChange={(e) => setKind(e.target.value)}
            >
              {['file', 'image', 'document', 'link', 'other'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="requirement-pair">
          <label>
            Reference type
            <select
              aria-label="Attachment reference type"
              value={locationType}
              disabled={disabled}
              onChange={(e) => setLocationType(e.target.value === 'url' ? 'url' : 'path')}
            >
              <option value="path">File path</option>
              <option value="url">Web link</option>
            </select>
          </label>
          <label>
            Attachment reference
            <input
              aria-label="Attachment reference"
              value={location}
              maxLength={500}
              disabled={disabled}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={
                locationType === 'path' ? 'docs/design.md' : 'https://example.com/evidence'
              }
            />
          </label>
        </div>
        <button
          type="submit"
          className="button secondary"
          disabled={disabled || !name.trim() || !location.trim() || attachments.length >= 20}
        >
          Add attachment reference
        </button>
        <small>
          Paths and links are recorded as references. This form does not upload file contents.
        </small>
      </form>
      <div className="requirement-resource-list">
        {resources.map((item, index) => (
          <article key={`resource-${index}`}>
            <div>
              <strong>{item.title || item.reference}</strong>
              <small>
                {item.kind} · {item.reference}
              </small>
            </div>
            <button
              type="button"
              className="button secondary"
              disabled={disabled}
              onClick={() => onResources(resources.filter((_, i) => i !== index))}
            >
              Remove related resource
            </button>
          </article>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled || !reference.trim() || resources.length >= 50) return;
          if (resourceKind === 'url' && !isRequirementUrl(reference.trim())) {
            setError('Use a valid HTTP or HTTPS resource link.');
            return;
          }
          onResources([
            ...resources,
            {
              kind: resourceKind,
              reference: reference.trim(),
              ...(resourceTitle.trim() ? { title: resourceTitle.trim() } : {}),
            },
          ]);
          setResourceTitle('');
          setReference('');
          setError('');
        }}
      >
        <div className="requirement-pair">
          <label>
            Related resource title
            <input
              aria-label="Related resource title"
              value={resourceTitle}
              maxLength={200}
              disabled={disabled}
              onChange={(e) => setResourceTitle(e.target.value)}
            />
          </label>
          <label>
            Related resource kind
            <select
              aria-label="Related resource kind"
              value={resourceKind}
              disabled={disabled}
              onChange={(e) => setResourceKind(e.target.value)}
            >
              {['spec', 'issue', 'pr', 'doc', 'url', 'other'].map((value) => (
                <option key={value} value={value}>
                  {value === 'pr' ? 'Pull request' : value}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Related resource reference
          <input
            aria-label="Related resource reference"
            value={reference}
            maxLength={500}
            disabled={disabled}
            onChange={(e) => setReference(e.target.value)}
            placeholder="An issue, specification, document or URL"
          />
        </label>
        <button
          type="submit"
          className="button secondary"
          disabled={disabled || !reference.trim() || resources.length >= 50}
        >
          Add related resource
        </button>
      </form>
    </section>
  );
}

const sourceNames: Record<string, string> = {
  user: 'User input',
  llm: 'Model proposal',
  deterministic: 'Engine rules',
  system: 'System',
};
const fieldNames: Record<string, string> = {
  title: 'Title',
  normalized_summary: 'Summary',
  request_type: 'Request type',
  priority: 'Priority',
  business_goal: 'Business goal',
  target_users: 'Target users',
  expected_outcome: 'Expected outcome',
  scope_notes: 'Scope notes',
  constraints: 'Constraints',
  provided_context: 'Provided context',
  attachments: 'Attachments',
  related_resources: 'Related resources',
};
export function RequirementEvidence({
  detail,
  busy = false,
  onDecision,
}: {
  detail: Record<string, unknown>;
  busy?: boolean;
  onDecision?: (id: string, decision: 'accept' | 'reject') => void;
}) {
  const attachments = entries(detail['attachments']);
  const resources = entries(detail['relatedResources']);
  const proposals = entries(detail['llmSuggestions']);
  const sources = Object.entries(record(detail['fieldSources'])).filter(
    ([, value]) => typeof value === 'string',
  );
  return (
    <section className="requirement-evidence" aria-label="Requirement evidence and sources">
      {(attachments.length > 0 || resources.length > 0) && (
        <>
          <h4>Supporting resources</h4>
          <div className="requirement-resource-list">
            {attachments.map((item, i) => (
              <article key={`a-${i}`}>
                <strong>{typeof item['name'] === 'string' ? item['name'] : 'Attachment'}</strong>
                <small>{typeof item['kind'] === 'string' ? item['kind'] : 'File reference'}</small>
                <p>
                  {typeof item['path'] === 'string'
                    ? item['path']
                    : typeof item['url'] === 'string'
                      ? item['url']
                      : 'Reference not reported'}
                </p>
              </article>
            ))}
            {resources.map((item, i) => (
              <article key={`r-${i}`}>
                <strong>
                  {typeof item['title'] === 'string' ? item['title'] : 'Related resource'}
                </strong>
                <small>{typeof item['kind'] === 'string' ? item['kind'] : 'Resource'}</small>
                <p>
                  {typeof item['reference'] === 'string'
                    ? item['reference']
                    : 'Reference not reported'}
                </p>
              </article>
            ))}
          </div>
        </>
      )}
      {proposals.length > 0 && (
        <>
          <h4>Recorded suggestions</h4>
          <p>
            These are proposals. Their recorded status shows whether they were accepted or rejected.
          </p>
          <div className="requirement-suggestions">
            {proposals.map((item, i) => {
              const value = item['value'];
              const question = record(value);
              return (
                <article key={typeof item['id'] === 'string' ? item['id'] : i}>
                  <header>
                    <strong>
                      {fieldNames[String(item['field'])] ??
                        String(item['kind'] ?? 'Suggestion').replaceAll('_', ' ')}
                    </strong>
                    <span>
                      {typeof item['status'] === 'string' ? item['status'] : 'Status not reported'}
                    </span>
                  </header>
                  {typeof value === 'string' ? (
                    <p>{value}</p>
                  ) : typeof question['question'] === 'string' ? (
                    <p>{question['question']}</p>
                  ) : Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? (
                    <ul>
                      {value.map((entry, index) => (
                        <li key={index}>{entry}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No readable preview was provided.</p>
                  )}
                  {typeof item['rationale'] === 'string' && <p>{item['rationale']}</p>}
                  {onDecision && item['status'] === 'pending' && typeof item['id'] === 'string' && (
                    <div className="sdd-actions">
                      <button
                        type="button"
                        className="button primary"
                        disabled={busy}
                        onClick={() => onDecision(item['id'] as string, 'accept')}
                      >
                        Accept suggestion
                      </button>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={busy}
                        onClick={() => onDecision(item['id'] as string, 'reject')}
                      >
                        Reject suggestion
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
      {sources.length > 0 && (
        <details className="requirement-provenance">
          <summary>Where this information came from</summary>
          <dl>
            {sources.map(([field, value]) => (
              <div key={field}>
                <dt>{fieldNames[field] ?? field.replaceAll('_', ' ')}</dt>
                <dd>{sourceNames[String(value)] ?? 'Source not reported'}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </section>
  );
}

export function RequirementResourceAppend({
  disabled,
  onSave,
  owner,
  storage,
}: {
  disabled: boolean;
  /** Intake id that owns these typed-but-not-saved inputs. */
  owner: string;
  storage?: FormDraftStorage;
  onSave: (input: {
    attachment?: RequirementAttachment;
    relatedResource?: RequirementResource;
  }) => Promise<boolean>;
}) {
  const input = usePersistedFields(storage, `requirement-resource-input:${owner}`, appendDefaults);
  const { kind, name, reference } = input.fields;
  const category = input.fields.category === 'relatedResource' ? 'relatedResource' : 'attachment';
  const isUrl = input.fields.isUrl === 'true';
  const setCategory = (value: 'attachment' | 'relatedResource') => input.set({ category: value });
  const setKind = (value: string) => input.set({ kind: value });
  const setName = (value: string) => input.set({ name: value });
  const setReference = (value: string) => input.set({ reference: value });
  const setIsUrl = (value: boolean) => input.set({ isUrl: String(value) });
  const [error, setError] = useState('');
  return (
    <details className="requirement-append">
      <summary>Add supporting resource</summary>
      {input.notice}
      {input.restored && (name || reference) && (
        <p className="field-help" role="status">
          Restored resource input you had not saved yet.
        </p>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (disabled || !reference.trim() || (category === 'attachment' && !name.trim())) return;
          if (
            ((category === 'attachment' && isUrl) ||
              (category === 'relatedResource' && kind === 'url')) &&
            !isRequirementUrl(reference.trim())
          ) {
            setError('Use a valid HTTP or HTTPS link.');
            return;
          }
          setError('');
          const input =
            category === 'attachment'
              ? {
                  attachment: {
                    name: name.trim(),
                    kind,
                    ...(isUrl ? { url: reference.trim() } : { path: reference.trim() }),
                  },
                }
              : {
                  relatedResource: {
                    kind,
                    reference: reference.trim(),
                    ...(name.trim() ? { title: name.trim() } : {}),
                  },
                };
          try {
            if (await onSave(input)) {
              setName('');
              setReference('');
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      >
        {error && (
          <p className="session-error" role="alert">
            {error}
          </p>
        )}
        <div className="requirement-pair">
          <label>
            Resource category
            <select
              aria-label="Resource category"
              disabled={disabled}
              value={category}
              onChange={(e) => {
                const value = e.target.value === 'attachment' ? 'attachment' : 'relatedResource';
                setCategory(value);
                setKind(value === 'attachment' ? 'file' : 'doc');
              }}
            >
              <option value="attachment">Attachment reference</option>
              <option value="relatedResource">Related resource</option>
            </select>
          </label>
          <label>
            Resource kind
            <select
              aria-label="Resource kind"
              disabled={disabled}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {(category === 'attachment'
                ? ['file', 'image', 'document', 'link', 'other']
                : ['spec', 'issue', 'pr', 'doc', 'url', 'other']
              ).map((value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Resource name
          <input
            aria-label="Resource name"
            disabled={disabled}
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {category === 'attachment' && (
          <label>
            <input
              type="checkbox"
              disabled={disabled}
              checked={isUrl}
              onChange={(e) => setIsUrl(e.target.checked)}
            />{' '}
            This reference is a web link
          </label>
        )}
        <label>
          Resource reference
          <input
            aria-label="Resource reference"
            disabled={disabled}
            maxLength={500}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
        <p>Only the path or link is recorded; no file contents are uploaded.</p>
        <button
          type="submit"
          className="button primary"
          disabled={disabled || !reference.trim() || (category === 'attachment' && !name.trim())}
        >
          Save resource
        </button>
      </form>
    </details>
  );
}
