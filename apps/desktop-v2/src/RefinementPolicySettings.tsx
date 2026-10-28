import { LoaderCircle, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { refinementText } from './composer-model';
import type { EngineCommand } from './engine-operations';
import { entries, record } from './engine-values';
import { MarkdownContent } from './MarkdownContent';
import { refinerRoute } from './refinement-policy-model';
import { sameSetting } from './settings-save-model';
import './refinement-policy.css';

export function RefinementPolicySettings({
  draft,
  saved,
  change,
  command,
}: {
  draft: Record<string, unknown>;
  saved: Record<string, unknown>;
  change: (key: string, value: unknown) => void;
  command: EngineCommand;
}) {
  const [models, setModels] = useState<{ provider: string; model: string }[]>([]),
    [catalogError, setCatalogError] = useState('');
  const [sample, setSample] = useState(''),
    [result, setResult] = useState<Record<string, unknown> | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const generation = useRef(0),
    previewGeneration = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    previewGeneration.current++;
    setResult(null);
    setError('');
    setBusy(false);
    setModels([]);
    setCatalogError('');
    void command('providers.saved', {}, ['providers.saved', 'key.operation_result'])
      .then(async (reply) => {
        const results = await Promise.allSettled(
          entries(reply['providers']).map(async (provider) => {
            const id = String(provider['id']);
            const reply = await command('provider.models', { providerId: id }, [
              'provider.models',
              'key.operation_result',
            ]);
            return entries(reply['models']).map((row) => ({
              provider: id,
              model: String(row['id']),
            }));
          }),
        );
        if (current === generation.current) {
          setModels(results.flatMap((value) => (value.status === 'fulfilled' ? value.value : [])));
          if (results.some((value) => value.status === 'rejected'))
            setCatalogError(
              'Some saved model catalogs are unavailable. Existing and custom model IDs remain editable.',
            );
        }
      })
      .catch((error) => {
        if (current === generation.current)
          setCatalogError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      generation.current++;
      previewGeneration.current++;
    };
  }, [command]);
  const savedRouteKey = JSON.stringify([
    refinerRoute(saved),
    record(saved['fallbackProfiles'])[String(saved['refinerFallbackProfile'] ?? '')],
  ]);
  useEffect(() => {
    previewGeneration.current++;
    setResult(null);
    setError('');
    setBusy(false);
  }, [savedRouteKey]);
  const profiles = record(draft['fallbackProfiles']),
    selected = String(draft['refinerFallbackProfile'] ?? '');
  const pending =
    !sameSetting(refinerRoute(draft), refinerRoute(saved)) ||
    !sameSetting(profiles[selected], record(saved['fallbackProfiles'])[selected]);
  const preview = async () => {
    if (busy || pending || !sample.trim()) return;
    setBusy(true);
    setError('');
    setResult(null);
    const current = ++previewGeneration.current,
      context = generation.current;
    try {
      const reply = await command(
        'model.refine',
        { text: sample, timeoutMs: 90000 },
        ['model.refine_result'],
        { timeoutMs: 105000 },
      );
      refinementText(reply, 'refined', sample);
      if (current === previewGeneration.current && context === generation.current) setResult(reply);
    } catch (error) {
      if (current === previewGeneration.current && context === generation.current)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (current === previewGeneration.current && context === generation.current) setBusy(false);
    }
  };
  return (
    <section className="refinement-policy" aria-label="Prompt refinement policy">
      <article>
        <header>
          <Sparkles size={21} />
          <div>
            <span className="eyebrow">BEFORE A MESSAGE</span>
            <h3>Refinement behavior</h3>
          </div>
        </header>
        <label className="refinement-policy-toggle">
          <span>
            <strong>Review refinement on submit</strong>
            <small>
              Open the refinement review when submitting a prompt. You still choose whether to apply
              or send a version.
            </small>
          </span>
          <input
            type="checkbox"
            aria-label="Review refinement on submit"
            checked={draft['enhanceEnabled'] === true}
            onChange={(event) => change('enhanceEnabled', event.target.checked)}
          />
        </label>
        <label>
          Preferred refinement language
          <select
            aria-label="Preferred refinement language"
            value={String(draft['enhanceLanguage'] ?? 'original')}
            onChange={(event) => change('enhanceLanguage', event.target.value)}
          >
            <option value="original">Keep original language</option>
            <option value="english">English</option>
          </select>
        </label>
        <p>Choose a version, edit it if needed, then approve when you are ready to send.</p>
      </article>
      <article>
        <h3>Dedicated refiner route</h3>
        <p>
          A named profile takes precedence. Prompt refinement uses its first configured candidate;
          explicit provider/model fields are used when no profile candidate is selected. Empty
          fields inherit the active runtime’s provider or model.
        </p>
        <label>
          Named refiner profile
          <select
            aria-label="Named refiner profile"
            value={selected}
            onChange={(event) => change('refinerFallbackProfile', event.target.value)}
          >
            <option value="">No named profile</option>
            {Object.keys(profiles).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            {selected && !Object.hasOwn(profiles, selected) && (
              <option value={selected}>{selected} · unavailable</option>
            )}
          </select>
        </label>
        {selected && (
          <p>
            Profile candidates:{' '}
            {Array.isArray(profiles[selected])
              ? (profiles[selected] as unknown[]).map(String).join(' → ') || 'Empty profile'
              : 'Unavailable profile; configure it under Fallbacks & agent defaults.'}
          </p>
        )}
        {catalogError && <p role="status">{catalogError}</p>}
        <label>
          Saved refiner model
          <select
            aria-label="Saved refiner model"
            value=""
            onChange={(event) => {
              const choice = models[Number(event.target.value)];
              if (choice) {
                change('refinerProvider', choice.provider);
                change('refinerModel', choice.model);
              }
            }}
          >
            <option value="">Choose from saved catalogs…</option>
            {models.map((entry, index) => (
              <option value={index} key={index}>
                {entry.provider}/{entry.model}
              </option>
            ))}
          </select>
        </label>
        <div className="refinement-route-fields">
          <label>
            Explicit refiner provider
            <input
              aria-label="Explicit refiner provider"
              value={String(draft['refinerProvider'] ?? '')}
              placeholder="Inherit active provider"
              onChange={(event) => change('refinerProvider', event.target.value)}
            />
          </label>
          <label>
            Explicit refiner model
            <input
              aria-label="Explicit refiner model"
              value={String(draft['refinerModel'] ?? '')}
              placeholder="Inherit active model"
              onChange={(event) => change('refinerModel', event.target.value)}
            />
          </label>
        </div>
        <p>
          Goals and missions can walk additional configured candidates. An unavailable dedicated
          provider can fall back to the active runtime. The preview below identifies the provider
          and model actually used.
        </p>
      </article>
      <article>
        <h3>Try the saved refiner</h3>
        <p>
          Send a sample to the saved model and inspect the returned text. This does not submit a
          chat message or create a conversation.
        </p>
        <label>
          Sample prompt
          <textarea
            rows={3}
            aria-label="Refiner sample prompt"
            value={sample}
            onChange={(event) => setSample(event.target.value)}
          />
        </label>
        {pending && <p>Save route changes before trying the refiner.</p>}
        <button
          type="button"
          className="button secondary"
          disabled={busy || pending || !sample.trim()}
          onClick={() => void preview()}
        >
          {busy ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}
          {busy ? 'Refining sample…' : 'Preview with saved refiner'}
        </button>
        {error && (
          <p role="alert" className="session-error">
            {error}
          </p>
        )}
        {result && (
          <section aria-label="Saved refiner preview">
            <p>
              Used {String(record(result['refinedWith'])['provider'] ?? 'unreported provider')} /{' '}
              {String(record(result['refinedWith'])['model'] ?? 'unreported model')}
            </p>
            <div className="refinement-preview-columns">
              <div>
                <h4>Original-language refinement</h4>
                <MarkdownContent text={String(result['refined'] ?? '')} />
              </div>
              <div>
                <h4>English version</h4>
                <MarkdownContent text={String(result['english'] ?? '')} />
              </div>
            </div>
          </section>
        )}
      </article>
    </section>
  );
}
