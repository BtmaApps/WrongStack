import { useState } from 'react';
import { distribution, type SessionModelStats } from '@/lib/session-model-stats';
import type { StoryEvent } from '@/lib/session-story';

const ms = (value: number | undefined) =>
  value === undefined
    ? '—'
    : value < 1000
      ? `${Math.round(value)} ms`
      : `${(value / 1000).toFixed(2)} s`;
const count = (value: number) => value.toLocaleString();
const usd = (value: number | undefined) =>
  value === undefined ? '—' : value > 0 && value < 0.000001 ? '<$0.000001' : `$${value.toFixed(6)}`;
const ratio = (n: number, total: number) => (total ? `${((n / total) * 100).toFixed(1)}%` : '—');
const samples = (n: number, total: number) => `${n}/${total}`;
type Mode = 'reliability' | 'speed' | 'work';

export function ModelDashboard({
  models,
  onInspect,
}: {
  models: SessionModelStats[];
  onInspect(event: StoryEvent): void;
}) {
  const [mode, setMode] = useState<Mode>('reliability');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string>('all');
  const [sort, setSort] = useState('attempts');
  const rows = models
    .filter((row) => `${row.model} ${row.provider}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sort === 'failures'
        ? b.failed - a.failed
        : sort === 'latency'
          ? (distribution(b.durations).avg ?? -1) - (distribution(a.durations).avg ?? -1)
          : sort === 'cost'
            ? (b.pricedSamples ? b.cost : -1) - (a.pricedSamples ? a.cost : -1)
            : b.attempts - a.attempts,
    );
  const picked = models.find((row) => row.key === selected);
  const maxLatency = Math.max(1, ...rows.map((row) => distribution(row.durations).avg ?? 0));
  const evidence = picked?.evidence ?? [];
  const issues = evidence.filter(
    (event) =>
      event.kind === 'alert' ||
      event.raw?.outcome === 'failure' ||
      /intervention|loop|verification/.test(event.raw?.eventType ?? ''),
  );
  const headers =
    mode === 'reliability'
      ? [
          'Model / provider',
          'Attempts',
          'Usable / failed / unsettled',
          'Attempt success',
          'Logical requests',
          'Retry attempts / scheduled',
          'Retry wait',
          'Recovered requests',
          'Fallback out / in',
        ]
      : mode === 'speed'
        ? [
            'Model / provider',
            'Avg / P50 / P95 / max',
            'Timed attempts',
            'First chunk avg / P95',
            'First chunk samples',
            'Output tok/s',
            'Fresh input / output',
            'Cache read / write',
            'Cache hit',
            'Usage coverage',
            'Est. cost / pricing coverage',
          ]
        : [
            'Model / provider',
            'Agents',
            'Tools / unsettled',
            'Tool success / failed / blocked',
            'Tool avg / P95',
            'Tool timing coverage',
            'Invalid tool inputs',
            'Tasks ok / failed / timeout / stopped / unknown',
            'Verification fails',
            'Loops / drift / interventions',
            'Length stops',
          ];
  const cells = (row: SessionModelStats) => {
    const timing = distribution(row.durations),
      first = distribution(row.firstChunk),
      tools = distribution(row.toolDurations);
    return mode === 'reliability'
      ? [
          count(row.attempts),
          `${row.completed} / ${row.failed} / ${row.unsettled}`,
          ratio(row.completed, row.completed + row.failed),
          row.requests.size || '—',
          `${row.retryAttempts} / ${row.retryScheduleSamples ? row.retriesScheduled : '—'} (schedule ${samples(row.retryScheduleSamples, row.failed)})`,
          row.retryDelaySamples
            ? `${ms(row.retryDelay)} (${samples(row.retryDelaySamples, row.retriesScheduled)})`
            : '—',
          row.recovered,
          `${row.fallbackOut} / ${row.fallbackIn}`,
        ]
      : mode === 'speed'
        ? [
            `${ms(timing.avg)} / ${ms(timing.p50)} / ${ms(timing.p95)} / ${ms(timing.max)}`,
            samples(timing.n, row.attempts),
            `${ms(first.avg)} / ${ms(first.p95)}`,
            first.n,
            row.timedOutputMs ? (row.timedOutput / (row.timedOutputMs / 1000)).toFixed(1) : '—',
            row.usageSamples ? `${count(row.input)} / ${count(row.output)}` : '—',
            row.usageSamples ? `${count(row.cacheRead)} / ${count(row.cacheWrite)}` : '—',
            ratio(row.cacheRead, row.input + row.cacheRead + row.cacheWrite),
            `${row.usageSamples}${row.usageSource === 'attempts' ? `/${row.completed}` : ''} (${row.usageSource})`,
            `${usd(row.pricedSamples ? row.cost : undefined)} · ${samples(row.pricedSamples, row.accountingSamples)}`,
          ]
        : [
            row.agents.size,
            `${row.toolCalls} / ${row.toolUnsettled}`,
            `${row.toolSuccess} / ${row.toolFailed} / ${row.toolBlocked}`,
            `${ms(tools.avg)} / ${ms(tools.p95)}`,
            samples(tools.n, row.toolCalls),
            row.invalidInputs,
            `${row.taskSuccess} / ${row.taskFailed} / ${row.taskTimeout} / ${row.taskStopped} / ${row.taskUnknown}`,
            row.verificationFailed,
            `${row.loops} / ${row.drift} / ${row.interventions}`,
            Object.entries(row.stopReasons)
              .filter(([key]) => /length|max_tokens/.test(key))
              .reduce((sum, [, n]) => sum + n, 0),
          ];
  };
  return (
    <div className="story-enter space-y-5">
      <section className="rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Model performance & evidence</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              Leader and subagents together, grouped by provider + model. Transport success is a
              usable response; task quality needs recorded outcome evidence.
            </p>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search models"
            placeholder="Search models…"
            className="rounded-xl border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(['reliability', 'speed', 'work'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={`rounded-xl border px-3 py-2 text-xs ${mode === value ? 'border-info/50 bg-info/10 text-info' : ''}`}
            >
              {value === 'reliability'
                ? 'Reliability'
                : value === 'speed'
                  ? 'Speed, tokens & cost'
                  : 'Work & quality signals'}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            Sort
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="rounded-lg border bg-background px-2 py-1"
            >
              <option value="attempts">Attempts</option>
              <option value="failures">Failures</option>
              <option value="latency">Avg latency</option>
              <option value="cost">Recorded cost</option>
            </select>
          </label>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section className="rounded-xl border bg-background/40 p-4">
            <h3 className="text-sm font-medium">Attempt reliability</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Green = usable · rose = failed · grey = unsettled
            </p>
            <div className="mt-4 space-y-3">
              {rows.slice(0, 8).map((row) => (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => setSelected(row.key)}
                  className="block w-full text-left"
                >
                  <span className="mb-1 flex justify-between gap-2 text-xs">
                    <span className="truncate">
                      {row.model}
                      <span className="ml-2 text-muted-foreground">{row.provider}</span>
                    </span>
                    <span className="shrink-0 font-mono">
                      {ratio(row.completed, row.completed + row.failed)} · n=
                      {row.completed + row.failed}
                    </span>
                  </span>
                  <span className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                    {[
                      [row.completed, 'hsl(var(--success))'],
                      [row.failed, 'hsl(var(--destructive))'],
                      [row.unsettled, 'hsl(var(--muted-foreground))'],
                    ].map(([n, color]) =>
                      Number(n) > 0 ? (
                        <span
                          key={color}
                          className="story-meter"
                          style={{
                            width: `${(Number(n) / Math.max(1, row.attempts)) * 100}%`,
                            background: String(color),
                          }}
                        />
                      ) : null,
                    )}
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section className="rounded-xl border bg-background/40 p-4">
            <h3 className="text-sm font-medium">Measured attempt latency</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Average terminal duration · failed attempts included
            </p>
            <div className="mt-4 space-y-3">
              {rows.slice(0, 8).map((row) => {
                const timing = distribution(row.durations);
                return (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => setSelected(row.key)}
                    className="block w-full text-left"
                  >
                    <span className="mb-1 flex justify-between gap-2 text-xs">
                      <span className="truncate">{row.model}</span>
                      <span className="shrink-0 font-mono">
                        {ms(timing.avg)} · n={timing.n}
                      </span>
                    </span>
                    <span className="block h-2.5 overflow-hidden rounded-full bg-muted">
                      <span
                        className="story-meter block h-full rounded-full bg-primary"
                        style={{ width: `${((timing.avg ?? 0) / maxLatency) * 100}%` }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                {headers.map((header) => (
                  <th key={header} className="whitespace-nowrap px-3 py-3 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className={`border-t ${selected === row.key ? 'bg-info/5' : 'hover:bg-muted/30'}`}
                >
                  <td className="min-w-48 px-3 py-3">
                    <button
                      type="button"
                      onClick={() => setSelected(row.key)}
                      aria-pressed={selected === row.key}
                      className="text-left font-medium text-info underline"
                    >
                      {row.model}
                    </button>
                    <p className="mt-1 text-[11px] text-muted-foreground">{row.provider}</p>
                  </td>
                  {cells(row).map((cell, index) => (
                    <td key={index} className="whitespace-nowrap px-3 py-3 font-mono">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No model evidence matches this filter.
          </p>
        )}
        <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
          Output tok/s = completed output tokens / measured full response time, including prefill;
          it is not streaming decode speed. First chunk includes thinking. Cache tokens are disjoint
          from fresh input. Costs are recorded per-call estimates with pricing coverage, not
          cumulative actor totals. Unknown/ambiguous attribution remains visible as Unknown model.
        </p>
      </section>
      {picked && (
        <section className="rounded-2xl border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                {picked.model} · {picked.provider}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {picked.agents.size} observed lanes · {issues.length} diagnostic records ·{' '}
                {picked.evidence.length} supporting records
              </p>
            </div>
            <button type="button" onClick={() => setSelected('all')} className="text-xs underline">
              Close details
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [
                'Prompt tokens avg / max',
                `${distribution(picked.promptTokens).avg?.toFixed(0) ?? '—'} / ${distribution(picked.promptTokens).max ?? '—'}`,
                `n=${picked.promptTokens.length}; includes cache`,
              ],
              [
                'Response tokens avg / P95',
                `${distribution(picked.responseTokens).avg?.toFixed(0) ?? '—'} / ${distribution(picked.responseTokens).p95 ?? '—'}`,
                `n=${picked.responseTokens.length}`,
              ],
              [
                'Messages / offered tools avg',
                `${distribution(picked.messageCounts).avg?.toFixed(1) ?? '—'} / ${distribution(picked.offeredTools).avg?.toFixed(1) ?? '—'}`,
                `samples ${picked.messageCounts.length} / ${picked.offeredTools.length}`,
              ],
              [
                'Streaming / priced call avg',
                `${samples(picked.streamingAttempts, picked.streamingSamples)} / ${usd(picked.pricedSamples ? picked.cost / picked.pricedSamples : undefined)}`,
                `${picked.pricedSamples} priced accounting calls`,
              ],
            ].map(([label, value, note]) => (
              <div key={label} className="rounded-xl border p-3">
                <h3 className="text-[11px] text-muted-foreground">{label}</h3>
                <p className="mt-2 font-mono text-sm">{value}</p>
                <p className="mt-2 text-[10px] text-muted-foreground">{note}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              ['Failure kinds', picked.errorKinds],
              ['HTTP statuses', picked.httpStatuses],
              ['Stop reasons', picked.stopReasons],
            ].map(([label, values]) => (
              <section key={String(label)} className="rounded-xl bg-muted/30 p-3">
                <h3 className="text-xs font-medium">{String(label)}</h3>
                <p className="mt-2 break-words font-mono text-xs text-muted-foreground">
                  {Object.entries(values as Record<string, number>)
                    .map(([key, n]) => `${key}: ${n}`)
                    .join(' · ') || 'No recorded samples'}
                </p>
              </section>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Failed tools may reflect permissions, filesystem, or network problems. Task success is a
            reported status; verification failures, loops, drift, and interventions are separate
            recorded signals. These figures do not form an automatic correctness score.
          </p>
          <div className="mt-4 space-y-2">
            {(issues.length ? issues : evidence)
              .slice(-20)
              .reverse()
              .map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => onInspect(event)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 text-left text-xs hover:bg-muted/30"
                >
                  <span className="text-muted-foreground">
                    {new Date(event.at).toLocaleTimeString()}
                  </span>
                  <span className="font-medium">{event.raw?.eventType}</span>
                  <span className="ml-auto font-mono text-muted-foreground">
                    {event.raw?.outcome ?? 'recorded'} · {event.actor}
                  </span>
                </button>
              ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Showing the latest 20 diagnostic records, or supporting records when no diagnostics are
            present. Click to inspect the original timeline evidence.
          </p>
        </section>
      )}
    </div>
  );
}
