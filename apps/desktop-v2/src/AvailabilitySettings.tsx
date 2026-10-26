import type { ModelBlackoutRule } from '@wrongstack/contracts/types/model-availability';
import { CalendarDays, Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { availabilityIssue, scheduleDays, scheduleSegments } from './availability-model';
import { entries } from './engine-values';
import type { PolicyProps } from './ModelPolicySettings';

export function AvailabilitySettings({ draft, change, command }: PolicyProps) {
  const rules = (
    Array.isArray(draft['modelAvailabilitySchedule']) ? draft['modelAvailabilitySchedule'] : []
  ) as ModelBlackoutRule[];
  const [catalog, setCatalog] = useState<Record<string, string[]>>({}),
    [catalogError, setCatalogError] = useState('');
  const prefix = useId();
  useEffect(() => {
    let active = true;
    void command('providers.saved', {}, ['providers.saved', 'key.operation_result'])
      .then(async (saved) => {
        const results = await Promise.allSettled(
          entries(saved['providers']).map(async (p) => {
            const id = String(p['id']);
            const result = await command('provider.models', { providerId: id }, [
              'provider.models',
              'key.operation_result',
            ]);
            return [id, entries(result['models']).map((model) => String(model['id']))] as const;
          }),
        );
        if (active) {
          setCatalog(
            Object.fromEntries(
              results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
            ),
          );
          if (results.some((result) => result.status === 'rejected'))
            setCatalogError(
              'Some catalogs are unavailable. Custom and stored model IDs remain editable.',
            );
        }
      })
      .catch((e) => {
        if (active) setCatalogError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, [command]);
  const patch = (id: string, values: Partial<ModelBlackoutRule>) =>
    change(
      'modelAvailabilitySchedule',
      rules.map((rule) => (rule.id === id ? { ...rule, ...values } : rule)),
    );
  const add = () =>
    change('modelAvailabilitySchedule', [
      ...rules,
      {
        id: crypto.randomUUID(),
        label: 'New availability window',
        enabled: false,
        start: '00:00',
        end: '08:00',
        days: [],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        mode: 'blackout',
      } satisfies ModelBlackoutRule,
    ]);
  const issue = availabilityIssue(rules);
  return (
    <div className="availability-settings model-policy-settings">
      <div className="settings-defaults-note">
        Blackout windows prevent use during selected times. Allow windows are combined: a model can
        be used inside any matching allow window, while matching blackout windows still apply. New
        windows start disabled.
      </div>
      <datalist id={prefix + 'providers'}>
        {Object.keys(catalog).map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
      {catalogError && <p className="field-help">{catalogError}</p>}
      <button type="button" className="button secondary" onClick={add}>
        <Plus size={14} />
        Add availability window
      </button>
      {!rules.length && (
        <div className="availability-empty">
          <CalendarDays size={30} />
          <h3>No availability restrictions</h3>
          <p>Models follow the engine’s normal routing and provider availability.</p>
        </div>
      )}
      {rules.map((rule, index) => {
        const name = 'Window ' + (index + 1),
          everyDay = !rule.days?.length;
        return (
          <article className="availability-card policy-profile" key={rule.id} aria-label={name}>
            <header>
              <div>
                <span className="eyebrow">
                  {rule.enabled === false ? 'DISABLED' : 'ENABLED'} ·{' '}
                  {rule.mode === 'allow_only' ? 'ALLOW WINDOW' : 'BLACKOUT WINDOW'}
                </span>
                <h3>{rule.label || name}</h3>
              </div>
              <button
                type="button"
                className="icon-button danger"
                aria-label={'Remove ' + name}
                onClick={() =>
                  change(
                    'modelAvailabilitySchedule',
                    rules.filter((item) => item.id !== rule.id),
                  )
                }
              >
                <Trash2 size={15} />
              </button>
            </header>
            <label className="policy-toggle">
              <input
                type="checkbox"
                aria-label={name + ' enabled'}
                checked={rule.enabled !== false}
                onChange={(e) => patch(rule.id, { enabled: e.target.checked })}
              />
              Enable this window
            </label>
            <label>
              {name} label
              <input
                aria-label={name + ' label'}
                value={rule.label ?? ''}
                onChange={(e) => patch(rule.id, { label: e.target.value })}
              />
            </label>
            <div className="policy-field-grid">
              <label>
                Provider · blank matches any provider
                <input
                  aria-label={name + ' provider'}
                  list={prefix + 'providers'}
                  required={!rule.model?.trim()}
                  value={rule.provider ?? ''}
                  onChange={(e) => patch(rule.id, { provider: e.target.value || undefined })}
                />
              </label>
              <label>
                Model · blank matches the whole provider
                <input
                  aria-label={name + ' model'}
                  list={prefix + rule.id}
                  required={!rule.provider?.trim()}
                  value={rule.model ?? ''}
                  onChange={(e) => patch(rule.id, { model: e.target.value || undefined })}
                />
              </label>
              <datalist id={prefix + rule.id}>
                {(catalog[rule.provider ?? ''] ?? []).map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </div>
            <label>
              Window behavior
              <select
                aria-label={name + ' behavior'}
                value={rule.mode ?? 'blackout'}
                onChange={(e) =>
                  patch(rule.id, { mode: e.target.value as 'blackout' | 'allow_only' })
                }
              >
                <option value="blackout">Do not use inside this window</option>
                <option value="allow_only">Use only inside matching allow windows</option>
              </select>
            </label>
            <div className="policy-field-grid">
              <label>
                Starts
                <input
                  aria-label={name + ' start'}
                  type="time"
                  required
                  value={rule.start}
                  onChange={(e) => patch(rule.id, { start: e.target.value })}
                />
              </label>
              <label>
                Ends
                <input
                  aria-label={name + ' end'}
                  type="time"
                  required
                  value={rule.end}
                  onChange={(e) => patch(rule.id, { end: e.target.value })}
                />
              </label>
              <label>
                Timezone
                <input
                  aria-label={name + ' timezone'}
                  value={rule.timezone ?? ''}
                  placeholder="Engine host timezone"
                  onChange={(e) => patch(rule.id, { timezone: e.target.value || undefined })}
                />
              </label>
            </div>
            <label className="policy-toggle">
              <input
                type="checkbox"
                aria-label={name + ' every day'}
                checked={everyDay}
                onChange={(e) =>
                  patch(rule.id, { days: e.target.checked ? [] : [0, 1, 2, 3, 4, 5, 6] })
                }
              />
              Every day
            </label>
            <fieldset className="schedule-days" aria-label={name + ' weekdays'} disabled={everyDay}>
              {scheduleDays.map((day, i) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    aria-label={name + ' ' + day}
                    checked={everyDay || !!rule.days?.includes(i)}
                    disabled={!everyDay && rule.days?.length === 1 && rule.days.includes(i)}
                    onChange={(e) =>
                      patch(rule.id, {
                        days: e.target.checked
                          ? [...(rule.days ?? []), i].sort()
                          : rule.days?.filter((value) => value !== i),
                      })
                    }
                  />
                  {day.slice(0, 3)}
                </label>
              ))}
            </fieldset>
            <section
              className={
                'schedule-week ' + (rule.enabled === false ? 'schedule-week-disabled' : '')
              }
              aria-label={name + ' local time preview'}
            >
              <header>
                <span>Local time preview</span>
                <span>00:00 · 12:00 · 24:00</span>
              </header>
              {scheduleDays.map((day, i) => (
                <div className="schedule-day-row" key={day}>
                  <span>{day.slice(0, 3)}</span>
                  <div>
                    {scheduleSegments(rule, i).map(([start, end]) => (
                      <i
                        key={start}
                        style={{ left: start / 14.4 + '%', width: (end - start) / 14.4 + '%' }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </section>
            <p className="field-help">
              Overnight windows continue into the following day. Equal start and end times cover the
              entire selected day. Preview shows this window, not the combined routing decision.
            </p>
          </article>
        );
      })}
      {issue && (
        <p className="field-help" role="status">
          {issue}
        </p>
      )}
    </div>
  );
}
