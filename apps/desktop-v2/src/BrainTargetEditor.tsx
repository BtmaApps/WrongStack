import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import {
  type BrainSeatDefault,
  type BrainTarget,
  type BrainTargetsDraft,
  type BrainVoter,
  emptyBrainSeat,
  emptyBrainTarget,
  emptyBrainVoter,
} from './brain-targets-model';
import type { EngineCommand } from './engine-operations';
import { entries } from './engine-values';
import './brain-targets.css';

export function BrainTargetEditor({
  value,
  onChange,
  snapshot,
  command,
}: {
  value: BrainTargetsDraft;
  onChange: (value: BrainTargetsDraft) => void;
  snapshot: Record<string, unknown>;
  command: EngineCommand;
}) {
  const [catalog, setCatalog] = useState<{ provider: string; model: string }[]>([]),
    [catalogError, setCatalogError] = useState('');
  const lensId = useId();
  const personas = entries(snapshot['personaCatalog']);
  useEffect(() => {
    let active = true;
    void command('providers.saved', {}, ['providers.saved', 'key.operation_result'])
      .then(async (reply) => {
        const results = await Promise.allSettled(
          entries(reply['providers']).map(async (provider) => {
            const id = String(provider['id']);
            const reply = await command('provider.models', { providerId: id }, [
              'provider.models',
              'key.operation_result',
            ]);
            return entries(reply['models'])
              .filter((row) => typeof row['id'] === 'string')
              .map((row) => ({ provider: id, model: String(row['id']) }));
          }),
        );
        if (active) {
          setCatalog(
            results.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])),
          );
          if (results.some((result) => result.status === 'rejected'))
            setCatalogError(
              'Some saved model catalogs are unavailable. Existing and custom references remain editable.',
            );
        }
      })
      .catch((error) => {
        if (active) setCatalogError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, [command]);
  const fields = (row: BrainTarget, label: string, update: (target: BrainTarget) => void) => (
    <div className="brain-target-fields">
      <label>
        Saved model
        <select
          aria-label={`${label} saved model`}
          value=""
          onChange={(event) => {
            const choice = catalog[Number(event.target.value)];
            if (choice) update(choice);
          }}
        >
          <option value="">Choose from saved catalogs…</option>
          {catalog.map((entry, index) => (
            <option value={index} key={index}>
              {entry.provider}/{entry.model}
            </option>
          ))}
        </select>
      </label>
      <label>
        Provider
        <input
          aria-label={`${label} provider`}
          value={row.provider}
          placeholder="Inherit runtime provider"
          onChange={(event) => update({ ...row, provider: event.target.value })}
        />
      </label>
      <label>
        Model ID
        <input
          aria-label={`${label} model ID`}
          value={row.model}
          placeholder="Model ID, including any namespace"
          onChange={(event) => update({ ...row, model: event.target.value })}
        />
      </label>
    </div>
  );
  const move = <T,>(items: T[], index: number, delta: number): T[] => {
    const next = [...items];
    [next[index], next[index + delta]] = [next[index + delta]!, next[index]!];
    return next;
  };
  const actions = (
    label: string,
    index: number,
    length: number,
    reorder: (delta: number) => void,
    remove: () => void,
  ) => (
    <div className="brain-target-actions">
      <button
        type="button"
        className="icon-button"
        disabled={index === 0}
        aria-label={`Move ${label} up`}
        onClick={() => reorder(-1)}
      >
        <ArrowUp size={15} />
      </button>
      <button
        type="button"
        className="icon-button"
        disabled={index === length - 1}
        aria-label={`Move ${label} down`}
        onClick={() => reorder(1)}
      >
        <ArrowDown size={15} />
      </button>
      <button
        type="button"
        className="icon-button danger"
        aria-label={`Remove ${label}`}
        onClick={remove}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
  const changeVoter = (index: number, patch: Partial<BrainVoter>) =>
    onChange({
      ...value,
      voters: value.voters.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
  return (
    <section className="brain-target-editor" aria-label="Brain models and council editor">
      {catalogError && <p role="status">{catalogError}</p>}
      <article className="brain-policy-card">
        <header>
          <h3>Decision model pool</h3>
          <p>
            Keep an ordered pool for fallback, or rotate calls across it. An empty pool inherits the
            runtime’s model selection.
          </p>
        </header>
        <label className="brain-pool-strategy">
          Pool strategy
          <select
            aria-label="Brain pool strategy"
            value={value.strategy}
            onChange={(event) => onChange({ ...value, strategy: event.target.value })}
          >
            <option value="fallback">Fallback in order</option>
            <option value="round-robin">Round robin</option>
          </select>
        </label>
        {value.pool.map((row, index) => (
          <div className="brain-target-row" key={index}>
            <header>
              <strong>Pool model {index + 1}</strong>
              {actions(
                `Brain pool model ${index + 1}`,
                index,
                value.pool.length,
                (delta) => onChange({ ...value, pool: move(value.pool, index, delta) }),
                () => onChange({ ...value, pool: value.pool.filter((_, i) => i !== index) }),
              )}
            </header>
            {fields(row, `Brain pool model ${index + 1}`, (target) =>
              onChange({
                ...value,
                pool: value.pool.map((old, i) => (i === index ? target : old)),
              }),
            )}
          </div>
        ))}
        {!value.pool.length && <p>Using inherited model selection.</p>}
        <button
          type="button"
          className="button secondary small"
          onClick={() => onChange({ ...value, pool: [...value.pool, emptyBrainTarget()] })}
        >
          <Plus size={14} />
          Add Brain pool model
        </button>
        {value.pool.length > 0 && (
          <button
            type="button"
            className="button secondary small"
            onClick={() => onChange({ ...value, pool: [] })}
          >
            Use inherited model selection
          </button>
        )}
      </article>
      <article className="brain-policy-card">
        <header>
          <h3>Council voting seats</h3>
          <p>
            Each seat has a model, a decision lens, a vote weight and optional veto. Empty seats
            inherit from the model pool. Seat order controls default lenses.
          </p>
        </header>
        <datalist id={lensId}>
          {personas.map((persona) => (
            <option key={String(persona['id'])} value={String(persona['id'])}>
              {String(persona['name'])}
            </option>
          ))}
        </datalist>
        {value.voters.map((row, index) => (
          <div className="brain-target-row" key={index}>
            <header>
              <strong>Voting seat {index + 1}</strong>
              {actions(
                `Brain voter ${index + 1}`,
                index,
                value.voters.length,
                (delta) => onChange({ ...value, voters: move(value.voters, index, delta) }),
                () => onChange({ ...value, voters: value.voters.filter((_, i) => i !== index) }),
              )}
            </header>
            {fields(row, `Brain voter ${index + 1}`, (target) => changeVoter(index, target))}
            <div className="brain-voter-policy">
              <label>
                Decision lens
                <input
                  aria-label={`Brain voter ${index + 1} lens`}
                  list={lensId}
                  value={row.persona}
                  placeholder="Default lens from seat order"
                  onChange={(event) => changeVoter(index, { persona: event.target.value })}
                />
              </label>
              <label>
                Vote weight
                <input
                  type="number"
                  min={Number.MIN_VALUE}
                  step="any"
                  aria-label={`Brain voter ${index + 1} weight`}
                  value={row.weight}
                  placeholder="Default: 1"
                  onChange={(event) => changeVoter(index, { weight: event.target.value })}
                />
              </label>
              <label>
                Veto
                <select
                  aria-label={`Brain voter ${index + 1} veto`}
                  value={row.veto}
                  onChange={(event) =>
                    changeVoter(index, { veto: event.target.value as BrainVoter['veto'] })
                  }
                >
                  <option value="default">Inherit seat / lens default</option>
                  <option value="yes">Explicitly enabled</option>
                  <option value="no">Explicitly disabled</option>
                </select>
              </label>
            </div>
            <p>
              {String(
                personas.find((persona) => persona['id'] === row.persona)?.['description'] ??
                  (row.persona
                    ? 'Custom decision lens; its text is preserved.'
                    : 'The engine chooses the default decision lens by seat order.'),
              )}
            </p>
          </div>
        ))}
        {!value.voters.length && (
          <p>No explicit seats. The engine may derive them from the model pool.</p>
        )}
        <button
          type="button"
          className="button secondary small"
          onClick={() => onChange({ ...value, voters: [...value.voters, emptyBrainVoter()] })}
        >
          <Plus size={14} />
          Add council voter
        </button>
        {value.voters.length > 0 && (
          <button
            type="button"
            className="button secondary small"
            onClick={() => onChange({ ...value, voters: [] })}
          >
            Use pool-derived council seats
          </button>
        )}
      </article>
      <article className="brain-policy-card" aria-label="Council seat defaults">
        <header>
          <h3>Seat defaults</h3>
          <p>
            An ordered rotation of decision lenses and veto preferences. Explicit voters inherit
            each missing preference from this rotation; their own overrides take priority. Without
            explicit voters, the engine seats at most one pool model per rotation entry.
          </p>
        </header>
        {!value.seats.length && (
          <p>Built-in rotation: executor, skeptic (veto enabled), auditor.</p>
        )}
        {value.seats.map((row, index) => {
          const change = (patch: Partial<BrainSeatDefault>) =>
            onChange({
              ...value,
              seats: value.seats.map((old, i) => (i === index ? { ...old, ...patch } : old)),
            });
          const persona = personas.find((entry) => entry['id'] === row.persona);
          return (
            <div className="brain-target-row" key={index}>
              <header>
                <strong>Default {index + 1}</strong>
                {actions(
                  `Brain seat default ${index + 1}`,
                  index,
                  value.seats.length,
                  (delta) => onChange({ ...value, seats: move(value.seats, index, delta) }),
                  () => onChange({ ...value, seats: value.seats.filter((_, i) => i !== index) }),
                )}
              </header>
              <div className="brain-voter-policy">
                <label>
                  Decision lens
                  <input
                    aria-label={`Brain seat default ${index + 1} lens`}
                    list={lensId}
                    value={row.persona}
                    placeholder="Choose a lens or enter custom text"
                    onChange={(event) => change({ persona: event.target.value })}
                  />
                </label>
                <label>
                  Veto
                  <select
                    aria-label={`Brain seat default ${index + 1} veto`}
                    value={row.veto}
                    onChange={(event) =>
                      change({ veto: event.target.value as BrainSeatDefault['veto'] })
                    }
                  >
                    <option value="default">Use lens default</option>
                    <option value="yes">Explicitly enabled</option>
                    <option value="no">Explicitly disabled</option>
                  </select>
                </label>
              </div>
              <p>
                {String(
                  persona?.['description'] ??
                    (row.persona
                      ? 'Custom decision lens; its text is preserved.'
                      : 'A decision lens is required.'),
                )}
              </p>
              {row.veto === 'default' && (
                <p>
                  {persona?.['defaultVeto'] === true
                    ? 'This catalog lens enables veto by default.'
                    : 'No veto default is reported for this lens; the engine resolves it.'}
                </p>
              )}
            </div>
          );
        })}
        <button
          type="button"
          className="button secondary small"
          onClick={() => onChange({ ...value, seats: [...value.seats, emptyBrainSeat()] })}
        >
          <Plus size={14} /> Add seat default
        </button>
        {value.seats.length > 0 && (
          <button
            type="button"
            className="button secondary small"
            onClick={() => onChange({ ...value, seats: [] })}
          >
            Use built-in seat defaults
          </button>
        )}
      </article>
      <article className="brain-policy-card">
        <h3>Council judge</h3>
        <p>
          Choose a tie-breaking model, or clear it to let the engine derive the judge from the pool.
        </p>
        {fields(value.judge, 'Council judge', (judge) => onChange({ ...value, judge }))}
        <button
          type="button"
          className="button secondary small"
          disabled={!value.judge.model && !value.judge.provider}
          onClick={() => onChange({ ...value, judge: emptyBrainTarget() })}
        >
          Use derived judge
        </button>
      </article>
    </section>
  );
}
