import { useEffect, useRef, useState } from 'react';
import type { EngineCommand } from './engine-operations';
import { entries, record } from './engine-values';
import { Modal } from './Modal';
import {
  disableModelPatch,
  modelListed,
  modelReferences,
  modelRefMatches,
  providerDisabled,
} from './model-visibility';
import { ProviderVisibilityControl } from './ProviderVisibilityControl';
import './model-visibility.css';

export function ModelVisibilitySettings({
  draft,
  change,
  command,
  defaultProvider,
}: {
  draft: Record<string, unknown>;
  change: (key: string, value: unknown) => void;
  command: EngineCommand;
  defaultProvider: string;
}) {
  const [providers, setProviders] = useState<Record<string, unknown>[]>([]),
    [provider, setProvider] = useState('');
  const [models, setModels] = useState<Record<string, unknown>[]>([]),
    [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [reload, setReload] = useState(0),
    [review, setReview] = useState<{ model: string; hide: boolean } | null>(null);
  const version = useRef(0);
  useEffect(() => {
    let active = true;
    void command('providers.saved', {}, ['providers.saved'])
      .then((reply) => {
        if (!active) return;
        const values = entries(reply['providers']);
        setProviders(values);
        setProvider((current) =>
          values.some((item) => item['id'] === current) ? current : String(values[0]?.['id'] ?? ''),
        );
      })
      .catch((error) => {
        if (active) setError(String(error));
      });
    return () => {
      active = false;
    };
  }, [command, reload]);
  useEffect(() => {
    const current = ++version.current;
    setModels([]);
    setError('');
    if (!provider) {
      setBusy(false);
      return;
    }
    setBusy(true);
    void command('provider.models', { providerId: provider, includeDisabled: true }, [
      'provider.models',
    ])
      .then((reply) => {
        if (current !== version.current) return;
        if (reply['provider'] !== provider)
          throw Error('The engine returned a different provider catalog.');
        setModels(entries(reply['models']));
      })
      .catch((error) => {
        if (current === version.current) setError(String(error));
      })
      .finally(() => {
        if (current === version.current) setBusy(false);
      });
    return () => {
      version.current++;
    };
  }, [command, provider, reload]);
  const hidden = modelReferences(draft['disabledModels']);
  const providerOff = providerDisabled(draft['disabledProviders'], provider);
  const visible = models.filter((model) => {
    const id = String(model['id']);
    return (
      `${id} ${model['name'] ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()) &&
      (filter === 'all' ||
        (filter === 'hidden'
          ? providerOff || modelListed(hidden, provider, id)
          : filter === 'favorites'
            ? modelListed(draft['favoriteModels'], provider, id)
            : !providerOff && !modelListed(hidden, provider, id)))
    );
  });
  const patch = review?.hide
    ? disableModelPatch(draft, provider, review.model, defaultProvider)
    : null;
  const removed = patch
    ? {
        favorites: modelReferences(draft['favoriteModels']).filter(
          (ref) => !patch.favoriteModels.includes(ref),
        ),
        fallback: modelReferences(draft['fallbackModels']).filter(
          (ref) => !patch.fallbackModels.includes(ref),
        ),
        profiles: Object.entries(record(draft['fallbackProfiles'])).flatMap(([name, refs]) =>
          modelReferences(refs)
            .filter((ref) => !patch.fallbackProfiles[name]?.includes(ref))
            .map((ref) => `${name}: ${ref}`),
        ),
      }
    : null;
  return (
    <section className="model-visibility" aria-label="Model visibility settings">
      <div className="model-visibility-toolbar">
        <label>
          Saved provider
          <select
            aria-label="Visibility provider"
            value={provider}
            disabled={busy || !!review}
            onChange={(event) => setProvider(event.target.value)}
          >
            {providers.map((item) => (
              <option key={String(item['id'])} value={String(item['id'])}>
                {String(item['id'])}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search models
          <input
            aria-label="Search model visibility"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Model name or ID…"
          />
        </label>
        <label>
          Show
          <select
            aria-label="Visibility filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">All models</option>
            <option value="enabled">Enabled</option>
            <option value="hidden">Disabled</option>
            <option value="favorites">Favorites</option>
          </select>
        </label>
        <button
          type="button"
          className="button secondary"
          disabled={busy || !!review}
          onClick={() => setReload((value) => value + 1)}
        >
          Refresh visibility catalog
        </button>
      </div>
      <p className="field-help">
        Changes stay in this settings draft until you save. Disabling hides models from catalogs and
        fallback suggestions. Running sessions and explicit role overrides keep their model.
      </p>
      <ProviderVisibilityControl key={provider} provider={provider} draft={draft} change={change} />
      {error && (
        <p role="alert" className="session-error">
          {error}
        </p>
      )}
      {busy && <p role="status">Reading all provider models, including disabled entries…</p>}
      <p>
        {visible.length} matching models ·{' '}
        {models.filter((model) => modelListed(hidden, provider, String(model['id']))).length}{' '}
        individually disabled for this provider
      </p>
      <div className="model-visibility-list">
        {visible.map((model) => {
          const id = String(model['id']),
            off = modelListed(hidden, provider, id),
            favorite = modelListed(draft['favoriteModels'], provider, id);
          return (
            <article key={id} aria-label={`Model visibility ${id}`}>
              <div>
                <strong>{String(model['name'] ?? id)}</strong>
                <code>{id}</code>
                <span>{off ? 'Disabled' : providerOff ? 'Provider disabled' : 'Enabled'}</span>
              </div>
              <button
                type="button"
                className="button secondary small"
                disabled={providerOff || off}
                aria-pressed={favorite}
                onClick={() =>
                  change(
                    'favoriteModels',
                    favorite
                      ? modelReferences(draft['favoriteModels']).filter(
                          (ref) => !modelRefMatches(ref, provider, id),
                        )
                      : [...modelReferences(draft['favoriteModels']), `${provider}/${id}`],
                  )
                }
              >
                {favorite ? 'Remove favorite' : 'Add favorite'}
              </button>
              <button
                type="button"
                className="button secondary small"
                disabled={providerOff}
                onClick={() => setReview({ model: id, hide: !off })}
              >
                {off ? 'Enable model' : 'Disable model'}
              </button>
            </article>
          );
        })}
      </div>
      {!busy && !visible.length && (
        <p className="quiet-state">No catalog models match. Saved rules below remain editable.</p>
      )}
      <details>
        <summary>{hidden.length} saved disabled-model rules</summary>
        <p className="field-help">
          Bare model IDs apply across providers. Qualified references apply to their named provider.
          Rules can outlive a catalog entry.
        </p>
        {hidden.map((ref, index) => (
          <div className="model-visibility-rule" key={`${index}:${ref}`}>
            <code>{ref}</code>
            <button
              type="button"
              className="button secondary small"
              aria-label={`Remove rule ${ref}`}
              onClick={() =>
                change(
                  'disabledModels',
                  hidden.filter((_, i) => i !== index),
                )
              }
            >
              Remove rule
            </button>
          </div>
        ))}
      </details>
      <details>
        <summary>
          {modelReferences(draft['disabledProviders']).length} saved disabled-provider rules
        </summary>
        <p className="field-help">
          Provider rules also apply to future models. Remove a rule here even when the saved
          connection is no longer present.
        </p>
        {modelReferences(draft['disabledProviders']).map((id, index) => (
          <div className="model-visibility-rule" key={`${index}:${id}`}>
            <code>{id}</code>
            <button
              type="button"
              className="button secondary small"
              aria-label={`Remove provider rule ${id}`}
              onClick={() =>
                change(
                  'disabledProviders',
                  modelReferences(draft['disabledProviders']).filter(
                    (item) => item.trim().toLowerCase() !== id.trim().toLowerCase(),
                  ),
                )
              }
            >
              Remove provider rule
            </button>
          </div>
        ))}
      </details>
      {review && (
        <Modal onClose={() => setReview(null)}>
          <h2 id="dialog-title">{review.hide ? 'Review model exclusion' : 'Enable this model'}</h2>
          <p>
            <strong>
              {provider} / {review.model}
            </strong>
          </p>
          {removed ? (
            <>
              <p>Saving this change disables the model and removes these matching references:</p>
              <ul>
                <li>Favorites: {removed.favorites.join(', ') || 'None'}</li>
                <li>Default fallback chain: {removed.fallback.join(', ') || 'None'}</li>
                <li>Named fallback profiles: {removed.profiles.join(', ') || 'None'}</li>
              </ul>
              <p className="field-help">
                Explicit role overrides are retained. Review those separately if they should change.
              </p>
            </>
          ) : (
            <>
              <p>Remove these matching exclusion rules:</p>
              <ul>
                {hidden
                  .filter((ref) => modelRefMatches(ref, provider, review.model))
                  .map((ref, index) => (
                    <li key={`${index}:${ref}`}>{ref}</li>
                  ))}
              </ul>
              <p className="field-help">
                Removing a bare model rule also enables that model ID on other providers unless
                another exclusion applies.
              </p>
              <p className="field-help">
                Previously removed favorites and fallback references stay removed until you add them
                again.
              </p>
            </>
          )}
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={() => setReview(null)}>
              Keep current visibility
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                if (patch) for (const [key, value] of Object.entries(patch)) change(key, value);
                else
                  change(
                    'disabledModels',
                    hidden.filter((ref) => !modelRefMatches(ref, provider, review.model)),
                  );
                setReview(null);
              }}
            >
              Apply to settings draft
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
