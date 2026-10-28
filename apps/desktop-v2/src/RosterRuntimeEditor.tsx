import { ArrowDown, ArrowUp, Plus, Save, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { EngineCommand } from './engine-operations';
import { emptyEngineState } from './engine-state';
import { entries, record } from './engine-values';
import { Modal } from './Modal';
import { ProfileModelPicker } from './ProfileModelPicker';
import {
  mergeRosterConfig,
  type RosterRecord,
  rosterBudgetFields,
  rosterConfig,
  rosterDocumentKey,
} from './roster-model';
import { sameSetting } from './settings-save-model';

const drafts = new Map<string, { base: RosterRecord; draft: RosterRecord }>();
const text = (value: unknown) => (typeof value === 'string' ? value : '');
export function RosterRuntimeEditor({
  projectId,
  role,
  snapshot,
  effective,
  toolNames,
  skillNames,
  command,
  onClose,
  onSaved,
}: {
  projectId: string;
  role: string;
  snapshot: RosterRecord;
  effective: RosterRecord;
  toolNames: string[];
  skillNames: string[];
  command: EngineCommand;
  onClose: () => void;
  onSaved: () => void;
}) {
  const key = rosterDocumentKey(projectId, role, 'runtime');
  const cached = useRef(drafts.get(key)).current;
  const [base, setBase] = useState(cached?.base ?? record(snapshot['config']));
  const [draft, setDraft] = useState<RosterRecord>(
    cached?.draft ?? structuredClone(record(snapshot['config'])),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [picker, setPicker] = useState<'model' | 'allowed' | null>(null),
    [pickerBusy, setPickerBusy] = useState(false);
  const saving = useRef(false);
  const dirty = !sameSetting(draft, base);
  const change = (next: RosterRecord) => {
    setDraft(next);
    drafts.set(key, { base, draft: next });
    setError('');
  };
  const field = (name: string, value: unknown) => {
    const next = { ...draft };
    if (value === undefined) delete next[name];
    else next[name] = value;
    change(next);
  };
  const close = () => {
    if (busy) return;
    if (dirty) setLeaving(true);
    else onClose();
  };
  const budget = record(draft['budget']),
    policy = record(draft['modelPolicy']),
    available = record(draft['availability']);
  const allowed = entries(policy['allowed']),
    fallbacks = entries(policy['fallbacks']);
  const save = async () => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const current = await command(
        'agent-roster.read-customization',
        { role, includeDocuments: false },
        ['agent-roster.read-customization'],
      );
      if (current['configState'] === 'unreadable')
        throw Error(
          'The stored runtime is unreadable. Repair its file before replacing project settings.',
        );
      if (snapshot['profile'] && !current['profile'])
        throw Error('This project role was removed. Your local runtime draft is preserved.');
      const next = mergeRosterConfig(base, draft, record(current['config']));
      await command('agent-roster.update-config', { role, config: next }, [
        'agent-roster.update-config',
      ]);
      const actual = await command(
        'agent-roster.read-customization',
        { role, includeDocuments: false },
        ['agent-roster.read-customization'],
      );
      if (actual['configState'] === 'unreadable' || !sameSetting(actual['config'], next))
        throw Error('The saved runtime did not match readback. Your local draft is kept.');
      drafts.delete(key);
      setBase(next);
      setDraft(next);
      onSaved();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const modelPolicy = (next: RosterRecord) => field('modelPolicy', next);
  const capabilityChoices = Array.isArray(effective['allowedCapabilities'])
    ? effective['allowedCapabilities'].map(String)
    : [];
  return (
    <>
      <Modal title={`Runtime policy for ${role}`} onClose={close}>
        <div className="roster-runtime-editor">
          <header>
            <div>
              <span className="eyebrow">PROJECT OVERRIDE · {role}</span>
              <h2>Runtime policy</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Close role runtime"
              disabled={busy}
              onClick={close}
            >
              <X size={18} />
            </button>
          </header>
          <p>
            Project choices are resolved against the role's catalog defaults on its next spawn.
            Empty budget fields inherit. Saved overrides and resolved values are shown separately.
          </p>
          {snapshot['systemProtected'] === true && (
            <p className="roster-policy-note">
              Built-in role rules retain base tools, use advisory availability and model policy, and
              apply budget minima. The resolved overview shows the result.
            </p>
          )}
          {cached && dirty && (
            <p role="status" className="roster-policy-note">
              Your unsaved runtime draft from this window has been recovered.
            </p>
          )}
          {error && (
            <p role="alert" className="session-error">
              {error}
            </p>
          )}
          <fieldset disabled={busy}>
            <section>
              <h3>Model and checkout</h3>
              <div className="roster-form-grid">
                <div>
                  <span className="field-label">Project role model</span>
                  <button
                    type="button"
                    className="button secondary"
                    aria-label="Choose role model"
                    onClick={() => setPicker('model')}
                  >
                    {draft['provider'] || draft['model']
                      ? `${draft['provider'] ?? '*'}/${draft['model'] ?? '*'}`
                      : 'Inherit model routing'}
                  </button>
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={() => {
                      const next = { ...draft };
                      delete next['provider'];
                      delete next['model'];
                      change(next);
                    }}
                  >
                    Inherit model
                  </button>
                </div>
                <label>
                  Fallback profile
                  <input
                    aria-label="Role fallback profile"
                    value={text(draft['fallbackProfile'])}
                    disabled={!!draft['modelPolicy']}
                    onChange={(event) => field('fallbackProfile', event.target.value || undefined)}
                    placeholder="Inherit"
                  />
                  <small>
                    Explicit model policy supplies fallbacks while enabled; this profile is
                    retained.
                  </small>
                </label>
                <label>
                  Working directory
                  <input
                    aria-label="Role working directory"
                    value={text(draft['cwd'])}
                    onChange={(event) => field('cwd', event.target.value || undefined)}
                    placeholder="Assigned checkout root"
                  />
                </label>
                <label>
                  Checkout strategy
                  <select
                    aria-label="Role checkout strategy"
                    value={draft['worktree'] === undefined ? '' : String(draft['worktree'])}
                    onChange={(event) =>
                      field(
                        'worktree',
                        event.target.value === ''
                          ? undefined
                          : event.target.value === 'true'
                            ? true
                            : event.target.value === 'false'
                              ? false
                              : event.target.value,
                      )
                    }
                  >
                    <option value="">Inherit</option>
                    <option value="auto">Automatic</option>
                    <option value="required">Require worktree</option>
                    <option value="off">No worktree</option>
                    <option value="true">Enabled (legacy)</option>
                    <option value="false">Disabled (legacy)</option>
                  </select>
                </label>
              </div>
            </section>
            <section>
              <h3>Execution budgets</h3>
              <p className="field-help">
                Amounts are stored as entered; zero is an explicit amount. Empty fields use the
                catalog. No desktop cap is added.
              </p>
              <div className="roster-form-grid">
                {rosterBudgetFields.map(({ key: fieldKey, label }) => (
                  <label key={fieldKey}>
                    {label}
                    <input
                      aria-label={`Role ${label}`}
                      inputMode={fieldKey === 'maxCostUsd' ? 'decimal' : 'numeric'}
                      value={budget[fieldKey] === undefined ? '' : String(budget[fieldKey])}
                      onChange={(event) =>
                        field('budget', { ...budget, [fieldKey]: event.target.value })
                      }
                      placeholder="Inherit"
                    />
                    <small>
                      Resolved:{' '}
                      {record(effective['budget'])[fieldKey] === undefined
                        ? 'Not reported'
                        : String(record(effective['budget'])[fieldKey])}
                    </small>
                  </label>
                ))}
              </div>
            </section>
            <section>
              <h3>Model policy</h3>
              <label className="roster-checkbox">
                <input
                  type="checkbox"
                  checked={!!draft['modelPolicy']}
                  onChange={(event) =>
                    event.target.checked
                      ? modelPolicy({ allowed: [], fallbacks: [], strict: false })
                      : field('modelPolicy', undefined)
                  }
                />
                Use an explicit allowed-model policy
              </label>
              {draft['modelPolicy'] !== undefined && (
                <>
                  <label className="roster-checkbox">
                    <input
                      type="checkbox"
                      checked={policy['strict'] === true}
                      onChange={(event) => modelPolicy({ ...policy, strict: event.target.checked })}
                    />
                    Enforce the allowed list for this custom role
                  </label>
                  <p className="field-help">
                    Fallbacks run in order and must also be allowed. Built-in roles apply their
                    protected policy rules.
                  </p>
                  <div className="roster-model-targets">
                    {allowed.map((target, index) => (
                      <div key={`${target['provider']}/${target['model']}`}>
                        <code>
                          {String(target['provider'])}/{String(target['model'])}
                        </code>
                        <label className="roster-checkbox">
                          <input
                            type="checkbox"
                            checked={fallbacks.some((item) => sameSetting(item, target))}
                            onChange={(event) =>
                              modelPolicy({
                                ...policy,
                                fallbacks: event.target.checked
                                  ? [...fallbacks, target]
                                  : fallbacks.filter((item) => !sameSetting(item, target)),
                              })
                            }
                          />
                          Fallback
                        </label>
                        <button
                          type="button"
                          className="icon-button danger"
                          aria-label={`Remove allowed model ${index + 1}`}
                          onClick={() =>
                            modelPolicy({
                              ...policy,
                              allowed: allowed.filter((_, i) => i !== index),
                              fallbacks: fallbacks.filter((item) => !sameSetting(item, target)),
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setPicker('allowed')}
                  >
                    <Plus size={14} />
                    Add allowed model
                  </button>
                  {fallbacks.length > 0 && (
                    <ol className="roster-model-targets">
                      {fallbacks.map((target, index) => (
                        <li key={`${target['provider']}/${target['model']}`}>
                          <code>
                            {String(target['provider'])}/{String(target['model'])}
                          </code>
                          {[-1, 1].map((direction) => (
                            <button
                              key={direction}
                              type="button"
                              className="icon-button"
                              aria-label={`Move fallback ${index + 1} ${direction < 0 ? 'up' : 'down'}`}
                              disabled={
                                index + direction < 0 || index + direction >= fallbacks.length
                              }
                              onClick={() => {
                                const next = [...fallbacks];
                                [next[index], next[index + direction]] = [
                                  next[index + direction]!,
                                  next[index]!,
                                ];
                                modelPolicy({ ...policy, fallbacks: next });
                              }}
                            >
                              {direction < 0 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                            </button>
                          ))}
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              )}
            </section>
            <section>
              <h3>Availability</h3>
              <label className="roster-checkbox">
                <input
                  type="checkbox"
                  checked={!!draft['availability']}
                  onChange={(event) =>
                    field(
                      'availability',
                      event.target.checked
                        ? {
                            timezone: 'UTC',
                            days: [1, 2, 3, 4, 5],
                            start: '09:00',
                            end: '17:00',
                            mode: 'advisory',
                          }
                        : undefined,
                    )
                  }
                />
                Set a role availability window
              </label>
              {draft['availability'] !== undefined && (
                <>
                  <div className="roster-form-grid">
                    <label>
                      Timezone
                      <input
                        aria-label="Role availability timezone"
                        value={text(available['timezone'])}
                        onChange={(event) =>
                          field('availability', { ...available, timezone: event.target.value })
                        }
                        placeholder="Europe/Kyiv"
                      />
                    </label>
                    <label>
                      Policy
                      <select
                        aria-label="Role availability policy"
                        value={text(available['mode']) || 'advisory'}
                        onChange={(event) =>
                          field('availability', { ...available, mode: event.target.value })
                        }
                      >
                        <option value="advisory">Advisory</option>
                        <option value="enforce">Enforce for custom role</option>
                      </select>
                    </label>
                    {['start', 'end'].map((name) => (
                      <label key={name}>
                        {name === 'start' ? 'From' : 'Until'}
                        <input
                          aria-label={`Role availability ${name}`}
                          type="time"
                          value={text(available[name])}
                          onChange={(event) =>
                            field('availability', { ...available, [name]: event.target.value })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <div className="roster-weekdays">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                      <label key={day}>
                        <input
                          type="checkbox"
                          aria-label={`Role available ${day}`}
                          checked={
                            Array.isArray(available['days']) && available['days'].includes(index)
                          }
                          onChange={(event) => {
                            const days = Array.isArray(available['days']) ? available['days'] : [];
                            field('availability', {
                              ...available,
                              days: event.target.checked
                                ? [...days, index].sort()
                                : days.filter((day) => day !== index),
                            });
                          }}
                        />
                        {day}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </section>
            <RosterListOverride
              label="Tool grants"
              value={draft['tools']}
              choices={toolNames}
              onChange={(value) => field('tools', value)}
            />
            <RosterListOverride
              label="Role skills"
              value={draft['skillNames']}
              choices={skillNames}
              onChange={(value) => field('skillNames', value)}
            />
            <RosterListOverride
              label="Allowed capabilities"
              value={draft['allowedCapabilities']}
              choices={capabilityChoices}
              onChange={(value) => field('allowedCapabilities', value)}
            />
          </fieldset>
          {leaving && (
            <div className="roster-confirm" role="alert">
              <p>This role has an unsaved runtime draft.</p>
              <button type="button" className="button secondary" onClick={() => setLeaving(false)}>
                Keep editing runtime
              </button>
              <button type="button" className="button secondary" onClick={onClose}>
                Keep draft and close
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  drafts.delete(key);
                  onClose();
                }}
              >
                Discard runtime draft
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={async () => {
                  setBusy(true);
                  try {
                    const current = await command(
                      'agent-roster.read-customization',
                      { role, includeDocuments: false },
                      ['agent-roster.read-customization'],
                    );
                    if (current['configState'] === 'unreadable')
                      throw Error('The stored role config is unreadable.');
                    const config = record(current['config']);
                    setBase(config);
                    setDraft(structuredClone(config));
                    drafts.delete(key);
                    setLeaving(false);
                    setError('');
                  } catch (error) {
                    setError(String(error));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Reload stored runtime
              </button>
            </div>
          )}
          <footer>
            <span>{dirty ? 'Unsaved project override' : 'Project runtime loaded'}</span>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => (dirty ? setLeaving(true) : onClose())}
            >
              Close
            </button>
            <button
              type="button"
              className="button primary"
              disabled={!dirty || busy}
              onClick={() => {
                try {
                  rosterConfig(draft);
                  void save();
                } catch (error) {
                  setError(String(error));
                }
              }}
            >
              <Save size={14} />
              Save role runtime
            </button>
          </footer>
        </div>
      </Modal>
      {picker && (
        <Modal
          title={`Choose ${role} ${picker === 'model' ? 'model' : 'allowed model'}`}
          onClose={() => {
            if (!pickerBusy) setPicker(null);
          }}
        >
          <ProfileModelPicker
            session={{
              ...emptyEngineState,
              provider: text(draft['provider']),
              model: text(draft['model']),
            }}
            title={`Choose ${role} ${picker === 'model' ? 'model' : 'allowed model'}`}
            description="This selection changes the project role draft. Save the runtime policy to apply it to future workers."
            onPick={(provider, model) => {
              if (picker === 'model') change({ ...draft, provider, model });
              else {
                const target = { provider, model };
                modelPolicy({
                  ...policy,
                  allowed: allowed.some((entry) => sameSetting(entry, target))
                    ? allowed
                    : [...allowed, target],
                });
              }
            }}
            onClose={() => setPicker(null)}
            onBusy={setPickerBusy}
          />
        </Modal>
      )}
    </>
  );
}

function RosterListOverride({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: unknown;
  choices: string[];
  onChange: (value: string[] | undefined) => void;
}) {
  const [query, setQuery] = useState(''),
    [limit, setLimit] = useState(100);
  const selected = Array.isArray(value) ? value.map(String) : [];
  const items = [...new Set([...selected, ...choices])]
    .filter((name) => name.toLowerCase().includes(query.toLowerCase()))
    .sort();
  return (
    <section className="roster-list-override">
      <h3>{label}</h3>
      <label className="roster-checkbox">
        <input
          type="checkbox"
          checked={Array.isArray(value)}
          onChange={(event) => onChange(event.target.checked ? [] : undefined)}
        />
        Override inherited {label.toLowerCase()}
      </label>
      <p className="field-help">
        {Array.isArray(value)
          ? `${selected.length} explicit names. The empty list is an explicit override; built-in roles retain their protected base grants.`
          : 'Using the role catalog defaults.'}
      </p>
      {Array.isArray(value) && (
        <>
          <label>
            Find or add a name
            <input
              aria-label={`Search ${label}`}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setLimit(100);
              }}
            />
          </label>
          {query.trim() && !items.includes(query.trim()) && (
            <button
              type="button"
              className="button secondary small"
              onClick={() => {
                onChange([...selected, query.trim()]);
                setQuery('');
              }}
            >
              Add “{query.trim()}”
            </button>
          )}
          <div className="roster-grant-options">
            {items.slice(0, limit).map((name) => (
              <label key={name}>
                <input
                  type="checkbox"
                  checked={selected.includes(name)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...selected, name]
                        : selected.filter((entry) => entry !== name),
                    )
                  }
                />
                <span>{name}</span>
                {!choices.includes(name) && <small>Stored / custom</small>}
              </label>
            ))}
          </div>
          {items.length > limit && (
            <button
              type="button"
              className="button secondary small"
              onClick={() => setLimit(limit + 100)}
            >
              Show more names ({items.length - limit})
            </button>
          )}
        </>
      )}
    </section>
  );
}
