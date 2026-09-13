/**
 * W5 #19 (RFC hq-improvements-2026-09.md): Event Log timeline view.
 *
 * A filterable archive of every telemetry envelope received from
 * connected clients. Filters: type, clientId, machineId, time range.
 *
 * The view consumes `/api/events` via the `fetchEvents` wrapper, which
 * maps the local `FetchEventsFilters` shape onto the server's query
 * parameters. Empty filters are omitted server-side; the view re-renders
 * on each "Refresh" click.
 *
 * Pure additive UI: no protocol-type ripple, no trust-boundary changes.
 *
 * @module webui-hq/views/events
 */
import type * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, type BadgeTone } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js';
import { type EventsResponse, type FetchEventsFilters, fetchEvents } from '../data/api.js';
import { cn } from '../lib/utils.js';

/**
 * Format an ISO timestamp as a short clock (HH:MM:SS.mmm) relative to the
 * current day. Falls back to the raw timestamp if parsing fails.
 */
function formatClock(iso: string | undefined): string {
  if (iso === undefined || iso.length === 0) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const mmm = String(date.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${mmm}`;
}

/** Resolve a `<input type="datetime-local">` string to epoch ms, or undefined if empty/invalid. */
function datetimeLocalToMs(value: string): number | undefined {
  if (value.length === 0) return undefined;
  const date = new Date(value);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

const TYPE_TONE: Record<string, BadgeTone> = {
  'session.snapshot': 'info',
  'session.transcript': 'info',
  'fleet.snapshot': 'info',
  'tool.started': 'neutral',
  'tool.completed': 'active',
  'brain.event': 'info',
  'cost.usage': 'warn',
  'provider.error': 'error',
  'approval.requested': 'warn',
};

function toneForType(type: string | undefined): BadgeTone {
  if (type === undefined) return 'neutral';
  return TYPE_TONE[type] ?? 'neutral';
}

/** Best-effort JSON preview: stringify compact; cap at ~120 chars. */
function previewPayload(payload: unknown): string {
  if (payload === undefined || payload === null) return '';
  let text: string;
  try {
    text = JSON.stringify(payload);
  } catch {
    text = String(payload);
  }
  if (text === undefined) return '';
  if (text.length <= 120) return text;
  return `${text.slice(0, 117)}…`;
}

/**
 * Top-level view component. Renders the filter bar, a refresh action, and
 * a simple list of events. The dashboard's `view-error-boundary` and the
 * lazy router catch any render errors before they crash the shell.
 */
export function EventsView(): React.ReactElement {
  const [filters, setFilters] = useState<FetchEventsFilters>({
    type: '',
    clientId: '',
    machineId: '',
    sinceMs: undefined,
    untilMs: undefined,
    limit: 200,
  });
  const [data, setData] = useState<EventsResponse>({ events: [], total: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinceText, setSinceText] = useState('');
  const [untilText, setUntilText] = useState('');

  const refresh = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const next = await fetchEvents({
        ...filters,
        type: filters.type?.trim() || undefined,
        clientId: filters.clientId?.trim() || undefined,
        machineId: filters.machineId?.trim() || undefined,
        sinceMs: filters.sinceMs,
        untilMs: filters.untilMs,
      });
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // Reset to the empty shape rather than `null`: the state type is
      // `EventsResponse`, and the error card is driven by `error`, not by
      // clearing the data.
      setData({ events: [], total: 0 });
    } finally {
      setBusy(false);
    }
  }, [filters]);

  // Auto-refresh on mount and whenever the limit changes. Time-range and
  // type/clientId/machineId filters require an explicit Refresh to avoid
  // re-fetching on every keystroke.
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only on limit change
  }, [filters.limit]);

  const events = useMemo(() => data?.events ?? [], [data]);

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex flex-col">
            <CardTitle className="text-sm font-semibold">Event Log</CardTitle>
            <p className="text-xs text-muted-foreground">
              Filterable timeline of every telemetry envelope. Filters: type, clientId, machineId,
              time range.
            </p>
          </div>
          <Button onClick={refresh} disabled={busy} size="sm">
            {busy ? 'Refreshing…' : 'Refresh'}
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-muted-foreground">Type</span>
            <input
              type="text"
              value={filters.type ?? ''}
              placeholder="e.g. session.snapshot"
              onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}
              className={cn(
                'rounded-md border bg-background px-2 py-1 text-sm',
                'placeholder:text-muted-foreground/60',
              )}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-muted-foreground">Client ID</span>
            <input
              type="text"
              value={filters.clientId ?? ''}
              placeholder="e.g. host-1:cli:42:abcd"
              onChange={(e) => setFilters((prev) => ({ ...prev, clientId: e.target.value }))}
              className={cn(
                'rounded-md border bg-background px-2 py-1 text-sm',
                'placeholder:text-muted-foreground/60',
              )}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-muted-foreground">Machine ID</span>
            <input
              type="text"
              value={filters.machineId ?? ''}
              placeholder="e.g. abc123def456"
              onChange={(e) => setFilters((prev) => ({ ...prev, machineId: e.target.value }))}
              className={cn(
                'rounded-md border bg-background px-2 py-1 text-sm',
                'placeholder:text-muted-foreground/60',
              )}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-muted-foreground">Since (local)</span>
            <input
              type="datetime-local"
              value={sinceText}
              onChange={(e) => {
                setSinceText(e.target.value);
                setFilters((prev) => ({ ...prev, sinceMs: datetimeLocalToMs(e.target.value) }));
              }}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-muted-foreground">Until (local)</span>
            <input
              type="datetime-local"
              value={untilText}
              onChange={(e) => {
                setUntilText(e.target.value);
                setFilters((prev) => ({ ...prev, untilMs: datetimeLocalToMs(e.target.value) }));
              }}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            />
          </label>
        </CardContent>
      </Card>

      {error !== null && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <Card className="min-h-0 flex-1 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-semibold">Timeline</CardTitle>
          <span className="text-xs text-muted-foreground">
            {events.length === 0 && !busy
              ? 'No events — adjust filters and click Refresh.'
              : `${events.length} event${events.length === 1 ? '' : 's'}${data !== undefined ? ` (total ${data.total})` : ''}`}
          </span>
        </CardHeader>
        <CardContent className="h-full overflow-y-auto">
          {events.length === 0 && !busy ? (
            <p className="text-xs text-muted-foreground">
              No events match the current filters. Click Refresh after changing inputs.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/40">
              {events.map((event, index) => {
                const tone = toneForType(event.type);
                return (
                  <li
                    key={`${event.timestamp ?? 'no-ts'}-${index}`}
                    className="grid grid-cols-[auto_1fr] items-start gap-x-3 py-2 text-xs"
                  >
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {formatClock(event.timestamp)}
                    </span>
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={tone}>{event.type ?? '(unknown)'}</Badge>
                        {event.clientId !== undefined && (
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {event.clientId}
                          </span>
                        )}
                        {event.machineId !== undefined && (
                          <span className="font-mono text-[11px] text-muted-foreground">
                            @ {event.machineId}
                          </span>
                        )}
                      </div>
                      {previewPayload(event.payload).length > 0 && (
                        <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-muted/40 px-2 py-1 font-mono text-[11px] leading-relaxed text-foreground/80">
                          {previewPayload(event.payload)}
                        </pre>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default EventsView;
