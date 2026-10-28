import {
  type ModelAdvancedDraft,
  modelEfforts,
  type ReasoningOptionDraft,
} from './model-advanced-editor';

export function ModelAdvancedFields({
  value,
  onChange,
}: {
  value: ModelAdvancedDraft;
  onChange: (next: ModelAdvancedDraft) => void;
}) {
  const change = (patch: Partial<ModelAdvancedDraft>) => onChange({ ...value, ...patch });
  const editOption = (index: number, patch: Partial<ReasoningOptionDraft>) =>
    change({
      options: value.options.map((item, position) =>
        position === index ? { ...item, ...patch } : item,
      ),
    });
  return (
    <details className="model-advanced-fields">
      <summary>Advanced model behavior</summary>
      <p>
        Describe this model's catalog capabilities. These settings do not change the effort of an
        already running conversation. Unedited schema fields are preserved.
      </p>
      <h3>Reasoning controls</h3>
      {value.runtimePolicy === 'preserve' && (
        <p role="note">
          This definition has an explicit runtime reasoning policy. It takes precedence over catalog
          controls. Keep it to preserve its current behavior, or explicitly switch to catalog
          controls.
        </p>
      )}
      <label>
        Reasoning policy source
        <select
          aria-label="Model reasoning policy source"
          value={value.runtimePolicy}
          onChange={(event) =>
            change({ runtimePolicy: event.target.value as ModelAdvancedDraft['runtimePolicy'] })
          }
        >
          <option value="preserve">Preserve saved runtime policy</option>
          <option value="catalog">Use catalog controls (remove explicit runtime policy)</option>
          <option value="custom">Author explicit runtime policy</option>
        </select>
      </label>
      {value.runtimePolicy === 'custom' && (
        <div className="model-reasoning-option">
          <p>
            This explicit policy overrides the catalog controls below. It describes support and
            defaults; running conversations keep their current settings.
          </p>
          <div className="model-editor-grid">
            <label>
              Reasoning default
              <select
                aria-label="Runtime reasoning default"
                value={value.runtime.default}
                onChange={(event) =>
                  change({ runtime: { ...value.runtime, default: event.target.value } })
                }
              >
                {['enabled', 'disabled', 'adaptive', 'always_on'].map((mode) => (
                  <option key={mode} value={mode}>
                    {mode.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Can disable reasoning
              <select
                aria-label="Runtime reasoning can disable"
                value={String(value.runtime.disableSupported)}
                onChange={(event) =>
                  change({
                    runtime: { ...value.runtime, disableSupported: event.target.value === 'true' },
                  })
                }
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
            <label>
              Effort support
              <select
                aria-label="Runtime reasoning effort support"
                value={value.runtime.effortSupported}
                onChange={(event) =>
                  change({
                    runtime: {
                      ...value.runtime,
                      effortSupported: event.target.value,
                      effortLevels: event.target.value === 'true' ? value.runtime.effortLevels : [],
                    },
                  })
                }
              >
                <option value="inherit">Undocumented; provider gates requests</option>
                <option value="true">Documented effort levels</option>
                <option value="false">No effort control</option>
              </select>
            </label>
            <label>
              Thinking retention
              <select
                aria-label="Runtime reasoning thinking retention"
                value={value.runtime.preserveThinking}
                onChange={(event) =>
                  change({ runtime: { ...value.runtime, preserveThinking: event.target.value } })
                }
              >
                {['unsupported', 'optional', 'always_on'].map((mode) => (
                  <option key={mode} value={mode}>
                    {mode.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {value.runtime.effortSupported === 'true' && (
            <fieldset className="model-effort-choices">
              <legend>Runtime effort levels</legend>
              {modelEfforts.map((effort) => (
                <label key={effort}>
                  <input
                    type="checkbox"
                    aria-label={`Runtime effort ${effort}`}
                    checked={value.runtime.effortLevels.includes(effort)}
                    onChange={(event) =>
                      change({
                        runtime: {
                          ...value.runtime,
                          effortLevels: event.target.checked
                            ? modelEfforts.filter(
                                (level) =>
                                  value.runtime.effortLevels.includes(level) || level === effort,
                              )
                            : value.runtime.effortLevels.filter((level) => level !== effort),
                        },
                      })
                    }
                  />
                  {effort}
                </label>
              ))}
            </fieldset>
          )}
        </div>
      )}
      <p>
        Only declare controls supported by the provider. No controls means inherit the catalog. An
        effort control without selected levels declares no supported effort levels.
      </p>
      {value.options.map((option, index) => (
        <div className="model-reasoning-option" key={`${index}-${option.type}`}>
          <div className="model-editor-grid">
            <label>
              Control type
              <select
                aria-label={`Reasoning control ${index + 1}`}
                value={option.type}
                onChange={(event) => editOption(index, { type: event.target.value })}
              >
                <option value="toggle">On / off toggle</option>
                <option value="effort">Reasoning effort</option>
                <option value="budget_tokens">Token budget</option>
              </select>
            </label>
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                change({ options: value.options.filter((_, position) => position !== index) })
              }
            >
              Remove reasoning control {index + 1}
            </button>
          </div>
          {option.type === 'effort' && (
            <fieldset className="model-effort-choices">
              <legend>Supported effort levels</legend>
              {modelEfforts.map((effort) => (
                <label key={effort}>
                  <input
                    type="checkbox"
                    aria-label={`Control ${index + 1} effort ${effort}`}
                    checked={option.values.includes(effort)}
                    onChange={(event) =>
                      editOption(index, {
                        values: event.target.checked
                          ? modelEfforts.filter(
                              (level) => option.values.includes(level) || level === effort,
                            )
                          : option.values.filter((level) => level !== effort),
                      })
                    }
                  />
                  {effort}
                </label>
              ))}
            </fieldset>
          )}
          {option.type === 'budget_tokens' && (
            <div className="model-editor-grid">
              {(['min', 'max'] as const).map((key) => (
                <label key={key}>
                  {key === 'min' ? 'Minimum' : 'Maximum'} reasoning tokens
                  <input
                    type="number"
                    min={0}
                    step={1}
                    aria-label={`Control ${index + 1} ${key} reasoning tokens`}
                    value={option[key]}
                    onChange={(event) => editOption(index, { [key]: event.target.value })}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={value.options.length >= 3}
        onClick={() => {
          const type = ['effort', 'budget_tokens', 'toggle'].find(
            (type) => !value.options.some((option) => option.type === type),
          );
          if (type)
            change({
              options: [...value.options, { type, values: [], min: '', max: '', source: {} }],
            });
        }}
      >
        Add reasoning control
      </button>
      <h3>Reasoning replay</h3>
      <p>
        Interleaved providers may require the original reasoning field to be replayed between tool
        calls.
      </p>
      <div className="model-editor-grid">
        <label>
          Interleaved reasoning
          <select
            aria-label="Model interleaved reasoning"
            value={value.interleaved}
            onChange={(event) => change({ interleaved: event.target.value })}
          >
            <option value="inherit">Inherit catalog</option>
            <option value="true">Supported</option>
            <option value="false">Not supported</option>
            <option value="field">Provider replay field</option>
          </select>
        </label>
        {value.interleaved === 'field' && (
          <label>
            Replay field
            <input
              aria-label="Model reasoning replay field"
              value={value.field}
              placeholder="reasoning_content"
              onChange={(event) => change({ field: event.target.value })}
            />
          </label>
        )}
      </div>
      <h3>Lifecycle</h3>
      <div className="model-editor-grid">
        <label>
          Catalog status
          <input
            aria-label="Model catalog status"
            value={value.status}
            placeholder="beta, deprecated, or blank to inherit"
            onChange={(event) => change({ status: event.target.value })}
          />
        </label>
        <label>
          Experimental
          <select
            aria-label="Model experimental status"
            value={value.experimental}
            onChange={(event) => change({ experimental: event.target.value })}
          >
            <option value="inherit">Inherit catalog</option>
            <option value="true">Experimental</option>
            <option value="false">Not experimental</option>
          </select>
        </label>
      </div>
      <h3>Model connection override</h3>
      <p>
        Leave blank to inherit the provider connection. SDK and API fields are catalog transport
        metadata; they do not install a package. Keep credentials in the provider vault.
      </p>
      <div className="model-editor-grid">
        <label>
          SDK package
          <input
            aria-label="Model SDK package"
            value={value.npm}
            placeholder="@ai-sdk/openai-compatible"
            onChange={(event) => change({ npm: event.target.value })}
          />
        </label>
        <label>
          API endpoint
          <input
            aria-label="Model API endpoint"
            value={value.api}
            placeholder="https://provider.example/v1"
            onChange={(event) => change({ api: event.target.value })}
          />
        </label>
      </div>
    </details>
  );
}
