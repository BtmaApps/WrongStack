import {
  formatLimitRange,
  LIMIT_BOUNDS,
  LIMITS_BUDGET_KEYS,
  LIMITS_SCALAR_KEYS,
} from '@wrongstack/contracts/types/config/limits';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { record } from './engine-values';
import {
  ModelCatalog,
  ModelReference,
  modelRef,
  modelRefPatch,
  type PolicyProps,
  ProfileSelect,
} from './ModelPolicySettings';
import { removeModelTier, validSettingsName, withoutSetting } from './settings-save-model';

type Row = Record<string, unknown>;
const labels: Record<string, string> = {
  responseOutputTokens: 'Response output tokens',
  historyMessages: 'Conversation history messages',
  toolOutputPreviewBytes: 'Tool output preview bytes',
  fetchBytes: 'Fetched page bytes',
  projectInstructionsChars: 'Project instruction characters',
  memoryInjectChars: 'SAGE injection characters',
  subagentResultChars: 'Subagent result characters',
  maxIterations: 'Worker iterations',
  maxToolCalls: 'Worker tool calls',
  timeoutMs: 'Worker timeout (ms)',
};
export function LimitsPolicySettings({ draft, change }: Pick<PolicyProps, 'draft' | 'change'>) {
  const limits = record(draft['limits']),
    budget = record(limits['subagentDefaultBudget']);
  const input = (
    key: (typeof LIMITS_SCALAR_KEYS)[number] | (typeof LIMITS_BUDGET_KEYS)[number],
    worker: boolean,
  ) => {
    const values = worker ? budget : limits,
      value = values[key],
      bound = LIMIT_BOUNDS[key];
    return (
      <div className="setting-row setting-number" key={key}>
        <div>
          <label htmlFor={'limit-' + key}>{labels[key]}</label>
          <p>{bound.why}</p>
          <small>{formatLimitRange(key)}</small>
        </div>
        <div className="setting-control">
          <input
            id={'limit-' + key}
            type="number"
            min={bound.min}
            max={bound.max}
            step="1"
            value={typeof value === 'number' ? value : ''}
            placeholder="Engine default"
            onChange={(e) => {
              const next =
                e.target.value === ''
                  ? withoutSetting(values, key)
                  : { ...values, [key]: Number(e.target.value) };
              change('limits', worker ? { ...limits, subagentDefaultBudget: next } : next);
            }}
          />
        </div>
      </div>
    );
  };
  return (
    <div className="model-policy-settings">
      <p className="settings-defaults-note">
        Blank means inherit the engine, roster or model default. A limit is applied only when you
        enter one. Clear a field to remove that override.
      </p>
      <section aria-label="Context and output limits">
        <h3>Context & output</h3>
        {LIMITS_SCALAR_KEYS.map((key) => input(key, false))}
      </section>
      <section aria-label="Default worker budgets">
        <h3>Default worker budgets</h3>
        <p className="field-help">
          Used when a worker has no explicit budget. Tier and task budgets remain separate.
        </p>
        {LIMITS_BUDGET_KEYS.map((key) => input(key, true))}
      </section>
    </div>
  );
}
function OptionalNumber({
  label,
  value,
  min = 0,
  max,
  step = 'any',
  onChange,
}: {
  label: string;
  value: unknown;
  min?: number;
  max?: number;
  step?: string;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={typeof value === 'number' ? value : ''}
        placeholder="Inherit"
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    </label>
  );
}
export function TierPolicySettings({ draft, change, command }: PolicyProps) {
  const tiers = record(draft['modelTiers']),
    levels = record(tiers['levels']),
    routes = record(tiers['routing']),
    leader = record(tiers['leader']),
    profiles = record(draft['fallbackProfiles']);
  const [name, setName] = useState(''),
    [route, setRoute] = useState(''),
    [target, setTarget] = useState(''),
    [error, setError] = useState('');
  const patch = (values: Row) => change('modelTiers', { ...tiers, ...values });
  const level = (id: string, values: Row) => patch({ levels: { ...levels, [id]: values } });
  const optional = (row: Row, key: string, value: unknown) =>
    value === '' || value === undefined ? withoutSetting(row, key) : { ...row, [key]: value };
  const tierSelect = (label: string, value: unknown, onChange: (v: string) => void) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Inherit</option>
        {[
          ...new Set([
            ...Object.keys(levels),
            ...(typeof value === 'string' && value ? [value] : []),
          ]),
        ].map((id) => (
          <option key={id}>{id}</option>
        ))}
      </select>
    </label>
  );
  const add = () => {
    const id = name.trim();
    if (!validSettingsName(id) || Object.hasOwn(levels, id)) {
      setError('Choose a unique tier name.');
      return;
    }
    level(id, {});
    setName('');
    setError('');
  };
  return (
    <div className="model-policy-settings">
      <ModelCatalog command={command} />
      <p className="settings-defaults-note">
        A tier binds a model or fallback profile to explicit worker budgets. Empty budgets inherit
        engine policy. Existing settings not shown here are preserved.
      </p>
      <label className="policy-toggle">
        <input
          type="checkbox"
          checked={tiers['enabled'] === true}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />
        Enable cost tiers
      </label>
      {tierSelect('Default cost tier', tiers['default'], (v) =>
        change('modelTiers', optional(tiers, 'default', v)),
      )}
      <section className="policy-profile-create">
        <label>
          New cost tier
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. fast or deep"
          />
        </label>
        <button type="button" className="button secondary" disabled={!name.trim()} onClick={add}>
          <Plus size={14} />
          Add tier
        </button>
      </section>
      {error && (
        <p className="session-error" role="alert">
          {error}
        </p>
      )}
      {Object.entries(levels).map(([id, v]) => {
        const row = record(v);
        return (
          <article className="policy-profile" key={id}>
            <header>
              <div>
                <span className="eyebrow">COST TIER</span>
                <h3>{id}</h3>
              </div>
              <button
                type="button"
                className="icon-button danger"
                aria-label={'Remove tier ' + id}
                onClick={() => change('modelTiers', removeModelTier(tiers, id))}
              >
                <Trash2 size={15} />
              </button>
            </header>
            <label>
              {id} description
              <input
                value={String(row['description'] ?? '')}
                onChange={(e) => level(id, optional(row, 'description', e.target.value))}
              />
            </label>
            <div className="policy-field-grid">
              <ModelReference
                label={id + ' primary model'}
                value={modelRef(row)}
                onChange={(v) => level(id, modelRefPatch(row, v))}
              />
              <ProfileSelect
                label={id + ' tier fallback profile'}
                value={row['fallbackProfile']}
                profiles={profiles}
                onChange={(v) => level(id, optional(row, 'fallbackProfile', v))}
              />
            </div>
            <div className="policy-field-grid">
              {(
                [
                  ['maxCostUsd', 'Spend ceiling (USD)', 0, '0.01'],
                  ['maxIterations', 'Iterations', 1, '1'],
                  ['maxToolCalls', 'Tool calls', 1, '1'],
                  ['maxTokens', 'Tokens', 1, '1'],
                  ['timeoutMs', 'Timeout (ms)', 1, '1'],
                ] as const
              ).map(([key, label, min, step]) => (
                <OptionalNumber
                  key={key}
                  label={id + ' ' + label}
                  value={row[key]}
                  min={min}
                  step={step}
                  onChange={(v) => level(id, optional(row, key, v))}
                />
              ))}
            </div>
          </article>
        );
      })}
      <section className="policy-profile">
        <header>
          <div>
            <span className="eyebrow">ROUTING</span>
            <h3>Role & phase tiers</h3>
          </div>
        </header>
        {Object.entries(routes).map(([id, value]) => (
          <div className="policy-chain-row" key={id}>
            {tierSelect(id + ' tier', value, (v) =>
              patch({ routing: v ? { ...routes, [id]: v } : withoutSetting(routes, id) }),
            )}
            <button
              type="button"
              className="icon-button danger"
              aria-label={'Remove tier route ' + id}
              onClick={() => patch({ routing: withoutSetting(routes, id) })}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <div className="policy-field-grid">
          <label>
            Tier route name
            <input
              value={route}
              onChange={(e) => setRoute(e.target.value)}
              placeholder="build, architect, or *"
            />
          </label>
          {tierSelect('Route to tier', target, setTarget)}
          <button
            type="button"
            className="button secondary"
            disabled={!validSettingsName(route) || !target || Object.hasOwn(routes, route.trim())}
            onClick={() => {
              patch({ routing: { ...routes, [route.trim()]: target } });
              setRoute('');
              setTarget('');
            }}
          >
            Add tier route
          </button>
        </div>
      </section>
      <section className="policy-profile">
        <header>
          <div>
            <span className="eyebrow">LEADER</span>
            <h3>Tier switching</h3>
          </div>
        </header>
        <p className="field-help">
          Controls whether the leader may change its own tier. Propose asks for a decision;
          automatic switching remains bounded by these guards.
        </p>
        <label>
          Leader tier switching
          <select
            aria-label="Leader tier switching"
            value={String(leader['mode'] ?? 'off')}
            onChange={(e) => patch({ leader: { ...leader, mode: e.target.value } })}
          >
            {['off', 'propose', 'auto'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <div className="policy-field-grid">
          {tierSelect('Leader maximum tier', leader['maxTier'], (v) =>
            patch({ leader: optional(leader, 'maxTier', v) }),
          )}
          <OptionalNumber
            label="Minimum turns before switching"
            value={leader['dwellTurns']}
            min={0}
            step="1"
            onChange={(v) => patch({ leader: optional(leader, 'dwellTurns', v) })}
          />
          <OptionalNumber
            label="Minimum savings (USD)"
            value={leader['minSavingsUsd']}
            min={0}
            onChange={(v) => patch({ leader: optional(leader, 'minSavingsUsd', v) })}
          />
          <OptionalNumber
            label="Maximum context fill for switching"
            value={leader['maxContextFillForSwitch']}
            min={0}
            max={1}
            onChange={(v) => patch({ leader: optional(leader, 'maxContextFillForSwitch', v) })}
          />
        </div>
      </section>
    </div>
  );
}
