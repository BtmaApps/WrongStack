import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { record } from './engine-values';
import {
  type ModelPriceTiersDraft,
  modelPriceTiersDraft,
  priceTierDraft,
  tierPriceFields,
} from './model-price-tiers';

export function ModelPriceTiers({
  value,
  onChange,
  legacySchedule,
}: {
  value: ModelPriceTiersDraft;
  onChange: (value: ModelPriceTiersDraft) => void;
  legacySchedule?: unknown;
}) {
  const change = (rows: ModelPriceTiersDraft['rows']) =>
    onChange({ ...value, changed: true, rows });
  return (
    <section className="model-price-tiers" aria-label="Model context price tiers">
      <header>
        <h3>Context price tiers</h3>
        <p>
          USD per million tokens at each catalog context threshold. Blank rates remain unspecified;
          zero means explicitly free. These catalog prices do not change provider billing or apply
          tiers to the Usage &amp; cost estimate.
        </p>
      </header>
      <LegacyContextPrices value={legacySchedule} />
      {value.unsupported ? (
        <p>
          This definition uses a provider-specific tier format. It will be preserved until you
          explicitly remove it.
        </p>
      ) : (
        <>
          {!value.rows.length && (
            <p>No context price tiers configured. Base prices remain separate.</p>
          )}
          {value.rows.map((row, index) => (
            <article className="model-price-tier" key={index}>
              <header>
                <strong>Price tier {index + 1}</strong>
                <div className="model-tier-actions">
                  {([-1, 1] as const).map((delta) => (
                    <button
                      type="button"
                      className="icon-button"
                      key={delta}
                      aria-label={`Move price tier ${index + 1} ${delta < 0 ? 'up' : 'down'}`}
                      disabled={delta < 0 ? index === 0 : index === value.rows.length - 1}
                      onClick={() => {
                        const rows = [...value.rows];
                        [rows[index], rows[index + delta]] = [rows[index + delta]!, rows[index]!];
                        change(rows);
                      }}
                    >
                      {delta < 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label={`Remove price tier ${index + 1}`}
                    onClick={() => change(value.rows.filter((_, i) => i !== index))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </header>
              {row.editable ? (
                <div className="model-editor-grid">
                  <label>
                    Context threshold (tokens)
                    <input
                      type="number"
                      min={1}
                      step={1}
                      aria-label={`Price tier ${index + 1} context threshold`}
                      value={row.size}
                      onChange={(event) =>
                        change(
                          value.rows.map((old, i) =>
                            i === index ? { ...old, size: event.target.value } : old,
                          ),
                        )
                      }
                    />
                  </label>
                  {tierPriceFields.map(([key, label]) => (
                    <label key={key}>
                      {label} USD / million tokens
                      <input
                        type="number"
                        min={0}
                        step="any"
                        placeholder="Unspecified"
                        aria-label={`Price tier ${index + 1} ${label.toLowerCase()} price`}
                        value={row.prices[key] ?? ''}
                        onChange={(event) =>
                          change(
                            value.rows.map((old, i) =>
                              i === index
                                ? { ...old, prices: { ...old.prices, [key]: event.target.value } }
                                : old,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <p>
                  Provider-specific tier preserved. Its fields cannot be edited with the
                  context-tier form. Remove this row only if you intend to delete it.
                </p>
              )}
            </article>
          ))}
          <button
            type="button"
            className="button secondary small"
            onClick={() => change([...value.rows, priceTierDraft()])}
          >
            <Plus size={14} /> Add context price tier
          </button>
        </>
      )}
      {(value.unsupported || value.rows.length > 0) && (
        <button
          type="button"
          className="button secondary small"
          onClick={() => onChange({ changed: true, unsupported: false, rows: [] })}
        >
          Remove all saved price tiers
        </button>
      )}
    </section>
  );
}

export function SavedModelPriceTiers({ cost }: { cost: Record<string, unknown> }) {
  const value = modelPriceTiersDraft(cost);
  const legacy = record(cost['context_over_200k']);
  if (cost['tiers'] === undefined && !Object.keys(legacy).length) return null;
  return (
    <section className="model-price-tiers" aria-label="Saved model price tiers">
      <h4>Saved context price tiers</h4>
      <p>
        Catalog metadata in USD per million tokens. Current-rate usage estimates do not apply these
        tiers.
      </p>
      <LegacyContextPrices value={cost['context_over_200k']} />
      {value.unsupported ? (
        <p>Provider-specific tier format is preserved.</p>
      ) : value.rows.length ? (
        <ol>
          {value.rows.map((row, index) => (
            <li key={index}>
              <strong>
                {row.editable
                  ? `Context threshold: ${Number(row.size).toLocaleString()} tokens`
                  : 'Provider-specific price tier'}
              </strong>
              <dl className="model-info">
                {tierPriceFields.map(
                  ([key, label]) =>
                    typeof record(row.source)[key] === 'number' && (
                      <div key={key}>
                        <dt>{label}</dt>
                        <dd>
                          $
                          {Number(record(row.source)[key]).toLocaleString(undefined, {
                            maximumFractionDigits: 8,
                          })}
                        </dd>
                      </div>
                    ),
                )}
              </dl>
            </li>
          ))}
        </ol>
      ) : (
        <p>No saved context price tiers.</p>
      )}
    </section>
  );
}

function LegacyContextPrices({ value }: { value: unknown }) {
  const prices = record(value);
  if (!Object.keys(prices).length) return null;
  return (
    <div>
      <h4>Legacy over-200k schedule</h4>
      <p>
        This saved structured schedule is preserved separately from context tiers. The scalar
        over-200k field does not replace it.
      </p>
      <dl className="model-info">
        {tierPriceFields.map(
          ([key, label]) =>
            typeof prices[key] === 'number' && (
              <div key={key}>
                <dt>{label} USD / million tokens</dt>
                <dd>
                  ${Number(prices[key]).toLocaleString(undefined, { maximumFractionDigits: 8 })}
                </dd>
              </div>
            ),
        )}
      </dl>
    </div>
  );
}
