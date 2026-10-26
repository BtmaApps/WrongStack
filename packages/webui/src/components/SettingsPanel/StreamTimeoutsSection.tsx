import {
  parseStreamWatchdogSeconds,
  STREAM_WATCHDOG_DEFAULTS,
  STREAM_WATCHDOG_MAX_SECONDS,
  STREAM_WATCHDOG_MIN_SECONDS,
} from '@wrongstack/contracts/types/config/runtime';
import { Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type LocalPrefs, useLocalPrefs } from '@/stores/local-prefs';

/**
 * StreamTimeoutsSection — the browser editor for `Config.modelRuntime.streaming`,
 * the two stream watchdogs every HTTP provider runs. Same values and rules as
 * `/settings stream-watchdog`: seconds in the UI, milliseconds in config, empty
 * = built-in default, `0` / `off` = disabled.
 *
 * Providers read the watchdogs when they are built, so a change reaches the
 * next provider built (a model switch, a restart) — not the instance already
 * in use, which new tabs share. The copy says so rather than implying it is
 * instant.
 */

type StreamTimeouts = LocalPrefs['streamTimeouts'];
type FieldKey = keyof StreamTimeouts;

const secs = (ms: number): number => Math.round(ms / 1000);

const FIELDS: Array<{ key: FieldKey; label: string; hint: string }> = [
  {
    key: 'hangTimeoutMs',
    label: 'Silence between chunks (seconds)',
    hint:
      `Longest pause allowed once a reply is streaming before the attempt is failed and retried. ` +
      `Empty = ${secs(STREAM_WATCHDOG_DEFAULTS.hangTimeoutMs)} s ` +
      `(${secs(STREAM_WATCHDOG_DEFAULTS.slowBackendHangTimeoutMs)} s for MiniMax and Z.AI). ` +
      'Raise it for models with long silent thinking phases.',
  },
  {
    key: 'headersTimeoutMs',
    label: 'Wait for response headers (seconds)',
    hint:
      `How long to wait for the provider to start answering at all. ` +
      `Empty = ${secs(STREAM_WATCHDOG_DEFAULTS.headersTimeoutMs)} s ` +
      `(${secs(STREAM_WATCHDOG_DEFAULTS.slowBackendHeadersTimeoutMs)} s for MiniMax and Z.AI).`,
  },
];

const RANGE = `${STREAM_WATCHDOG_MIN_SECONDS}–${STREAM_WATCHDOG_MAX_SECONDS} s, 0 or off`;

/** Stored ms → what the input shows: empty for unset, `off` for disabled. */
function display(value: number | undefined): string {
  if (value === undefined) return '';
  return value === 0 ? 'off' : String(secs(value));
}

function WatchdogInput({
  label,
  hint,
  value,
  testId,
  onCommit,
}: {
  label: string;
  hint: string;
  value: number | undefined;
  testId: string;
  onCommit: (next: number | undefined) => void;
}): React.ReactElement {
  const [draft, setDraft] = useState(display(value));
  useEffect(() => setDraft(display(value)), [value]);
  const parsed = parseStreamWatchdogSeconds(draft);
  const invalid = parsed === 'invalid';

  // Committed on blur / Enter, not per keystroke: each commit writes config.
  const commit = () => {
    if (invalid || parsed === value) return;
    onCommit(parsed);
  };

  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        placeholder="default"
        aria-invalid={invalid}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        className={`w-full rounded-md border bg-background px-2 py-1 text-xs ${
          invalid ? 'border-destructive' : 'border-border'
        }`}
        data-testid={testId}
      />
      <span
        className={`block text-[11px] leading-snug ${invalid ? 'text-destructive' : 'text-muted-foreground'}`}
      >
        {invalid
          ? `Must be ${STREAM_WATCHDOG_MIN_SECONDS}–${STREAM_WATCHDOG_MAX_SECONDS} seconds, 0 / off, or empty for the default.`
          : hint}
      </span>
      {parsed === 0 && (
        <span className="block text-[11px] leading-snug text-warning" data-testid={`${testId}-off`}>
          Off: a dead connection is never detected — the turn waits until you stop it (Esc).
        </span>
      )}
      <span className="block text-[10px] text-muted-foreground/80">{RANGE}</span>
    </label>
  );
}

interface StreamTimeoutsSectionProps {
  /** Writes the pref locally AND pushes it to the server (see SettingsPanel). */
  syncPref: (key: string, value: unknown) => void;
}

export function StreamTimeoutsSection({
  syncPref,
}: StreamTimeoutsSectionProps): React.ReactElement {
  const timeouts: StreamTimeouts = useLocalPrefs().streamTimeouts ?? {};

  // Always send the WHOLE pair: the server replaces `modelRuntime.streaming`
  // rather than merging it, and an absent field is how a value is cleared.
  const setField = (key: FieldKey, next: number | undefined) => {
    const updated: StreamTimeouts = { ...timeouts };
    if (next === undefined) delete updated[key];
    else updated[key] = next;
    syncPref('streamTimeouts', updated);
  };

  return (
    <div
      className="rounded-xl border border-border/70 bg-card/80 p-5 shadow-sm"
      data-testid="stream-timeouts-section"
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
          <Timer className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">Stream timeouts</h3>
          <p className="text-xs text-muted-foreground">
            When a provider goes quiet, these decide how long to wait before the attempt fails and
            is retried. Empty uses the default. Takes effect the next time a model connection is set
            up — switch model (or restart WrongStack) to apply it to the model you are using now.
            Same as <code>/settings stream-watchdog</code>.
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <WatchdogInput
            key={field.key}
            label={field.label}
            hint={field.hint}
            value={timeouts[field.key]}
            testId={`stream-timeout-${field.key}`}
            onCommit={(next) => setField(field.key, next)}
          />
        ))}
      </div>
    </div>
  );
}
