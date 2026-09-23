import { useId } from 'react';

/** Runtime limits use zero for unlimited and accept any nonnegative integer. */
export function PreferenceLimit({
  label,
  hint,
  value,
  onChange,
  unlimitedLabel,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
  unlimitedLabel: string;
}) {
  const inputId = useId();
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-2">
      <div className="min-w-0 flex-1 basis-48">
        <label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </label>
        <div id={`${inputId}-hint`} className="text-xs text-muted-foreground mt-0.5">
          {hint}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          aria-describedby={`${inputId}-hint`}
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(event) => {
            const next = event.target.valueAsNumber;
            if (Number.isSafeInteger(next) && next >= 0) onChange(next);
          }}
          className="h-8 w-24 rounded-md border bg-background px-2 text-xs tabular-nums"
        />
        <button
          type="button"
          aria-pressed={value === 0}
          onClick={() => onChange(0)}
          className="h-8 rounded-md border px-2 text-xs aria-pressed:border-primary aria-pressed:text-primary"
        >
          {unlimitedLabel}
        </button>
      </div>
    </div>
  );
}

/** A labeled slider with current value display. */
export function PreferenceSlider({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange,
  unit,
}: {
  label: string;
  hint?: string | undefined;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: string | undefined;
}) {
  const inputId = useId();
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </label>
        {hint && (
          <div id={`${inputId}-hint`} className="text-xs text-muted-foreground mt-0.5">
            {hint}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          id={inputId}
          type="range"
          aria-describedby={hint ? `${inputId}-hint` : undefined}
          aria-valuetext={`${value}${unit ?? ''}`}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-24 h-1.5 accent-primary"
        />
        <span className="text-xs tabular-nums w-10 text-right text-muted-foreground" aria-hidden>
          {value}
          {unit ?? ''}
        </span>
      </div>
    </div>
  );
}

/** A labeled select dropdown. */
export function PreferenceSelect<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string | undefined;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  /** Blocks the select while an in-flight write is reconciling. */
  disabled?: boolean | undefined;
}) {
  const inputId = useId();
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-2">
      <div className="min-w-0 flex-1 basis-48">
        <label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </label>
        {hint && (
          <div id={`${inputId}-hint`} className="text-xs text-muted-foreground mt-0.5">
            {hint}
          </div>
        )}
      </div>
      <select
        id={inputId}
        aria-describedby={hint ? `${inputId}-hint` : undefined}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-9 min-w-0 max-w-full rounded-md border bg-background px-2 text-xs disabled:opacity-50"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
